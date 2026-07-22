import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CURRENCY, priceFor, type Currency } from '../common/currency';
import { NotificationsService } from '../notifications/notifications.service';
import { cycleMonths, addMonths } from '../finance/finance.config';
import {
  Role,
  EnrollmentStatus,
  SubscriptionRequestStatus,
  SubscriptionRequestType,
} from '../generated/prisma/enums';
import {
  ListSubscriptionRequestsDto,
  RequestPackageChangeDto,
  RequestScheduleChangeDto,
  ReviewSubscriptionRequestDto,
} from './dto';

type Actor = { id: string; name?: string; role?: string } | undefined;

/*
 * A student changes their package or their schedule by asking, never by
 * editing. A coach decides, and an approved change is written to the *next*
 * cycle — the current one keeps running on what the family is already paying
 * for and already turning up to.
 *
 * There is no `Subscription` table. What a student calls their subscription is
 * three unrelated rows, and this service is the one place that assembles them:
 *
 *   package   Enrollment.packageId → Package
 *   schedule  Batch.daysOfWeek + startTime, via BatchStudent
 *   cycle     StudentFeeAssignment.nextRunAt + FeePlan.cycle
 *
 * Keeping that assembly here rather than spreading it across screens is what
 * stops the student panel and the coach panel disagreeing about what somebody
 * is on.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /*
   * Rule 2: how close to the cycle boundary a request is still accepted. A
   * change approved an hour before the roll would be applied by a sweep that
   * may already have run, so the student would be billed for the new package
   * without the schedule to match.
   */
  private static readonly CUTOFF_HOURS = 48;

  // ── Reading the subscription ───────────────────────────────────────────────

  private async studentByUserId(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true, studentCode: true, userId: true },
    });
    if (!student) throw new NotFoundException('Student profile not found.');
    return student;
  }

  /*
   * There is no paused flag on a fee assignment, so "paused" is derived:
   * autoGenerate off means the recurring invoice has been deliberately stopped
   * while the assignment is still live. Anything not active at all has ended.
   * Documented rather than invented so the student panel and Rule 1 agree.
   */
  private statusOf(assignment: { active: boolean; autoGenerate: boolean } | null) {
    if (!assignment) return 'NONE' as const;
    if (!assignment.active) return 'ENDED' as const;
    if (!assignment.autoGenerate) return 'PAUSED' as const;
    return 'ACTIVE' as const;
  }

  /** Module 1 — everything the read-only panel shows, from live rows. */
  async currentForUser(userId: string) {
    const student = await this.studentByUserId(userId);
    return this.currentFor(student.id);
  }

  async currentFor(studentId: string) {
    const [profile, enrolment, batchLinks, assignment, queued] = await Promise.all([
      /*
       * The currency this family is billed in. Every amount below is read in
       * it, and a package the academy has not priced in that currency reports
       * null rather than the dollar figure — a number carrying the wrong
       * currency symbol is worse than no number.
       */
      this.prisma.studentProfile.findUnique({
        where: { id: studentId },
        select: { billingCurrency: true },
      }),
      this.prisma.enrollment.findFirst({
        where: { studentId, status: EnrollmentStatus.ACTIVE },
        orderBy: { startedAt: 'desc' },
        include: { package: true, course: { select: { id: true, title: true } } },
      }),
      this.prisma.batchStudent.findMany({
        where: { studentId },
        include: {
          batch: {
            select: {
              id: true,
              name: true,
              daysOfWeek: true,
              startTime: true,
              endTime: true,
              timeZone: true,
              teacherId: true,
            },
          },
        },
      }),
      this.prisma.studentFeeAssignment.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        // No currency on the plan any more — the family's own is what every
        // amount in this payload is in, and it is reported at the top level.
        include: { plan: { select: { id: true, name: true, cycle: true } } },
      }),
      this.prisma.subscriptionNextCycle.findUnique({
        where: { studentId },
        include: {
          nextPackage: {
            select: { id: true, name: true, classesPerMonth: true, priceUSD: true, priceAED: true, priceGBP: true },
          },
        },
      }),
    ]);

    const currency = (profile?.billingCurrency ?? DEFAULT_CURRENCY) as Currency;

    // The cycle runs from one invoice date to the next; nextRunAt is the next
    // one, so the current cycle started a whole cycle before it.
    const months = assignment?.plan ? cycleMonths(assignment.plan.cycle) : 0;
    const cycleEnd = assignment?.nextRunAt ?? null;
    const cycleStart =
      cycleEnd && months > 0 ? addMonths(cycleEnd, -months) : (assignment?.startDate ?? null);

    const batches = batchLinks
      .map((b) => b.batch)
      .filter((b) => b.daysOfWeek.length || b.startTime);

    return {
      // What every amount in this payload is denominated in — the family's own,
      // and now the only currency in the system's answer for them.
      currency,
      package: enrolment?.package
        ? {
            id: enrolment.package.id,
            name: enrolment.package.name,
            classesPerMonth: enrolment.package.classesPerMonth,
            price: priceFor(enrolment.package, currency),
          }
        : null,
      course: enrolment?.course ?? null,
      // Every batch the student sits in, not just the first: a student on two
      // timetables who was shown one would think the other had been dropped.
      schedule: batches.map((b) => ({
        batchId: b.id,
        batchName: b.name,
        days: b.daysOfWeek,
        startTime: b.startTime,
        endTime: b.endTime,
        timeZone: b.timeZone,
      })),
      cycle: {
        start: cycleStart,
        end: cycleEnd,
        planName: assignment?.plan?.name ?? null,
        cycle: assignment?.plan?.cycle ?? null,
      },
      status: this.statusOf(assignment),
      // What is already queued for next cycle, so the panel can say "changing
      // on 29 Dec" instead of looking like nothing happened.
      nextCycle: queued
        ? {
            package: queued.nextPackage
              ? {
                  id: queued.nextPackage.id,
                  name: queued.nextPackage.name,
                  classesPerMonth: queued.nextPackage.classesPerMonth,
                  price: priceFor(queued.nextPackage, currency),
                }
              : null,
            days: queued.nextDays,
            time: queued.nextTime,
            startDate: queued.nextStartDate,
            batchId: queued.nextBatchId,
          }
        : null,
    };
  }

  /** Packages a student can move to — the catalogue, minus the one they are on. */
  async packageOptions(userId: string) {
    const current = await this.currentForUser(userId);
    const packages = await this.prisma.package.findMany({
      where: { active: true },
      orderBy: { priceUSD: 'asc' },
      select: {
        id: true, name: true, classesPerMonth: true,
        priceUSD: true, priceAED: true, priceGBP: true,
      },
    });
    /*
     * A package the academy has not priced in this family's currency is not
     * offered at all. Showing it with a dollar figure would have them request
     * a change at a price that is not theirs, and the coach would approve a
     * number nobody agreed to.
     */
    return packages
      .filter((p) => p.id !== current.package?.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        classesPerMonth: p.classesPerMonth,
        price: priceFor(p, current.currency),
      }))
      .filter((p) => p.price != null);
  }

  // ── Raising a request (Modules 3 and 5, with the Module 10 rules) ──────────

  private async assertCanRequest(studentId: string, type: SubscriptionRequestType) {
    const assignment = await this.prisma.studentFeeAssignment.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: { active: true, autoGenerate: true, nextRunAt: true },
    });

    const status = this.statusOf(assignment);
    if (status === 'PAUSED') {
      throw new BadRequestException(
        'Your subscription is paused, so changes cannot be requested right now.',
      );
    }
    if (status !== 'ACTIVE') {
      throw new BadRequestException(
        'You do not have an active subscription to change.',
      );
    }

    // Rule 2 — too close to the boundary to land safely.
    if (assignment?.nextRunAt) {
      const hoursLeft =
        (assignment.nextRunAt.getTime() - Date.now()) / 3_600_000;
      if (hoursLeft < SubscriptionsService.CUTOFF_HOURS) {
        throw new BadRequestException(
          `Your cycle renews in under ${SubscriptionsService.CUTOFF_HOURS} hours. Please request this once the new cycle has started.`,
        );
      }
    }

    // Rule 3 — one open request of each kind.
    const open = await this.prisma.subscriptionRequest.findFirst({
      where: { studentId, type, status: SubscriptionRequestStatus.PENDING },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException(
        type === SubscriptionRequestType.PACKAGE_CHANGE
          ? 'You already have a package change waiting for approval.'
          : 'You already have a schedule change waiting for approval.',
      );
    }
  }

  /*
   * Rule 4 — every request and decision is appended to the student's activity
   * log, the same immutable table the timeline and audit tabs read.
   */
  private async audit(
    studentId: string,
    type: string,
    title: string,
    description: string,
    actor: Actor,
    meta?: unknown,
  ) {
    return this.prisma.studentActivity.create({
      data: {
        studentId,
        kind: 'AUDIT',
        type,
        title,
        description,
        meta: meta as never,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
      },
    });
  }

  private async notifyStaff(studentId: string, title: string, body: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { coachId: true },
    });

    // The owning coach if there is one, and admins either way — a request that
    // only reached an unassigned coach would sit forever.
    if (student?.coachId) {
      this.notifications
        .createFor(student.coachId, {
          type: 'SUBSCRIPTION_REQUEST',
          title,
          body,
          link: '/subscription-requests',
        })
        .catch(() => undefined);
    }
    this.notifications
      .createForRoles([Role.ADMIN], {
        type: 'SUBSCRIPTION_REQUEST',
        title,
        body,
        link: '/subscription-requests',
      })
      .catch(() => undefined);
  }

  async requestPackageChange(userId: string, dto: RequestPackageChangeDto, actor: Actor) {
    const student = await this.studentByUserId(userId);
    await this.assertCanRequest(student.id, SubscriptionRequestType.PACKAGE_CHANGE);

    const wanted = await this.prisma.package.findFirst({
      where: { id: dto.packageId, active: true },
      select: { id: true, name: true, classesPerMonth: true, priceUSD: true, priceAED: true, priceGBP: true },
    });
    if (!wanted) throw new BadRequestException('Choose one of the packages listed.');

    const current = await this.currentFor(student.id);
    if (current.package?.id === wanted.id) {
      throw new BadRequestException('You are already on that package.');
    }

    const request = await this.prisma.subscriptionRequest.create({
      data: {
        studentId: student.id,
        type: SubscriptionRequestType.PACKAGE_CHANGE,
        requestedPackageId: wanted.id,
        reason: dto.reason?.trim() || null,
        fromLabel: current.package
          ? `${current.package.name} · ${current.package.classesPerMonth} classes/month`
          : 'No package on record',
        toLabel: `${wanted.name} · ${wanted.classesPerMonth} classes/month`,
      },
    });

    await this.audit(
      student.id,
      'SUBSCRIPTION_PACKAGE_REQUESTED',
      'Package change requested',
      `${request.fromLabel} → ${request.toLabel}`,
      actor,
      { requestId: request.id },
    );

    this.notifications
      .createFor(userId, {
        type: 'SUBSCRIPTION_REQUEST_SUBMITTED',
        title: 'Your request has been submitted',
        body: 'A coach will review your package change. It would apply from your next billing cycle.',
        link: '/student/subscription',
      })
      .catch(() => undefined);
    await this.notifyStaff(
      student.id,
      'New student request pending',
      `Package change: ${request.fromLabel} → ${request.toLabel}`,
    );

    return request;
  }

  async requestScheduleChange(userId: string, dto: RequestScheduleChangeDto, actor: Actor) {
    const student = await this.studentByUserId(userId);
    await this.assertCanRequest(student.id, SubscriptionRequestType.SCHEDULE_CHANGE);

    if (!dto.days.length) {
      throw new BadRequestException('Choose at least one day.');
    }

    const current = await this.currentFor(student.id);
    if (!current.schedule.length) {
      throw new BadRequestException(
        'You do not have a class schedule yet, so there is nothing to change.',
      );
    }

    // With one timetable the batch is obvious; with several the student has to
    // say which, or a coach would be guessing which classes they meant.
    let batch = current.schedule[0];
    if (dto.batchId) {
      const picked = current.schedule.find((s) => s.batchId === dto.batchId);
      if (!picked) throw new BadRequestException('That is not one of your batches.');
      batch = picked;
    } else if (current.schedule.length > 1) {
      throw new BadRequestException(
        'You are on more than one timetable — choose which one to change.',
      );
    }

    const request = await this.prisma.subscriptionRequest.create({
      data: {
        studentId: student.id,
        type: SubscriptionRequestType.SCHEDULE_CHANGE,
        requestedDays: dto.days,
        requestedTime: dto.time,
        requestedStartDate: dto.startDate ? new Date(dto.startDate) : null,
        batchId: batch.batchId,
        reason: dto.reason?.trim() || null,
        fromLabel: `${batch.days.join(', ') || 'No days'} · ${batch.startTime ?? 'no time'}`,
        toLabel: `${dto.days.join(', ')} · ${dto.time}`,
      },
    });

    await this.audit(
      student.id,
      'SUBSCRIPTION_SCHEDULE_REQUESTED',
      'Schedule change requested',
      `${request.fromLabel} → ${request.toLabel}`,
      actor,
      { requestId: request.id, batchId: batch.batchId },
    );

    this.notifications
      .createFor(userId, {
        type: 'SUBSCRIPTION_REQUEST_SUBMITTED',
        title: 'Your request has been submitted',
        body: 'A coach will review your schedule change. It would apply from your next billing cycle.',
        link: '/student/subscription',
      })
      .catch(() => undefined);
    await this.notifyStaff(
      student.id,
      'New student request pending',
      `Schedule change: ${request.fromLabel} → ${request.toLabel}`,
    );

    return request;
  }

  /** Module 8 — the student's own list. */
  async myRequests(userId: string) {
    const student = await this.studentByUserId(userId);
    const rows = await this.prisma.subscriptionRequest.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // The reviewer's name is staff-internal; the student sees what changed and
    // where it got to, not who signed it off.
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      fromLabel: r.fromLabel,
      toLabel: r.toLabel,
      reason: r.reason,
      reviewNotes: r.reviewNotes,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      appliedAt: r.appliedAt,
    }));
  }

  // ── Staff: review and decide (Modules 4 and 6) ─────────────────────────────

  /*
   * A coach sees the students they own; an admin or supervisor sees everyone.
   * Same rule the rest of the coach console uses — coaches are scoped, not
   * trusted to filter for themselves.
   */
  private async scopeFor(actor: Actor) {
    if (actor?.role !== Role.ACADEMIC_COACH) return {};
    const mine = await this.prisma.studentProfile.findMany({
      where: { coachId: actor.id },
      select: { id: true },
    });
    return { studentId: { in: mine.map((s) => s.id) } };
  }

  async list(dto: ListSubscriptionRequestsDto, actor: Actor) {
    const { page = 1, limit = 20, status, type, search } = dto;
    const where: any = {
      ...(await this.scopeFor(actor)),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(search
        ? {
            student: {
              OR: [
                { studentCode: { contains: search, mode: 'insensitive' } },
                { user: { firstName: { contains: search, mode: 'insensitive' } } },
                { user: { lastName: { contains: search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscriptionRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: {
            select: {
              id: true,
              studentCode: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          requestedPackage: {
            select: { id: true, name: true, priceUSD: true, priceAED: true, priceGBP: true, classesPerMonth: true },
          },
        },
      }),
      this.prisma.subscriptionRequest.count({ where }),
    ]);

    return {
      items: items.map((r) => this.staffShape(r)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  private staffShape(r: any) {
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      reason: r.reason,
      fromLabel: r.fromLabel,
      toLabel: r.toLabel,
      reviewNotes: r.reviewNotes,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      decidedByName: r.decidedByName,
      appliedAt: r.appliedAt,
      student: r.student
        ? {
            id: r.student.id,
            code: r.student.studentCode,
            name: `${r.student.user.firstName} ${r.student.user.lastName}`.trim(),
            email: r.student.user.email,
          }
        : null,
      requestedPackage: r.requestedPackage
        ? { ...r.requestedPackage, price: Number(r.requestedPackage.price) }
        : null,
      requestedDays: r.requestedDays,
      requestedTime: r.requestedTime,
      requestedStartDate: r.requestedStartDate,
      batchId: r.batchId,
      targetBatchId: r.targetBatchId,
    };
  }

  /*
   * Everything the coach needs on one screen to answer "should this happen?" —
   * the money difference, the hours difference, whether the teacher is free,
   * and whether granting it would drag other students along. Computed here so
   * the screen cannot quietly answer a different question by assembling it
   * differently.
   */
  async detail(id: string, actor: Actor) {
    const request = await this.prisma.subscriptionRequest.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        requestedPackage: {
          select: {
            id: true, name: true, classesPerMonth: true, feePlanId: true,
            priceUSD: true, priceAED: true, priceGBP: true,
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Request not found.');

    const scope = await this.scopeFor(actor);
    if ((scope as any).studentId && !(scope as any).studentId.in.includes(request.studentId)) {
      throw new ForbiddenException('This request belongs to another coach.');
    }

    const current = await this.currentFor(request.studentId);

    let comparison: any = null;
    if (request.type === SubscriptionRequestType.PACKAGE_CHANGE && request.requestedPackage) {
      const oldPrice = current.package?.price ?? null;
      const oldHours = current.package?.classesPerMonth ?? 0;
      /*
       * Both sides in the family's own currency. A package the academy has not
       * priced there reports null, and the difference stays null too rather
       * than being computed against a dollar figure — a coach approving
       * "+£12" that is really "+$12" is exactly the mistake to avoid.
       */
      const newPrice = priceFor(request.requestedPackage, current.currency);
      comparison = {
        currency: current.currency,
        priceFrom: oldPrice,
        priceTo: newPrice,
        priceDifference:
          oldPrice != null && newPrice != null ? newPrice - oldPrice : null,
        classesFrom: oldHours,
        classesTo: request.requestedPackage.classesPerMonth,
        classesDifference: request.requestedPackage.classesPerMonth - oldHours,
        /*
         * A package with no fee plan behind it cannot move the billing. Said
         * out loud rather than silently approving a change that would give the
         * student more classes at the old price.
         */
        billingLinked: !!request.requestedPackage.feePlanId,
      };
    }

    let schedule: any = null;
    if (request.type === SubscriptionRequestType.SCHEDULE_CHANGE && request.batchId) {
      schedule = await this.scheduleContext(request);
    }

    return { ...this.staffShape(request), current, comparison, schedule };
  }

  /** Who else is in the batch, and is the teacher actually free then. */
  private async scheduleContext(request: {
    batchId: string | null;
    studentId: string;
    requestedDays: string[];
    requestedTime: string | null;
  }) {
    if (!request.batchId) return null;

    const batch = await this.prisma.batch.findUnique({
      where: { id: request.batchId },
      select: {
        id: true,
        name: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        teacherId: true,
        courseId: true,
        students: { select: { studentId: true } },
      },
    });
    if (!batch) return null;

    const others = batch.students.filter((s) => s.studentId !== request.studentId).length;

    let teacher: any = null;
    if (batch.teacherId) {
      const tp = await this.prisma.teacherProfile.findUnique({
        where: { id: batch.teacherId },
        select: {
          id: true,
          availability: true,
          availabilityApproved: true,
          user: { select: { firstName: true, lastName: true } },
        },
      });
      if (tp) {
        const windows = (tp.availability ?? {}) as Record<string, { from?: string; to?: string }[]>;
        const wanted = request.requestedTime;
        teacher = {
          id: tp.id,
          name: `${tp.user.firstName} ${tp.user.lastName}`.trim(),
          availabilityApproved: tp.availabilityApproved,
          perDay: request.requestedDays.map((day) => ({
            day,
            free: this.withinWindow(windows[day], wanted),
          })),
        };
      }
    }

    /*
     * Batches the same teacher already runs on any of the requested days at
     * that time. Only a warning: a coach may know one of them is ending.
     */
    let teacherClashes: { batchId: string; name: string; days: string[]; startTime: string | null }[] = [];
    if (batch.teacherId && request.requestedTime) {
      const sameTime = await this.prisma.batch.findMany({
        where: {
          teacherId: batch.teacherId,
          id: { not: batch.id },
          startTime: request.requestedTime,
        },
        select: { id: true, name: true, daysOfWeek: true, startTime: true },
      });
      teacherClashes = sameTime
        .filter((b) => b.daysOfWeek.some((d) => request.requestedDays.includes(d)))
        .map((b) => ({ batchId: b.id, name: b.name, days: b.daysOfWeek, startTime: b.startTime }));
    }

    // Batches this student could be moved into instead, when the current one
    // is shared. Offered rather than left to the coach to go and find.
    const alternatives = others
      ? await this.prisma.batch.findMany({
          where: { id: { not: batch.id }, courseId: batch.courseId },
          select: { id: true, name: true, daysOfWeek: true, startTime: true, teacherId: true },
          take: 25,
        })
      : [];

    return {
      batch: {
        id: batch.id,
        name: batch.name,
        days: batch.daysOfWeek,
        startTime: batch.startTime,
        endTime: batch.endTime,
      },
      otherStudentsInBatch: others,
      // With nobody else in it the batch can simply be retimed; shared, the
      // student has to move instead or everyone else moves with them.
      canRetimeInPlace: others === 0,
      teacher,
      teacherClashes,
      alternatives,
    };
  }

  private withinWindow(
    windows: { from?: string; to?: string }[] | undefined,
    time: string | null,
  ): boolean {
    if (!windows?.length || !time) return false;
    const mins = (v?: string) => {
      if (!v || !/^\d{1,2}:\d{2}$/.test(v)) return null;
      const [h, m] = v.split(':').map(Number);
      return h * 60 + m;
    };
    const at = mins(time);
    if (at === null) return false;
    return windows.some((w) => {
      const from = mins(w.from);
      const to = mins(w.to);
      return from !== null && to !== null && at >= from && at < to;
    });
  }

  /*
   * Approving does NOT change the subscription. It writes what the
   * subscription becomes when the cycle turns, and the rollover applies it.
   * That separation is the whole point of the feature: a family keeps the
   * classes and the price they have already paid for until the cycle ends.
   */
  async review(id: string, dto: ReviewSubscriptionRequestDto, actor: Actor) {
    const request = await this.prisma.subscriptionRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found.');

    const scope = await this.scopeFor(actor);
    if ((scope as any).studentId && !(scope as any).studentId.in.includes(request.studentId)) {
      throw new ForbiddenException('This request belongs to another coach.');
    }
    if (request.status !== SubscriptionRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been decided.');
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: request.studentId },
      select: { userId: true },
    });

    if (!dto.approve) {
      const rejected = await this.prisma.subscriptionRequest.update({
        where: { id },
        data: {
          status: SubscriptionRequestStatus.REJECTED,
          reviewNotes: dto.notes?.trim() || null,
          decidedAt: new Date(),
          decidedById: actor?.id ?? null,
          decidedByName: actor?.name ?? null,
        },
      });
      await this.audit(
        request.studentId,
        'SUBSCRIPTION_REQUEST_REJECTED',
        'Subscription request rejected',
        `${request.fromLabel} → ${request.toLabel}`,
        actor,
        { requestId: id },
      );
      if (student) {
        this.notifications
          .createFor(student.userId, {
            type: 'SUBSCRIPTION_DECIDED',
            title: 'Your request was not approved',
            body: dto.notes?.trim() || 'Please speak to your academic coach for details.',
            link: '/student/subscription',
          })
          .catch(() => undefined);
      }
      return rejected;
    }

    // ── Approve: write the next cycle ───────────────────────────────────────
    const next: any = {};
    let targetBatchId: string | null = null;

    if (request.type === SubscriptionRequestType.PACKAGE_CHANGE) {
      if (!request.requestedPackageId) {
        throw new BadRequestException('This request has no package on it.');
      }
      next.nextPackageId = request.requestedPackageId;
    } else {
      const ctx = await this.scheduleContext(request);
      if (!ctx) throw new BadRequestException('The batch on this request no longer exists.');

      if (ctx.canRetimeInPlace) {
        // Nobody else in the batch — its days and times can simply move.
        targetBatchId = ctx.batch.id;
      } else {
        /*
         * Shared batch. Retiming it would move every other student in it, so a
         * target batch is required rather than assumed.
         */
        if (!dto.targetBatchId) {
          throw new BadRequestException(
            `${ctx.otherStudentsInBatch} other student(s) share this batch, so its time cannot be changed. Choose a batch to move this student into.`,
          );
        }
        const target = await this.prisma.batch.findUnique({
          where: { id: dto.targetBatchId },
          select: { id: true },
        });
        if (!target) throw new BadRequestException('That batch does not exist.');
        targetBatchId = target.id;
      }

      next.nextDays = request.requestedDays;
      next.nextTime = request.requestedTime;
      next.nextStartDate = request.requestedStartDate;
      next.nextBatchId = targetBatchId;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.subscriptionRequest.update({
        where: { id },
        data: {
          status: SubscriptionRequestStatus.APPROVED,
          reviewNotes: dto.notes?.trim() || null,
          targetBatchId,
          decidedAt: new Date(),
          decidedById: actor?.id ?? null,
          decidedByName: actor?.name ?? null,
        },
      }),
      this.prisma.subscriptionNextCycle.upsert({
        where: { studentId: request.studentId },
        create: { studentId: request.studentId, ...next },
        update: next,
      }),
    ]);

    await this.audit(
      request.studentId,
      'SUBSCRIPTION_REQUEST_APPROVED',
      'Subscription request approved',
      `${request.fromLabel} → ${request.toLabel} (applies next cycle)`,
      actor,
      { requestId: id, targetBatchId },
    );

    if (student) {
      this.notifications
        .createFor(student.userId, {
          type: 'SUBSCRIPTION_DECIDED',
          title: 'Your request has been approved',
          body: 'It will apply from your next billing cycle.',
          link: '/student/subscription',
        })
        .catch(() => undefined);
    }

    return updated;
  }

  // ── Module 7: the cycle turns and everything lands together ────────────────

  /*
   * Applies whatever was queued for this student, then clears the queue.
   *
   * Called from the billing sweep *before* the new invoice is raised, so a
   * package change is reflected in the invoice it is meant to take effect
   * with — do it the other way round and the family is billed once more for
   * the package they asked to leave.
   *
   * Returns what it did so the sweep can log it; silently does nothing when
   * there is nothing queued, which is the case for almost every student.
   */
  async applyNextCycleFor(studentId: string) {
    /*
     * Claim the queued row by deleting it, and use the returned copy as the
     * work order. Reading it first and deleting at the end let two callers —
     * the billing sweep and an admin pressing apply-now — both see the same
     * queue and both apply it: the classes were generated twice on the same
     * day and the billing plan moved twice. Delete is atomic, so exactly one
     * caller gets the row and the other sees P2025 and stops.
     *
     * The trade-off is deliberate: if applying fails after the claim the queue
     * is gone and the change has to be re-approved. That is recoverable and
     * visible; double-booking a teacher and double-moving a fee plan is not.
     */
    const claimed = await this.prisma.$queryRaw<
      {
        nextPackageId: string | null;
        nextDays: string[];
        nextTime: string | null;
        nextBatchId: string | null;
      }[]
    >`
      DELETE FROM "SubscriptionNextCycle"
      WHERE "studentId" = ${studentId}
      RETURNING "nextPackageId", "nextDays", "nextTime", "nextBatchId"
    `;
    // Nothing queued, or another caller claimed it in the same instant.
    if (!claimed.length) return null;
    const queued = claimed[0];

    const nextPackage = queued.nextPackageId
      ? await this.prisma.package.findUnique({
          where: { id: queued.nextPackageId },
          select: { id: true, name: true, feePlanId: true },
        })
      : null;

    const applied: string[] = [];

    // ── Package, and the billing behind it ────────────────────────────────
    if (queued.nextPackageId) {
      const enrolment = await this.prisma.enrollment.findFirst({
        where: { studentId, status: EnrollmentStatus.ACTIVE },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      if (enrolment) {
        await this.prisma.enrollment.update({
          where: { id: enrolment.id },
          data: { packageId: queued.nextPackageId },
        });
        applied.push(`package → ${nextPackage?.name ?? queued.nextPackageId}`);
      }

      /*
       * Move the money too. A package that names no fee plan cannot, and that
       * is recorded rather than hidden: the student would otherwise be taught
       * the new package and billed the old one indefinitely.
       */
      if (nextPackage?.feePlanId) {
        const assignment = await this.prisma.studentFeeAssignment.findFirst({
          where: { studentId, active: true },
          orderBy: { createdAt: 'desc' },
          select: { id: true, planId: true },
        });
        if (assignment && assignment.planId !== nextPackage.feePlanId) {
          await this.prisma.studentFeeAssignment.update({
            where: { id: assignment.id },
            data: { planId: nextPackage.feePlanId },
          });
          applied.push('billing plan moved with it');
        }
      } else {
        applied.push('billing unchanged — the new package has no fee plan');
      }
    }

    // ── Schedule ──────────────────────────────────────────────────────────
    let scheduleBatchId: string | null = null;
    if (queued.nextBatchId) {
      const current = await this.prisma.batchStudent.findFirst({
        where: { studentId },
        select: { batchId: true },
      });

      if (current && current.batchId !== queued.nextBatchId) {
        // Moving into somebody else's timetable: leave the old batch, join the
        // new one. The new batch's own days and times are the schedule now —
        // rewriting them here would move that batch's other students.
        await this.prisma.batchStudent.deleteMany({
          where: { studentId, batchId: current.batchId },
        });
        await this.prisma.batchStudent.upsert({
          where: {
            batchId_studentId: { batchId: queued.nextBatchId, studentId },
          },
          create: { batchId: queued.nextBatchId, studentId },
          update: {},
        });
        applied.push('moved to another batch');
      } else if (queued.nextDays.length || queued.nextTime) {
        // Their own batch — retime it in place.
        await this.prisma.batch.update({
          where: { id: queued.nextBatchId },
          data: {
            ...(queued.nextDays.length ? { daysOfWeek: queued.nextDays } : {}),
            ...(queued.nextTime ? { startTime: queued.nextTime } : {}),
          },
        });
        applied.push(`schedule → ${queued.nextDays.join(', ')} ${queued.nextTime ?? ''}`.trim());
      }
      scheduleBatchId = queued.nextBatchId;
    }

    /*
     * ── The classes themselves ────────────────────────────────────────────
     *
     * Moving the timetable is not the change a family notices — the sessions
     * are. Nothing else in this codebase creates them on a schedule:
     * generateClasses() is an on-demand admin action, so without this the
     * student's new days and times would exist on the batch while their
     * calendar still showed the old ones.
     *
     * Generated for the cycle that is starting. Days that already have a
     * session for this batch are skipped, so a second sweep — or two students
     * in the same batch both rolling over — cannot double-book anybody.
     */
    if (scheduleBatchId) {
      const generated = await this.generateCycleClasses(studentId, scheduleBatchId).catch(
        (e) => {
          // The schedule change itself has already been applied and must
          // stand; a failure to mint sessions is reported, not rolled back.
          applied.push(`classes not generated (${e?.message ?? e})`);
          return 0;
        },
      );
      if (generated) applied.push(`${generated} class(es) scheduled`);
    }

    // ── The requests that asked for all this ──────────────────────────────
    await this.prisma.subscriptionRequest.updateMany({
      where: { studentId, status: SubscriptionRequestStatus.APPROVED },
      data: { status: SubscriptionRequestStatus.APPLIED, appliedAt: new Date() },
    });

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true },
    });
    if (student) {
      this.notifications
        .createFor(student.userId, {
          type: 'SUBSCRIPTION_APPLIED',
          title: 'Your new cycle has started',
          body: applied.join('; ') || 'Your subscription has been updated.',
          link: '/student/subscription',
        })
        .catch(() => undefined);
    }

    await this.audit(
      studentId,
      'SUBSCRIPTION_APPLIED',
      'Subscription change applied',
      applied.join('; ') || 'Nothing to apply.',
      undefined,
      { batchId: scheduleBatchId },
    );

    return { studentId, applied, batchId: scheduleBatchId };
  }

  /*
   * Sessions for the cycle that is starting, from the batch's weekly pattern.
   *
   * The window is this student's own cycle — nextRunAt is the boundary the
   * rollover fires on, so it is the new cycle's start, and the plan says how
   * long it runs. Falls back to a month when there is no plan to read, rather
   * than generating nothing and leaving an empty calendar.
   *
   * Not attendance.generateClasses(): that one creates a session for every
   * matching day with no check for what is already there, which is right for a
   * one-off admin action and wrong here — a re-run of the sweep, or two
   * students in the same batch rolling over together, would double-book the
   * teacher. Skipping start times that already exist is the difference, and it
   * is why this does not just call the other one.
   */
  private async generateCycleClasses(studentId: string, batchId: string): Promise<number> {
    const assignment = await this.prisma.studentFeeAssignment.findFirst({
      where: { studentId, active: true },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { cycle: true } } },
    });

    const from = assignment?.nextRunAt ?? new Date();
    const months = assignment?.plan ? cycleMonths(assignment.plan.cycle) : 0;
    const to = addMonths(from, months > 0 ? months : 1);

    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        name: true,
        courseId: true,
        teacherId: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        students: { select: { studentId: true } },
      },
    });
    // Not an error: a batch with no weekly pattern or no teacher simply has
    // nothing to generate, and saying so beats throwing on a normal state.
    if (!batch?.daysOfWeek?.length || !batch.startTime || !batch.endTime || !batch.teacherId) {
      return 0;
    }

    /*
     * Compare on the stored wall clock, formatted by Postgres.
     *
     * startsAt is `timestamp without time zone`, so a JS Date round-trip picks
     * up the server's offset somewhere between the driver and the client and
     * the two sides stop matching — dedupe silently missed every existing
     * session and a re-run doubled the whole cycle. Asking the database to
     * render the value takes the timezone out of the comparison entirely.
     */
    const existing = await this.prisma.$queryRaw<{ slot: string }[]>`
      SELECT to_char("startsAt", 'YYYY-MM-DD HH24:MI') AS slot
      FROM "ClassSession"
      WHERE "batchId" = ${batchId}
        AND "startsAt" >= ${from}
        AND "startsAt" < ${to}
    `;
    const taken = new Set(existing.map((e) => e.slot));
    const slotOf = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(
        d.getUTCMinutes(),
      ).padStart(2, '0')}`;

    /*
     * UTC, not server-local. Everything else this feature touches treats a
     * batch's "18:00" as UTC — teacher availability windows, the free-slot
     * maths, the trial booking. attendance.generateClasses() uses setHours()
     * instead, so the same string means server-local there; on an IST box a
     * class approved for 18:00 was created at 12:30 UTC and shown back as
     * 12:30. Matching the rest of the feature is what makes the approved time
     * and the generated class the same time.
     */
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const [sh, sm] = batch.startTime.split(':').map(Number);
    const [eh, em] = batch.endTime.split(':').map(Number);

    let made = 0;
    for (const d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!batch.daysOfWeek.includes(DAYS[d.getUTCDay()])) continue;

      const startsAt = new Date(d);
      startsAt.setUTCHours(sh, sm, 0, 0);
      if (taken.has(slotOf(startsAt))) continue;
      const endsAt = new Date(d);
      endsAt.setUTCHours(eh, em, 0, 0);

      const session = await this.prisma.classSession.create({
        data: {
          courseId: batch.courseId,
          teacherId: batch.teacherId,
          batchId: batch.id,
          title: `${batch.name} — Class`,
          startsAt,
          endsAt,
          status: 'SCHEDULED',
        },
      });
      if (batch.students.length) {
        await this.prisma.classAttendee.createMany({
          data: batch.students.map((s) => ({ classId: session.id, studentId: s.studentId })),
          skipDuplicates: true,
        });
      }
      made += 1;
    }
    return made;
  }
}
