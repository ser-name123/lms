import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  Role,
  UserStatus,
  LeadStatus,
  LeadPriority,
  CourseStatus,
  EnrollmentStatus,
} from '../generated/prisma/enums';
import { LeadAvailabilityService } from './availability.service';
import { ZoomService } from './zoom.service';
import {
  AssignTeacherLeadDto,
  CoachDecisionDto,
  CreateLeadDto,
  EvaluateLeadDto,
  ListLeadsDto,
  ScheduleTrialDto,
  TrialAttendanceDto,
  TrialFeedbackDto,
  UpdateLeadDto,
  UpdateTrialDto,
} from './dto';

/*
 * The signed-in staff member. `role` is what decides which leads they may
 * touch, so it is part of the type rather than something each caller
 * remembers to pass — see scopeFor / assertAccess.
 */
type Actor = { id?: string; name?: string; role?: string } | undefined;

/** Points at the coach who received the most recent lead. See nextCoachInRotation. */
const COACH_ROTATION_KEY = 'LEAD_COACH_ROTATION_LAST';

@Injectable()
export class LeadsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
    private readonly availability: LeadAvailabilityService,
    private readonly zoom: ZoomService,
  ) {}

  // ── Reminder sweep ──────────────────────────────────────────────────────────
  // No cron dependency: a lightweight in-process interval checks every 5 minutes
  // for trials entering their 24h / 1h window and dispatches an email reminder,
  // stamping the row so each reminder fires exactly once.
  onModuleInit() {
    const FIVE_MIN = 5 * 60 * 1000;
    setInterval(() => this.sweepReminders().catch(() => undefined), FIVE_MIN);
  }

  /*
   * ── Public: book a trial ──────────────────────────────────────────────────
   *
   * One step. The visitor picks a date and a 30-minute slot from the merged
   * teacher availability, and submitting creates the lead, the trial, its Zoom
   * meeting and the acknowledgement email together.
   *
   * There is deliberately no email OTP: the previous flow returned the code in
   * the HTTP response, so it verified nothing while costing every genuine
   * visitor an extra step.
   */
  async book(dto: CreateLeadDto, meta: { ip?: string }) {
    const email = dto.email.toLowerCase().trim();
    const mobile = dto.mobile.trim();

    // Re-validate the slot server-side. The form only ever offers bookable
    // slots, but the endpoint is public and nothing stops a direct POST.
    const date = this.availability.parseBookableDate(dto.preferredDate ?? '');
    const slot = (dto.preferredSlot ?? '').trim();
    if (!/^\d{2}:\d{2}$/.test(slot)) {
      throw new BadRequestException('Please choose a time slot');
    }
    const offered = await this.availability.slotsFor(dto.preferredDate!);
    if (!offered.slots.includes(slot)) {
      throw new BadRequestException(
        'That slot has just been taken. Please pick another one.',
      );
    }

    const startAt = new Date(
      date.getTime() + Number(slot.slice(0, 2)) * 3_600_000 + Number(slot.slice(3)) * 60_000,
    );

    const siblings = (dto.siblings ?? [])
      .filter((s) => s && (s.firstName ?? '').trim())
      .map((s) => ({
        firstName: (s.firstName ?? '').trim(),
        lastName: (s.lastName ?? '').trim(),
      }));

    const leadNumber = await this.nextLeadNumber();
    const coachId = await this.nextCoachInRotation();

    const lead = await this.prisma.lead.create({
      data: {
        leadNumber,
        studentFirstName: dto.studentFirstName.trim(),
        studentLastName: dto.studentLastName.trim(),
        country: dto.country || null,
        timeZone: dto.timeZone || null,
        email,
        mobile,
        countryCode: dto.countryCode || null,
        interestedSubject: dto.interestedSubject || null,
        preferredTeacherGender: dto.preferredTeacherGender || null,
        sessionFor: dto.sessionFor || null,
        howFound: dto.howFound || null,
        preferredDate: date,
        preferredSlot: slot,
        preferredSlotTz: offered.timeZone,
        siblings: siblings.length ? siblings : undefined,
        leadSource: 'Website',
        ipAddress: meta.ip || null,
        browser: dto.browser || null,
        device: dto.device || null,
        referralUrl: dto.referralUrl || null,
        utmSource: dto.utmSource || null,
        utmCampaign: dto.utmCampaign || null,
        utmMedium: dto.utmMedium || null,
        status: LeadStatus.TRIAL_SCHEDULED,
        priority: LeadPriority.MEDIUM,
        assignedCoachId: coachId,
        assignedCoachAt: coachId ? new Date() : null,
      },
    });

    /*
     * No teacher is assigned yet — the slot came from merged availability, not
     * from one person's calendar, and picking the teacher is the coach's job.
     * The trial row exists from the start so the slot is held and the visitor
     * gets a real appointment rather than "we'll be in touch".
     */
    const trial = await this.prisma.leadTrial.create({
      data: {
        leadId: lead.id,
        scheduledAt: startAt,
        durationMins: 30,
        timeZone: offered.timeZone,
        meetingProvider: 'Zoom',
        status: 'SCHEDULED',
      },
    });

    const zoom = await this.zoom.createTrialMeeting({
      topic: `Free trial — ${lead.studentFirstName} ${lead.studentLastName}`.trim(),
      startAt,
      durationMins: 30,
      timeZone: offered.timeZone,
      agenda: dto.interestedSubject ? `Trial class: ${dto.interestedSubject}` : undefined,
    });

    if (zoom.ok && zoom.meeting) {
      await this.prisma.leadTrial.update({
        where: { id: trial.id },
        data: {
          meetingId: zoom.meeting.meetingId,
          meetingLink: zoom.meeting.joinUrl,
          meetingHostUrl: zoom.meeting.hostUrl,
        },
      });
      trial.meetingLink = zoom.meeting.joinUrl;
    } else {
      /*
       * The booking still stands. The coach is told on the timeline that this
       * one needs a link added by hand, because the acknowledgement email goes
       * out without one and the visitor will expect it.
       */
      await this.addActivity(
        lead.id,
        'TRIAL_SCHEDULED',
        `Zoom link could not be created (${zoom.reason ?? 'unknown'}). Add a meeting link manually.`,
      );
    }

    await this.addActivity(
      lead.id,
      'CREATED',
      `Trial booked from the website for ${startAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    );
    if (offered.fallback) {
      await this.addActivity(
        lead.id,
        'NOTE',
        'Booked into a default slot — no teacher had published availability for this date. A teacher still needs to be found.',
      );
    }

    this.sendBookingAcknowledgement(lead, startAt, trial.meetingLink, siblings).catch(
      () => undefined,
    );
    this.notifyNewLead(lead).catch(() => undefined);

    return {
      id: lead.id,
      leadNumber: lead.leadNumber,
      scheduledAt: startAt.toISOString(),
      meetingLink: trial.meetingLink ?? null,
      message:
        'Your free trial class is booked. Check your email for the joining details.',
    };
  }

  /*
   * Round-robin across active academic coaches: request 1 goes to coach 1,
   * request 2 to coach 2, and after the last one it wraps back to the first.
   *
   * The pointer stores the *last coach assigned* rather than an index, so
   * adding or removing a coach shifts the rotation gracefully instead of
   * silently skipping someone. Coaches are ordered by createdAt so the
   * sequence is stable across restarts.
   */
  private async nextCoachInRotation(): Promise<string | null> {
    const coaches = await this.prisma.user.findMany({
      where: { role: Role.ACADEMIC_COACH, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!coaches.length) return null;

    const pointer = await this.prisma.systemSetting.findUnique({
      where: { key: COACH_ROTATION_KEY },
    });
    const lastIndex = coaches.findIndex((c) => c.id === pointer?.value);
    // -1 (no pointer, or that coach is gone) lands on 0 — the first coach.
    const next = coaches[(lastIndex + 1) % coaches.length];

    await this.prisma.systemSetting.upsert({
      where: { key: COACH_ROTATION_KEY },
      create: { key: COACH_ROTATION_KEY, value: next.id },
      update: { value: next.id },
    });
    return next.id;
  }

  private async sendBookingAcknowledgement(
    lead: { studentFirstName: string; studentLastName: string; email: string; interestedSubject: string | null },
    startAt: Date,
    meetingLink: string | null,
    siblings: { firstName: string; lastName: string }[],
  ) {
    const when = startAt.toISOString().replace('T', ' ').slice(0, 16);
    const name = `${lead.studentFirstName} ${lead.studentLastName}`.trim();
    const row = (label: string, value: string) =>
      `<tr><td style="padding:6px 0;color:#6b7280;">${label}</td><td style="padding:6px 0;font-weight:700;">${value}</td></tr>`;

    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f6f8;padding:40px 20px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e1e4e8;">
          <div style="background:#133C55;padding:26px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">Your free trial class is booked</h1>
          </div>
          <div style="padding:28px;color:#1f2937;font-size:14px;line-height:1.7;">
            <p>Assalamu alaikum ${name || 'there'},</p>
            <p>Thank you for booking a free trial class with us. We are looking forward to meeting you.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              ${row('Date &amp; time (UTC)', when)}
              ${lead.interestedSubject ? row('Subject', lead.interestedSubject) : ''}
              ${siblings.length ? row('Also attending', siblings.map((s) => `${s.firstName} ${s.lastName}`.trim()).join(', ')) : ''}
              ${meetingLink ? row('Zoom link', `<a href="${meetingLink}">${meetingLink}</a>`) : ''}
            </table>
            ${
              meetingLink
                ? '<p>Just click the Zoom link at the scheduled time — no software setup is needed.</p>'
                : '<p>We are preparing your joining link and will email it to you shortly, well before the class.</p>'
            }
            <p style="color:#6b7280;">Need to change the time? Simply reply to this email and our academic coach will help.</p>
          </div>
        </div>
      </div>`;

    await this.emails.sendMail(
      lead.email,
      'Your free trial class is booked',
      `Your free trial class is booked for ${when} UTC.${meetingLink ? ` Join: ${meetingLink}` : ''}`,
      undefined,
      html,
    );
  }


  private async nextLeadNumber(): Promise<string> {
    const year = new Date().getFullYear();
    // Sequential within the year: LD-2026-000001.
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await this.prisma.lead.count({
        where: { leadNumber: { startsWith: `LD-${year}-` } },
      });
      const candidate = `LD-${year}-${String(count + 1 + attempt).padStart(6, '0')}`;
      const clash = await this.prisma.lead.findUnique({
        where: { leadNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    // Extremely unlikely fallback.
    return `LD-${year}-${Date.now().toString().slice(-6)}`;
  }

  // ── Admin/Coach: list / stats / detail ──────────────────────────────────────
  /*
   * ── Who may see which lead ────────────────────────────────────────────────
   *
   * A lead belongs to the coach the rotation handed it to. Another coach must
   * not see it at all — not in the list, not in the counts, not by guessing the
   * URL. Admins see everything.
   *
   * The scope is built here, in the service, and every read and write funnels
   * through `scopeFor` or `assertAccess`. Enforcing it in the controller, or in
   * each query by hand, is how one forgotten endpoint quietly becomes the way
   * around the rule.
   */
  private scopeFor(user: Actor): { assignedCoachId?: string } {
    if (!user?.role || user.role === Role.ADMIN) return {};
    if (user.role === Role.ACADEMIC_COACH) return { assignedCoachId: user.id };
    return {};
  }

  /**
   * Throws unless this user may work on this lead. Returns the lead so callers
   * do not fetch it twice.
   */
  private async assertAccess(leadId: string, user: Actor) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);

    if (user?.role === Role.ACADEMIC_COACH && lead.assignedCoachId !== user.id) {
      /*
       * 403, not 404. These are trusted colleagues: telling a coach the lead
       * exists but belongs to someone else lets them ask for it to be
       * reassigned, where a bare "not found" just looks broken.
       */
      throw new ForbiddenException(
        'This trial request is assigned to another academic coach. Ask an admin to reassign it.',
      );
    }
    return lead;
  }

  /**
   * Same rule for a trial, reached through its lead — plus the assigned teacher,
   * who has to mark attendance and leave feedback on their own trials without
   * being able to see the rest of the coach's pipeline.
   */
  private async assertTrialAccess(trialId: string, user: Actor) {
    const trial = await this.prisma.leadTrial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException(`Trial ${trialId} not found`);

    if (user?.role === Role.TEACHER) {
      const profile = await this.prisma.teacherProfile.findUnique({
        where: { userId: user.id ?? '' },
        select: { id: true },
      });
      if (!profile || trial.teacherId !== profile.id) {
        throw new ForbiddenException('This trial is not assigned to you.');
      }
      return trial;
    }

    await this.assertAccess(trial.leadId, user);
    return trial;
  }

  async list(dto: ListLeadsDto, user?: Actor) {
    const { page = 1, limit = 20, search, status, priority, country, subject, coachId } = dto;
    const scope = this.scopeFor(user);

    /*
     * A coach asking for someone else's pipeline gets an empty page, not their
     * own rows. Silently swapping the filter would answer a question they did
     * not ask and make the UI look like the other coach has these leads.
     */
    if (scope.assignedCoachId && coachId && coachId !== scope.assignedCoachId) {
      return { items: [], meta: { page, limit, total: 0, totalPages: 1 } };
    }

    const where: any = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(country ? { country: { contains: country, mode: 'insensitive' } } : {}),
      ...(subject ? { interestedSubject: { contains: subject, mode: 'insensitive' } } : {}),
      ...(coachId ? { assignedCoachId: coachId } : {}),
      // Last, so it overrides any coachId a coach passed for someone else.
      ...scope,
      ...(search
        ? {
            OR: [
              { studentFirstName: { contains: search, mode: 'insensitive' } },
              { studentLastName: { contains: search, mode: 'insensitive' } },
              { parentName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { mobile: { contains: search, mode: 'insensitive' } },
              { leadNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    const withNames = await this.attachNames(items);

    return {
      items: withNames,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getOne(id: string, user?: Actor) {
    const lead = await this.assertAccess(id, user);
    const [withNames] = await this.attachNames([lead]);
    return withNames;
  }

  async listActivities(id: string, user?: Actor) {
    await this.assertAccess(id, user);
    return this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(user?: Actor) {
    const scope = this.scopeFor(user);
    // Counts follow the same scope as the list — a coach's pipeline numbers
    // must match the rows they can actually open.
    const byStatus = await this.prisma.lead.groupBy({
      by: ['status'],
      where: scope,
      _count: { _all: true },
    });
    const statusCounts: Record<string, number> = {};
    byStatus.forEach((r) => (statusCounts[r.status] = r._count._all));

    const [total, converted, rejected, avgRatingAgg] = await Promise.all([
      this.prisma.lead.count({ where: scope }),
      this.prisma.lead.count({ where: { ...scope, status: LeadStatus.CONVERTED } }),
      this.prisma.lead.count({ where: { ...scope, status: LeadStatus.REJECTED } }),
      this.prisma.lead.aggregate({ where: scope, _avg: { overallScore: true } }),
    ]);

    // Subject- and country-wise breakdown for the marketing charts.
    const [bySubject, byCountry] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['interestedSubject'], where: scope, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['country'], where: scope, _count: { _all: true } }),
    ]);

    return {
      total,
      converted,
      rejected,
      newLeads: statusCounts[LeadStatus.NEW] || 0,
      inPipeline:
        total - (statusCounts[LeadStatus.CONVERTED] || 0) - (statusCounts[LeadStatus.REJECTED] || 0) - (statusCounts[LeadStatus.CLOSED] || 0),
      conversionRate: total ? Math.round((converted / total) * 100) : 0,
      avgScore: avgRatingAgg._avg.overallScore ? Math.round(avgRatingAgg._avg.overallScore) : 0,
      statusCounts,
      bySubject: bySubject
        .filter((r) => r.interestedSubject)
        .map((r) => ({ subject: r.interestedSubject as string, count: r._count._all })),
      byCountry: byCountry
        .filter((r) => r.country)
        .map((r) => ({ country: r.country as string, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }

  // ── Admin/Coach: update (status / priority / coach assignment / note) ────────
  async update(id: string, dto: UpdateLeadDto, actor: Actor) {
    const lead = await this.assertAccess(id, actor);

    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.priority) data.priority = dto.priority;
    if (dto.assignedCoachId !== undefined) {
      data.assignedCoachId = dto.assignedCoachId || null;
      data.assignedCoachAt = dto.assignedCoachId ? new Date() : null;
    }

    const updated = await this.prisma.lead.update({ where: { id }, data });

    // Activity log for each meaningful change.
    if (dto.status && dto.status !== lead.status) {
      await this.addActivity(id, 'STATUS_CHANGED', `Status changed to ${dto.status.replace(/_/g, ' ')}.`, actor);
    }
    if (dto.priority && dto.priority !== lead.priority) {
      await this.addActivity(id, 'PRIORITY_CHANGED', `Priority set to ${dto.priority}.`, actor);
    }
    if (dto.assignedCoachId && dto.assignedCoachId !== lead.assignedCoachId) {
      const coach = await this.prisma.user.findUnique({
        where: { id: dto.assignedCoachId },
        select: { firstName: true, lastName: true },
      });
      const coachName = coach ? `${coach.firstName} ${coach.lastName}` : 'a coach';
      await this.addActivity(id, 'ASSIGNED', `Assigned to coach ${coachName}.`, actor);
      // Notify the coach in-app.
      this.notifications
        .createFor(dto.assignedCoachId, {
          type: 'LEAD_ASSIGNED',
          title: 'New Lead Assigned',
          body: `${lead.studentFirstName} ${lead.studentLastName} (${lead.leadNumber}) has been assigned to you.`,
          link: `/leads/${id}`,
        })
        .catch(() => undefined);
    }
    if (dto.note) {
      await this.addActivity(id, 'NOTE', dto.note, actor);
    }

    const [withNames] = await this.attachNames([updated]);
    return withNames;
  }

  // ── Step 6: evaluation (scores 1–10 → overall %) ────────────────────────────
  async evaluate(id: string, dto: EvaluateLeadDto, actor: Actor) {
    const lead = await this.assertAccess(id, actor);

    const values = Object.values(dto.scores || {}).filter(
      (v) => typeof v === 'number' && !isNaN(v),
    );
    if (!values.length) {
      throw new BadRequestException('Provide at least one score.');
    }
    // Each score is out of 10; overall is the average expressed as a percentage.
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const overall = Math.round(avg * 10);

    const rec = this.recommendFromScore(overall, lead);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        evaluationScores: dto.scores as any,
        overallScore: overall,
        evaluationNotes: dto.notes || null,
        evaluatedAt: new Date(),
        evaluatedById: actor?.id || null,
        status: LeadStatus.EVALUATION_COMPLETED,
        recommendedLevel: rec.level,
        recommendedBatch: rec.batch,
      },
    });

    await this.addActivity(id, 'EVALUATED', `Evaluation completed — overall score ${overall}%.`, actor);

    const [withNames] = await this.attachNames([updated]);
    return withNames;
  }

  // ── Step 7: recommendation engine (level + batch + best-fit teacher) ─────────
  async getRecommendation(id: string, user?: Actor) {
    const lead = await this.assertAccess(id, user);

    const rec = this.recommendFromScore(lead.overallScore ?? null, lead);
    const teacher = await this.bestTeacher(lead.interestedSubject);

    // Persist the level/batch/teacher suggestion for quick reference.
    await this.prisma.lead.update({
      where: { id },
      data: {
        recommendedLevel: rec.level,
        recommendedBatch: rec.batch,
        recommendedTeacherId: teacher?.id || null,
      },
    });

    return {
      recommendedLevel: rec.level,
      recommendedBatch: rec.batch,
      teacher,
    };
  }

  private recommendFromScore(score: number | null, lead: any) {
    let level = 'Beginner';
    if (score != null) {
      if (score >= 80) level = 'Advanced';
      else if (score >= 60) level = 'Intermediate';
      else if (score >= 40) level = 'Elementary';
      else level = 'Beginner';
    } else if (lead.currentLevel) {
      level = lead.currentLevel;
    }

    const slot = (lead.preferredTimeSlots || [])[0];
    const batch = slot ? `${slot.split(' ')[0]} Batch` : 'Flexible Batch';

    return { level, batch };
  }

  // Best-fit teacher: prefer a subject-specialisation match, then lowest
  // workload (fewest active enrolments).
  private async bestTeacher(subject?: string | null) {
    const baseWhere: any = { user: { role: Role.TEACHER, status: UserStatus.ACTIVE } };

    const pick = async (where: any) =>
      this.prisma.teacherProfile.findFirst({
        where,
        orderBy: { enrollments: { _count: 'asc' } },
        select: {
          id: true,
          specialisation: true,
          user: { select: { firstName: true, lastName: true } },
          _count: { select: { enrollments: true } },
        },
      });

    let t = subject
      ? await pick({ ...baseWhere, specialisation: { contains: subject, mode: 'insensitive' } })
      : null;
    if (!t) t = await pick(baseWhere);
    if (!t) return null;

    return {
      id: t.id,
      name: `${t.user.firstName} ${t.user.lastName}`,
      specialisation: t.specialisation,
      workload: t._count.enrollments,
    };
  }

  // ── Step 8: teacher assignment (manual or auto) ─────────────────────────────
  async assignTeacher(id: string, dto: AssignTeacherLeadDto, actor: Actor) {
    const lead = await this.assertAccess(id, actor);

    let teacherId = dto.teacherId;
    if (dto.auto || !teacherId) {
      const best = await this.bestTeacher(lead.interestedSubject);
      if (!best) throw new BadRequestException('No active teacher available to assign.');
      teacherId = best.id;
    }

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!teacher) throw new BadRequestException('Selected teacher not found.');
    const teacherName = `${teacher.user.firstName} ${teacher.user.lastName}`;

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        assignedTeacherId: teacherId,
        assignedTeacherAt: new Date(),
        status: LeadStatus.TEACHER_ASSIGNED,
      },
    });

    await this.addActivity(
      id,
      'TEACHER_ASSIGNED',
      `Teacher ${teacherName} assigned${dto.auto ? ' (auto)' : ''}.`,
      actor,
    );

    const [withNames] = await this.attachNames([updated]);
    return withNames;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Trial scheduling · meeting link · reminders · attendance
  // ══════════════════════════════════════════════════════════════════════════

  // ── Step 9: schedule a trial (demo) class ───────────────────────────────────
  async scheduleTrial(leadId: string, dto: ScheduleTrialDto, actor: Actor) {
    const lead = await this.assertAccess(leadId, actor);

    const when = new Date(dto.scheduledAt);
    if (isNaN(when.getTime())) throw new BadRequestException('Invalid trial date/time.');

    const teacherId = dto.teacherId || lead.assignedTeacherId || null;

    const durationMins = dto.durationMins ?? 30;
    const trial = await this.prisma.leadTrial.create({
      data: {
        leadId,
        teacherId,
        scheduledAt: when,
        durationMins,
        timeZone: dto.timeZone || lead.timeZone || null,
        meetingProvider: dto.meetingProvider || 'Zoom',
        meetingLink: dto.meetingLink || null,
        notes: dto.notes || null,
        createdById: actor?.id || null,
      },
    });

    /*
     * A coach-scheduled trial gets its own Zoom room too. Without this the
     * website booking had a link and a second trial arranged by the coach did
     * not, which is the same class with the same family — the difference would
     * only ever look like a bug. Skipped when the coach pasted their own link.
     */
    if (!dto.meetingLink) {
      const zoom = await this.zoom.createTrialMeeting({
        topic: `Trial — ${lead.studentFirstName} ${lead.studentLastName}`.trim(),
        startAt: when,
        durationMins,
        timeZone: dto.timeZone || lead.timeZone || 'UTC',
        agenda: lead.interestedSubject ? `Trial class: ${lead.interestedSubject}` : undefined,
      });
      if (zoom.ok && zoom.meeting) {
        await this.prisma.leadTrial.update({
          where: { id: trial.id },
          data: {
            meetingId: zoom.meeting.meetingId,
            meetingLink: zoom.meeting.joinUrl,
            meetingHostUrl: zoom.meeting.hostUrl,
          },
        });
        trial.meetingId = zoom.meeting.meetingId;
        trial.meetingLink = zoom.meeting.joinUrl;
      } else {
        await this.addActivity(
          leadId,
          'TRIAL_SCHEDULED',
          `Zoom link could not be created (${zoom.reason ?? 'unknown'}). Add a meeting link manually.`,
          actor,
        );
      }
    }

    // Keep the teacher on the lead in sync when one was supplied here.
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: LeadStatus.TRIAL_SCHEDULED,
        ...(teacherId && teacherId !== lead.assignedTeacherId
          ? { assignedTeacherId: teacherId, assignedTeacherAt: new Date() }
          : {}),
      },
    });

    await this.addActivity(
      leadId,
      'TRIAL_SCHEDULED',
      `Trial scheduled for ${when.toLocaleString()}${dto.meetingProvider ? ` on ${dto.meetingProvider}` : ''}.`,
      actor,
    );

    // Notify the assigned teacher in-app + email the parent the invite.
    await this.notifyTrialScheduled(lead, trial, teacherId).catch(() => undefined);

    return this.attachTrialNames([trial]).then((r) => r[0]);
  }

  async listTrials(leadId: string, user?: Actor) {
    await this.assertAccess(leadId, user);
    const trials = await this.prisma.leadTrial.findMany({
      where: { leadId },
      orderBy: { scheduledAt: 'desc' },
    });
    return this.attachTrialNames(trials);
  }

  // ── Update / reschedule a trial (meeting link, teacher, status) ─────────────
  async updateTrial(trialId: string, dto: UpdateTrialDto, actor: Actor) {
    const trial = await this.assertTrialAccess(trialId, actor);

    const data: any = {};
    let rescheduled = false;
    if (dto.scheduledAt) {
      const when = new Date(dto.scheduledAt);
      if (isNaN(when.getTime())) throw new BadRequestException('Invalid trial date/time.');
      data.scheduledAt = when;
      if (when.getTime() !== trial.scheduledAt.getTime()) {
        rescheduled = true;
        // A fresh schedule means reminders should fire again.
        data.reminder24hSentAt = null;
        data.reminder1hSentAt = null;
        if (!dto.status) data.status = 'RESCHEDULED';
      }
    }
    if (dto.teacherId !== undefined) data.teacherId = dto.teacherId || null;
    if (dto.durationMins !== undefined) data.durationMins = dto.durationMins;
    if (dto.timeZone !== undefined) data.timeZone = dto.timeZone || null;
    if (dto.meetingProvider !== undefined) data.meetingProvider = dto.meetingProvider || null;
    if (dto.meetingLink !== undefined) data.meetingLink = dto.meetingLink || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.status) data.status = dto.status;

    /*
     * Keep the Zoom room in step with the trial. Without this a rescheduled
     * trial keeps its original meeting time and a cancelled one leaves a live
     * room behind that a family could still walk into.
     */
    if (trial.meetingId) {
      if (dto.status === 'CANCELLED') {
        const gone = await this.zoom.cancelMeeting(trial.meetingId);
        if (gone) {
          data.meetingId = null;
          data.meetingLink = null;
          data.meetingHostUrl = null;
        }
      } else if (rescheduled) {
        await this.zoom.rescheduleMeeting(
          trial.meetingId,
          data.scheduledAt,
          data.durationMins ?? trial.durationMins,
        );
      }
    }

    const updated = await this.prisma.leadTrial.update({ where: { id: trialId }, data });

    // Reflect terminal trial states onto the lead pipeline.
    if (dto.status === 'COMPLETED') {
      await this.prisma.lead.update({
        where: { id: trial.leadId },
        data: { status: LeadStatus.TRIAL_COMPLETED },
      });
      await this.addActivity(trial.leadId, 'TRIAL_COMPLETED', 'Trial marked as completed.', actor);
    } else if (dto.status === 'CANCELLED') {
      await this.addActivity(trial.leadId, 'TRIAL_CANCELLED', 'Trial cancelled.', actor);
    } else if (rescheduled) {
      await this.addActivity(
        trial.leadId,
        'TRIAL_RESCHEDULED',
        `Trial rescheduled to ${new Date(data.scheduledAt).toLocaleString()}.`,
        actor,
      );
    }

    return this.attachTrialNames([updated]).then((r) => r[0]);
  }

  // ── Step 11: mark attendance ────────────────────────────────────────────────
  async markAttendance(trialId: string, dto: TrialAttendanceDto, actor: Actor) {
    const trial = await this.assertTrialAccess(trialId, actor);

    const present = dto.attendance === 'PRESENT';
    const updated = await this.prisma.leadTrial.update({
      where: { id: trialId },
      data: {
        attendance: dto.attendance,
        attendedAt: new Date(),
        status: present ? 'COMPLETED' : 'NO_SHOW',
      },
    });

    await this.prisma.lead.update({
      where: { id: trial.leadId },
      data: present ? { status: LeadStatus.TRIAL_COMPLETED } : {},
    });
    await this.addActivity(
      trial.leadId,
      present ? 'TRIAL_ATTENDED' : 'TRIAL_NO_SHOW',
      present ? 'Student attended the trial class.' : 'Student did not show up for the trial.',
      actor,
    );

    return this.attachTrialNames([updated]).then((r) => r[0]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — Feedback · coach decision · conversion · analytics
  // ══════════════════════════════════════════════════════════════════════════

  // ── Step 12: teacher / parent feedback ──────────────────────────────────────
  async submitTrialFeedback(trialId: string, dto: TrialFeedbackDto, actor: Actor) {
    const trial = await this.assertTrialAccess(trialId, actor);

    const data: any = {};
    if (dto.side === 'teacher') {
      data.teacherRating = dto.rating ?? null;
      data.teacherFeedback = dto.feedback || null;
      data.teacherRecommendsEnroll = dto.positive ?? null;
    } else {
      data.parentRating = dto.rating ?? null;
      data.parentFeedback = dto.feedback || null;
      data.parentInterested = dto.positive ?? null;
    }

    const updated = await this.prisma.leadTrial.update({ where: { id: trialId }, data });

    // Once feedback is in, the lead awaits the parent's decision.
    await this.prisma.lead.update({
      where: { id: trial.leadId },
      data: { status: LeadStatus.WAITING_PARENT_DECISION },
    });
    await this.addActivity(
      trial.leadId,
      'TRIAL_FEEDBACK',
      `${dto.side === 'teacher' ? 'Teacher' : 'Parent'} feedback recorded${dto.rating ? ` — ${dto.rating}/5` : ''}.`,
      actor,
    );

    return this.attachTrialNames([updated]).then((r) => r[0]);
  }

  // ── Step 13: coach decision — ENROLL converts the lead into a student ───────
  async coachDecision(leadId: string, dto: CoachDecisionDto, actor: Actor) {
    const lead = await this.assertAccess(leadId, actor);
    if (lead.convertedStudentId) {
      throw new BadRequestException('This lead has already been converted to a student.');
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        coachDecision: dto.decision,
        coachDecisionNotes: dto.notes || null,
        coachDecisionAt: new Date(),
      },
    });

    if (dto.decision === 'ENROLL') {
      return this.convert(lead, dto.courseCode, actor);
    }

    const status = dto.decision === 'REJECT' ? LeadStatus.REJECTED : LeadStatus.WAITING_PARENT_DECISION;
    const updated = await this.prisma.lead.update({ where: { id: leadId }, data: { status } });
    await this.addActivity(
      leadId,
      'COACH_DECISION',
      dto.decision === 'REJECT'
        ? `Coach decision: not enrolling${dto.notes ? ` — ${dto.notes}` : ''}.`
        : `Coach decision: follow up later${dto.notes ? ` — ${dto.notes}` : ''}.`,
      actor,
    );
    // Let the family know when the lead is closed out.
    if (dto.decision === 'REJECT') {
      this.notifyDecision(lead, false).catch(() => undefined);
    }
    return this.attachNames([updated]).then((r) => r[0]);
  }

  // ── Step 14: conversion — create a real StudentProfile + User ───────────────
  /*
   * A booking can carry siblings, and each child needs their own account —
   * their own progress, attendance and enrolments. So conversion creates one
   * student per child on the lead, not one per lead.
   *
   * Siblings share the family's single email address, which the User table
   * requires to be unique, so their logins are plus-addressed
   * (parent+ahmed@example.com). Mail still lands in the same inbox, and the
   * family gets one email listing every account.
   */
  private async convert(lead: any, courseCode: string | undefined, actor: Actor) {
    const siblings: { firstName: string; lastName?: string }[] = Array.isArray(lead.siblings)
      ? lead.siblings
      : [];

    const children = [
      { firstName: lead.studentFirstName, lastName: lead.studentLastName, email: lead.email },
      ...siblings.map((s, i) => ({
        firstName: s.firstName,
        lastName: s.lastName || lead.studentLastName,
        email: this.siblingEmail(lead.email, s.firstName, i),
      })),
    ];

    // Check every address before creating anything — a half-converted family
    // is far worse to clean up than a rejected conversion.
    const clashes = await this.prisma.user.findMany({
      where: { email: { in: children.map((c) => c.email) } },
      select: { email: true },
    });
    if (clashes.length) {
      throw new BadRequestException(
        `An account already exists for ${clashes.map((c) => c.email).join(', ')}. ` +
          'Change the email on the lead, or convert this family manually.',
      );
    }

    const now = new Date();
    const codes = await this.nextStudentCodes(children.length);

    // One password per child, so handing one out never exposes the others.
    const passwords = children.map(() => this.tempPassword());
    const hashes = await Promise.all(passwords.map((p) => bcrypt.hash(p, 12)));

    const created = await this.prisma.$transaction(async (tx) => {
      const profiles: { id: string; code: string; name: string; email: string }[] = [];

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const profile = await tx.studentProfile.create({
          data: {
            studentCode: codes[i],
            phone: lead.mobile,
            // Only the primary child's personal details were ever collected;
            // a sibling's gender and DOB are the coach's to fill in later.
            gender: i === 0 ? lead.gender : null,
            dateOfBirth: i === 0 ? lead.dateOfBirth : null,
            guardianName: lead.parentName || null,
            joiningDate: now,
            user: {
              create: {
                email: child.email,
                passwordHash: hashes[i],
                firstName: child.firstName,
                lastName: child.lastName ?? '',
                country: lead.country,
                role: Role.STUDENT,
                status: UserStatus.ACTIVE,
              },
            },
          },
          select: { id: true },
        });

        // Enrol into the chosen LmsCourse if one was supplied.
        if (courseCode) {
          const lms = await tx.lmsCourse.findUnique({ where: { code: courseCode } });
          if (lms) {
            const slug = courseCode.toLowerCase();
            const course = await tx.course.upsert({
              where: { slug },
              update: {},
              create: {
                title: lms.title,
                slug,
                description: lms.description,
                price: 0,
                status: CourseStatus.PUBLISHED,
              },
            });
            await tx.enrollment.create({
              data: {
                studentId: profile.id,
                courseId: course.id,
                status: EnrollmentStatus.ACTIVE,
                startedAt: now,
              },
            });
            await tx.lmsCourse.update({
              where: { id: lms.id },
              data: { studentsCount: { increment: 1 } },
            });
          }
        }

        profiles.push({
          id: profile.id,
          code: codes[i],
          name: `${child.firstName} ${child.lastName ?? ''}`.trim(),
          // Carried rather than recomputed later: the address was derived from
          // the first name, so rebuilding it from the full name would print a
          // login in the welcome email that does not exist.
          email: child.email,
        });
      }

      return profiles;
    });

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.CONVERTED,
        // The singular pair keeps pointing at the primary child so every
        // existing screen and query carries on working unchanged.
        convertedStudentId: created[0].id,
        convertedStudentCode: created[0].code,
        convertedStudents: created,
        convertedAt: now,
      },
    });

    const studentCode = created[0].code;
    await this.addActivity(
      lead.id,
      'CONVERTED',
      created.length === 1
        ? `Converted to student ${studentCode}. Account activated.`
        : `Converted to ${created.length} students (${created.map((c) => c.code).join(', ')}). Accounts activated.`,
      actor,
    );

    // Email the family their new login credentials + in-app alert to staff.
    this.notifyConverted(lead, created, passwords).catch(() => undefined);
    this.notifications
      .createForRoles([Role.ADMIN, Role.ACADEMIC_COACH], {
        type: 'LEAD_CONVERTED',
        title: 'Lead Converted 🎉',
        body: `${lead.studentFirstName} ${lead.studentLastName} (${lead.leadNumber}) is now student ${studentCode}.`,
        link: `/leads/${lead.id}`,
      })
      .catch(() => undefined);

    return this.attachNames([updated]).then((r) => r[0]);
  }

  private tempPassword() {
    // Human-typeable temporary password, e.g. "Trial-4821".
    return `Trial-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  // ── Step 15: teacher's trial queue (today / upcoming / all) ─────────────────
  async myTrials(userId: string, scope: 'today' | 'upcoming' | 'all' = 'upcoming') {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return [];

    const where: any = { teacherId: profile.id };
    const now = new Date();
    if (scope === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: start, lte: end };
    } else if (scope === 'upcoming') {
      where.scheduledAt = { gte: new Date(now.getTime() - 60 * 60 * 1000) };
    }

    const trials = await this.prisma.leadTrial.findMany({
      where,
      orderBy: { scheduledAt: scope === 'all' ? 'desc' : 'asc' },
    });
    return this.attachTrialNames(trials, true);
  }

  // ── Full funnel analytics (Step 15 dashboards) ──────────────────────────────
  async getFunnel(user?: Actor) {
    const byStatus = await this.prisma.lead.groupBy({ by: ['status'], where: this.scopeFor(user), _count: { _all: true } });
    const statusCounts: Record<string, number> = {};
    byStatus.forEach((r) => (statusCounts[r.status] = r._count._all));

    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const converted = statusCounts[LeadStatus.CONVERTED] || 0;
    const rejected = statusCounts[LeadStatus.REJECTED] || 0;

    // Cumulative funnel: each stage counts leads that reached at least that far.
    const order = [
      LeadStatus.NEW,
      LeadStatus.CONTACTED,
      LeadStatus.EVALUATION_COMPLETED,
      LeadStatus.TEACHER_ASSIGNED,
      LeadStatus.TRIAL_SCHEDULED,
      LeadStatus.TRIAL_COMPLETED,
      LeadStatus.WAITING_PARENT_DECISION,
      LeadStatus.CONVERTED,
    ];
    const rank = (s: string) => order.indexOf(s as any);
    const funnel = order.map((stage, i) => {
      const reached = byStatus
        .filter((r) => rank(r.status) >= i && r.status !== LeadStatus.REJECTED && r.status !== LeadStatus.CLOSED)
        .reduce((a, r) => a + r._count._all, 0);
      return { stage, reached };
    });

    // Trial + rating stats.
    const [trialAgg, trialByStatus, tRating, pRating] = await Promise.all([
      this.prisma.leadTrial.count(),
      this.prisma.leadTrial.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.leadTrial.aggregate({ _avg: { teacherRating: true } }),
      this.prisma.leadTrial.aggregate({ _avg: { parentRating: true } }),
    ]);
    const trialStatusCounts: Record<string, number> = {};
    trialByStatus.forEach((r) => (trialStatusCounts[r.status] = r._count._all));

    const scheduled = trialAgg;
    const attended = trialStatusCounts['COMPLETED'] || 0;
    const noShow = trialStatusCounts['NO_SHOW'] || 0;

    return {
      total,
      converted,
      rejected,
      conversionRate: total ? Math.round((converted / total) * 100) : 0,
      funnel,
      trials: {
        scheduled,
        attended,
        noShow,
        attendanceRate: scheduled ? Math.round((attended / scheduled) * 100) : 0,
        avgTeacherRating: tRating._avg.teacherRating ? Math.round(tRating._avg.teacherRating * 10) / 10 : 0,
        avgParentRating: pRating._avg.parentRating ? Math.round(pRating._avg.parentRating * 10) / 10 : 0,
      },
    };
  }

  // ── Reminder sweep worker ───────────────────────────────────────────────────
  private async sweepReminders() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    const active = { in: ['SCHEDULED', 'RESCHEDULED'] as any };

    // 24-hour reminders: trials starting within the next 24h, not yet reminded.
    const due24 = await this.prisma.leadTrial.findMany({
      where: { status: active, reminder24hSentAt: null, scheduledAt: { gt: now, lte: in24h } },
    });
    for (const t of due24) {
      await this.sendTrialReminder(t, '24 hours').catch(() => undefined);
      await this.prisma.leadTrial.update({ where: { id: t.id }, data: { reminder24hSentAt: new Date() } });
    }

    // 1-hour reminders.
    const due1 = await this.prisma.leadTrial.findMany({
      where: { status: active, reminder1hSentAt: null, scheduledAt: { gt: now, lte: in1h } },
    });
    for (const t of due1) {
      await this.sendTrialReminder(t, '1 hour').catch(() => undefined);
      await this.prisma.leadTrial.update({ where: { id: t.id }, data: { reminder1hSentAt: new Date() } });
    }
  }

  // Manual "send reminder now" trigger from the UI.
  async sendReminderNow(trialId: string, user?: Actor) {
    const trial = await this.assertTrialAccess(trialId, user);
    await this.sendTrialReminder(trial, 'soon');
    return { sent: true };
  }

  private async sendTrialReminder(trial: any, window: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: trial.leadId } });
    if (!lead) return;
    const name = lead.parentName || `${lead.studentFirstName} ${lead.studentLastName}`;
    const when = new Date(trial.scheduledAt).toLocaleString();
    const html = this.trialEmail(
      'Trial Class Reminder',
      `
      <p>Dear ${name},</p>
      <p>This is a reminder that <b>${lead.studentFirstName}</b>'s trial class is scheduled in <b>${window}</b>.</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">When</td><td style="padding:6px 0;font-weight:700;">${when}</td></tr>
        ${trial.meetingProvider ? `<tr><td style="padding:6px 0;color:#6b7280;">Platform</td><td style="padding:6px 0;font-weight:700;">${trial.meetingProvider}</td></tr>` : ''}
        ${trial.meetingLink ? `<tr><td style="padding:6px 0;color:#6b7280;">Join link</td><td style="padding:6px 0;"><a href="${trial.meetingLink}">${trial.meetingLink}</a></td></tr>` : ''}
      </table>
      <p style="color:#6b7280;">Please join a few minutes early. We look forward to seeing you!</p>`,
    );
    await this.emails.sendMail(
      lead.email,
      `Reminder: trial class in ${window}`,
      `Reminder: ${lead.studentFirstName}'s trial class is in ${window} (${when}). ${trial.meetingLink || ''}`,
      undefined,
      html,
    );
  }

  // ── Trial notifications ─────────────────────────────────────────────────────
  private async notifyTrialScheduled(lead: any, trial: any, teacherId: string | null) {
    if (teacherId) {
      const tp = await this.prisma.teacherProfile.findUnique({
        where: { id: teacherId },
        select: { userId: true },
      });
      if (tp) {
        this.notifications
          .createFor(tp.userId, {
            type: 'TRIAL_SCHEDULED',
            title: 'New Trial Class',
            body: `Trial with ${lead.studentFirstName} ${lead.studentLastName} on ${new Date(trial.scheduledAt).toLocaleString()}.`,
            link: `/teacher/trials`,
          })
          .catch(() => undefined);
      }
    }

    const name = lead.parentName || `${lead.studentFirstName} ${lead.studentLastName}`;
    const when = new Date(trial.scheduledAt).toLocaleString();
    const html = this.trialEmail(
      'Your Trial Class is Booked',
      `
      <p>Dear ${name},</p>
      <p>Great news — a free trial class for <b>${lead.studentFirstName}</b> has been scheduled.</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">When</td><td style="padding:6px 0;font-weight:700;">${when}</td></tr>
        ${trial.meetingProvider ? `<tr><td style="padding:6px 0;color:#6b7280;">Platform</td><td style="padding:6px 0;font-weight:700;">${trial.meetingProvider}</td></tr>` : ''}
        ${trial.meetingLink ? `<tr><td style="padding:6px 0;color:#6b7280;">Join link</td><td style="padding:6px 0;"><a href="${trial.meetingLink}">${trial.meetingLink}</a></td></tr>` : ''}
      </table>
      <p style="color:#6b7280;">We'll send you a reminder before the class. Reference: <b>${lead.leadNumber}</b></p>`,
    );
    await this.emails
      .sendMail(
        lead.email,
        'Your free trial class is booked',
        `Your trial class for ${lead.studentFirstName} is booked for ${when}. ${trial.meetingLink || ''}`,
        undefined,
        html,
      )
      .catch(() => undefined);
  }

  /**
   * One welcome email for the whole family, listing every account created.
   * `students` and `passwords` are index-aligned by `convert`.
   */
  private async notifyConverted(
    lead: any,
    students: { id: string; code: string; name: string; email: string }[],
    passwords: string[],
  ) {
    const name = lead.parentName || `${lead.studentFirstName} ${lead.studentLastName}`;
    const block = students
      .map(
        (s, i) => `
      <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;border-top:1px solid #e5e7eb;">
        <tr><td style="padding:6px 0;color:#6b7280;">Student</td><td style="padding:6px 0;font-weight:700;">${s.name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Student ID</td><td style="padding:6px 0;font-weight:700;">${s.code}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Login email</td><td style="padding:6px 0;font-weight:700;">${s.email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Temporary password</td><td style="padding:6px 0;font-weight:700;">${passwords[i]}</td></tr>
      </table>`,
      )
      .join('');

    const html = this.trialEmail(
      'Welcome to the Academy 🎉',
      `
      <p>Dear ${name},</p>
      <p>Congratulations! ${
        students.length === 1
          ? `<b>${students[0].name}</b> is now enrolled and a student account has been created.`
          : `<b>${students.length} student accounts</b> have been created — one for each child.`
      }</p>
      ${block}
      <p style="color:#b45309;">For your security, please change ${
        students.length === 1 ? 'this password' : 'these passwords'
      } after the first sign-in.</p>
      ${
        students.length > 1
          ? '<p style="color:#6b7280;">Each child signs in with their own email above; all mail still reaches this inbox.</p>'
          : ''
      }`,
    );

    await this.emails
      .sendMail(
        lead.email,
        'Welcome — your student account is ready',
        students
          .map((s, i) => `${s.name}: ID ${s.code}, login ${s.email} / ${passwords[i]}`)
          .join('\n') + '\nPlease change the password after first sign-in.',
        undefined,
        html,
      )
      .catch(() => undefined);
  }

  /*
   * A sibling's login address. The User table needs unique emails and a family
   * has one inbox, so the child's name is plus-addressed onto it. The index
   * keeps two siblings with the same first name apart.
   */
  private siblingEmail(parentEmail: string, firstName: string, index: number): string {
    const [local, domain] = parentEmail.toLowerCase().trim().split('@');
    if (!domain) return parentEmail;
    const tag = (firstName || `child${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    return `${local}+${tag || `child${index + 1}`}${index + 1}@${domain}`;
  }

  /**
   * The next `count` student codes. Derived from the highest existing code
   * rather than a row count, which would repeat a code after any deletion.
   */
  private async nextStudentCodes(count: number): Promise<string[]> {
    const latest = await this.prisma.studentProfile.findFirst({
      where: { studentCode: { startsWith: 'ST-' } },
      orderBy: { studentCode: 'desc' },
      select: { studentCode: true },
    });
    let next = Number(latest?.studentCode?.slice(3)) || 0;

    const codes: string[] = [];
    while (codes.length < count) {
      next += 1;
      const candidate = `ST-${String(next).padStart(5, '0')}`;
      // Cheap insurance against a gap-filling code already being taken.
      const clash = await this.prisma.studentProfile.findUnique({
        where: { studentCode: candidate },
        select: { id: true },
      });
      if (!clash) codes.push(candidate);
    }
    return codes;
  }

  private async notifyDecision(lead: any, enrolled: boolean) {
    const name = lead.parentName || `${lead.studentFirstName} ${lead.studentLastName}`;
    const html = this.trialEmail(
      'Update on your enquiry',
      `
      <p>Dear ${name},</p>
      <p>Thank you for taking the time to explore our academy. After your trial we won't be moving ahead with enrolment at this time.</p>
      ${lead.coachDecisionNotes ? `<p style="color:#6b7280;">${lead.coachDecisionNotes}</p>` : ''}
      <p style="color:#6b7280;">You're always welcome to reach out again in the future.</p>`,
    );
    void enrolled;
    await this.emails
      .sendMail(lead.email, 'Update on your enquiry', 'Thank you for your interest.', undefined, html)
      .catch(() => undefined);
  }

  private trialEmail(title: string, body: string) {
    return `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f6f8;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e1e4e8;">
          <div style="background:#133C55;padding:26px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">${title}</h1>
          </div>
          <div style="padding:28px;color:#1f2937;font-size:14px;line-height:1.7;">${body}</div>
        </div>
      </div>`;
  }

  // Resolve teacherId -> name (and optionally the lead summary for teacher views).
  private async attachTrialNames(trials: any[], withLead = false) {
    const teacherIds = [...new Set(trials.map((t) => t.teacherId).filter(Boolean))];
    const leadIds = withLead ? [...new Set(trials.map((t) => t.leadId))] : [];

    const [teachers, leads] = await Promise.all([
      teacherIds.length
        ? this.prisma.teacherProfile.findMany({
            where: { id: { in: teacherIds as string[] } },
            select: { id: true, user: { select: { firstName: true, lastName: true } } },
          })
        : [],
      leadIds.length
        ? this.prisma.lead.findMany({
            where: { id: { in: leadIds as string[] } },
            select: {
              id: true, leadNumber: true, studentFirstName: true, studentLastName: true,
              interestedSubject: true, email: true, mobile: true, timeZone: true,
            },
          })
        : [],
    ]);

    const tMap = new Map(teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`]));
    const lMap = new Map(leads.map((l) => [l.id, l]));

    return trials.map((t) => ({
      ...t,
      teacherName: t.teacherId ? tMap.get(t.teacherId) || null : null,
      ...(withLead ? { lead: lMap.get(t.leadId) || null } : {}),
    }));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private async addActivity(leadId: string, type: string, message: string, actor?: Actor) {
    return this.prisma.leadActivity.create({
      data: { leadId, type, message, actorId: actor?.id || null, actorName: actor?.name || null },
    });
  }

  // Resolve coach + teacher ids to display names for the UI.
  private async attachNames(leads: any[]) {
    const coachIds = [...new Set(leads.map((l) => l.assignedCoachId).filter(Boolean))];
    const teacherIds = [
      ...new Set(
        leads.flatMap((l) => [l.assignedTeacherId, l.recommendedTeacherId]).filter(Boolean),
      ),
    ];

    const [coaches, teachers] = await Promise.all([
      coachIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: coachIds as string[] } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
      teacherIds.length
        ? this.prisma.teacherProfile.findMany({
            where: { id: { in: teacherIds as string[] } },
            select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } } },
          })
        : [],
    ]);

    const coachMap = new Map(coaches.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
    const teacherMap = new Map(
      teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`]),
    );

    return leads.map((l) => ({
      ...l,
      assignedCoachName: l.assignedCoachId ? coachMap.get(l.assignedCoachId) || null : null,
      assignedTeacherName: l.assignedTeacherId ? teacherMap.get(l.assignedTeacherId) || null : null,
      recommendedTeacherName: l.recommendedTeacherId
        ? teacherMap.get(l.recommendedTeacherId) || null
        : null,
    }));
  }

  // Step 4 — new-lead notifications: email the parent, alert coaches + admins.
  private async notifyNewLead(lead: any) {
    // In-app alert to every admin & academic coach.
    await this.notifications.createForRoles([Role.ADMIN, Role.ACADEMIC_COACH], {
      type: 'LEAD_NEW',
      title: '1 New Lead Received',
      body: `${lead.studentFirstName} ${lead.studentLastName} — ${lead.interestedSubject || 'General'} (${lead.leadNumber}).`,
      link: `/leads/${lead.id}`,
    });

    // Thank-you email to the parent.
    const name = lead.parentName || `${lead.studentFirstName} ${lead.studentLastName}`;
    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f6f8;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e1e4e8;">
          <div style="background:#133C55;padding:26px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">Thank you for registering</h1>
          </div>
          <div style="padding:28px;color:#1f2937;font-size:14px;line-height:1.7;">
            <p>Dear ${name},</p>
            <p>We have received your trial request for <b>${lead.studentFirstName} ${lead.studentLastName}</b>. Our Academic Coach will contact you shortly to schedule an evaluation.</p>
            <p style="color:#6b7280;">Reference: <b>${lead.leadNumber}</b></p>
          </div>
        </div>
      </div>`;
    await this.emails
      .sendMail(
        lead.email,
        'Thank you for registering',
        'Thank you for registering. Our Academic Coach will contact you shortly.',
        undefined,
        html,
      )
      .catch(() => undefined);
  }
}
