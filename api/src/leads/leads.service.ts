import {
  BadRequestException,
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

type Actor = { id?: string; name?: string } | undefined;

@Injectable()
export class LeadsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Reminder sweep ──────────────────────────────────────────────────────────
  // No cron dependency: a lightweight in-process interval checks every 5 minutes
  // for trials entering their 24h / 1h window and dispatches an email reminder,
  // stamping the row so each reminder fires exactly once.
  onModuleInit() {
    const FIVE_MIN = 5 * 60 * 1000;
    setInterval(() => this.sweepReminders().catch(() => undefined), FIVE_MIN);
  }

  // ── Public: duplicate check for the "you already have a trial request" popup ─
  async checkDuplicate(email?: string, mobile?: string) {
    const or: any[] = [];
    if (email) or.push({ email: email.toLowerCase().trim() });
    if (mobile) or.push({ mobile: mobile.trim() });
    if (!or.length) return { exists: false };

    const existing = await this.prisma.lead.findFirst({
      where: { OR: or },
      orderBy: { createdAt: 'desc' },
      select: { id: true, leadNumber: true, status: true, createdAt: true },
    });
    return { exists: !!existing, lead: existing };
  }

  // Leads awaiting email-OTP verification. The Lead row is only created once the
  // code is confirmed (mirrors the student/teacher registration OTP flow).
  private otpPending = new Map<
    string,
    { otp: string; expiresAt: Date; attempts: number; dto: CreateLeadDto; ip?: string }
  >();

  private newOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ── Public: step 1 — submit the form, receive an email OTP ──────────────────
  async requestOtp(dto: CreateLeadDto, meta: { ip?: string }) {
    const email = dto.email.toLowerCase().trim();
    const otp = this.newOtp();
    this.otpPending.set(email, {
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      dto,
      ip: meta.ip,
    });

    this.sendOtpEmail(
      email,
      dto.parentName || `${dto.studentFirstName} ${dto.studentLastName}`.trim(),
      otp,
    ).catch(() => undefined);

    return {
      otpRequired: true,
      email,
      otp, // shown to the client for now; email is the eventual channel
      message: 'A verification code has been sent to your email. Enter it to finish.',
    };
  }

  // ── Public: step 2 — verify the OTP, then create the lead ───────────────────
  async verifyOtp(rawEmail: string, code: string) {
    const email = (rawEmail || '').toLowerCase().trim();
    const record = this.otpPending.get(email);
    if (!record) {
      throw new BadRequestException(
        'No pending request for this email, or the code expired. Please submit the form again.',
      );
    }
    if (record.expiresAt < new Date()) {
      this.otpPending.delete(email);
      throw new BadRequestException('Verification code has expired. Please submit the form again.');
    }
    if (record.otp !== code) {
      record.attempts += 1;
      if (record.attempts >= 5) {
        this.otpPending.delete(email);
        throw new BadRequestException('Too many incorrect attempts. Please submit the form again.');
      }
      throw new BadRequestException('Invalid verification code.');
    }

    this.otpPending.delete(email);
    return this.persist(record.dto, { ip: record.ip });
  }

  private async sendOtpEmail(to: string, name: string, otp: string) {
    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f6f8;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e1e4e8;">
          <div style="background:#133C55;padding:26px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">Verify your trial request</h1>
          </div>
          <div style="padding:28px;color:#1f2937;font-size:14px;line-height:1.7;">
            <p>Dear ${name || 'there'},</p>
            <p>Use the code below to confirm your free-trial request. It is valid for <b>10 minutes</b>.</p>
            <div style="background:#f0f3ff;border:1px dashed #386FA4;border-radius:12px;padding:16px;text-align:center;margin:16px 0;">
              <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:900;letter-spacing:8px;color:#133C55;">${otp}</span>
            </div>
            <p style="color:#6b7280;">If you did not request this, you can ignore this email.</p>
          </div>
        </div>
      </div>`;
    await this.emails.sendMail(
      to,
      'Your trial request verification code',
      `Your verification code is: ${otp} (valid for 10 minutes)`,
      undefined,
      html,
    );
  }

  // Actual Lead creation, run only after the email OTP is confirmed.
  private async persist(dto: CreateLeadDto, meta: { ip?: string }) {
    const email = dto.email.toLowerCase().trim();
    const mobile = dto.mobile.trim();

    const leadNumber = await this.nextLeadNumber();

    const lead = await this.prisma.lead.create({
      data: {
        leadNumber,
        studentFirstName: dto.studentFirstName,
        studentLastName: dto.studentLastName,
        gender: dto.gender || null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        currentGrade: dto.currentGrade || null,
        currentSchool: dto.currentSchool || null,
        country: dto.country || null,
        timeZone: dto.timeZone || null,
        parentName: dto.parentName || null,
        relationship: dto.relationship || null,
        email,
        mobile,
        whatsappNumber: dto.whatsappNumber || null,
        interestedSubject: dto.interestedSubject || null,
        currentLevel: dto.currentLevel || null,
        preferredLanguage: dto.preferredLanguage || null,
        preferredTeacherGender: dto.preferredTeacherGender || null,
        preferredDays: dto.preferredDays || [],
        preferredTimeSlots: dto.preferredTimeSlots || [],
        learningGoal: dto.learningGoal || null,
        previousCoaching: dto.previousCoaching || null,
        specialRequirements: dto.specialRequirements || null,
        medicalDisability: dto.medicalDisability || null,
        acceptPrivacy: dto.acceptPrivacy ?? false,
        acceptTerms: dto.acceptTerms ?? false,
        recaptchaToken: dto.recaptchaToken || null,
        leadSource: 'Website',
        ipAddress: meta.ip || null,
        browser: dto.browser || null,
        device: dto.device || null,
        referralUrl: dto.referralUrl || null,
        utmSource: dto.utmSource || null,
        utmCampaign: dto.utmCampaign || null,
        utmMedium: dto.utmMedium || null,
        status: LeadStatus.NEW,
        priority: LeadPriority.MEDIUM,
      },
    });

    await this.addActivity(lead.id, 'CREATED', 'Lead captured from the website form.');

    // Step 4 — automatic actions (email + in-app; SMS/WhatsApp stubbed for now)
    this.notifyNewLead(lead).catch(() => undefined);

    return {
      id: lead.id,
      leadNumber: lead.leadNumber,
      message:
        'Thank you! Your trial request has been received. Our academic coach will contact you shortly.',
    };
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
  async list(dto: ListLeadsDto) {
    const { page = 1, limit = 20, search, status, priority, country, subject, coachId } = dto;

    const where: any = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(country ? { country: { contains: country, mode: 'insensitive' } } : {}),
      ...(subject ? { interestedSubject: { contains: subject, mode: 'insensitive' } } : {}),
      ...(coachId ? { assignedCoachId: coachId } : {}),
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

  async getOne(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    const [withNames] = await this.attachNames([lead]);
    return withNames;
  }

  async listActivities(id: string) {
    return this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats() {
    const byStatus = await this.prisma.lead.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const statusCounts: Record<string, number> = {};
    byStatus.forEach((r) => (statusCounts[r.status] = r._count._all));

    const [total, converted, rejected, avgRatingAgg] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { status: LeadStatus.CONVERTED } }),
      this.prisma.lead.count({ where: { status: LeadStatus.REJECTED } }),
      this.prisma.lead.aggregate({ _avg: { overallScore: true } }),
    ]);

    // Subject- and country-wise breakdown for the marketing charts.
    const [bySubject, byCountry] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['interestedSubject'], _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['country'], _count: { _all: true } }),
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
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);

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
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);

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
  async getRecommendation(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);

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
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);

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
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);

    const when = new Date(dto.scheduledAt);
    if (isNaN(when.getTime())) throw new BadRequestException('Invalid trial date/time.');

    const teacherId = dto.teacherId || lead.assignedTeacherId || null;

    const trial = await this.prisma.leadTrial.create({
      data: {
        leadId,
        teacherId,
        scheduledAt: when,
        durationMins: dto.durationMins ?? 30,
        timeZone: dto.timeZone || lead.timeZone || null,
        meetingProvider: dto.meetingProvider || null,
        meetingLink: dto.meetingLink || null,
        notes: dto.notes || null,
        createdById: actor?.id || null,
      },
    });

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

  async listTrials(leadId: string) {
    const trials = await this.prisma.leadTrial.findMany({
      where: { leadId },
      orderBy: { scheduledAt: 'desc' },
    });
    return this.attachTrialNames(trials);
  }

  // ── Update / reschedule a trial (meeting link, teacher, status) ─────────────
  async updateTrial(trialId: string, dto: UpdateTrialDto, actor: Actor) {
    const trial = await this.prisma.leadTrial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException(`Trial ${trialId} not found`);

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
    const trial = await this.prisma.leadTrial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException(`Trial ${trialId} not found`);

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
    const trial = await this.prisma.leadTrial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException(`Trial ${trialId} not found`);

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
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);
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
  private async convert(lead: any, courseCode: string | undefined, actor: Actor) {
    // Guard against a duplicate account for the same email.
    const existing = await this.prisma.user.findUnique({ where: { email: lead.email } });
    if (existing) {
      throw new BadRequestException(
        'A user account already exists for this email. Convert manually or use a different email.',
      );
    }

    const now = new Date();
    const studentCount = await this.prisma.studentProfile.count();
    const studentCode = `ST-${String(studentCount + 1).padStart(5, '0')}`;

    // The lead never set a password — generate a temporary one and email it.
    const tempPassword = this.tempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const profile = await this.prisma.$transaction(async (tx) => {
      const created = await tx.studentProfile.create({
        data: {
          studentCode,
          phone: lead.mobile,
          gender: lead.gender,
          dateOfBirth: lead.dateOfBirth,
          guardianName: lead.parentName || null,
          joiningDate: now,
          user: {
            create: {
              email: lead.email,
              passwordHash,
              firstName: lead.studentFirstName,
              lastName: lead.studentLastName,
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
              studentId: created.id,
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
      return created;
    });

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.CONVERTED,
        convertedStudentId: profile.id,
        convertedStudentCode: studentCode,
        convertedAt: now,
      },
    });

    await this.addActivity(
      lead.id,
      'CONVERTED',
      `Converted to student ${studentCode}. Account activated.`,
      actor,
    );

    // Email the family their new login credentials + in-app alert to staff.
    this.notifyConverted(lead, studentCode, tempPassword).catch(() => undefined);
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
  async getFunnel() {
    const byStatus = await this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } });
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
  async sendReminderNow(trialId: string) {
    const trial = await this.prisma.leadTrial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException(`Trial ${trialId} not found`);
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

  private async notifyConverted(lead: any, studentCode: string, tempPassword: string) {
    const name = lead.parentName || `${lead.studentFirstName} ${lead.studentLastName}`;
    const html = this.trialEmail(
      'Welcome to the Academy 🎉',
      `
      <p>Dear ${name},</p>
      <p>Congratulations! <b>${lead.studentFirstName} ${lead.studentLastName}</b> is now enrolled. A student account has been created.</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Student ID</td><td style="padding:6px 0;font-weight:700;">${studentCode}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Login email</td><td style="padding:6px 0;font-weight:700;">${lead.email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Temporary password</td><td style="padding:6px 0;font-weight:700;">${tempPassword}</td></tr>
      </table>
      <p style="color:#b45309;">For your security, please change this password after your first sign-in.</p>`,
    );
    await this.emails
      .sendMail(
        lead.email,
        'Welcome — your student account is ready',
        `Welcome! Student ID ${studentCode}. Login: ${lead.email} / ${tempPassword} (please change after first sign-in).`,
        undefined,
        html,
      )
      .catch(() => undefined);
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
