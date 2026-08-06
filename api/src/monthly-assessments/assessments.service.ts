import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { Role } from '../generated/prisma/enums';
import { AssessmentTemplatesService, actorName, type Actor } from './templates.service';
import { gradeFor, round2 } from './assessment.config';
import {
  assessableCycle, cycleAt, currentCycle, dueDateFor, enrolledDaysInCycle, type Cycle,
} from './cycle';
import type {
  ListAssessmentsQuery, ReopenAssessmentDto, ReturnAssessmentDto, ReviewFeedbackDto,
  SaveAssessmentDto, SubmitFeedbackDto,
} from './dto';

const STAFF_ROLES = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH];

/*
 * Module 7A — the end-of-billing-cycle assessment a teacher writes for each of
 * their students.
 *
 * Lifecycle, and who may move it:
 *
 *   DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED ──publish──▶ PUBLISHED
 *     ▲                   │                                            │
 *     └──── RETURNED ◀────┘ (supervisor sends it back with a reason)    │
 *                                                                      │
 *                          reopen (supervisor only) ◀──────────────────┘
 *
 * Two rules run through all of it:
 *
 *  - A published report is READ-ONLY. Families read these; silently rewriting
 *    one they have already seen is worse than making a supervisor reopen it.
 *  - Marks, percentage and grade are ALWAYS computed here, never accepted from
 *    the client. The form shows a live total for the teacher's benefit; the
 *    number that is stored is the one this service worked out.
 */
@Injectable()
export class MonthlyAssessmentsService implements OnModuleInit {
  private readonly logger = new Logger(MonthlyAssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: AssessmentTemplatesService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
  ) {}

  /*
   * Deadline reminders, on the project's setInterval convention (there is no
   * @nestjs/schedule anywhere in this codebase). Hourly is enough for a rule
   * measured in days, and `lastReminderAt` keeps it to one nudge per day.
   */
  onModuleInit() {
    setTimeout(() => {
      setInterval(() => void this.reminderSweep().catch(() => undefined), 60 * 60 * 1000).unref();
    }, 45_000).unref();
  }

  // ══ Context loading ════════════════════════════════════════════════════════

