import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

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
import { BillingService } from '../finance/billing.service';
import {
  AssignTeacherLeadDto,
  CoachDecisionDto,
  CreateLeadDto,
  EvaluateLeadDto,
  ListLeadsDto,
  ScheduleTrialDto,
  TrialAttendanceDto,
  TrialFeedbackDto,
  TrialInfoFormDto,
  TrialReportDto,
  TrialStatusDto,
  TRIAL_LEVEL_OPTIONS,
  UpdateLeadDto,
  UpdateTrialDto,
  WEEKDAY_OPTIONS,
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
    private readonly billing: BillingService,
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
     * The slot came from merged availability, so it belongs to no one teacher
     * — but somebody has to run the class. This used to be left null for the
     * coach to fill in, and nothing chased it: the trial appeared on no
     * teacher's screen while the family still got their reminder. Pick the
     * obvious candidate now; the coach can change it, and if nobody is free
     * this stays null and the trial is flagged as needing a teacher.
     */
    const teacherId = await this.availability.pickTeacherFor({
      date: dto.preferredDate!,
      slot,
      durationMins: 30,
      subject: dto.interestedSubject,
      preferredGender: dto.preferredTeacherGender,
    });

    const trial = await this.prisma.leadTrial.create({
      data: {
        leadId: lead.id,
        teacherId,
        scheduledAt: startAt,
        durationMins: 30,
        timeZone: offered.timeZone,
        meetingProvider: 'Zoom',
        status: 'SCHEDULED',
      },
    });

    if (teacherId) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { assignedTeacherId: teacherId, assignedTeacherAt: new Date() },
      });
    }

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
      return { items: [], meta: { page, limit, total: 0, totalPages: 1, hiddenConverted: 0 } };
    }

    /*
     * A converted request has left this queue — it is a student now, and the
     * Students section is where it lives. Leaving them here made the list a
     * mix of work to do and work already finished, and put rows on screen
     * that deliberately refuse to be deleted.
     *
     * Filtering explicitly by "Converted" still reaches them: this is the
     * default view, not a restriction.
     */
    const hideConverted = !status;

    const where: any = {
      ...(status ? { status } : { status: { not: LeadStatus.CONVERTED } }),
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

    /*
     * How many are being kept out of view. Said out loud, because a total on
     * the dashboard that does not match the rows underneath it is the kind of
     * discrepancy people waste an afternoon on.
     */
    const hiddenConverted = hideConverted
      ? await this.prisma.lead.count({
          where: { ...where, status: LeadStatus.CONVERTED },
        })
      : 0;

    const withNames = await this.attachNames(items);

    return {
      items: withNames,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hiddenConverted,
      },
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

    /*
     * The details the family typed in themselves. A blank string clears the
     * field; a field the caller left out is untouched — the edit form sends
     * only what changed, and "not sent" must never mean "erase".
     */
    const TEXT_FIELDS = [
      'studentFirstName', 'studentLastName', 'mobile', 'countryCode', 'whatsappNumber',
      'parentName', 'relationship', 'gender', 'currentGrade', 'currentSchool',
      'country', 'timeZone', 'interestedSubject', 'currentLevel', 'preferredLanguage',
      'preferredTeacherGender', 'learningGoal', 'specialRequirements', 'medicalDisability',
    ] as const;
    for (const f of TEXT_FIELDS) {
      if (dto[f] !== undefined) data[f] = dto[f] || null;
    }
    // Names are required on the record, so an empty one is a no-op rather
    // than a null that breaks every screen that prints them.
    if (!data.studentFirstName) delete data.studentFirstName;
    if (!data.studentLastName) delete data.studentLastName;

    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = this.parseDate(dto.dateOfBirth, 'date of birth');
    }
    if (dto.email !== undefined) {
      // Stored lowercased, the same way booking stores it — otherwise a
      // corrected address stops matching the one the family booked with.
      data.email = dto.email.trim().toLowerCase();
    }

    const updated = await this.prisma.lead.update({ where: { id }, data });

    /*
     * Corrections are logged with both values. Somebody changing the address
     * a family's reminders go to should leave a trace of what it used to be.
     */
    const changes = [
      dto.email !== undefined && data.email !== lead.email ? `email ${lead.email} → ${data.email}` : null,
      dto.mobile !== undefined && data.mobile !== lead.mobile ? `phone ${lead.mobile ?? '—'} → ${data.mobile ?? '—'}` : null,
      // Compared against what was stored, not merely "a name was sent" —
      // re-saving the form unchanged should not write a history entry.
      updated.studentFirstName !== lead.studentFirstName ||
      updated.studentLastName !== lead.studentLastName
        ? `name ${lead.studentFirstName} ${lead.studentLastName} → ${updated.studentFirstName} ${updated.studentLastName}`
        : null,
    ].filter(Boolean);
    if (changes.length) {
      await this.addActivity(id, 'DETAILS_EDITED', `Details corrected — ${changes.join(', ')}.`, actor);
    }

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

  /**
   * Delete a trial request outright.
   *
   * Trials and the activity timeline cascade with it, but three things do not
   * clean themselves up and each is visible to somebody:
   *  - a live Zoom room the family could still walk into,
   *  - staff notifications linking to a lead that now 404s,
   *  - the slot the request was holding, which frees itself once the rows go.
   *
   * A converted lead is refused. The student account it created survives the
   * delete — `convertedStudentId` is a plain column, not a foreign key — so
   * deleting the lead would silently sever a paying student from the record of
   * how they arrived, and nothing on screen would say so.
   */
  async remove(id: string, actor: Actor) {
    const lead = await this.assertAccess(id, actor);
    if (lead.convertedStudentId) {
      /*
       * Refuse only while the student is actually there. The point of the
       * guard is to keep a real student attached to the record of how they
       * joined — once that student has been removed, the link is already
       * dangling and the lead is debris the admin should be able to sweep up.
       * Checking the column alone made the message insist on protecting
       * somebody who no longer existed.
       */
      const student = await this.prisma.studentProfile.findUnique({
        where: { id: lead.convertedStudentId },
        select: { id: true },
      });
      if (student) {
        throw new BadRequestException(
          `${lead.studentFirstName} ${lead.studentLastName} has already been enrolled as ${lead.convertedStudentCode}. ` +
            'Deleting the request would cut the student loose from how they joined — archive it instead.',
        );
      }
    }

    const trials = await this.prisma.leadTrial.findMany({
      where: { leadId: id },
      select: { meetingId: true },
    });
    for (const t of trials) {
      if (t.meetingId) await this.zoom.cancelMeeting(t.meetingId).catch(() => undefined);
    }

    await this.prisma.lead.delete({ where: { id } });
    /*
     * After the row is gone, not before. Notifications are dispatched
     * fire-and-forget, so one kicked off just before this call can still be
     * mid-flight; clearing first left it pointing at a lead that no longer
     * exists and a colleague clicking through to a 404. Sweeping afterwards
     * catches everything written up to this moment. A write that lands during
     * these two statements is still possible and would leave one orphan — rare
     * enough to accept, and it costs a dead link rather than data.
     */
    await this.prisma.notification.deleteMany({ where: { link: `/leads/${id}` } });

    return {
      id,
      leadNumber: lead.leadNumber,
      name: `${lead.studentFirstName} ${lead.studentLastName}`.trim(),
    };
  }

  /**
   * Delete several at once.
   *
   * Reports per request rather than failing the batch: rolling back nineteen
   * deletions because the twentieth was already enrolled would be a worse
   * outcome than telling the user which one could not go.
   */
  async removeMany(ids: string[], actor: Actor) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) throw new BadRequestException('Select at least one trial request.');
    if (unique.length > 100) {
      throw new BadRequestException('Delete up to 100 requests at a time.');
    }

    const deleted: { id: string; leadNumber: string; name: string }[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const id of unique) {
      try {
        deleted.push(await this.remove(id, actor));
      } catch (e: any) {
        failed.push({ id, reason: e?.message ?? 'Could not be deleted.' });
      }
    }

    return { deleted: deleted.length, failed: failed.length, deletedItems: deleted, failures: failed };
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

    /*
     * A teacher who sat in the room and assessed the student outranks a level
     * derived from an evaluation score. This used to overwrite the assessed
     * level with the heuristic every time the coach opened the tab, silently
     * discarding the report they had just been notified about.
     */
    const [report] = await this.prisma.leadTrial.findMany({
      where: { leadId: id, reportSubmittedAt: { not: null }, assessedLevel: { not: null } },
      orderBy: { reportSubmittedAt: 'desc' },
      take: 1,
    });

    const level = report?.assessedLevel ?? rec.level;

    await this.prisma.lead.update({
      where: { id },
      data: {
        recommendedLevel: level,
        recommendedBatch: rec.batch,
        recommendedTeacherId: teacher?.id || null,
      },
    });

    let fromTeacher: Record<string, unknown> | null = null;
    if (report) {
      const [named] = await this.attachTrialNames([report]);
      fromTeacher = {
        trialId: report.id,
        teacherName: named.teacherName,
        assessedLevel: report.assessedLevel,
        recommendedCourse: report.recommendedCourse,
        recommendsEnroll: report.teacherRecommendsEnroll,
        rating: report.teacherRating,
        feedback: report.teacherFeedback,
        submittedAt: report.reportSubmittedAt?.toISOString() ?? null,
      };
    }

    return {
      recommendedLevel: level,
      recommendedBatch: rec.batch,
      teacher,
      // Which of the two produced the level above, so the UI need not guess.
      source: report ? 'teacher' : 'evaluation',
      fromTeacher,
    };
  }

  /*
   * Where a status sits in the pipeline. Shared by the funnel and by every
   * write that should only ever move a lead forward — a lead that has sat a
   * trial must not be dragged back to "Teacher Assigned" by an edit.
   *
   * Every status the enum can hold is listed. One missing from here ranks -1,
   * which used to drop those leads out of the funnel entirely: the top bar
   * then disagreed with the "Total Requests" tile printed right above it.
   */
  private static readonly STAGE_ORDER: LeadStatus[] = [
    LeadStatus.NEW,
    LeadStatus.CONTACT_PENDING,
    LeadStatus.CONTACTED,
    LeadStatus.EVALUATION_SCHEDULED,
    LeadStatus.EVALUATION_COMPLETED,
    LeadStatus.TEACHER_ASSIGNED,
    LeadStatus.TRIAL_SCHEDULED,
    LeadStatus.TRIAL_COMPLETED,
    LeadStatus.WAITING_PARENT_DECISION,
    LeadStatus.CONVERTED,
  ];

  private stageRank(status: string) {
    return LeadsService.STAGE_ORDER.indexOf(status as LeadStatus);
  }

  /** Part of the day a preference falls in, whether it reads "16:30" or "Evening 4-7". */
  private batchLabel(slot?: string | null) {
    if (!slot) return 'Flexible Batch';
    const clock = /^(\d{1,2}):(\d{2})/.exec(slot);
    if (!clock) return `${slot.split(' ')[0]} Batch`;
    const hour = Number(clock[1]);
    if (hour < 12) return 'Morning Batch';
    if (hour < 16) return 'Afternoon Batch';
    if (hour < 20) return 'Evening Batch';
    return 'Night Batch';
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

    /*
     * `preferredTimeSlots` used to hold the old form's coarse labels ("Morning
     * 9-12"), which is what taking the first word was for. The trial report and
     * the family's info form now write a clock time into it, so that same line
     * printed "16:30 Batch". Read the hour and name the part of the day.
     */
    const slot = (lead.preferredTimeSlots || [])[0] as string | undefined;
    const batch = this.batchLabel(slot);

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
        /*
         * Only forward. A lead whose trial has already happened must not drop
         * back to "Teacher Assigned" because somebody changed the teacher —
         * that reads as a regression on the badge and pulls the lead back a
         * stage in the funnel.
         */
        ...(this.stageRank(lead.status) < this.stageRank(LeadStatus.TEACHER_ASSIGNED)
          ? { status: LeadStatus.TEACHER_ASSIGNED }
          : {}),
      },
    });

    /*
     * The trials go with them.
     *
     * Assigning a teacher to the lead used to leave every already-scheduled
     * trial on `teacherId: null` — and a website booking always starts that
     * way. The coach saw "Currently assigned: X" on one tab and "Unassigned
     * teacher" on the next, while X's own trials page stayed empty and the
     * report endpoint refused them. Nobody was assigned where it counted.
     */
    const openTrials = await this.prisma.leadTrial.findMany({
      where: { leadId: id, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
      select: { id: true, teacherId: true, scheduledAt: true },
    });
    const adopted = openTrials.filter((t) => t.teacherId !== teacherId);
    if (adopted.length) {
      await this.prisma.leadTrial.updateMany({
        where: { id: { in: adopted.map((t) => t.id) } },
        data: { teacherId },
      });
      for (const t of adopted) {
        this.notifyTrialScheduled(lead, { ...t, teacherId }, teacherId).catch(() => undefined);
      }
    }

    await this.addActivity(
      id,
      'TEACHER_ASSIGNED',
      `Teacher ${teacherName} assigned${dto.auto ? ' (auto)' : ''}` +
        (adopted.length
          ? ` and put on ${adopted.length} scheduled trial${adopted.length > 1 ? 's' : ''}.`
          : '.'),
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

    /*
     * A coach scheduling by hand has a teacher in front of them, so there is no
     * reason to save a class nobody is going to run. The website flow is the
     * only place a trial may still start teacherless, and only when literally
     * nobody is free — there it is flagged instead.
     */
    const teacherId = dto.teacherId || lead.assignedTeacherId || null;
    if (!teacherId) {
      throw new BadRequestException(
        'Choose a teacher for this trial. If nobody is listed, no teacher has approved availability for that time yet.',
      );
    }

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
    /*
     * Editing may change who teaches, never blank it: a trial with no teacher
     * shows on nobody's schedule while the family is still sent a reminder for
     * it. Cancel it or move it, but do not quietly empty it.
     */
    if (dto.teacherId !== undefined) {
      if (!dto.teacherId) {
        throw new BadRequestException(
          'A trial needs a teacher. Choose a different one, or cancel the trial.',
        );
      }
      data.teacherId = dto.teacherId;
    }
    if (dto.durationMins !== undefined) data.durationMins = dto.durationMins;
    if (dto.timeZone !== undefined) data.timeZone = dto.timeZone || null;
    if (dto.meetingProvider !== undefined) data.meetingProvider = dto.meetingProvider || null;
    if (dto.meetingLink !== undefined) data.meetingLink = dto.meetingLink || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.status) {
      data.status = dto.status;
      /*
       * Status and attendance are one fact — setTrialStatus keeps them in step
       * and this route must not be the way round it. Marking a trial COMPLETED
       * here with attendance still null leaves a class that happened with
       * nobody recorded as present.
       */
      if (dto.status === 'COMPLETED') {
        data.attendance = 'PRESENT';
        data.attendedAt = trial.attendedAt ?? new Date();
      } else if (dto.status === 'NO_SHOW') {
        data.attendance = 'ABSENT';
        data.attendedAt = null;
      }
    }

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

    /*
     * Keep the teacher on the lead in step, exactly as scheduling does. Without
     * this, assigning or changing the teacher here moved the trial but left the
     * lead pointing at the old person — or at nobody — and every screen that
     * reads the lead rather than the trial disagreed with this one.
     */
    if (data.teacherId && data.teacherId !== trial.teacherId) {
      await this.prisma.lead.update({
        where: { id: trial.leadId },
        data: { assignedTeacherId: data.teacherId, assignedTeacherAt: new Date() },
      });
      await this.addActivity(
        trial.leadId,
        'TEACHER_ASSIGNED',
        trial.teacherId ? 'Trial teacher changed.' : 'Teacher assigned to the trial.',
        actor,
      );
    }

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

  /**
   * Step 11 — mark attendance.
   *
   * Attendance and status are one fact, so this is the same operation as
   * setTrialStatus under an older name and delegates to it rather than
   * writing the two columns itself. Kept apart they drifted: this route wrote
   * status with none of the rules setTrialStatus enforces, so a teacher could
   * mark a coach-cancelled trial "present" to revive it, or flip a trial with
   * a filed report back to a no-show — both of which the other route refuses.
   */
  async markAttendance(trialId: string, dto: TrialAttendanceDto, actor: Actor) {
    return this.setTrialStatus(
      trialId,
      { status: dto.attendance === 'PRESENT' ? 'COMPLETED' : 'NO_SHOW' },
      actor,
    );
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

  // ══════════════════════════════════════════════════════════════════════════
  // Step 14 — the teacher's trial report
  //
  // The teacher the trial was assigned to runs the session and records it:
  // what they covered, the details the family gave them, and the level and
  // course they recommend. Saved as a draft while the class is running, then
  // submitted, which is what tells the coach the trial is theirs to act on.
  // ══════════════════════════════════════════════════════════════════════════

  /** The catalogue a teacher picks a recommendation from. */
  async trialOptions() {
    const [courses, packages] = await Promise.all([
      this.prisma.course.findMany({
        where: { status: CourseStatus.PUBLISHED },
        select: { id: true, title: true, level: { select: { name: true } } },
        orderBy: { title: 'asc' },
      }),
      this.prisma.package.findMany({
        where: { active: true },
        select: { id: true, name: true, price: true, classesPerMonth: true },
        orderBy: { price: 'asc' },
      }),
    ]);

    return {
      courses: courses.map((c) => ({ id: c.id, title: c.title, level: c.level?.name ?? null })),
      packages: packages.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        classesPerMonth: p.classesPerMonth,
      })),
      levels: TRIAL_LEVEL_OPTIONS as unknown as string[],
      weekdays: WEEKDAY_OPTIONS as unknown as string[],
    };
  }

  /**
   * The trial, its report so far, and everything the family submitted when
   * they booked — the teacher has to check that information against what they
   * are told in the session, which they cannot do without seeing it.
   */
  async getTrialReport(trialId: string, user: Actor) {
    await this.assertTrialAccess(trialId, user);

    // The lead block comes from attachTrialNames, the one place that decides
    // what a trial's lead looks like.
    const trial = await this.prisma.leadTrial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException(`Trial ${trialId} not found`);

    const [withName] = await this.attachTrialNames([trial]);
    return withName;
  }

  /** Save the report without finishing it. Called as the teacher types. */
  async saveTrialReport(trialId: string, dto: TrialReportDto, actor: Actor) {
    const trial = await this.assertTrialAccess(trialId, actor);
    if (trial.reportSubmittedAt) {
      throw new BadRequestException('This report has already been submitted.');
    }

    const updated = await this.prisma.leadTrial.update({
      where: { id: trialId },
      data: await this.reportData(dto),
    });
    return this.attachTrialNames([updated]).then((r) => r[0]);
  }

  /**
   * Finish the report. Beyond stamping the trial this is the hand-back to the
   * coach: the lead moves to WAITING_PARENT_DECISION, the recommended level
   * lands on the lead, and the assigned coach is told there is a decision to
   * make.
   */
  async submitTrialReport(trialId: string, dto: TrialReportDto, actor: Actor) {
    const trial = await this.assertTrialAccess(trialId, actor);
    if (trial.reportSubmittedAt) {
      throw new BadRequestException('This report has already been submitted.');
    }
    if (trial.status === 'CANCELLED') {
      throw new BadRequestException('This trial was cancelled — there is nothing to report on.');
    }
    if (trial.attendance === 'ABSENT') {
      throw new BadRequestException(
        'The student was marked absent. Reopen attendance before filing a report.',
      );
    }

    const data = await this.reportData(dto);
    const level = data.assessedLevel ?? trial.assessedLevel;
    if (!level) {
      throw new BadRequestException('Record the level you assessed the student at before submitting.');
    }

    const updated = await this.prisma.leadTrial.update({
      where: { id: trialId },
      data: {
        ...data,
        reportSubmittedAt: new Date(),
        // Filing a report is itself the statement that the class happened.
        status: 'COMPLETED',
        attendance: trial.attendance ?? 'PRESENT',
        attendedAt: trial.attendedAt ?? new Date(),
      },
    });

    /*
     * The teacher was the one in the room, so where they corrected what the
     * family typed into the booking form, their version wins on the lead. Only
     * the fields they actually filled in — a blank box is "not asked", not
     * "erase what we had".
     */
    const leadPatch: any = {
      status: LeadStatus.WAITING_PARENT_DECISION,
      recommendedLevel: level,
    };
    if (updated.studentDob) leadPatch.dateOfBirth = updated.studentDob;
    if (updated.guardianName) leadPatch.parentName = updated.guardianName;
    if (updated.guardianRelation) leadPatch.relationship = updated.guardianRelation;
    if (updated.preferredDays.length) leadPatch.preferredDays = updated.preferredDays;
    if (updated.preferredTime) leadPatch.preferredTimeSlots = [updated.preferredTime];
    await this.prisma.lead.update({ where: { id: trial.leadId }, data: leadPatch });

    const summary = [
      `Trial report submitted — level assessed as ${level}`,
      updated.recommendedCourse ? `recommended ${updated.recommendedCourse}` : null,
      updated.teacherRecommendsEnroll === true
        ? 'teacher recommends enrolment'
        : updated.teacherRecommendsEnroll === false
          ? 'teacher does not recommend enrolment'
          : null,
    ]
      .filter(Boolean)
      .join(' · ');
    await this.addActivity(trial.leadId, 'TRIAL_REPORT', `${summary}.`, actor);

    const lead = await this.prisma.lead.findUnique({
      where: { id: trial.leadId },
      select: { leadNumber: true, studentFirstName: true, studentLastName: true, assignedCoachId: true },
    });
    if (lead?.assignedCoachId) {
      this.notifications
        .createFor(lead.assignedCoachId, {
          type: 'TRIAL_REPORT_SUBMITTED',
          title: 'Trial report ready',
          body: `${actor?.name || 'The teacher'} filed the trial report for ${lead.studentFirstName} ${lead.studentLastName} (${lead.leadNumber}) — level ${level}.`,
          link: `/leads/${trial.leadId}`,
        })
        .catch(() => undefined);
    }

    return this.attachTrialNames([updated]).then((r) => r[0]);
  }

  /** Shared mapping for save and submit. */
  private async reportData(dto: TrialReportDto) {
    const data: any = {};

    for (const flag of [
      'coveredIntro', 'coveredPresentation', 'coveredDemoLesson',
      'coveredPackages', 'verifiedDetails',
    ] as const) {
      if (dto[flag] !== undefined) data[flag] = dto[flag];
    }

    if (dto.guardianName !== undefined) data.guardianName = dto.guardianName || null;
    if (dto.guardianRelation !== undefined) data.guardianRelation = dto.guardianRelation || null;
    if (dto.guardianPhone !== undefined) data.guardianPhone = dto.guardianPhone || null;
    if (dto.guardianEmail !== undefined) data.guardianEmail = dto.guardianEmail || null;
    // Same check as the family's own form: an unrecognised package name is
    // what conversion bills from, and a typo silently suppresses the invoice.
    if (dto.preferredPackage !== undefined) {
      data.preferredPackage = dto.preferredPackage
        ? (await this.knownPackage(dto.preferredPackage)).name
        : null;
    }
    if (dto.preferredDays !== undefined) data.preferredDays = dto.preferredDays;
    if (dto.preferredTime !== undefined) data.preferredTime = dto.preferredTime || null;
    if (dto.assessedLevel !== undefined) data.assessedLevel = dto.assessedLevel || null;
    if (dto.reportNotes !== undefined) data.reportNotes = dto.reportNotes || null;
    if (dto.teacherRating !== undefined) data.teacherRating = dto.teacherRating ?? null;
    if (dto.teacherFeedback !== undefined) data.teacherFeedback = dto.teacherFeedback || null;
    if (dto.teacherRecommendsEnroll !== undefined) {
      data.teacherRecommendsEnroll = dto.teacherRecommendsEnroll;
    }

    if (dto.studentDob !== undefined) data.studentDob = this.parseDate(dto.studentDob, 'date of birth');
    if (dto.preferredStartDate !== undefined) {
      data.preferredStartDate = this.parseDate(dto.preferredStartDate, 'preferred start date');
    }

    /*
     * Age is derived from the date of birth whenever there is one, so the two
     * cannot disagree — and a stored age would go stale on the next birthday
     * anyway. It is only kept as a typed number for families who give an age
     * but not a date.
     */
    if (data.studentDob) data.studentAge = this.ageFrom(data.studentDob);
    else if (dto.studentAge !== undefined) data.studentAge = dto.studentAge ?? null;

    if (dto.recommendedCourseId !== undefined) {
      if (!dto.recommendedCourseId) {
        data.recommendedCourseId = null;
        data.recommendedCourse = null;
      } else {
        const course = await this.prisma.course.findUnique({
          where: { id: dto.recommendedCourseId },
          select: { id: true, title: true },
        });
        if (!course) throw new BadRequestException('That course no longer exists.');
        data.recommendedCourseId = course.id;
        // Snapshot the title so the report still reads right if it is renamed.
        data.recommendedCourse = course.title;
      }
    }

    return data;
  }

  /**
   * The teacher declaring how their own trial ended.
   *
   * Attendance and status are the same fact stated twice, so this keeps them
   * in step rather than letting a trial sit COMPLETED with nobody marked
   * present. Cancelling and rescheduling are not offered here — see
   * TEACHER_TRIAL_OUTCOMES.
   */
  async setTrialStatus(trialId: string, dto: TrialStatusDto, actor: Actor) {
    const trial = await this.assertTrialAccess(trialId, actor);
    if (trial.status === 'CANCELLED') {
      throw new BadRequestException('This trial was cancelled by the academic coach.');
    }
    if (trial.reportSubmittedAt && dto.status !== 'COMPLETED') {
      throw new BadRequestException(
        'A report has already been filed for this trial, so it cannot be reopened as a no-show.',
      );
    }

    const present = dto.status === 'COMPLETED';
    const updated = await this.prisma.leadTrial.update({
      where: { id: trialId },
      data: {
        status: dto.status as any,
        attendance: present ? 'PRESENT' : 'ABSENT',
        // Only somebody who turned up has an "attended at". A no-show carrying
        // a timestamp is a record that contradicts itself.
        attendedAt: present ? trial.attendedAt ?? new Date() : null,
        ...(dto.note ? { notes: dto.note } : {}),
      },
    });

    await this.prisma.lead.update({
      where: { id: trial.leadId },
      data: present ? { status: LeadStatus.TRIAL_COMPLETED } : {},
    });
    await this.addActivity(
      trial.leadId,
      present ? 'TRIAL_ATTENDED' : 'TRIAL_NO_SHOW',
      present
        ? `Trial marked completed${dto.note ? ` — ${dto.note}` : ''}.`
        : `Trial marked a no-show${dto.note ? ` — ${dto.note}` : ''}.`,
      actor,
    );

    return this.attachTrialNames([updated]).then((r) => r[0]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 14b — missing information, collected from the family afterwards
  //
  // Families routinely will not settle on a package or a start date while the
  // trial is running. Rather than the coach chasing it by phone and typing it
  // in themselves, they send a link and the answers land on the trial record.
  // ══════════════════════════════════════════════════════════════════════════

  private static readonly INFO_LINK_DAYS = 14;

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issue (or re-issue) the link and email it to the family.
   *
   * The plaintext token is returned exactly once, here, so the coach can also
   * send it over WhatsApp. It is not recoverable afterwards — only its hash is
   * stored — so re-issuing is the way to get another, and that invalidates the
   * previous link.
   */
  async requestMissingInfo(trialId: string, actor: Actor) {
    const trial = await this.assertTrialAccess(trialId, actor);
    if (trial.status === 'CANCELLED') {
      throw new BadRequestException('This trial was cancelled.');
    }

    const lead = await this.prisma.lead.findUnique({
      where: { id: trial.leadId },
      select: { studentFirstName: true, studentLastName: true, email: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + LeadsService.INFO_LINK_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.leadTrial.update({
      where: { id: trialId },
      data: {
        infoTokenHash: this.hashToken(token),
        infoTokenExpiresAt: expiresAt,
        infoRequestedAt: new Date(),
        infoRequestedById: actor?.id || null,
        /*
         * infoSubmittedAt is deliberately left alone. Clearing it made the
         * form's own "you have answered this before" warning unreachable —
         * submitting nulls the hash, so the only way back in is a fresh link,
         * which used to arrive claiming the family had never answered.
         */
      },
    });

    const base = process.env.APP_URL ?? 'http://localhost:3000';
    const url = `${base}/trial-details/${token}`;

    await this.sendInfoRequestEmail(lead, url, expiresAt).catch(() => undefined);
    await this.addActivity(
      trial.leadId,
      'INFO_REQUESTED',
      `Sent ${lead.email} a link to complete their preferences.`,
      actor,
    );

    return { url, expiresAt: expiresAt.toISOString(), sentTo: lead.email };
  }

  /** Resolve a token to a trial, or say precisely why it will not open. */
  private async trialForToken(token: string) {
    if (!token || token.length < 20) throw new NotFoundException('This link is not valid.');

    const trial = await this.prisma.leadTrial.findFirst({
      where: { infoTokenHash: this.hashToken(token) },
      include: {
        lead: {
          select: { studentFirstName: true, studentLastName: true, interestedSubject: true },
        },
      },
    });
    if (!trial) throw new NotFoundException('This link is not valid.');
    if (trial.infoTokenExpiresAt && trial.infoTokenExpiresAt < new Date()) {
      throw new BadRequestException(
        'This link has expired. Ask your academic coach to send a new one.',
      );
    }
    return trial;
  }

  /**
   * What the public form may see.
   *
   * Deliberately thin: a first name to address them by, the subject, and the
   * choices they are picking from. Anyone holding the link gets exactly this —
   * no contact details, no assessment, no pipeline.
   */
  async getInfoForm(token: string) {
    const trial = await this.trialForToken(token);
    const options = await this.trialOptions();

    return {
      studentName: `${trial.lead.studentFirstName} ${trial.lead.studentLastName}`.trim(),
      subject: trial.lead.interestedSubject,
      trialDate: trial.scheduledAt.toISOString(),
      alreadySubmitted: Boolean(trial.infoSubmittedAt),
      current: {
        preferredPackage: trial.preferredPackage,
        preferredDays: trial.preferredDays,
        preferredTime: trial.preferredTime,
        preferredStartDate: trial.preferredStartDate?.toISOString().slice(0, 10) ?? null,
      },
      packages: options.packages,
      weekdays: options.weekdays,
    };
  }

  /** The family's answers, straight onto the trial record. */
  async submitInfoForm(token: string, dto: TrialInfoFormDto) {
    const trial = await this.trialForToken(token);

    const data: any = {};
    if (dto.preferredPackage !== undefined) {
      /*
       * Checked against the live catalogue, not taken on trust.
       *
       * This endpoint is reached with a token rather than a login, and the
       * package name it returns is what conversion bills the first invoice
       * from. Storing the string verbatim would let anyone holding the link
       * name the cheapest package — or a nonexistent one, which silently
       * suppresses the invoice altogether.
       */
      data.preferredPackage = dto.preferredPackage
        ? (await this.knownPackage(dto.preferredPackage)).name
        : null;
    }
    if (dto.preferredDays !== undefined) data.preferredDays = dto.preferredDays;
    if (dto.preferredTime !== undefined) data.preferredTime = dto.preferredTime || null;
    if (dto.preferredStartDate !== undefined) {
      data.preferredStartDate = this.parseDate(dto.preferredStartDate, 'preferred start date');
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('Fill in at least one of the four details.');
    }

    /*
     * This writes to a submitted report, which is otherwise locked. That is
     * the point: the report is locked so the *teacher's assessment* cannot
     * change under the coach, but these four fields are the family's own
     * preference and the whole reason the link exists is that they were not
     * known at the time. Nothing else on the row is reachable from here.
     */
    const updated = await this.prisma.leadTrial.update({
      where: { id: trial.id },
      data: {
        ...data,
        infoSubmittedAt: new Date(),
        // One submission per link. Re-issuing is how a coach reopens it.
        infoTokenHash: null,
        infoTokenExpiresAt: null,
      },
    });

    // Keep the lead in step, the same way the teacher's report does.
    const leadPatch: any = {};
    if (updated.preferredDays.length) leadPatch.preferredDays = updated.preferredDays;
    if (updated.preferredTime) leadPatch.preferredTimeSlots = [updated.preferredTime];
    if (Object.keys(leadPatch).length) {
      await this.prisma.lead.update({ where: { id: trial.leadId }, data: leadPatch });
    }

    const filled = [
      updated.preferredPackage ? `package ${updated.preferredPackage}` : null,
      updated.preferredDays.length ? `days ${updated.preferredDays.join(', ')}` : null,
      updated.preferredTime ? `time ${updated.preferredTime}` : null,
      updated.preferredStartDate
        ? `start ${updated.preferredStartDate.toISOString().slice(0, 10)}`
        : null,
    ].filter(Boolean);
    await this.addActivity(
      trial.leadId,
      'INFO_RECEIVED',
      `The family completed their preferences — ${filled.join(' · ')}.`,
      { name: 'The family' },
    );

    const lead = await this.prisma.lead.findUnique({
      where: { id: trial.leadId },
      select: { leadNumber: true, studentFirstName: true, studentLastName: true, assignedCoachId: true },
    });
    if (lead?.assignedCoachId) {
      this.notifications
        .createFor(lead.assignedCoachId, {
          type: 'TRIAL_INFO_RECEIVED',
          title: 'Trial details completed',
          body: `${lead.studentFirstName} ${lead.studentLastName} (${lead.leadNumber}) filled in their remaining preferences.`,
          link: `/leads/${trial.leadId}`,
        })
        .catch(() => undefined);
    }

    return { ok: true, message: 'Thank you — your details have reached your academic coach.' };
  }

  private async sendInfoRequestEmail(
    lead: { studentFirstName: string; studentLastName: string; email: string },
    url: string,
    expiresAt: Date,
  ) {
    const name = `${lead.studentFirstName} ${lead.studentLastName}`.trim();
    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f6f8;padding:40px 20px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e1e4e8;">
          <div style="background:#133C55;padding:26px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">A few details to finish</h1>
          </div>
          <div style="padding:28px;color:#1f2937;font-size:14px;line-height:1.7;">
            <p>Assalamu alaikum,</p>
            <p>Thank you for attending the trial class for <strong>${name}</strong>. To set up the regular schedule we still need four things: the package you would like, your preferred days and time, and when you would like to start.</p>
            <p style="text-align:center;margin:26px 0;">
              <a href="${url}" style="background:#133C55;color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:700;display:inline-block;">Complete my details</a>
            </p>
            <p style="color:#6b7280;font-size:12px;">This link is personal to you and stops working on ${expiresAt.toISOString().slice(0, 10)}. If it expires, your academic coach can send a new one.</p>
          </div>
        </div>
      </div>`;

    await this.emails.sendMail(
      lead.email,
      'Please complete your class preferences',
      `Complete your class preferences for ${name}: ${url}`,
      undefined,
      html,
    );
  }

  private parseDate(value: string | undefined, label: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new BadRequestException(`Invalid ${label}.`);
    return d;
  }

  private ageFrom(dob: Date) {
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const month = now.getMonth() - dob.getMonth();
    if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age--;
    return age;
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
      return this.convert(lead, dto.courseCode, actor, dto.packageId);
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
  /**
   * Work out which package to bill.
   *
   * The coach can name one outright, but by default it is the package the
   * family chose — either during the trial or afterwards on the info-form
   * link. Falling back to the report means the coach does not have to
   * re-enter something the family already told the teacher.
   */
  /** A package name is only ever stored after the catalogue confirms it exists. */
  private async knownPackage(name: string) {
    const known = await this.prisma.package.findFirst({
      where: { name, active: true },
      select: { name: true },
    });
    if (!known) throw new BadRequestException('Choose one of the packages listed.');
    return known;
  }

  private async packageForConversion(leadId: string, packageId?: string) {
    if (packageId) {
      const chosen = await this.prisma.package.findUnique({ where: { id: packageId } });
      if (!chosen) throw new BadRequestException('That package no longer exists.');
      return chosen;
    }

    const [trial] = await this.prisma.leadTrial.findMany({
      where: { leadId, preferredPackage: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      select: { preferredPackage: true },
    });
    if (!trial?.preferredPackage) return null;

    // Matched by name because that is what the report stores — a package the
    // academy has since renamed simply falls through to "no invoice yet",
    // which the coach can see and fix, rather than billing the wrong thing.
    return this.prisma.package.findFirst({
      where: { name: trial.preferredPackage, active: true },
    });
  }

  private async convert(
    lead: any,
    courseCode: string | undefined,
    actor: Actor,
    packageId?: string,
  ) {
    const siblings: { firstName: string; lastName?: string }[] = Array.isArray(lead.siblings)
      ? lead.siblings
      : [];

    /*
     * Every child gets a plus-addressed login, including the first.
     *
     * The bare family address used to become the eldest child's student login,
     * which quietly made a parent account impossible: ParentLink refuses an
     * address that already belongs to a STUDENT, and that address is the only
     * one the family gave us. The whole parent portal was unreachable for
     * anyone who came through this pipeline. The inbox belongs to the parent,
     * so it stays theirs.
     */
    const children = [
      {
        firstName: lead.studentFirstName,
        lastName: lead.studentLastName,
        email: this.siblingEmail(lead.email, lead.studentFirstName, 0),
      },
      ...siblings.map((s, i) => ({
        firstName: s.firstName,
        lastName: s.lastName || lead.studentLastName,
        email: this.siblingEmail(lead.email, s.firstName, i + 1),
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

    /*
     * Everything the trial learned about this family, carried onto the student
     * record. Without this the coach reopens the lead to find out what level
     * the teacher placed the student at and which days they asked for — and
     * the parent's own contact details, collected in the report precisely so a
     * parent account could be created, never leave the trial row.
     */
    const [report] = await this.prisma.leadTrial.findMany({
      where: { leadId: lead.id, reportSubmittedAt: { not: null } },
      orderBy: { reportSubmittedAt: 'desc' },
      take: 1,
    });

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
            dateOfBirth: i === 0 ? (report?.studentDob ?? lead.dateOfBirth) : null,
            guardianName: report?.guardianName || lead.parentName || null,

            // The parent's own details, so an admin can create their login
            // without hunting through the lead — and so ParentLink has the
            // address it insists on.
            parentName: report?.guardianName || lead.parentName || null,
            parentEmail: lead.email,
            parentRelationship: report?.guardianRelation || lead.relationship || null,
            parentMobile: report?.guardianPhone || lead.mobile || null,
            parentWhatsapp: lead.whatsappNumber || null,

            /*
             * Only the child who actually sat the trial. Siblings ride the same
             * booking but were never assessed — stamping the eldest's level on
             * all of them puts a teacher's judgement on a student they never met.
             */
            learningLevel: i === 0 ? report?.assessedLevel || lead.recommendedLevel || lead.currentLevel || null : null,
            preferredLanguage: lead.preferredLanguage || null,
            coachId: lead.assignedCoachId || null,
            // A family that asked to start next month should not be dated as
            // having joined today.
            joiningDate: report?.preferredStartDate ?? now,
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

        /*
         * Enrol them into the course the teacher recommended.
         *
         * Without this a family pays the invoice, signs in, and finds "My
         * Courses" empty — the recommendation was captured, validated and
         * shown to the coach, then dropped on the floor at the one moment it
         * was meant to take effect. An explicit courseCode still wins.
         */
        if (!courseCode && report?.recommendedCourseId) {
          const exists = await tx.course.findUnique({
            where: { id: report.recommendedCourseId },
            select: { id: true },
          });
          if (exists) {
            await tx.enrollment.create({
              data: {
                studentId: profile.id,
                courseId: exists.id,
                status: EnrollmentStatus.ACTIVE,
                startedAt: report.preferredStartDate ?? now,
              },
            });
          }
        }

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

      // Automatically resolve any pending trials when a lead is converted
      const pendingTrials = await tx.leadTrial.findMany({
        where: { leadId: lead.id, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
        select: { id: true, scheduledAt: true },
      });
      for (const t of pendingTrials) {
        const isFuture = t.scheduledAt && new Date(t.scheduledAt) > new Date();
        await tx.leadTrial.update({
          where: { id: t.id },
          data: { status: isFuture ? 'CANCELLED' : 'COMPLETED' },
        });
      }

      return profiles;
    });

    /*
     * First invoice, one per student — Invoice.studentId is singular and each
     * child enrols on their own terms, so a shared family bill would have to
     * pick one of them to hang off. The welcome email lists them all together.
     *
     * Raised after the transaction and tolerant of failure: a family whose
     * accounts exist but whose invoice did not generate is recoverable in a
     * click, whereas rolling the accounts back over a billing hiccup is not.
     */
    const pkg = await this.packageForConversion(lead.id, packageId).catch(() => null);
    const invoices: { studentName: string; number: string; amount: number; currency: string; dueAt: Date | null }[] = [];
    if (pkg) {
      for (const student of created) {
        const invoice = await this.billing
          .createEnrolmentInvoice({
            studentId: student.id,
            label: `${pkg.name} — first month`,
            amount: Number(pkg.price),
          })
          .catch(() => null);
        if (invoice) invoices.push({ studentName: student.name, ...invoice });
      }
      /*
       * The monthly fee on the student record, so Finance and the student's
       * own Fees page agree with the package they were just sold.
       */
      await this.prisma.studentProfile.updateMany({
        where: { id: { in: created.map((c) => c.id) } },
        data: { fees: pkg.price, nextPaymentDate: invoices[0]?.dueAt ?? null },
      });
      if (invoices.length) {
        await this.addActivity(
          lead.id,
          'INVOICED',
          `First invoice raised for ${pkg.name} — ${invoices.map((i) => i.number).join(', ')}.`,
          actor,
        );
      }
    } else {
      await this.addActivity(
        lead.id,
        'INVOICE_PENDING',
        'No package was recorded, so no first invoice was raised. Raise one from Finance.',
        actor,
      );
    }

    /*
     * The invoice number rides along on each child, so the coach's own screen
     * can say whether billing actually happened. The alternative — a timeline
     * entry on another tab — hides the one outcome most worth checking.
     */
    const byName = new Map(invoices.map((i) => [i.studentName, i]));
    const withInvoices = created.map((c) => ({
      ...c,
      invoiceNumber: byName.get(c.name)?.number ?? null,
      invoiceAmount: byName.get(c.name)?.amount ?? null,
      invoiceCurrency: byName.get(c.name)?.currency ?? null,
    }));

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.CONVERTED,
        // The singular pair keeps pointing at the primary child so every
        // existing screen and query carries on working unchanged.
        convertedStudentId: created[0].id,
        convertedStudentCode: created[0].code,
        convertedStudents: withInvoices,
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
    this.notifyConverted(lead, created, passwords, pkg, invoices).catch(() => undefined);
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

    /*
     * Status distribution funnel: each stage counts leads currently in that
     * specific status. The stage list is the full pipeline order, so no status
     * can fall through and go uncounted.
     */
    const order = LeadsService.STAGE_ORDER;
    const funnel = order.map((stage) => {
      const reached = statusCounts[stage] || 0;
      return { stage, reached };
    });

    /*
     * Trial + rating stats, through the same scope as the lead counts above.
     * Without it a coach saw their own funnel beside academy-wide attendance
     * and ratings — two different populations presented as one report.
     */
    const trialScope = { lead: this.scopeFor(user) };
    const [trialAgg, trialByStatus, tRating, pRating] = await Promise.all([
      this.prisma.leadTrial.count({ where: trialScope }),
      this.prisma.leadTrial.groupBy({ by: ['status'], where: trialScope, _count: { _all: true } }),
      this.prisma.leadTrial.aggregate({ where: trialScope, _avg: { teacherRating: true } }),
      this.prisma.leadTrial.aggregate({ where: trialScope, _avg: { parentRating: true } }),
    ]);
    const trialStatusCounts: Record<string, number> = {};
    trialByStatus.forEach((r) => (trialStatusCounts[r.status] = r._count._all));

    const scheduled = trialAgg;
    const attended = trialStatusCounts['COMPLETED'] || 0;
    const noShow = trialStatusCounts['NO_SHOW'] || 0;
    /*
     * The rate is out of trials that have actually happened, not out of every
     * trial ever booked. With the total as the denominator a coach with eight
     * upcoming trials and two attended read "Scheduled 10 · Attended 2 ·
     * No-shows 0 · Attendance 20%" — four numbers that cannot be reconciled,
     * because the percentage was drawn from a population the tiles beside it
     * were not.
     */
    const concluded = attended + noShow;

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
        // Trials still to come — so `scheduled` is visibly the sum of the three.
        upcoming: Math.max(0, scheduled - concluded - (trialStatusCounts['CANCELLED'] || 0)),
        cancelled: trialStatusCounts['CANCELLED'] || 0,
        attendanceRate: concluded ? Math.round((attended / concluded) * 100) : 0,
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
            // Trials were merged into Live Classes and the standalone item left
            // the teacher's nav, so this used to land them somewhere they can
            // no longer navigate back to.
            link: `/teacher/live-class`,
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
    pkg?: { name: string; price: any; classesPerMonth: number } | null,
    invoices?: { studentName: string; number: string; amount: number; currency: string; dueAt: Date | null }[],
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

    const money = (amount: number, currency: string) =>
      `${currency} ${amount.toFixed(2)}`;

    const packageBlock = pkg
      ? `
      <h3 style="margin:22px 0 6px;font-size:15px;">Your package</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e5e7eb;">
        <tr><td style="padding:6px 0;color:#6b7280;">Package</td><td style="padding:6px 0;font-weight:700;">${pkg.name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Classes each month</td><td style="padding:6px 0;font-weight:700;">${pkg.classesPerMonth}</td></tr>
      </table>`
      : '';

    /*
     * Only mention an invoice that actually exists. Telling a family their
     * bill is attached when none was raised sends them looking for something
     * that is not in their portal.
     */
    const invoiceBlock = invoices?.length
      ? `
      <h3 style="margin:22px 0 6px;font-size:15px;">Your first invoice</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e5e7eb;">
        ${invoices
          .map(
            (inv) => `<tr>
              <td style="padding:6px 0;color:#6b7280;">${inv.studentName}</td>
              <td style="padding:6px 0;font-weight:700;">${inv.number} — ${money(inv.amount, inv.currency)}${
                inv.dueAt ? `, due ${inv.dueAt.toISOString().slice(0, 10)}` : ''
              }</td>
            </tr>`,
          )
          .join('')}
      </table>
      <p style="color:#6b7280;">The full invoice is in the student portal under Fees.</p>`
      : '';

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
      }
      ${packageBlock}
      ${invoiceBlock}`,
    );

    await this.emails
      .sendMail(
        lead.email,
        'Welcome — your student account is ready',
        students
          .map((s, i) => `${s.name}: ID ${s.code}, login ${s.email} / ${passwords[i]}`)
          .join('\n') +
          '\nPlease change the password after first sign-in.' +
          (pkg ? `\nPackage: ${pkg.name} (${pkg.classesPerMonth} classes a month).` : '') +
          (invoices?.length
            ? `\nFirst invoice: ${invoices.map((i) => `${i.number} ${money(i.amount, i.currency)}`).join(', ')}.`
            : ''),
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
  /*
   * One shape for every trial the API returns.
   *
   * `withLead` used to default to false and only `myTrials` passed true, so
   * the same row came back three different ways depending on the route. The
   * `lead` block is optional in the client type, which meant a component
   * reading `trial.lead.studentFirstName` type-checked everywhere and only
   * worked on one endpoint — held together by both pages happening to refetch
   * rather than trusting a mutation's response. It is always attached now.
   */
  private async attachTrialNames(trials: any[], withLead = true) {
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
              // The teacher has to check what the family submitted against what
              // they are told in the session, so the booking travels with the
              // trial rather than needing a second round trip per card.
              gender: true, dateOfBirth: true, currentGrade: true, country: true,
              parentName: true, relationship: true, whatsappNumber: true,
              currentLevel: true, preferredLanguage: true, sessionFor: true,
              learningGoal: true, specialRequirements: true, medicalDisability: true,
              siblings: true,
              // Folded in from getTrialReport's own bespoke select, which was a
              // second definition of "the lead, as a trial sees it".
              countryCode: true, preferredDate: true, preferredSlot: true,
              previousCoaching: true, status: true,
            },
          })
        : [],
    ]);

    const tMap = new Map(teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`]));
    const lMap = new Map(leads.map((l) => [l.id, l]));

    return trials.map((t) => {
      /*
       * The info-form token hash never leaves the server. It is only a hash,
       * but it is the one field on this row that exists to be secret, and
       * every trial response in the app goes through here.
       */
      const { infoTokenHash: _hash, ...rest } = t;
      return {
        ...rest,
        teacherName: t.teacherId ? tMap.get(t.teacherId) || null : null,
        ...(withLead ? { lead: lMap.get(t.leadId) || null } : {}),
      };
    });
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
