import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveCategory, LeaveRequestStatus, Role } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { LeavesService, type Actor } from './leaves.service';
import { endOfUtcDay, startOfUtcDay } from './leave.config';
import type { DecideImpactDto } from './dto';

const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const window = (a: Date, b: Date) => `${shortDate(a)} – ${shortDate(b)}`;

/** How often the return-to-availability sweep looks for finished windows. */
const RETURN_SWEEP_MS = 15 * 60_000;

/*
 * Module 9 §9.4–§9.7 — what an approved teacher unavailability does to the
 * students who were booked with them.
 *
 * Approval does NOT touch a single class. It builds a queue of affected
 * students for the Academic Coach, who speaks to each family and picks one of
 * the spec's three options. That ordering is the whole point of §9.5: before
 * this module the approval cancelled every class outright and locked their
 * attendance, so a family lost lessons they had paid for and nobody was asked.
 */
@Injectable()
export class LeaveImpactService implements OnModuleInit {
  private readonly logger = new Logger(LeaveImpactService.name);
  private returnTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaves: LeavesService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onModuleInit() {
    // Hand ourselves to LeavesService so approval and cancellation can reach
    // the impact half without a circular constructor dependency.
    this.leaves.registerImpactService(this);

    // The project's scheduling convention: setInterval + OnModuleInit, no
    // @nestjs/schedule anywhere in this codebase.
    this.returnTimer = setInterval(() => {
      this.returnSweep().catch((e) => this.logger.error(`Return sweep failed: ${e?.message ?? e}`));
    }, RETURN_SWEEP_MS);
    this.returnTimer.unref?.();
    // Run once at boot so a restart does not delay a teacher's return.
    setTimeout(() => this.returnSweep().catch(() => undefined), 10_000).unref?.();
  }

  onModuleDestroy() {
    if (this.returnTimer) clearInterval(this.returnTimer);
  }

  // ══ §9.4 build the coach's queue ════════════════════════════════════════════