  private async studentContext(studentId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        id: true, studentCode: true, userId: true, learningLevel: true, coachId: true,
        parentName: true, parentEmail: true, guardianName: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'ON_BREAK'] as never } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true, courseId: true, actualCycleStartDate: true, renewalDate: true, startDate: true,
          },
        },
        enrollments: {
          select: {
            id: true, courseId: true, teacherId: true, startedAt: true, status: true,
            course: { select: { id: true, title: true, levelId: true, level: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found.');
    return student;
  }

  private anchorFor(student: Awaited<ReturnType<typeof this.studentContext>>, courseId: string) {
    const sub = student.subscriptions[0] ?? null;
    const enrolment = student.enrollments.find((e) => e.courseId === courseId) ?? null;
    return {
      subscriptionId: sub?.id ?? null,
      anchor: {
        actualCycleStartDate: sub?.actualCycleStartDate ?? null,
        renewalDate: sub?.renewalDate ?? null,
        fallbackStart: enrolment?.startedAt ?? sub?.startDate ?? null,
      },
      enrolment,
    };
  }

  /**
   * Attendance, assignment and homework figures for one student over one cycle.
   *
   * Snapshotted onto the assessment when it is first saved, so a published
   * report never shifts under the family because somebody corrected an
   * attendance record two weeks later.
   */
  private async cycleStats(studentId: string, courseId: string, cycle: Cycle) {
    const window = { gte: cycle.start, lt: cycle.end };

    const [attendance, assignments] = await Promise.all([
      this.prisma.classAttendee.findMany({
        where: {
          studentId,
          status: { not: null },
          class: { courseId, startsAt: window },
        },
        select: { status: true },
      }),
      this.prisma.assignment.findMany({
        where: { courseId, dueAt: window, status: { in: ['PUBLISHED', 'CLOSED'] } },
        select: {
          id: true, type: true, maxMarks: true,
          submissions: {
            where: { studentId },
            select: { status: true, grade: true, submittedAt: true },
          },
        },
      }),
    ]);

    const present = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
    const totalClasses = attendance.length;
    const attendancePct = totalClasses ? Math.round((present / totalClasses) * 100) : 0;

    // Assignment score: marks earned over marks available, across everything
    // that was actually graded. Ungraded work is excluded rather than counted
    // as zero — a teacher's backlog is not the student's failure.
    let earned = 0;
    let available = 0;
    let submitted = 0;
    let homeworkDone = 0;
    let homeworkTotal = 0;
    for (const a of assignments) {
      const sub = a.submissions[0] ?? null;
      const didSubmit = !!sub?.submittedAt || sub?.status === 'SUBMITTED' || sub?.status === 'EVALUATED' || sub?.status === 'LATE_SUBMITTED';
      if (didSubmit) submitted += 1;
      if (sub?.grade != null) {
        earned += Number(sub.grade);
        available += a.maxMarks || 0;
      }
      if ((a.type ?? '').toUpperCase() === 'HOMEWORK') {
        homeworkTotal += 1;
        if (didSubmit) homeworkDone += 1;
      }
    }

    return {
      attendancePct,
      attendedClasses: present,
      totalClasses,
      assignmentPct: available ? Math.round((earned / available) * 100) : 0,
      assignmentsSubmitted: submitted,
      assignmentsTotal: assignments.length,
      homeworkPct: homeworkTotal ? Math.round((homeworkDone / homeworkTotal) * 100) : 0,
    };
  }

  // ══ Teacher: the form ══════════════════════════════════════════════════════

  private async teacherProfileId(userId: string): Promise<string | null> {
    const t = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    return t?.id ?? null;
  }

  /**
   * Everything the assessment screen needs, in one call: student, course,
   * level, attendance + assignment summary, the rubric, and any existing
   * draft/returned assessment for the cycle.
   *
   * `cycleStart` is optional — omitted, it resolves the cycle that is currently
   * due, which is what "open the monthly assessment" means in practice.
   */
  async loadForm(studentId: string, courseId: string, cycleStartIso: string | undefined, actor: Actor) {
    const student = await this.studentContext(studentId);
    const { anchor, subscriptionId, enrolment } = this.anchorFor(student, courseId);

    if (!enrolment) {
      throw new BadRequestException('This student is not enrolled in that course.');
    }
    await this.assertMayWrite(actor, enrolment.teacherId ?? null);

    const cycle = cycleStartIso
      ? cycleAt(anchor, new Date(cycleStartIso))
      : assessableCycle(anchor);
    if (!cycle) {
      const live = currentCycle(anchor);
      throw new BadRequestException(
        `No billing cycle has finished yet for this student — the current one runs to ${live.end.toISOString().slice(0, 10)}.`,
      );
    }

    const cfg = await this.templates.config();
    const enrolledDays = enrolledDaysInCycle(cycle, enrolment.startedAt ?? anchor.actualCycleStartDate);
    const eligible = enrolledDays >= cfg.minDaysBeforeAssessment;

    const template = await this.templates.templateFor(courseId, enrolment.course?.levelId ?? null);
    const existing = await this.prisma.monthlyAssessment.findUnique({
      where: { studentId_courseId_cycleStart: { studentId, courseId, cycleStart: cycle.start } },
      include: { scores: { orderBy: { displayOrder: 'asc' } } },
    });

    // A saved assessment keeps its own snapshot; only a fresh one reads live.
    const stats = existing
      ? {
          attendancePct: existing.attendancePct,
          attendedClasses: existing.attendedClasses,
          totalClasses: existing.totalClasses,
          assignmentPct: existing.assignmentPct,
          assignmentsSubmitted: existing.assignmentsSubmitted,
          assignmentsTotal: existing.assignmentsTotal,
          homeworkPct: existing.homeworkPct,
        }
      : await this.cycleStats(studentId, courseId, cycle);

    const bands = await this.templates.bandsFor(template?.gradingScaleId ?? null);

    return {
      student: {
        id: student.id,
        code: student.studentCode,
        name: `${student.user.firstName} ${student.user.lastName}`.trim(),
        email: student.user.email,
        level: enrolment.course?.level?.name ?? student.learningLevel ?? null,
        parentName: student.parentName ?? student.guardianName ?? null,
      },
      course: enrolment.course ? { id: enrolment.course.id, title: enrolment.course.title } : null,
      teacherId: enrolment.teacherId ?? null,
      cycle: {
        start: cycle.start,
        end: cycle.end,
        index: cycle.index,
        label: cycle.label,
        fromSubscription: cycle.fromSubscription,
        dueAt: dueDateFor(cycle, cfg.dueDaysAfterCycleEnd),
      },
      eligibility: {
        eligible,
        enrolledDays,
        minDays: cfg.minDaysBeforeAssessment,
        reason: eligible
          ? null
          : `This student was only enrolled for ${enrolledDays} day(s) of this cycle. At least ${cfg.minDaysBeforeAssessment} are needed before an assessment can be raised.`,
      },
      summary: stats,
      template: template
        ? {
            id: template.id,
            name: template.name,
            maxMarks: template.maxMarks,
            passingMarks: template.passingMarks,
            criteria: template.criteria.map((c) => ({
              id: c.id,
              name: c.name,
              maxMarks: c.maxMarks,
              displayOrder: c.displayOrder,
              isMandatory: c.isMandatory,
            })),
          }
        : null,
      gradeBands: bands,
      subscriptionId,
      assessment: existing ? this.shape(existing) : null,
      // The form is editable only while the teacher still owns the row.
      editable: !existing || existing.status === 'DRAFT' || existing.status === 'RETURNED',
    };
  }

  private async assertMayWrite(actor: Actor, assignedTeacherId: string | null) {
    if ((STAFF_ROLES as string[]).includes(actor.role)) return;
    if (actor.role !== Role.TEACHER) throw new ForbiddenException('Only a teacher or staff may write an assessment.');
    const mine = await this.teacherProfileId(actor.id);
    if (!mine || mine !== assignedTeacherId) {
      throw new ForbiddenException('You can only assess students assigned to you.');
    }
  }

  // ══ Save / submit ══════════════════════════════════════════════════════════

  /** Compute total, percentage, grade and pass/fail from the entered scores. */
  private async computeTotals(
    scores: { marks: number; maxMarks: number }[],
    maxMarks: number,
    passingMarks: number,
    gradingScaleId: string | null,
  ) {
    const total = round2(scores.reduce((a, s) => a + Number(s.marks || 0), 0));
    const percentage = maxMarks > 0 ? round2((total / maxMarks) * 100) : 0;
    const bands = await this.templates.bandsFor(gradingScaleId);
    return {
      totalMarks: total,
      percentage,
      grade: gradeFor(percentage, bands),
      passed: total >= passingMarks,
    };
  }

  async save(dto: SaveAssessmentDto, actor: Actor, submit: boolean) {
    const student = await this.studentContext(dto.studentId);
    const { anchor, subscriptionId, enrolment } = this.anchorFor(student, dto.courseId);
    if (!enrolment) throw new BadRequestException('This student is not enrolled in that course.');
    await this.assertMayWrite(actor, enrolment.teacherId ?? null);

    const cycle = dto.cycleStart ? cycleAt(anchor, new Date(dto.cycleStart)) : assessableCycle(anchor);
    if (!cycle) throw new BadRequestException('No finished billing cycle to assess yet.');

    const cfg = await this.templates.config();
    const enrolledDays = enrolledDaysInCycle(cycle, enrolment.startedAt ?? anchor.actualCycleStartDate);
    if (enrolledDays < cfg.minDaysBeforeAssessment) {
      throw new BadRequestException(
        `At least ${cfg.minDaysBeforeAssessment} days of the cycle must be completed before assessing — this student has ${enrolledDays}.`,
      );
    }

    const template = await this.templates.templateFor(dto.courseId, enrolment.course?.levelId ?? null);
    if (!template) {
      throw new BadRequestException(
        'No active assessment template exists for this course. Ask an admin to create one first.',
      );
    }

    const existing = await this.prisma.monthlyAssessment.findUnique({
      where: {
        studentId_courseId_cycleStart: {
          studentId: dto.studentId, courseId: dto.courseId, cycleStart: cycle.start,
        },
      },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== 'DRAFT' && existing.status !== 'RETURNED') {
      throw new BadRequestException(
        existing.status === 'PUBLISHED'
          ? 'This assessment is published and read-only. A supervisor must reopen it first.'
          : `This assessment is ${existing.status.toLowerCase()} and can no longer be edited.`,
      );
    }

    const scores = this.validateScores(dto.scores, template);
    const totals = await this.computeTotals(scores, template.maxMarks, template.passingMarks, template.gradingScaleId);

    if (submit && !dto.teacherRemarks?.trim()) {
      throw new BadRequestException('Teacher comments are required before submitting an assessment.');
    }

    const stats = existing
      ? null // keep the snapshot taken when it was first created
      : await this.cycleStats(dto.studentId, dto.courseId, cycle);

    const teacherId = enrolment.teacherId ?? (actor.role === Role.TEACHER ? await this.teacherProfileId(actor.id) : null);

    /*
     * Submitting publishes outright unless a supervisor's approval is required.
     *
     * The academy's rule is that the teacher's submission IS the report — a
     * supervisor reads it afterwards rather than gating it. `publish()` still
     * exists for the other setting, and the SUPERVISOR/ADMIN half of the
     * publish notification means they still hear about every one of these.
     *
     * The status is written straight into the upsert rather than by calling
     * publish() after it: publish() re-reads and atomically claims the row
     * because two supervisors can race for it, whereas here the teacher's own
     * write is already the only one in flight.
     */
    const autoPublish = submit && !cfg.requireSupervisorApproval;
    const status = autoPublish ? 'PUBLISHED' : submit ? 'SUBMITTED' : 'DRAFT';
    const submitStamp = submit
      ? {
          submittedAt: new Date(),
          returnedReason: null,
          returnedAt: null,
          ...(autoPublish ? { publishedAt: new Date() } : {}),
        }
      : {};

    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.monthlyAssessment.upsert({
        where: {
          studentId_courseId_cycleStart: {
            studentId: dto.studentId, courseId: dto.courseId, cycleStart: cycle.start,
          },
        },
        update: {
          teacherId,
          templateId: template.id,
          subscriptionId,
          maxMarks: template.maxMarks,
          passingMarks: template.passingMarks,
          ...totals,
          teacherRemarks: dto.teacherRemarks ?? null,
          recommendations: dto.recommendations ?? null,
          assessmentDate: new Date(),
          status,
          ...submitStamp,
        },
        create: {
          studentId: dto.studentId,
          courseId: dto.courseId,
          teacherId,
          templateId: template.id,
          subscriptionId,
          cycleStart: cycle.start,
          cycleEnd: cycle.end,
          cycleIndex: cycle.index,
          monthLabel: cycle.label,
          dueAt: dueDateFor(cycle, cfg.dueDaysAfterCycleEnd),
          levelName: enrolment.course?.level?.name ?? student.learningLevel ?? null,
          ...(stats ?? {}),
          maxMarks: template.maxMarks,
          passingMarks: template.passingMarks,
          ...totals,
          teacherRemarks: dto.teacherRemarks ?? null,
          recommendations: dto.recommendations ?? null,
          status,
          ...submitStamp,
        },
        select: { id: true },
      });

      // Scores are replaced wholesale — they are one form, saved as a unit.
      await tx.monthlyAssessmentScore.deleteMany({ where: { assessmentId: row.id } });
      await tx.monthlyAssessmentScore.createMany({
        data: scores.map((s, i) => ({
          assessmentId: row.id,
          criterionId: s.criterionId ?? null,
          criterionName: s.criterionName,
          maxMarks: s.maxMarks,
          marks: s.marks,
          comment: s.comment ?? null,
          displayOrder: s.displayOrder ?? i,
        })),
      });
      return row.id;
    });

    await this.logActivity(
      dto.studentId,
      actor,
      autoPublish ? 'ASSESSMENT_PUBLISHED' : submit ? 'ASSESSMENT_SUBMITTED' : 'ASSESSMENT_DRAFT',
      {
        title: autoPublish
          ? `Monthly assessment published — ${cycle.label}`
          : submit
            ? `Monthly assessment submitted — ${cycle.label}`
            : `Monthly assessment saved as draft — ${cycle.label}`,
        description: `${totals.totalMarks}/${template.maxMarks} (${totals.percentage}%${totals.grade ? `, grade ${totals.grade}` : ''})`,
        // A published report is family-visible, so its audit entry is too.
        ...(autoPublish ? { visibility: 'ALL' as const } : {}),
        meta: { assessmentId: saved, cycleStart: cycle.start, courseId: dto.courseId },
      },
    );

    if (autoPublish) {
      await this.notifyPublished(saved).catch((e) =>
        this.logger.warn(`Assessment ${saved} published on submit but notifications failed: ${(e as Error).message}`),
      );
    } else if (submit) {
      await this.notifySubmitted(saved).catch(() => undefined);
    } else {
      await this.notifyDraft(saved, actor).catch(() => undefined);
    }

    return this.getOne(saved, actor);
  }

  /**
   * Marks must fit the rubric.
   *
   * Trusting the client here would let a teacher post 500/20 for one criterion
   * and hand the student a 400% report — the totals are computed server-side
   * precisely so that the inputs have to be checked here too.
   */
  private validateScores(
    incoming: SaveAssessmentDto['scores'],
    template: { maxMarks: number; criteria: { id: string; name: string; maxMarks: number; displayOrder: number; isMandatory: boolean }[] },
  ) {
    const byId = new Map(template.criteria.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const out: {
      criterionId: string | null; criterionName: string; maxMarks: number;
      marks: number; comment?: string; displayOrder: number;
    }[] = [];

    for (const s of incoming ?? []) {
      const criterion = s.criterionId ? byId.get(s.criterionId) : undefined;
      if (!criterion) {
        throw new BadRequestException(
          `"${s.criterionName}" is not a criterion on this template — reload the form and try again.`,
        );
      }
      if (seen.has(criterion.id)) {
        throw new BadRequestException(`"${criterion.name}" was scored twice.`);
      }
      seen.add(criterion.id);
      const marks = Number(s.marks);
      if (!Number.isFinite(marks) || marks < 0) {
        throw new BadRequestException(`"${criterion.name}": marks must be zero or more.`);
      }
      if (marks > criterion.maxMarks) {
        throw new BadRequestException(
          `"${criterion.name}": ${marks} exceeds the maximum of ${criterion.maxMarks}.`,
        );
      }
      out.push({
        criterionId: criterion.id,
        criterionName: criterion.name,
        maxMarks: criterion.maxMarks,
        marks: round2(marks),
        comment: s.comment,
        displayOrder: criterion.displayOrder,
      });
    }

    const missing = template.criteria.filter((c) => c.isMandatory && !seen.has(c.id));
    if (missing.length) {
      throw new BadRequestException(
        `Marks are required for: ${missing.map((m) => m.name).join(', ')}.`,
      );
    }
    return out.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  // ══ Supervisor: review → approve → publish ═════════════════════════════════

  private async loadOr404(id: string) {
    const a = await this.prisma.monthlyAssessment.findUnique({
      where: { id },
      include: { scores: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!a) throw new NotFoundException('Assessment not found.');
    return a;
  }

  async setUnderReview(id: string, actor: Actor) {
    const a = await this.loadOr404(id);
    if (a.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only a submitted assessment can be reviewed (this one is ${a.status.toLowerCase()}).`);
    }
    await this.prisma.monthlyAssessment.update({
      where: { id },
      data: { reviewedById: actor?.id ?? null, reviewedByName: await actorName(this.prisma, actor) },
    });
    return this.getOne(id, actor);
  }

  async approve(id: string, actor: Actor) {
    const a = await this.loadOr404(id);
    if (a.status === 'PUBLISHED') throw new BadRequestException('Already published.');
    if (a.status === 'APPROVED') throw new BadRequestException('Already approved.');
    if (a.status !== 'SUBMITTED') {
      throw new BadRequestException('Only a submitted assessment can be approved.');
    }
    await this.prisma.monthlyAssessment.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: actor?.id ?? null,
        approvedByName: await actorName(this.prisma, actor),
        approvedAt: new Date(),
        returnedReason: null,
      },
    });
    await this.logActivity(a.studentId, actor, 'ASSESSMENT_APPROVED', {
      title: `Monthly assessment approved — ${a.monthLabel}`,
      meta: { assessmentId: id },
    });
    await this.notifyStaff(id, 'MONTHLY_ASSESSMENT_APPROVED', 'Assessment approved', (s) =>
      `${s.studentName}'s ${s.monthLabel} assessment has been approved and is ready to publish.`,
    ).catch(() => undefined);
    return this.getOne(id, actor);
  }

  async returnForRevision(id: string, dto: ReturnAssessmentDto, actor: Actor) {
    const a = await this.loadOr404(id);
    if (a.status !== 'SUBMITTED' && a.status !== 'APPROVED') {
      throw new BadRequestException('Only a submitted or approved assessment can be returned for revision.');
    }
    await this.prisma.monthlyAssessment.update({
      where: { id },
      data: {
        status: 'RETURNED',
        returnedReason: dto.reason.trim(),
        returnedAt: new Date(),
        reviewedById: actor?.id ?? null,
        reviewedByName: await actorName(this.prisma, actor),
        approvedAt: null,
        approvedById: null,
        approvedByName: null,
      },
    });
    await this.logActivity(a.studentId, actor, 'ASSESSMENT_RETURNED', {
      title: `Monthly assessment returned for revision — ${a.monthLabel}`,
      description: dto.reason.trim(),
      meta: { assessmentId: id },
    });
    await this.notifyStaff(id, 'MONTHLY_ASSESSMENT_RETURNED', 'Assessment returned for revision', (s) =>
      `${s.studentName}'s ${s.monthLabel} assessment was returned: ${dto.reason.trim()}`,
    ).catch(() => undefined);
    return this.getOne(id, actor);
  }

  async publish(id: string, actor: Actor) {
    const cfg = await this.templates.config();
    const a = await this.loadOr404(id);
    if (a.status === 'PUBLISHED') throw new BadRequestException('Already published.');
    if (cfg.requireSupervisorApproval && a.status !== 'APPROVED') {
      throw new BadRequestException('This assessment must be approved by a supervisor before it can be published.');
    }
    if (!cfg.requireSupervisorApproval && a.status !== 'SUBMITTED' && a.status !== 'APPROVED') {
      throw new BadRequestException('Only a submitted or approved assessment can be published.');
    }

    /*
     * Publishing is the one transition that makes the row visible to the family
     * and immutable, so it is claimed atomically: two supervisors clicking at
     * once would otherwise both publish and both send the family a notification.
     */
    const claimed = await this.prisma.monthlyAssessment.updateMany({
      where: { id, status: { in: ['SUBMITTED', 'APPROVED'] } },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('This assessment was just published by someone else.');
    }

    await this.logActivity(a.studentId, actor, 'ASSESSMENT_PUBLISHED', {
      title: `Monthly assessment published — ${a.monthLabel}`,
      description: `${Number(a.totalMarks)}/${a.maxMarks} (${Number(a.percentage)}%${a.grade ? `, grade ${a.grade}` : ''})`,
      visibility: 'ALL',
      meta: { assessmentId: id },
    });
    await this.notifyPublished(id).catch((e) =>
      this.logger.warn(`Assessment ${id} published but notifications failed: ${(e as Error).message}`),
    );
    return this.getOne(id, actor);
  }

  /** Publish every approved assessment in a cycle at once. */
  async publishBatch(ids: string[], actor: Actor) {
    const results: { id: string; published: boolean; reason?: string }[] = [];
    for (const id of ids) {
      try {
        await this.publish(id, actor);
        results.push({ id, published: true });
      } catch (e) {
        results.push({ id, published: false, reason: (e as Error).message });
      }
    }
    return { published: results.filter((r) => r.published).length, results };
  }

  async reopen(id: string, dto: ReopenAssessmentDto, actor: Actor) {
    const a = await this.loadOr404(id);
    if (a.status !== 'PUBLISHED') {
      throw new BadRequestException('Only a published assessment needs reopening.');
    }
    await this.prisma.monthlyAssessment.update({
      where: { id },
      data: {
        status: 'RETURNED',
        returnedReason: dto.reason?.trim() || 'Reopened by a supervisor for correction.',
        returnedAt: new Date(),
        publishedAt: null,
        approvedAt: null,
        approvedById: null,
        approvedByName: null,
        reopenedById: actor?.id ?? null,
        reopenedByName: await actorName(this.prisma, actor),
        reopenedAt: new Date(),
      },
    });
    await this.logActivity(a.studentId, actor, 'ASSESSMENT_REOPENED', {
      title: `Monthly assessment reopened — ${a.monthLabel}`,
      description: dto.reason?.trim() || null,
      meta: { assessmentId: id },
    });
    await this.notifyStaff(id, 'MONTHLY_ASSESSMENT_RETURNED', 'Assessment reopened', (s) =>
      `${s.studentName}'s ${s.monthLabel} assessment was reopened for correction.`,
    ).catch(() => undefined);
    return this.getOne(id, actor);
  }

  // ══ Reading ════════════════════════════════════════════════════════════════

  private shape(a: any) {
    return {
      id: a.id,
      studentId: a.studentId,
      courseId: a.courseId,
      teacherId: a.teacherId,
      templateId: a.templateId,
      cycleStart: a.cycleStart,
      cycleEnd: a.cycleEnd,
      cycleIndex: a.cycleIndex,
      monthLabel: a.monthLabel,
      dueAt: a.dueAt,
      assessmentDate: a.assessmentDate,
      levelName: a.levelName,
      summary: {
        attendancePct: a.attendancePct,
        attendedClasses: a.attendedClasses,
        totalClasses: a.totalClasses,
        assignmentPct: a.assignmentPct,
        assignmentsSubmitted: a.assignmentsSubmitted,
        assignmentsTotal: a.assignmentsTotal,
        homeworkPct: a.homeworkPct,
      },
      totalMarks: Number(a.totalMarks),
      maxMarks: a.maxMarks,
      passingMarks: a.passingMarks,
      percentage: Number(a.percentage),
      grade: a.grade,
      passed: a.passed,
      teacherRemarks: a.teacherRemarks,
      recommendations: a.recommendations,
      status: a.status,
      submittedAt: a.submittedAt,
      returnedReason: a.returnedReason,
      returnedAt: a.returnedAt,
      reviewedByName: a.reviewedByName,
      approvedByName: a.approvedByName,
      approvedAt: a.approvedAt,
      publishedAt: a.publishedAt,
      reopenedByName: a.reopenedByName,
      reopenedAt: a.reopenedAt,
      scores: (a.scores ?? []).map((s: any) => ({
        id: s.id,
        criterionId: s.criterionId,
        criterionName: s.criterionName,
        maxMarks: s.maxMarks,
        marks: Number(s.marks),
        comment: s.comment,
        displayOrder: s.displayOrder,
      })),
    };
  }

  async getOne(id: string, actor: Actor) {
    const a = await this.prisma.monthlyAssessment.findUnique({
      where: { id },
      include: {
        scores: { orderBy: { displayOrder: 'asc' } },
        feedback: { orderBy: { createdAt: 'desc' } },
        course: { select: { id: true, title: true } },
        student: {
          select: {
            id: true, studentCode: true, userId: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Assessment not found.');

    // A student may only read their own, and only once published.
    if (actor.role === Role.STUDENT) {
      if (a.student.userId !== actor.id) throw new NotFoundException('Assessment not found.');
      if (a.status !== 'PUBLISHED') throw new NotFoundException('Assessment not found.');
    }
    if (actor.role === Role.TEACHER) {
      const mine = await this.teacherProfileId(actor.id);
      if (a.teacherId && mine !== a.teacherId) {
        throw new ForbiddenException('This assessment belongs to another teacher.');
      }
    }

    const teacher = a.teacherId
      ? await this.prisma.teacherProfile.findUnique({
          where: { id: a.teacherId },
          select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } } },
        })
      : null;

    return {
      ...this.shape(a),
      student: {
        id: a.student.id,
        code: a.student.studentCode,
        name: `${a.student.user.firstName} ${a.student.user.lastName}`.trim(),
      },
      course: a.course ? { id: a.course.id, title: a.course.title } : null,
      teacher: teacher
        ? { id: teacher.id, code: teacher.teacherCode, name: `${teacher.user.firstName} ${teacher.user.lastName}`.trim() }
        : null,
      feedback: a.feedback.map((f) => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        by: f.submittedByName,
        at: f.createdAt,
        reviewedByName: f.reviewedByName,
        reviewedAt: f.reviewedAt,
        reviewNote: f.reviewNote,
      })),
    };
  }

  /** The staff/teacher list. Teachers are narrowed to their own rows. */
  async list(q: ListAssessmentsQuery, actor: Actor) {
    const where: Record<string, unknown> = {};
    if (q.courseId) where.courseId = q.courseId;
    if (q.studentId) where.studentId = q.studentId;
    if (q.status) where.status = q.status;
    if (q.monthLabel) where.monthLabel = q.monthLabel;
    if (q.cycleStart) {
      const d = new Date(q.cycleStart);
      if (!isNaN(d.getTime())) where.cycleStart = d;
    }
    if (actor.role === Role.TEACHER) {
      const mine = await this.teacherProfileId(actor.id);
      where.teacherId = mine ?? '__none__';
    } else if (q.teacherId) {
      where.teacherId = q.teacherId;
    }

    const rows = await this.prisma.monthlyAssessment.findMany({
      where,
      include: {
        course: { select: { id: true, title: true } },
        student: {
          select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } },
        },
        _count: { select: { feedback: true } },
      },
      orderBy: [{ cycleStart: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    const teacherIds = [...new Set(rows.map((r) => r.teacherId).filter(Boolean) as string[])];
    const teachers = teacherIds.length
      ? await this.prisma.teacherProfile.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const tName = new Map(teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`.trim()]));

    const search = q.search?.trim().toLowerCase();
    return rows
      .map((r) => ({
        id: r.id,
        student: {
          id: r.student.id,
          code: r.student.studentCode,
          name: `${r.student.user.firstName} ${r.student.user.lastName}`.trim(),
        },
        course: r.course ? { id: r.course.id, title: r.course.title } : null,
        teacherName: r.teacherId ? tName.get(r.teacherId) ?? null : null,
        monthLabel: r.monthLabel,
        cycleStart: r.cycleStart,
        cycleEnd: r.cycleEnd,
        dueAt: r.dueAt,
        totalMarks: Number(r.totalMarks),
        maxMarks: r.maxMarks,
        percentage: Number(r.percentage),
        grade: r.grade,
        passed: r.passed,
        status: r.status,
        submittedAt: r.submittedAt,
        publishedAt: r.publishedAt,
        feedbackCount: r._count.feedback,
      }))
      .filter((r) =>
        !search ||
        r.student.name.toLowerCase().includes(search) ||
        (r.student.code ?? '').toLowerCase().includes(search) ||
        (r.course?.title ?? '').toLowerCase().includes(search),
      );
  }

  /**
   * The teacher's work queue: one row per student they teach whose latest
   * finished cycle has no submitted assessment yet.
   */
  async dueList(actor: Actor) {
    const teacherId =
      actor.role === Role.TEACHER ? await this.teacherProfileId(actor.id) : null;
    if (actor.role === Role.TEACHER && !teacherId) return [];

    const enrolments = await this.prisma.enrollment.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
        ...(teacherId ? { teacherId } : {}),
      },
      select: {
        id: true, courseId: true, teacherId: true, startedAt: true,
        course: { select: { id: true, title: true, levelId: true } },
        student: {
          select: {
            id: true, studentCode: true, learningLevel: true,
            user: { select: { firstName: true, lastName: true } },
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'ON_BREAK'] as never } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { actualCycleStartDate: true, renewalDate: true, startDate: true },
            },
          },
        },
      },
      take: 1000,
    });

    const cfg = await this.templates.config();
    const now = new Date();
    const out: any[] = [];

    for (const e of enrolments) {
      const sub = e.student.subscriptions[0] ?? null;
      const anchor = {
        actualCycleStartDate: sub?.actualCycleStartDate ?? null,
        renewalDate: sub?.renewalDate ?? null,
        fallbackStart: e.startedAt ?? sub?.startDate ?? null,
      };
      const cycle = assessableCycle(anchor, now);
      if (!cycle) continue;

      const enrolledDays = enrolledDaysInCycle(cycle, e.startedAt ?? anchor.actualCycleStartDate);
      if (enrolledDays < cfg.minDaysBeforeAssessment) continue;

      const existing = await this.prisma.monthlyAssessment.findUnique({
        where: {
          studentId_courseId_cycleStart: {
            studentId: e.student.id, courseId: e.courseId, cycleStart: cycle.start,
          },
        },
        select: { id: true, status: true, totalMarks: true, percentage: true, grade: true },
      });
      // Anything already handed over is off the teacher's plate.
      if (existing && existing.status !== 'DRAFT' && existing.status !== 'RETURNED') continue;

      const dueAt = dueDateFor(cycle, cfg.dueDaysAfterCycleEnd);
      out.push({
        studentId: e.student.id,
        studentCode: e.student.studentCode,
        studentName: `${e.student.user.firstName} ${e.student.user.lastName}`.trim(),
        courseId: e.courseId,
        courseTitle: e.course?.title ?? null,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        monthLabel: cycle.label,
        dueAt,
        overdue: now > dueAt,
        daysLeft: Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000),
        enrolledDays,
        assessmentId: existing?.id ?? null,
        status: existing?.status ?? 'NOT_STARTED',
      });
    }
    return out.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }

  /** A student's own published reports, newest first. */
  async myReports(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) return [];
    const rows = await this.prisma.monthlyAssessment.findMany({
      where: { studentId: student.id, status: 'PUBLISHED' },
      include: {
        scores: { orderBy: { displayOrder: 'asc' } },
        feedback: { orderBy: { createdAt: 'desc' } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { cycleStart: 'desc' },
    });
    const teacherIds = [...new Set(rows.map((r) => r.teacherId).filter(Boolean) as string[])];
    const teachers = teacherIds.length
      ? await this.prisma.teacherProfile.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const tName = new Map(teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`.trim()]));

    return rows.map((r) => ({
      ...this.shape(r),
      course: r.course ? { id: r.course.id, title: r.course.title } : null,
      teacherName: r.teacherId ? tName.get(r.teacherId) ?? null : null,
      feedback: r.feedback.map((f) => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        by: f.submittedByName,
        at: f.createdAt,
        reviewedByName: f.reviewedByName,
        reviewedAt: f.reviewedAt,
        reviewNote: f.reviewNote,
      })),
    }));
  }

  /** Every assessment for one student — the admin student-hub tab. */
  async forStudent(studentId: string) {
    const rows = await this.prisma.monthlyAssessment.findMany({
      where: { studentId },
      include: {
        scores: { orderBy: { displayOrder: 'asc' } },
        course: { select: { id: true, title: true } },
        _count: { select: { feedback: true } },
      },
      orderBy: { cycleStart: 'desc' },
    });
    return rows.map((r) => ({
      ...this.shape(r),
      course: r.course ? { id: r.course.id, title: r.course.title } : null,
      feedbackCount: r._count.feedback,
    }));
  }

  // ══ Parent/guardian feedback (submitted from the student panel) ════════════

  async submitFeedback(assessmentId: string, dto: SubmitFeedbackDto, actor: Actor) {
    const a = await this.prisma.monthlyAssessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true, status: true, monthLabel: true, teacherId: true, studentId: true,
        student: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!a) throw new NotFoundException('Assessment not found.');
    if (a.status !== 'PUBLISHED') {
      throw new BadRequestException('Feedback can only be given on a published assessment.');
    }
    if (actor.role === Role.STUDENT && a.student.userId !== actor.id) {
      throw new NotFoundException('Assessment not found.');
    }

    const created = await this.prisma.assessmentFeedback.create({
      data: {
        assessmentId,
        submittedById: actor?.id ?? null,
        submittedByName: await actorName(this.prisma, actor),
        rating: dto.rating ?? null,
        comment: dto.comment.trim(),
      },
    });

    await this.logActivity(a.studentId, actor, 'ASSESSMENT_FEEDBACK', {
      kind: 'COMMUNICATION',
      title: `Feedback on the ${a.monthLabel} assessment`,
      description: dto.comment.trim(),
      meta: { assessmentId, rating: dto.rating ?? null },
    });

    // The teacher and the supervisors are told, because the spec's loop ends
    // with them reviewing the feedback after being notified.
    const studentName = `${a.student.user.firstName} ${a.student.user.lastName}`.trim();
    const body = `${studentName}'s family left feedback on the ${a.monthLabel} assessment${dto.rating ? ` (${dto.rating}/5)` : ''}.`;
    const jobs: Promise<unknown>[] = [
      this.notifications.createForRoles([Role.SUPERVISOR, Role.ADMIN], {
        type: 'MONTHLY_ASSESSMENT_FEEDBACK',
        title: 'Assessment feedback received',
        body,
        link: `/monthly-assessments/${assessmentId}`,
      }),
    ];
    const teacherUserId = a.teacherId ? await this.teacherUserId(a.teacherId) : null;
    if (teacherUserId) {
      jobs.push(
        this.notifications.createFor(teacherUserId, {
          type: 'MONTHLY_ASSESSMENT_FEEDBACK',
          title: 'Assessment feedback received',
          body,
          link: `/teacher/monthly-assessments/${assessmentId}`,
        }),
      );
    }
    await Promise.all(jobs.map((p) => p.catch(() => undefined)));
    return { id: created.id, submitted: true };
  }

  async reviewFeedback(feedbackId: string, dto: ReviewFeedbackDto, actor: Actor) {
    const f = await this.prisma.assessmentFeedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, assessmentId: true },
    });
    if (!f) throw new NotFoundException('Feedback not found.');
    await this.prisma.assessmentFeedback.update({
      where: { id: feedbackId },
      data: {
        reviewedById: actor?.id ?? null,
        reviewedByName: await actorName(this.prisma, actor),
        reviewedAt: new Date(),
        reviewNote: dto.note?.trim() || null,
      },
    });
    return this.getOne(f.assessmentId, actor);
  }

  /** Feedback nobody has looked at yet — the teacher/supervisor follow-up list. */
  async pendingFeedback(actor: Actor) {
    const where: Record<string, unknown> = { reviewedAt: null };
    if (actor.role === Role.TEACHER) {
      const mine = await this.teacherProfileId(actor.id);
      where.assessment = { teacherId: mine ?? '__none__' };
    }
    const rows = await this.prisma.assessmentFeedback.findMany({
      where,
      include: {
        assessment: {
          select: {
            id: true, monthLabel: true,
            course: { select: { title: true } },
            student: { select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((f) => ({
      id: f.id,
      assessmentId: f.assessmentId,
      monthLabel: f.assessment.monthLabel,
      courseTitle: f.assessment.course?.title ?? null,
      student: {
        id: f.assessment.student.id,
        code: f.assessment.student.studentCode,
        name: `${f.assessment.student.user.firstName} ${f.assessment.student.user.lastName}`.trim(),
      },
      rating: f.rating,
      comment: f.comment,
      by: f.submittedByName,
      at: f.createdAt,
    }));
  }

  // ══ Dashboards ═════════════════════════════════════════════════════════════

  async adminDashboard() {
    const [byStatus, total, published, pendingFeedback] = await Promise.all([
      this.prisma.monthlyAssessment.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.monthlyAssessment.count(),
      this.prisma.monthlyAssessment.findMany({
        where: { status: 'PUBLISHED' },
        select: { percentage: true, passed: true, grade: true, monthLabel: true, courseId: true },
        take: 2000,
        orderBy: { cycleStart: 'desc' },
      }),
      this.prisma.assessmentFeedback.count({ where: { reviewedAt: null } }),
    ]);

    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    const avg = published.length
      ? round2(published.reduce((a, r) => a + Number(r.percentage), 0) / published.length)
      : 0;
    const passRate = published.length
      ? Math.round((published.filter((r) => r.passed).length / published.length) * 100)
      : 0;

    const gradeCounts = new Map<string, number>();
    for (const r of published) {
      if (!r.grade) continue;
      gradeCounts.set(r.grade, (gradeCounts.get(r.grade) ?? 0) + 1);
    }

    const overdue = await this.prisma.monthlyAssessment.count({
      where: { status: { in: ['DRAFT', 'RETURNED'] }, dueAt: { lt: new Date() } },
    });

    return {
      total,
      draft: counts.DRAFT ?? 0,
      submitted: counts.SUBMITTED ?? 0,
      returned: counts.RETURNED ?? 0,
      approved: counts.APPROVED ?? 0,
      published: counts.PUBLISHED ?? 0,
      overdue,
      pendingFeedback,
      averagePercentage: avg,
      passRate,
      gradeDistribution: [...gradeCounts.entries()]
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async teacherDashboard(actor: Actor) {
    const teacherId = await this.teacherProfileId(actor.id);
    if (!teacherId) return { due: 0, overdue: 0, draft: 0, submitted: 0, published: 0, pendingFeedback: 0 };
    const due = await this.dueList(actor);
    const [draft, submitted, published, pendingFeedback] = await Promise.all([
      this.prisma.monthlyAssessment.count({ where: { teacherId, status: 'DRAFT' } }),
      this.prisma.monthlyAssessment.count({ where: { teacherId, status: 'SUBMITTED' } }),
      this.prisma.monthlyAssessment.count({ where: { teacherId, status: 'PUBLISHED' } }),
      this.prisma.assessmentFeedback.count({ where: { reviewedAt: null, assessment: { teacherId } } }),
    ]);
    return {
      due: due.length,
      overdue: due.filter((d) => d.overdue).length,
      draft,
      submitted,
      published,
      pendingFeedback,
    };
  }

  // ══ Notifications ══════════════════════════════════════════════════════════

  private async teacherUserId(teacherProfileId: string): Promise<string | null> {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { userId: true },
    });
    return t?.userId ?? null;
  }

  private async notifySummary(id: string) {
    const a = await this.prisma.monthlyAssessment.findUnique({
      where: { id },
      select: {
        id: true, monthLabel: true, teacherId: true, studentId: true, grade: true,
        percentage: true, totalMarks: true, maxMarks: true,
        course: { select: { title: true } },
        student: {
          select: {
            userId: true, parentEmail: true, parentName: true, guardianName: true, coachId: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    if (!a) return null;
    return {
      id: a.id,
      monthLabel: a.monthLabel,
      teacherId: a.teacherId,
      studentId: a.studentId,
      studentUserId: a.student.userId,
      studentName: `${a.student.user.firstName} ${a.student.user.lastName}`.trim(),
      studentEmail: a.student.user.email,
      parentEmail: a.student.parentEmail,
      parentName: a.student.parentName ?? a.student.guardianName,
      coachId: a.student.coachId,
      courseTitle: a.course?.title ?? 'the course',
      grade: a.grade,
      percentage: Number(a.percentage),
      totalMarks: Number(a.totalMarks),
      maxMarks: a.maxMarks,
    };
  }

  private async notifyDraft(id: string, actor: Actor) {
    // Per the spec's matrix, the draft notice goes to the teacher alone — it is
    // a "your work is saved" receipt, not news for anybody else.
    const s = await this.notifySummary(id);
    if (!s) return;
    const teacherUserId = s.teacherId ? await this.teacherUserId(s.teacherId) : null;
    const target = teacherUserId ?? (actor.role === Role.TEACHER ? actor.id : null);
    if (!target) return;
    await this.notifications.createFor(target, {
      type: 'MONTHLY_ASSESSMENT_DRAFT',
      title: 'Assessment saved as draft',
      body: `Your ${s.monthLabel} assessment for ${s.studentName} is saved. It is not submitted yet.`,
      link: `/teacher/monthly-assessments`,
    });
  }

  private async notifySubmitted(id: string) {
    const s = await this.notifySummary(id);
    if (!s) return;
    const jobs: Promise<unknown>[] = [
      this.notifications.createForRoles([Role.SUPERVISOR, Role.ADMIN], {
        type: 'MONTHLY_ASSESSMENT_SUBMITTED',
        title: 'Assessment submitted for review',
        body: `${s.studentName}'s ${s.monthLabel} ${s.courseTitle} assessment is ready for review.`,
        link: `/monthly-assessments/${s.id}`,
      }),
    ];
    const teacherUserId = s.teacherId ? await this.teacherUserId(s.teacherId) : null;
    if (teacherUserId) {
      jobs.push(
        this.notifications.createFor(teacherUserId, {
          type: 'MONTHLY_ASSESSMENT_SUBMITTED',
          title: 'Assessment submitted',
          body: `Your ${s.monthLabel} assessment for ${s.studentName} has been submitted for review.`,
          link: `/teacher/monthly-assessments`,
        }),
      );
    }
    await Promise.all(jobs.map((p) => p.catch(() => undefined)));
  }

  private async notifyStaff(id: string, type: string, title: string, body: (s: NonNullable<Awaited<ReturnType<typeof this.notifySummary>>>) => string) {
    const s = await this.notifySummary(id);
    if (!s) return;
    const jobs: Promise<unknown>[] = [
      this.notifications.createForRoles([Role.SUPERVISOR, Role.ADMIN], {
        type,
        title,
        body: body(s),
        link: `/monthly-assessments/${s.id}`,
      }),
    ];
    const teacherUserId = s.teacherId ? await this.teacherUserId(s.teacherId) : null;
    if (teacherUserId) {
      jobs.push(
        this.notifications.createFor(teacherUserId, {
          type,
          title,
          body: body(s),
          link: `/teacher/monthly-assessments`,
        }),
      );
    }
    await Promise.all(jobs.map((p) => p.catch(() => undefined)));
  }

  /**
   * Publication is the one event the family hears about.
   *
   * There is no parent login in this deployment, so "the parent portal" is the
   * student account — the family's single login. The parent contact address is
   * emailed separately when it differs, which is how every other parent-facing
   * message in this codebase reaches them.
   */
  private async notifyPublished(id: string) {
    const s = await this.notifySummary(id);
    if (!s) return;

    const summaryLine = `${s.totalMarks}/${s.maxMarks} (${s.percentage}%${s.grade ? `, grade ${s.grade}` : ''})`;
    const jobs: Promise<unknown>[] = [];

    jobs.push(
      this.notifications.createFor(s.studentUserId, {
        type: 'MONTHLY_ASSESSMENT_PUBLISHED',
        title: `Your ${s.monthLabel} assessment is ready`,
        body: `Your ${s.courseTitle} monthly assessment has been published: ${summaryLine}.`,
        link: '/student/monthly-assessments',
      }),
    );
    jobs.push(
      this.notifications.createFor(s.studentUserId, {
        type: 'MONTHLY_ASSESSMENT_AVAILABLE',
        title: 'Monthly assessment available',
        body: `${s.monthLabel} results are available in your portal. Your feedback is welcome.`,
        link: '/student/monthly-assessments',
      }),
    );
    const teacherUserId = s.teacherId ? await this.teacherUserId(s.teacherId) : null;
    if (teacherUserId) {
      jobs.push(
        this.notifications.createFor(teacherUserId, {
          type: 'MONTHLY_ASSESSMENT_PUBLISHED',
          title: 'Assessment published',
          body: `${s.studentName}'s ${s.monthLabel} assessment is now visible to the family.`,
          link: '/teacher/monthly-assessments',
        }),
      );
    }
    jobs.push(
      this.notifications.createForRoles([Role.SUPERVISOR, Role.ADMIN], {
        type: 'MONTHLY_ASSESSMENT_PUBLISHED',
        title: 'Assessment published',
        body: `${s.studentName}'s ${s.monthLabel} assessment has been published.`,
        link: `/monthly-assessments/${s.id}`,
      }),
    );
    if (s.coachId) {
      jobs.push(
        this.notifications.createFor(s.coachId, {
          type: 'MONTHLY_ASSESSMENT_PUBLISHED',
          title: 'Assessment published',
          body: `${s.studentName}'s ${s.monthLabel} assessment has been published.`,
          link: `/monthly-assessments/${s.id}`,
        }),
      );
    }

    await Promise.all(jobs.map((p) => p.catch(() => undefined)));

    // Parent contact address, when it is not simply the student's own.
    const parentEmail = s.parentEmail?.trim();
    if (parentEmail && parentEmail.toLowerCase() !== (s.studentEmail ?? '').toLowerCase()) {
      const text =
        `${s.studentName}'s monthly assessment for ${s.courseTitle} (${s.monthLabel}) has been published. ` +
        `Result: ${summaryLine}. Sign in to the student portal to read the full report and leave your feedback.`;
      await this.emails
        .sendMail(
          parentEmail,
          `${s.studentName} — ${s.monthLabel} monthly assessment`,
          text,
          undefined,
          `
            <p>Dear ${s.parentName || 'Parent'},</p>
            <p>${s.studentName}'s monthly assessment for <strong>${s.courseTitle}</strong> (${s.monthLabel}) has been published.</p>
            <p style="font-size:18px;"><strong>${summaryLine}</strong></p>
            <p>The full report — including the teacher's comments and recommendations — is available by signing in to the student portal, where you can also leave your feedback.</p>
          `,
        )
        .catch(() => undefined);
    }
  }

  // ══ Reminder sweep ═════════════════════════════════════════════════════════

  /**
   * Nudge teachers about assessments that are due or overdue.
   *
   * Both halves of the spec's rule live here: a heads-up N days before the due
   * date, then a daily nag once it has passed. `lastReminderAt` is what keeps
   * the hourly pass from becoming an hourly nag.
   */
  async reminderSweep() {
    const cfg = await this.templates.config();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const rows = await this.prisma.monthlyAssessment.findMany({
      where: {
        status: { in: ['DRAFT', 'RETURNED'] },
        teacherId: { not: null },
        dueAt: { not: null },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: dayAgo } }],
      },
      select: {
        id: true, teacherId: true, dueAt: true, monthLabel: true, status: true,
        student: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
      take: 300,
    });

    let sent = 0;
    for (const r of rows) {
      if (!r.dueAt || !r.teacherId) continue;
      const daysLeft = Math.ceil((r.dueAt.getTime() - now.getTime()) / 86_400_000);
      const overdue = daysLeft < 0;
      if (overdue && !cfg.overdueReminders) continue;
      // Before the reminder window opens there is nothing to say.
      if (!overdue && daysLeft > cfg.reminderDaysBefore) continue;

      const userId = await this.teacherUserId(r.teacherId);
      if (!userId) continue;
      const name = `${r.student.user.firstName} ${r.student.user.lastName}`.trim();
      await this.notifications
        .createFor(userId, {
          type: 'MONTHLY_ASSESSMENT_DUE',
          title: overdue ? 'Assessment overdue' : 'Assessment due soon',
          body: overdue
            ? `${name}'s ${r.monthLabel} assessment was due ${Math.abs(daysLeft)} day(s) ago. Please submit it.`
            : `${name}'s ${r.monthLabel} assessment is due in ${daysLeft} day(s).`,
          link: '/teacher/monthly-assessments',
        })
        .catch(() => undefined);
      await this.prisma.monthlyAssessment
        .update({ where: { id: r.id }, data: { lastReminderAt: now } })
        .catch(() => undefined);
      sent += 1;
    }

    /*
     * Cycles that have finished with no assessment row at all get a reminder
     * too — the row only exists once the teacher opens the form, so a teacher
     * who never opens it would otherwise never be chased.
     */
    const notStarted = await this.dueListForAllTeachers(cfg);
    for (const d of notStarted) {
      if (d.assessmentId) continue;
      if (!d.overdue && d.daysLeft > cfg.reminderDaysBefore) continue;
      if (d.overdue && !cfg.overdueReminders) continue;
      if (!d.teacherUserId) continue;
      await this.notifications
        .createFor(d.teacherUserId, {
          type: 'MONTHLY_ASSESSMENT_DUE',
          title: d.overdue ? 'Assessment overdue' : 'Assessment due soon',
          body: d.overdue
            ? `${d.studentName}'s ${d.monthLabel} assessment has not been started and was due ${Math.abs(d.daysLeft)} day(s) ago.`
            : `${d.studentName}'s ${d.monthLabel} assessment is due in ${d.daysLeft} day(s) and has not been started.`,
          link: '/teacher/monthly-assessments',
        })
        .catch(() => undefined);
      sent += 1;
    }

    if (sent) this.logger.log(`Assessment reminders sent: ${sent}`);
    return { sent };
  }

  /** dueList across every teacher, with the teacher's user id resolved. */
  private async dueListForAllTeachers(cfg: { minDaysBeforeAssessment: number; dueDaysAfterCycleEnd: number }) {
    const enrolments = await this.prisma.enrollment.findMany({
      where: { status: { in: ['ACTIVE', 'PENDING'] }, teacherId: { not: null } },
      select: {
        courseId: true, teacherId: true, startedAt: true,
        student: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'ON_BREAK'] as never } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { actualCycleStartDate: true, renewalDate: true, startDate: true },
            },
          },
        },
      },
      take: 1000,
    });

    const teacherIds = [...new Set(enrolments.map((e) => e.teacherId).filter(Boolean) as string[])];
    const teachers = teacherIds.length
      ? await this.prisma.teacherProfile.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, userId: true },
        })
      : [];
    const tUser = new Map(teachers.map((t) => [t.id, t.userId]));

    const now = new Date();
    const out: {
      studentName: string; monthLabel: string; dueAt: Date; overdue: boolean;
      daysLeft: number; assessmentId: string | null; teacherUserId: string | null;
    }[] = [];

    for (const e of enrolments) {
      const sub = e.student.subscriptions[0] ?? null;
      const cycle = assessableCycle(
        {
          actualCycleStartDate: sub?.actualCycleStartDate ?? null,
          renewalDate: sub?.renewalDate ?? null,
          fallbackStart: e.startedAt ?? sub?.startDate ?? null,
        },
        now,
      );
      if (!cycle) continue;
      if (enrolledDaysInCycle(cycle, e.startedAt) < cfg.minDaysBeforeAssessment) continue;

      const existing = await this.prisma.monthlyAssessment.findUnique({
        where: {
          studentId_courseId_cycleStart: {
            studentId: e.student.id, courseId: e.courseId, cycleStart: cycle.start,
          },
        },
        select: { id: true },
      });
      if (existing) continue; // handled by the row-based pass above

      const dueAt = dueDateFor(cycle, cfg.dueDaysAfterCycleEnd);
      out.push({
        studentName: `${e.student.user.firstName} ${e.student.user.lastName}`.trim(),
        monthLabel: cycle.label,
        dueAt,
        overdue: now > dueAt,
        daysLeft: Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000),
        assessmentId: null,
        teacherUserId: e.teacherId ? tUser.get(e.teacherId) ?? null : null,
      });
    }
    return out;
  }

  // ══ Audit ══════════════════════════════════════════════════════════════════

  private async logActivity(
    studentId: string,
    actor: Actor,
    type: string,
    input: { title: string; description?: string | null; kind?: string; visibility?: string; meta?: unknown },
  ) {
    await this.prisma.studentActivity
      .create({
        data: {
          studentId,
          kind: input.kind ?? 'TIMELINE',
          type,
          title: input.title,
          description: input.description ?? null,
          visibility: input.visibility ?? 'STAFF',
          meta: (input.meta ?? undefined) as never,
          actorId: actor?.id ?? null,
          actorName: await actorName(this.prisma, actor),
        },
      })
      .catch(() => undefined);
  }
}