  /**
   * Called when a teacher's unavailability is approved: work out who is
   * affected and open one review row per student.
   *
   * Idempotent — re-approving or re-running never doubles a family up, which
   * matters because a second row would let the same subscription be paused
   * twice and its cycle extended twice.
   */
  async buildForLeave(leaveId: string, actor: Actor | null): Promise<number> {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: {
        id: true, userId: true, category: true, status: true, startDate: true, endDate: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!leave || leave.status !== LeaveRequestStatus.APPROVED) return 0;
    if (leave.category !== LeaveCategory.TEACHER_UNAVAILABILITY) return 0;

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: leave.userId },
      select: { id: true },
    });
    if (!teacher) return 0;

    const from = startOfUtcDay(leave.startDate);
    const to = endOfUtcDay(leave.endDate);

    const classes = await this.prisma.classSession.findMany({
      where: {
        teacherId: teacher.id,
        status: { in: ['SCHEDULED', 'LIVE'] },
        startsAt: { gte: from, lte: to },
      },
      select: {
        id: true, courseId: true, startsAt: true,
        course: { select: { title: true } },
        attendees: { select: { studentId: true } },
      },
    });

    // Count the classes per student rather than per class: the coach's unit of
    // work is a conversation with a family, not a lesson.
    const perStudent = new Map<string, { count: number; courseId: string | null; courseTitle: string | null }>();
    for (const c of classes) {
      for (const a of c.attendees) {
        const acc = perStudent.get(a.studentId) ?? { count: 0, courseId: c.courseId, courseTitle: c.course?.title ?? null };
        acc.count += 1;
        perStudent.set(a.studentId, acc);
      }
    }

    const teacherName = `${leave.user.firstName ?? ''} ${leave.user.lastName ?? ''}`.trim() || leave.user.email;
    let created = 0;
    for (const [studentId, info] of perStudent) {
      const enrollment = info.courseId
        ? await this.prisma.enrollment.findFirst({
            where: { studentId, courseId: info.courseId },
            select: { id: true },
          })
        : null;

      // createMany + skipDuplicates would hide whether this was new; the unique
      // index does the guarding and the catch tells us it already existed.
      const existing = await this.prisma.leaveImpact.findUnique({
        where: { leaveId_studentId: { leaveId, studentId } },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.leaveImpact.update({
          where: { id: existing.id },
          data: { affectedClassCount: info.count },
        });
        continue;
      }

      await this.prisma.leaveImpact.create({
        data: {
          leaveId,
          studentId,
          enrollmentId: enrollment?.id ?? null,
          courseId: info.courseId,
          courseTitle: info.courseTitle,
          originalTeacherId: teacher.id,
          affectedClassCount: info.count,
        },
      });
      created += 1;
    }

    await this.leaves.audit(leaveId, actor, 'IMPACT_BUILT',
      `${perStudent.size} student(s) affected, ${classes.length} class(es) in the window`,
      { students: perStudent.size, classes: classes.length });

    if (perStudent.size) {
      await this.notifyClassesAffected(leaveId, teacherName, leave.startDate, leave.endDate, [...perStudent.keys()])
        .catch(() => undefined);
    }
    return created;
  }

  async openImpactsForLeave(leaveId: string): Promise<number> {
    return this.prisma.leaveImpact.count({ where: { leaveId, status: 'OPEN' } });
  }

  // ══ §9.5 the three options ══════════════════════════════════════════════════

  async decide(impactId: string, dto: DecideImpactDto, actor: Actor) {
    const impact = await this.mustFind(impactId);
    if (impact.status === 'RESOLVED') {
      throw new BadRequestException('That student has already been dealt with. Revert it first to change the plan.');
    }
    const leave = impact.leave;
    if (leave.status !== LeaveRequestStatus.APPROVED) {
      throw new BadRequestException('That unavailability is no longer approved.');
    }

    const decidedByName = await this.nameOf(actor.id);
    let extendedDays: number | null = null;
    let tempName: string | null = null;

    if (dto.option === 'WAIT_FOR_TEACHER') {
      extendedDays = await this.optionWait(impact, leave);
    } else if (dto.option === 'TEMPORARY_TEACHER') {
      if (!dto.temporaryTeacherId) throw new BadRequestException('Pick the teacher who will stand in.');
      tempName = await this.optionTemporaryTeacher(impact, leave, dto.temporaryTeacherId, actor);
    } else {
      await this.optionReschedule(impact, leave, dto.reschedules ?? [], actor);
    }

    const updated = await this.prisma.leaveImpact.update({
      where: { id: impactId },
      data: {
        option: dto.option,
        status: 'RESOLVED',
        temporaryTeacherId: dto.option === 'TEMPORARY_TEACHER' ? dto.temporaryTeacherId : null,
        temporaryTeacherName: tempName,
        restoreOriginal: dto.restoreOriginal ?? true,
        cycleExtendedDays: extendedDays,
        decidedById: actor.id,
        decidedByName,
        decidedAt: new Date(),
        notes: dto.notes?.trim() || null,
      },
    });

    await this.leaves.audit(leave.id, actor, 'IMPACT_DECIDED',
      `${dto.option} for ${impact.student.user?.email ?? impact.studentId}`,
      { impactId, option: dto.option, extendedDays, temporaryTeacherId: dto.temporaryTeacherId });

    return updated;
  }

  /**
   * Option 1 — the family waits for their own teacher.
   *
   * Pauses the classes, extends the billing cycle by the same span and keeps
   * the batch (and therefore the reserved recurring slot) exactly as it is. The
   * arithmetic lives in SubscriptionsService so there is one implementation of
   * "a pause costs the family nothing".
   */
  private async optionWait(
    impact: Awaited<ReturnType<LeaveImpactService['mustFind']>>,
    leave: { id: string; startDate: Date; endDate: Date },
  ): Promise<number> {
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId: impact.studentId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!sub) {
      // No live subscription to pause — the classes still need holding, so say
      // so rather than silently recording a pause that never happened.
      throw new BadRequestException(
        'This student has no active subscription to pause. Use a temporary teacher or reschedule instead.',
      );
    }

    const days = await this.subscriptions.pauseForTeacherUnavailability(
      sub.id, leave.startDate, leave.endDate,
    );
    if (!days) throw new BadRequestException('Their subscription could not be paused — it may already be paused.');

    await this.prisma.leaveImpact.update({
      where: { id: impact.id },
      data: { pausedSubscriptionId: sub.id },
    });
    await this.leaves.audit(leave.id, null, 'CLASSES_PAUSED',
      `${impact.affectedClassCount} class(es) paused; cycle extended ${days} day(s)`,
      { impactId: impact.id, subscriptionId: sub.id, days });
    return days;
  }

  /**
   * Option 2 — someone else takes the classes.
   *
   * The affected sessions are moved to the stand-in; the ENROLMENT is left
   * pointing at the original teacher unless the coach says otherwise, because
   * §9.11 requires a temporary assignment to preserve the student's real
   * teacher. Restoring on return is then just moving future sessions back.
   */
  private async optionTemporaryTeacher(
    impact: Awaited<ReturnType<LeaveImpactService['mustFind']>>,
    leave: { id: string; startDate: Date; endDate: Date },
    temporaryTeacherId: string,
    actor: Actor,
  ): Promise<string> {
    if (temporaryTeacherId === impact.originalTeacherId) {
      throw new BadRequestException('That is the teacher who is away.');
    }
    const temp = await this.prisma.teacherProfile.findUnique({
      where: { id: temporaryTeacherId },
      select: { id: true, userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!temp) throw new NotFoundException('That teacher does not exist.');

    // The stand-in must not themselves be away, or the class simply moves to a
    // second empty chair.
    if (await this.leaves.isAway(temp.userId, startOfUtcDay(leave.startDate), endOfUtcDay(leave.endDate))) {
      throw new BadRequestException('That teacher is also unavailable during this period.');
    }

    const classes = await this.affectedClasses(impact, leave);
    for (const c of classes) {
      await this.prisma.classSession.update({
        where: { id: c.id },
        data: { teacherId: temporaryTeacherId },
      });
    }

    const name = `${temp.user.firstName ?? ''} ${temp.user.lastName ?? ''}`.trim() || temp.user.email;
    await this.leaves.audit(leave.id, actor, 'TEMP_TEACHER_ASSIGNED',
      `${classes.length} class(es) reassigned to ${name}`,
      { impactId: impact.id, temporaryTeacherId, classes: classes.length });

    await this.notifyTemporaryTeacher(impact, leave, temp.userId, name).catch(() => undefined);
    return name;
  }

  /**
   * Option 3 — move the classes, using the same rules the reschedule module
   * enforces: no holidays, no clashes, and never into the unavailability
   * window we are trying to escape.
   */
  private async optionReschedule(
    impact: Awaited<ReturnType<LeaveImpactService['mustFind']>>,
    leave: { id: string; startDate: Date; endDate: Date },
    moves: { classId: string; startsAt: string }[],
    actor: Actor,
  ) {
    if (!moves.length) throw new BadRequestException('Give the new date and time for each class.');

    const classes = await this.affectedClasses(impact, leave);
    const byId = new Map(classes.map((c) => [c.id, c]));
    const from = startOfUtcDay(leave.startDate);
    const to = endOfUtcDay(leave.endDate);

    for (const m of moves) {
      const cls = byId.get(m.classId);
      if (!cls) throw new BadRequestException('One of those classes is not affected by this unavailability.');
      const startsAt = new Date(m.startsAt);
      if (!Number.isFinite(startsAt.getTime())) throw new BadRequestException('That is not a valid date and time.');
      if (startsAt >= from && startsAt <= to) {
        throw new BadRequestException(
          `${shortDate(startsAt)} is still inside the unavailability window — pick a date outside ${window(leave.startDate, leave.endDate)}.`,
        );
      }
      const durationMs = cls.endsAt.getTime() - cls.startsAt.getTime();
      const endsAt = new Date(startsAt.getTime() + durationMs);

      // The teacher must be free then — including of any OTHER approved leave.
      if (await this.leaves.isAway(impact.originalTeacherUserId, startsAt, endsAt)) {
        throw new BadRequestException(`The teacher is also away on ${shortDate(startsAt)}.`);
      }
      const clash = await this.prisma.classSession.findFirst({
        where: {
          id: { not: cls.id },
          teacherId: cls.teacherId,
          status: { in: ['SCHEDULED', 'LIVE'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });
      if (clash) throw new BadRequestException(`The teacher already has a class at ${shortDate(startsAt)}.`);

      await this.prisma.classSession.update({
        where: { id: cls.id },
        data: { startsAt, endsAt },
      });
    }

    await this.leaves.audit(leave.id, actor, 'CLASSES_RESCHEDULED',
      `${moves.length} class(es) moved out of the unavailability window`,
      { impactId: impact.id, moves: moves.length });

    await this.notifyRescheduled(impact, moves.length).catch(() => undefined);
  }

  // ══ §9.7 return to availability ═════════════════════════════════════════════

  /**
   * Approved windows that have finished: give the teacher back, resume anything
   * paused, and step the stand-ins down.
   *
   * Runs on a timer AND is safe to call by hand. Every step is idempotent
   * because a sweep that half-ran must be able to finish on the next tick.
   */
  async returnSweep(): Promise<{ returned: number }> {
    const cfg = await this.leaves.config();
    if (!cfg.autoRestoreOnReturn) return { returned: 0 };

    const now = new Date();
    const finished = await this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveRequestStatus.APPROVED,
        category: LeaveCategory.TEACHER_UNAVAILABILITY,
        returnedAt: null,
        endDate: { lt: startOfUtcDay(now) },
      },
      select: { id: true, userId: true, startDate: true, endDate: true },
      take: 100,
    });

    let returned = 0;
    for (const leave of finished) {
      await this.completeReturn(leave.id).catch((e) =>
        this.logger.warn(`Leave ${leave.id}: return failed — ${e?.message ?? e}`),
      );
      returned += 1;
    }
    if (returned) this.logger.log(`Restored ${returned} teacher(s) to availability.`);
    return { returned };
  }

  /** The §9.7 steps for one finished window. */
  async completeReturn(leaveId: string) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: {
        id: true, userId: true, startDate: true, endDate: true, returnedAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!leave || leave.returnedAt) return;

    // 1. The teacher is available again, with their weekly pattern restored.
    await this.leaves.restoreAvailability(leaveId);

    // 2. Everything the coach decided is stood back down.
    const impacts = await this.prisma.leaveImpact.findMany({
      where: { leaveId, status: 'RESOLVED' },
    });
    for (const impact of impacts) {
      if (impact.option === 'WAIT_FOR_TEACHER' && impact.pausedSubscriptionId) {
        await this.subscriptions
          .resumeBreak(impact.pausedSubscriptionId, 'TEACHER_UNAVAILABILITY')
          .catch(() => undefined);
      }
      if (impact.option === 'TEMPORARY_TEACHER' && impact.restoreOriginal && impact.temporaryTeacherId) {
        // Only classes still ahead: one already taught by the stand-in is part
        // of the record, and rewriting who taught it would be a lie.
        await this.prisma.classSession
          .updateMany({
            where: {
              teacherId: impact.temporaryTeacherId,
              status: 'SCHEDULED',
              startsAt: { gt: new Date() },
              attendees: { some: { studentId: impact.studentId } },
            },
            data: { teacherId: impact.originalTeacherId },
          })
          .catch(() => undefined);
      }
      await this.prisma.leaveImpact.update({
        where: { id: impact.id },
        data: { status: 'REVERTED' },
      });
    }

    const teacherName = `${leave.user.firstName ?? ''} ${leave.user.lastName ?? ''}`.trim() || leave.user.email;
    await this.leaves.audit(leaveId, null, 'RETURNED',
      `${teacherName} is available again; ${impacts.length} student arrangement(s) stood down`,
      { impacts: impacts.length });

    await this.notifyAvailableAgain(leave.userId, teacherName, impacts.map((i) => i.studentId))
      .catch(() => undefined);
  }

  /** Undo everything for a leave that was cancelled after approval. */
  async revertForLeave(leaveId: string, actor: Actor | null): Promise<void> {
    const impacts = await this.prisma.leaveImpact.findMany({
      where: { leaveId, status: { in: ['OPEN', 'RESOLVED'] } },
    });
    for (const impact of impacts) {
      if (impact.option === 'WAIT_FOR_TEACHER' && impact.pausedSubscriptionId) {
        await this.subscriptions
          .resumeBreak(impact.pausedSubscriptionId, 'TEACHER_UNAVAILABILITY')
          .catch(() => undefined);
      }
      if (impact.option === 'TEMPORARY_TEACHER' && impact.temporaryTeacherId) {
        await this.prisma.classSession
          .updateMany({
            where: {
              teacherId: impact.temporaryTeacherId,
              status: 'SCHEDULED',
              startsAt: { gt: new Date() },
              attendees: { some: { studentId: impact.studentId } },
            },
            data: { teacherId: impact.originalTeacherId },
          })
          .catch(() => undefined);
      }
      await this.prisma.leaveImpact.update({ where: { id: impact.id }, data: { status: 'REVERTED' } });
    }
    if (impacts.length) {
      await this.leaves.audit(leaveId, actor, 'IMPACT_REVERTED',
        `${impacts.length} student arrangement(s) undone`, { impacts: impacts.length });
    }
  }

  // ══ Reads ═══════════════════════════════════════════════════════════════════

  async list(status?: string, leaveId?: string) {
    const rows = await this.prisma.leaveImpact.findMany({
      where: {
        ...(status ? { status: status as never } : { status: 'OPEN' }),
        ...(leaveId ? { leaveId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
      include: {
        student: { select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true, email: true } } } },
        leave: {
          select: {
            id: true, startDate: true, endDate: true, totalDays: true, leaveType: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    return rows.map((r) => this.shapeRow(r));
  }

  async getOne(impactId: string) {
    const impact = await this.mustFind(impactId);
    const classes = await this.affectedClasses(impact, impact.leave);
    return {
      ...this.shapeRow(impact as never),
      classes: classes.map((c) => ({
        id: c.id, title: c.title, startsAt: c.startsAt, endsAt: c.endsAt, status: c.status,
      })),
    };
  }

  /**
   * §9.5 option 2 — teachers who could take these classes.
   *
   * Filtered by the same rules scheduling uses: not the teacher who is away,
   * not anybody else who is away in the window, and only approved availability.
   */
  async availableReplacements(impactId: string) {
    const impact = await this.mustFind(impactId);
    const leave = impact.leave;
    const from = startOfUtcDay(leave.startDate);
    const to = endOfUtcDay(leave.endDate);

    const away = await this.leaves.unavailableTeacherIds(from, to);
    const candidates = await this.prisma.teacherProfile.findMany({
      where: {
        id: { not: impact.originalTeacherId },
        user: { status: 'ACTIVE' },
        ...(impact.courseId ? { OR: [{ courseId: impact.courseId }, { courseId: null }] } : {}),
      },
      select: {
        id: true, teacherCode: true, subjects: true, availability: true, availabilityApproved: true,
        courseId: true, rating: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      take: 200,
    });

    const classes = await this.affectedClasses(impact, leave);
    const out = [];
    for (const c of candidates) {
      if (away.has(c.id)) continue;
      // A clash against any of the affected slots rules them out — offering a
      // teacher who is already teaching then would be an error at assign time.
      let clashes = 0;
      for (const cls of classes) {
        const busy = await this.prisma.classSession.findFirst({
          where: {
            teacherId: c.id,
            status: { in: ['SCHEDULED', 'LIVE'] },
            startsAt: { lt: cls.endsAt },
            endsAt: { gt: cls.startsAt },
          },
          select: { id: true },
        });
        if (busy) clashes += 1;
      }
      out.push({
        id: c.id,
        name: `${c.user.firstName ?? ''} ${c.user.lastName ?? ''}`.trim() || c.user.email,
        email: c.user.email,
        teacherCode: c.teacherCode,
        subjects: c.subjects,
        rating: c.rating,
        sameCourse: !!impact.courseId && c.courseId === impact.courseId,
        availabilityApproved: c.availabilityApproved,
        clashes,
        free: clashes === 0,
      });
    }
    // Free first, then same-course, then best rated — the order a coach picks in.
    return out.sort(
      (a, b) =>
        Number(b.free) - Number(a.free) ||
        Number(b.sameCourse) - Number(a.sameCourse) ||
        (b.rating ?? 0) - (a.rating ?? 0),
    );
  }

  /** What a student sees about their own disrupted classes. */
  async forStudentUser(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) return [];
    const rows = await this.prisma.leaveImpact.findMany({
      where: { studentId: student.id, status: { in: ['OPEN', 'RESOLVED'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        leave: {
          select: {
            id: true, startDate: true, endDate: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      option: r.option,
      status: r.status,
      affectedClassCount: r.affectedClassCount,
      courseTitle: r.courseTitle,
      temporaryTeacherName: r.temporaryTeacherName,
      cycleExtendedDays: r.cycleExtendedDays,
      // The student is told their teacher is away and what was arranged — never
      // why, which is the teacher's private business.
      teacherName: `${r.leave.user.firstName ?? ''} ${r.leave.user.lastName ?? ''}`.trim() || 'Your teacher',
      from: r.leave.startDate,
      to: r.leave.endDate,
      decidedAt: r.decidedAt,
    }));
  }

  // ══ Internals ═══════════════════════════════════════════════════════════════

  private async mustFind(impactId: string) {
    const impact = await this.prisma.leaveImpact.findUnique({
      where: { id: impactId },
      include: {
        student: { select: { id: true, studentCode: true, userId: true, user: { select: { firstName: true, lastName: true, email: true } } } },
        leave: {
          select: {
            id: true, userId: true, status: true, startDate: true, endDate: true, totalDays: true,
            leaveType: true, user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    if (!impact) throw new NotFoundException('That affected-student record does not exist.');
    return { ...impact, originalTeacherUserId: impact.leave.userId };
  }

  private async affectedClasses(
    impact: { studentId: string; originalTeacherId: string; temporaryTeacherId?: string | null },
    leave: { startDate: Date; endDate: Date },
  ) {
    return this.prisma.classSession.findMany({
      where: {
        // Either teacher: once a stand-in has taken them, the same sessions are
        // still this impact's classes.
        teacherId: impact.temporaryTeacherId
          ? { in: [impact.originalTeacherId, impact.temporaryTeacherId] }
          : impact.originalTeacherId,
        status: { in: ['SCHEDULED', 'LIVE'] },
        startsAt: { gte: startOfUtcDay(leave.startDate), lte: endOfUtcDay(leave.endDate) },
        attendees: { some: { studentId: impact.studentId } },
      },
      orderBy: { startsAt: 'asc' },
      select: { id: true, title: true, startsAt: true, endsAt: true, status: true, teacherId: true },
    });
  }

  private shapeRow(r: {
    id: string; leaveId: string; studentId: string; courseTitle: string | null;
    option: string; status: string; affectedClassCount: number;
    temporaryTeacherName: string | null; cycleExtendedDays: number | null;
    decidedByName: string | null; decidedAt: Date | null; notes: string | null; createdAt: Date;
    student?: { studentCode: string | null; user: { firstName: string | null; lastName: string | null; email: string } | null } | null;
    leave?: { startDate: Date; endDate: Date; totalDays: number; leaveType: string; user: { firstName: string | null; lastName: string | null; email: string } } | null;
  }) {
    const s = r.student?.user;
    const t = r.leave?.user;
    return {
      id: r.id,
      leaveId: r.leaveId,
      studentId: r.studentId,
      studentName: s ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email : '',
      studentCode: r.student?.studentCode ?? null,
      courseTitle: r.courseTitle,
      teacherName: t ? `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || t.email : '',
      from: r.leave?.startDate ?? null,
      to: r.leave?.endDate ?? null,
      totalDays: r.leave?.totalDays ?? null,
      leaveType: r.leave?.leaveType ?? null,
      option: r.option,
      status: r.status,
      affectedClassCount: r.affectedClassCount,
      temporaryTeacherName: r.temporaryTeacherName,
      cycleExtendedDays: r.cycleExtendedDays,
      decidedByName: r.decidedByName,
      decidedAt: r.decidedAt,
      notes: r.notes,
      createdAt: r.createdAt,
    };
  }

  private async nameOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email : 'System';
  }

  private async studentUserIds(studentIds: string[]): Promise<string[]> {
    if (!studentIds.length) return [];
    const rows = await this.prisma.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId).filter((x): x is string => !!x);
  }

  // ══ §9.8 notifications ══════════════════════════════════════════════════════

  /** Row 4 — "Teacher Unavailability Affects Classes": coach, supervisor, admin, student. Teacher ✗. */
  private async notifyClassesAffected(
    leaveId: string, teacherName: string, from: Date, to: Date, studentIds: string[],
  ) {
    await this.notifications
      .createForRoles([Role.ACADEMIC_COACH, Role.SUPERVISOR, Role.ADMIN], {
        type: 'LEAVE_CLASSES_AFFECTED',
        title: 'Classes need rearranging',
        body: `${teacherName} is away ${window(from, to)} — ${studentIds.length} student(s) need a decision.`,
        link: '/leave-impacts',
      })
      .catch(() => undefined);

    const userIds = await this.studentUserIds(studentIds);
    if (userIds.length) {
      await this.notifications
        .createForUsers(userIds, {
          type: 'LEAVE_CLASSES_AFFECTED',
          title: 'Your teacher is away',
          // No reason and no leave type — why a teacher is off is their business.
          body: `Your teacher is unavailable ${window(from, to)}. Your academic coach will be in touch about your classes.`,
          link: '/student/classes',
        })
        .catch(() => undefined);
    }
  }

  /** Row 5 — "Temporary Teacher Assigned": teacher, coach, admin, student. Supervisor ✗. */
  private async notifyTemporaryTeacher(
    impact: { studentId: string; courseTitle: string | null },
    leave: { startDate: Date; endDate: Date },
    tempUserId: string,
    tempName: string,
  ) {
    await this.notifications
      .createFor(tempUserId, {
        type: 'LEAVE_TEMP_TEACHER',
        title: 'You are covering some classes',
        body: `You have been assigned cover for ${impact.courseTitle ?? 'a course'}, ${window(leave.startDate, leave.endDate)}.`,
        link: '/teacher/classes',
      })
      .catch(() => undefined);

    await this.notifications
      .createForRoles([Role.ACADEMIC_COACH, Role.ADMIN], {
        type: 'LEAVE_TEMP_TEACHER',
        title: 'Temporary teacher assigned',
        body: `${tempName} is covering ${impact.courseTitle ?? 'classes'} for ${window(leave.startDate, leave.endDate)}.`,
        link: '/leave-impacts',
      })
      .catch(() => undefined);

    const [studentUserId] = await this.studentUserIds([impact.studentId]);
    if (studentUserId) {
      await this.notifications
        .createFor(studentUserId, {
          type: 'LEAVE_TEMP_TEACHER',
          title: 'A stand-in teacher for your classes',
          body: `${tempName} will take your classes ${window(leave.startDate, leave.endDate)}.`,
          link: '/student/classes',
        })
        .catch(() => undefined);
    }
  }

  private async notifyRescheduled(impact: { studentId: string }, count: number) {
    const [studentUserId] = await this.studentUserIds([impact.studentId]);
    if (!studentUserId) return;
    await this.notifications
      .createFor(studentUserId, {
        type: 'LEAVE_CLASSES_AFFECTED',
        title: 'Your classes have been moved',
        body: `${count} class(es) have been rescheduled while your teacher is away. Check your timetable.`,
        link: '/student/classes',
      })
      .catch(() => undefined);
  }

  /** Row 6 — "Teacher Available Again": teacher, coach, admin, student. Supervisor ✗. */
  private async notifyAvailableAgain(teacherUserId: string, teacherName: string, studentIds: string[]) {
    await this.notifications
      .createFor(teacherUserId, {
        type: 'LEAVE_TEACHER_RETURNED',
        title: 'Welcome back',
        body: 'Your availability has been restored and your classes have resumed.',
        link: '/teacher/availability',
      })
      .catch(() => undefined);

    await this.notifications
      .createForRoles([Role.ACADEMIC_COACH, Role.ADMIN], {
        type: 'LEAVE_TEACHER_RETURNED',
        title: 'Teacher available again',
        body: `${teacherName} is back; ${studentIds.length} student arrangement(s) have been stood down.`,
        link: '/leave-impacts',
      })
      .catch(() => undefined);

    const userIds = await this.studentUserIds(studentIds);
    if (userIds.length) {
      await this.notifications
        .createForUsers(userIds, {
          type: 'LEAVE_TEACHER_RETURNED',
          title: 'Your teacher is back',
          body: 'Your regular teacher is available again and your normal schedule has resumed.',
          link: '/student/classes',
        })
        .catch(() => undefined);
    }
  }
}
