import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CURRENCY, priceFor, type Currency } from '../common/currency';
import {
  monthlyHours as calcMonthlyHours,
  monthlyClasses as calcMonthlyClasses,
  monthlyTuition,
  hourlyRateFor,
} from '../common/tuition';
import { NotificationsService } from '../notifications/notifications.service';
import { cycleMonths, addMonths, addDays, subscriptionCycleEnd } from '../finance/finance.config';
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

  /*
   * The one stored subscription row, if this student has one. New enrolments
   * write it; legacy students do not have one until the backfill runs, which is
   * why currentFor still assembles the three loose rows below and treats this
   * record as an enrichment layer rather than the sole source.
   */
  async activeSubscriptionFor(studentId: string) {
    return this.prisma.studentSubscription.findFirst({
      where: { studentId, status: { in: ['ACTIVE', 'PENDING', 'PENDING_PAYMENT', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' },
      include: { model: { select: { key: true, name: true, pricingMode: true } } },
    });
  }

  async currentFor(studentId: string) {
    const [profile, enrolment, batchLinks, assignment, queued, record] = await Promise.all([
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
      this.activeSubscriptionFor(studentId),
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
      /*
       * The stored subscription record — the model, tier, chosen duration/weekly,
       * live counters and renewal. Null for a legacy student until the backfill
       * runs. Panels read the richer numbers from here; the loose fields above
       * stay for backward compatibility and un-migrated students.
       */
      record: record
        ? {
            id: record.id,
            model: record.model
              ? { key: record.model.key, name: record.model.name, pricingMode: record.model.pricingMode }
              : null,
            pricingMode: record.pricingMode,
            tier: record.tier,
            // Spec requires the record to carry Course, Currency and Billing
            // Cycle explicitly. Currency and billingCycle are the record's own
            // snapshots; course rides along from the active enrolment.
            currency: record.currency,
            billingCycle: record.billingCycle,
            course: enrolment?.course ?? null,
            // Payment-gated dates: what the family asked for vs the official start
            // set at payment. actualCycleStartDate is null while PENDING_PAYMENT.
            preferredStartDate: record.preferredStartDate,
            actualCycleStartDate: record.actualCycleStartDate,
            monthlyPrice: record.monthlyPrice == null ? null : Number(record.monthlyPrice),
            hourlyRate: record.hourlyRate == null ? null : Number(record.hourlyRate),
            durationMinutes: record.durationMinutes,
            weeklyClasses: record.weeklyClasses,
            monthlyHours: record.monthlyHours,
            renewalDate: record.renewalDate,
            remainingClasses: record.remainingClasses,
            completedClasses: record.completedClasses,
            rescheduleCounter: record.rescheduleCounter,
            rescheduleLimit: record.rescheduleLimit,
            reschedulesLeft: Math.max(0, record.rescheduleLimit - record.rescheduleCounter),
            familyDiscountPct: record.familyDiscountPct == null ? 0 : Number(record.familyDiscountPct),
            status: record.status,
          }
        : null,
      // The stored record's status wins when there is one — it carries PENDING
      // and survives a paused/ended migration that the loose assignment cannot.
      status: record ? record.status : this.statusOf(assignment),
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

  /*
   * Create the stored subscription row for a student. Called when a lead is
   * converted (Phase 3) and by the backfill for legacy students. Derives the
   * hours/class counts from duration × weekly so a caller cannot store a
   * monthlyHours that disagrees with the schedule it came from.
   */
  async createStudentSubscription(input: {
    studentId: string;
    enrollmentId?: string | null;
    courseId?: string | null;
    modelId: string;
    pricingMode: 'FIXED_MONTHLY' | 'HOURLY';
    planId?: string | null;
    tier?: string | null;
    currency: string;
    monthlyPrice?: number | null;
    hourlyRate?: number | null;
    durationMinutes: number;
    weeklyClasses: number;
    billingCycle?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM';
    startDate?: Date;
    renewalDate?: Date | null;
    remainingClasses?: number | null;
    rescheduleLimit?: number | null;
    familyDiscountPct?: number | null;
    batchId?: string | null;
    feeAssignmentId?: string | null;
    status?: 'PENDING' | 'PENDING_PAYMENT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
    // Held while PENDING_PAYMENT so activation can build the schedule after payment.
    pendingDays?: string[] | null;
    pendingTime?: string | null;
    pendingTeacherId?: string | null;
    preferredStartDate?: Date | null;
    preferredTeacherGender?: string | null;
    adminStartOverride?: boolean;
  }) {
    const hours = calcMonthlyHours(input.durationMinutes, input.weeklyClasses);
    const classes = calcMonthlyClasses(input.weeklyClasses);
    return this.prisma.studentSubscription.create({
      data: {
        studentId: input.studentId,
        enrollmentId: input.enrollmentId ?? null,
        courseId: input.courseId ?? null,
        modelId: input.modelId,
        pricingMode: input.pricingMode,
        planId: input.planId ?? null,
        tier: input.tier ?? null,
        currency: input.currency,
        monthlyPrice: input.monthlyPrice ?? null,
        hourlyRate: input.hourlyRate ?? null,
        durationMinutes: input.durationMinutes,
        weeklyClasses: input.weeklyClasses,
        monthlyHours: Math.round(hours),
        billingCycle: (input.billingCycle ?? 'MONTHLY') as any,
        startDate: input.startDate ?? new Date(),
        renewalDate: input.renewalDate ?? null,
        remainingClasses: input.remainingClasses ?? classes,
        completedClasses: 0,
        rescheduleLimit: input.rescheduleLimit ?? 0,
        familyDiscountPct: input.familyDiscountPct ?? 0,
        batchId: input.batchId ?? null,
        feeAssignmentId: input.feeAssignmentId ?? null,
        pendingDays: input.pendingDays ?? [],
        pendingTime: input.pendingTime ?? null,
        pendingTeacherId: input.pendingTeacherId ?? null,
        preferredStartDate: input.preferredStartDate ?? null,
        preferredTeacherGender: input.preferredTeacherGender ?? null,
        adminStartOverride: input.adminStartOverride ?? false,
        status: (input.status ?? 'ACTIVE') as any,
      },
    });
  }

  /*
   * A class has been finalised (its attendance was locked). Consume one class
   * from each attending student's active subscription — remainingClasses down,
   * completedClasses up. Only a class that actually took place counts: an
   * EXCUSED / approved-leave attendee, and a CANCELLED session, never burn a
   * class. Called exactly once per class, at the lock transition, so it cannot
   * double-count. Floors remainingClasses at zero.
   */
  async consumeClassForSubscription(classId: string): Promise<void> {
    const cls = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        status: true,
        batchId: true,
        attendees: { select: { studentId: true, status: true } },
      },
    });
    if (!cls || cls.status !== 'COMPLETED') return;
    // A held class uses a slot whether the student showed up or not; only an
    // excused absence or approved leave is forgiven.
    const CONSUMING = new Set(['PRESENT', 'LATE', 'ABSENT', 'NO_SHOW']);
    for (const a of cls.attendees) {
      if (!a.status || !CONSUMING.has(a.status)) continue;
      // Prefer the subscription tied to this batch; fall back to the student's
      // active one for legacy rows that predate batch tracking.
      const sub =
        (cls.batchId
          ? await this.prisma.studentSubscription.findFirst({
              where: { studentId: a.studentId, status: 'ACTIVE', batchId: cls.batchId },
              orderBy: { createdAt: 'desc' },
            })
          : null) ??
        (await this.prisma.studentSubscription.findFirst({
          where: { studentId: a.studentId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        }));
      if (!sub) continue;
      await this.prisma.studentSubscription.update({
        where: { id: sub.id },
        data: {
          remainingClasses: Math.max(0, sub.remainingClasses - 1),
          completedClasses: { increment: 1 },
        },
      });
    }
  }

  /*
   * A new billing cycle has begun for this student — refill the class allowance
   * (remainingClasses back to the monthly count, completedClasses to zero) and
   * roll renewalDate to the next billing date. Called from the billing sweep
   * after a renewal invoice is actually raised, so it runs on every real cycle
   * turn regardless of whether a plan change was queued.
   */
  async refillCycle(studentId: string): Promise<void> {
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return;
    const monthly = calcMonthlyClasses(sub.weeklyClasses);
    // Subscriptions renew on a fixed 28-day cadence. Anchor to the cycle
    // boundary (the old renewal date), not the sweep time, so cycles don't drift;
    // step forward until the new renewal is in the future (catches a late sweep).
    const nowTs = new Date();
    let renewal = sub.renewalDate ? new Date(sub.renewalDate) : nowTs;
    while (renewal <= nowTs) renewal = subscriptionCycleEnd(renewal);
    await this.prisma.studentSubscription.update({
      where: { id: sub.id },
      data: {
        remainingClasses: monthly,
        completedClasses: 0,
        minutesUsed: 0,
        // The reschedule allowance is per-cycle — the flow's "Reset Cycle
        // Counters: Hours, Classes, Reschedules Used" box. Reset it here too,
        // because this advances renewalDate into the future and so disarms the
        // lazy reset in requestReschedule; without this the counter would carry
        // over and a renewed student would lose their reschedules permanently.
        rescheduleCounter: 0,
        renewalDate: renewal,
      },
    });
    if (sub.feeAssignmentId) {
      await this.prisma.studentFeeAssignment
        .update({ where: { id: sub.feeAssignmentId }, data: { nextRunAt: renewal } })
        .catch(() => undefined);
    }
  }

  /*
   * Cycle close: the classes of the cycle that just ended become immutable —
   * their attendance is settled and they can no longer be rescheduled. Locks
   * every not-yet-locked past session of the batch.
   */
  async lockClosedCycleClasses(batchId: string | null | undefined, before: Date): Promise<void> {
    if (!batchId) return;
    await this.prisma.classSession
      .updateMany({
        where: { batchId, cycleLocked: false, startsAt: { lt: before } },
        data: { cycleLocked: true },
      })
      .catch(() => undefined);
  }

  /*
   * Generate the next 28-day cycle's classes for a student's active batch, when
   * no queued change already did so. Reuses the deduped cycle generator, so a
   * double call is safe.
   */
  async generateNextCycleForSubscription(studentId: string): Promise<number> {
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { batchId: true },
    });
    if (!sub?.batchId) return 0;
    return this.generateCycleClasses(studentId, sub.batchId).catch(() => 0);
  }

  /* Notify the student, their teacher and their coach that a new cycle is live. */
  async notifyCycleRenewed(studentId: string): Promise<void> {
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { batchId: true, renewalDate: true },
    });
    let teacherProfileId: string | null = null;
    if (sub?.batchId) {
      const batch = await this.prisma.batch.findUnique({ where: { id: sub.batchId }, select: { teacherId: true } });
      teacherProfileId = batch?.teacherId ?? null;
    }
    await this.notifyScheduleReady(studentId, teacherProfileId, sub?.renewalDate ?? new Date(), 'CYCLE_RENEWED');
  }

  /*
   * Next sequential batch code (BATCH-0001…). Read-max-then-insert like the rest
   * of the codebase, but wrapped in a retry so a concurrent enrolment losing the
   * unique race retries the next number instead of failing the whole conversion.
   */
  private async nextBatchCode(): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const count = await this.prisma.batch.count();
      const candidate = `BATCH-${String(count + 1 + attempt).padStart(4, '0')}`;
      const clash = await this.prisma.batch.findUnique({ where: { code: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    // Fallback: a suffix that cannot collide, rather than giving up.
    return `BATCH-${Date.now().toString().slice(-8)}`;
  }

  private addMinutesToTime(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = (h * 60 + m + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  private async generateSessionsForBatch(batchId: string, from: Date, to: Date): Promise<number> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        id: true, name: true, courseId: true, teacherId: true,
        daysOfWeek: true, startTime: true, endTime: true,
        students: { select: { studentId: true } },
      },
    });
    if (!batch?.daysOfWeek?.length || !batch.startTime || !batch.endTime || !batch.teacherId) return 0;

    // UTC throughout, matching generateCycleClasses and the availability maths.
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const [sh, sm] = batch.startTime.split(':').map(Number);
    const [eh, em] = batch.endTime.split(':').map(Number);
    // No backdated classes, ever — a session earlier than the window start or
    // already in the past is skipped (the spec's late-payment rule).
    const now = new Date();
    let made = 0;
    for (const d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!batch.daysOfWeek.includes(DAYS[d.getUTCDay()])) continue;
      const startsAt = new Date(d);
      startsAt.setUTCHours(sh, sm, 0, 0);
      if (startsAt < from || startsAt < now) continue;
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

  /*
   * Turn an accepted enrolment into a full subscription: a Batch for the chosen
   * schedule, its recurring class sessions, a recurring fee assignment, and the
   * stored StudentSubscription that ties them together. Every step is guarded —
   * a missing teacher or unscheduled day builds what it can (at minimum the
   * subscription record) rather than failing the conversion. Returns what it made.
   */
  /*
   * Resolve a package into the concrete shape a subscription needs: its model +
   * pricing mode, the class duration/weekly count (honouring an hourly plan's
   * family-chosen overrides), and the priced monthly amount. Pure resolution —
   * no rows written — so both the conversion-time invoice and the stored
   * subscription can be priced without building a batch.
   */
  private async resolvePlanShape(
    pkg: any,
    currency: Currency,
    durationOverride?: number | null,
    weeklyOverride?: number | null,
    fallbackDurationMinutes?: number | null,
    days?: string[],
  ): Promise<{
    modelId: string | null;
    pricingMode: 'FIXED_MONTHLY' | 'HOURLY';
    durationMinutes: number;
    weeklyClasses: number;
    monthlyPrice: number | null;
    hourlyRate: number | null;
  }> {
    let modelId: string | null = pkg?.modelId ?? null;
    let pricingMode: 'FIXED_MONTHLY' | 'HOURLY' = 'FIXED_MONTHLY';
    if (modelId) {
      const m = await this.prisma.subscriptionModel.findUnique({
        where: { id: modelId },
        select: { pricingMode: true },
      });
      pricingMode = (m?.pricingMode as 'FIXED_MONTHLY' | 'HOURLY') ?? 'FIXED_MONTHLY';
    } else {
      const monthly = await this.prisma.subscriptionModel.findUnique({
        where: { key: 'MONTHLY' },
        select: { id: true },
      });
      modelId = monthly?.id ?? null;
    }
    const dayCount = (days ?? []).filter(Boolean).length;
    const durationMinutes =
      pricingMode === 'HOURLY' && durationOverride
        ? Number(durationOverride)
        : Number(pkg?.durationMinutes) || fallbackDurationMinutes || 60;
    const weeklyClasses =
      pricingMode === 'HOURLY' && weeklyOverride
        ? Number(weeklyOverride)
        : Number(pkg?.weeklyClasses) || dayCount || 2;
    const monthlyPrice =
      pricingMode === 'HOURLY'
        ? monthlyTuition({ pricingMode, currency, hourlyRate: hourlyRateFor(pkg, currency), durationMinutes, weeklyClasses })
        : priceFor(pkg, currency);
    const hourlyRate = pricingMode === 'HOURLY' ? hourlyRateFor(pkg, currency) : null;
    return { modelId, pricingMode, durationMinutes, weeklyClasses, monthlyPrice, hourlyRate };
  }

  /*
   * Payment-gated enrollment, phase 1: record the *intent*. Creates a
   * PENDING_PAYMENT subscription carrying the agreed price and the schedule the
   * family chose, but builds NO batch, NO class sessions and NO fee assignment —
   * so nothing is scheduled and the teacher's calendar is not blocked until the
   * first payment lands. The invoice is raised by the caller from the returned
   * monthlyPrice. `activateSubscription` completes the rest on payment.
   */
  async recordSubscriptionIntent(input: {
    studentId: string;
    enrollmentId?: string | null;
    courseId?: string | null;
    teacherId?: string | null;
    pkg: any;
    currency: Currency;
    days?: string[];
    time?: string | null;
    preferredStartDate?: Date | null;
    preferredTeacherGender?: string | null;
    adminStartOverride?: boolean;
    fallbackDurationMinutes?: number | null;
    durationOverride?: number | null;
    weeklyOverride?: number | null;
  }): Promise<{
    subscriptionId: string | null;
    monthlyPrice: number | null;
    pricingMode: 'FIXED_MONTHLY' | 'HOURLY';
  }> {
    const pkg = input.pkg ?? {};
    const shape = await this.resolvePlanShape(
      pkg,
      input.currency,
      input.durationOverride,
      input.weeklyOverride,
      input.fallbackDurationMinutes,
      input.days,
    );
    if (!shape.modelId) {
      return { subscriptionId: null, monthlyPrice: null, pricingMode: 'FIXED_MONTHLY' };
    }
    const days = (input.days ?? []).filter(Boolean);
    let subscriptionId: string | null = null;
    try {
      const sub = await this.createStudentSubscription({
        studentId: input.studentId,
        enrollmentId: input.enrollmentId ?? null,
        courseId: input.courseId ?? null,
        modelId: shape.modelId,
        pricingMode: shape.pricingMode,
        planId: pkg.id ?? null,
        tier: pkg.tier ?? null,
        currency: input.currency,
        monthlyPrice: shape.monthlyPrice,
        hourlyRate: shape.hourlyRate,
        durationMinutes: shape.durationMinutes,
        weeklyClasses: shape.weeklyClasses,
        // No cycle yet — startDate/renewalDate/remainingClasses are set on payment.
        remainingClasses: 0,
        rescheduleLimit: Number(pkg.rescheduleLimit) || 0,
        familyDiscountPct: Number(pkg.familyDiscountPct) || 0,
        pendingDays: days,
        pendingTime: input.time ?? null,
        pendingTeacherId: input.teacherId ?? null,
        preferredStartDate: input.preferredStartDate ?? null,
        preferredTeacherGender: input.preferredTeacherGender ?? null,
        adminStartOverride: input.adminStartOverride ?? false,
        status: 'PENDING_PAYMENT',
      });
      subscriptionId = sub.id;
    } catch {
      subscriptionId = null;
    }
    return { subscriptionId, monthlyPrice: shape.monthlyPrice, pricingMode: shape.pricingMode };
  }

  /*
   * The official cycle start, decided only once payment lands. The spec's rules:
   *  - Admin override → start as soon as possible (first preferred weekday on/after
   *    payment), ignoring the preferred-date floor.
   *  - Paid on/before the preferred date (on-time or early) → start exactly on the
   *    preferred date. Never earlier.
   *  - Paid after the preferred date (late) → the first preferred class day on/after
   *    the payment date. No backdating.
   */
  private computeActualCycleStart(
    preferred: Date | null | undefined,
    paymentDate: Date,
    days: string[],
    adminOverride: boolean,
  ): Date {
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const nextPreferredDay = (from: Date): Date => {
      if (!days.length) return from;
      for (let i = 0; i < 14; i++) {
        const d = addDays(from, i);
        if (days.includes(DAYS[d.getUTCDay()])) return d;
      }
      return from;
    };
    const pref = preferred ? new Date(preferred) : null;
    if (adminOverride) return nextPreferredDay(paymentDate);
    if (pref && paymentDate <= pref) return pref;
    return nextPreferredDay(pref && pref > paymentDate ? pref : paymentDate);
  }

  /*
   * Payment-gated enrollment, phase 2: activate. Called when the first invoice is
   * fully paid. Computes the actual cycle-start date (never backdated), builds the
   * Batch (which is the teacher-calendar reservation), generates the 28-day class
   * schedule, creates the recurring fee assignment, flips the subscription and its
   * enrolment to ACTIVE, and notifies the student, teacher and coach. Idempotent:
   * a subscription already ACTIVE is skipped.
   */
  async activateSubscription(
    studentId: string,
    paymentDate?: Date,
  ): Promise<{ activated: boolean; subscriptionId?: string; batchId?: string | null; sessionsCreated?: number; actualStart?: Date; cycleEnd?: Date }> {
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: 'PENDING_PAYMENT' },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return { activated: false };

    const payDate = paymentDate ?? new Date();
    const days = (sub.pendingDays ?? []).filter(Boolean);
    const actualStart = this.computeActualCycleStart(sub.preferredStartDate, payDate, days, sub.adminStartOverride);
    const cycleEnd = subscriptionCycleEnd(actualStart);

    // Build the batch — this IS the permanent teacher-calendar reservation.
    let batchId: string | null = null;
    if (sub.pendingTeacherId && sub.courseId && days.length && sub.pendingTime) {
      try {
        const code = await this.nextBatchCode();
        const batch = await this.prisma.batch.create({
          data: {
            code,
            name: `${sub.tier ?? 'Subscription'} — ${studentId.slice(0, 6)}`,
            courseId: sub.courseId,
            teacherId: sub.pendingTeacherId,
            daysOfWeek: days,
            startTime: sub.pendingTime,
            endTime: this.addMinutesToTime(sub.pendingTime, sub.durationMinutes),
            startDate: actualStart,
            status: 'ACTIVE',
          },
        });
        batchId = batch.id;
        await this.prisma.batchStudent.create({ data: { batchId: batch.id, studentId } });
      } catch {
        batchId = null;
      }
    }

    // Recurring fee assignment (28-day) when the package is billed by a fee plan.
    let feeAssignmentId: string | null = null;
    const pkg = sub.planId
      ? await this.prisma.package.findUnique({ where: { id: sub.planId }, select: { feePlanId: true } })
      : null;
    if (pkg?.feePlanId) {
      try {
        const fa = await this.prisma.studentFeeAssignment.create({
          data: {
            studentId,
            planId: pkg.feePlanId,
            startDate: actualStart,
            nextRunAt: cycleEnd,
            active: true,
            autoGenerate: true,
          },
        });
        feeAssignmentId = fa.id;
      } catch {
        feeAssignmentId = null;
      }
    }

    // The first 28-day cycle's class sessions (no backdating — see generator).
    let sessionsCreated = 0;
    if (batchId) {
      sessionsCreated = await this.generateSessionsForBatch(batchId, actualStart, cycleEnd).catch(() => 0);
    }

    const monthly = calcMonthlyClasses(sub.weeklyClasses);
    await this.prisma.studentSubscription.update({
      where: { id: sub.id },
      data: {
        status: 'ACTIVE',
        actualCycleStartDate: actualStart,
        startDate: actualStart,
        renewalDate: cycleEnd,
        batchId,
        feeAssignmentId,
        remainingClasses: monthly,
        completedClasses: 0,
        minutesUsed: 0,
      },
    });

    // The enrolment goes live too, dated from the actual cycle start.
    if (sub.enrollmentId) {
      await this.prisma.enrollment
        .update({
          where: { id: sub.enrollmentId },
          data: {
            status: EnrollmentStatus.ACTIVE,
            startedAt: actualStart,
            ...(sub.pendingTeacherId ? { teacherId: sub.pendingTeacherId } : {}),
          },
        })
        .catch(() => undefined);
    }

    await this.notifyScheduleReady(studentId, sub.pendingTeacherId, actualStart).catch(() => undefined);

    return { activated: true, subscriptionId: sub.id, batchId, sessionsCreated, actualStart, cycleEnd };
  }

  /*
   * Tell the student, their teacher and their coach that a schedule is live — on
   * first activation and on each cycle renewal. Resolves the three recipients'
   * user ids and fires the notification to each; entirely best-effort.
   */
  private async notifyScheduleReady(
    studentId: string,
    teacherProfileId: string | null | undefined,
    startDate: Date,
    kind: 'CLASS_SCHEDULED' | 'CYCLE_RENEWED' = 'CLASS_SCHEDULED',
  ): Promise<void> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        userId: true,
        coachId: true,
        studentCode: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const teacher = teacherProfileId
      ? await this.prisma.teacherProfile.findUnique({ where: { id: teacherProfileId }, select: { userId: true } })
      : null;
    const when = startDate.toISOString().slice(0, 10);
    const studentName = student?.user
      ? `${student.user.firstName} ${student.user.lastName}`.trim()
      : 'the student';
    const renewed = kind === 'CYCLE_RENEWED';

    /*
     * Each recipient gets a message written for their role — the spec's renewal
     * notification list: the student hears about their new schedule (their new
     * invoice comes separately from billing.notifyIssued), the teacher about a
     * new schedule to teach, the coach a confirmation the cycle turned over.
     */
    const messages: { userId: string; title: string; body: string; link: string }[] = [];
    if (student?.userId) {
      messages.push({
        userId: student.userId,
        title: renewed ? 'New schedule available' : 'Your class schedule is ready',
        body: renewed
          ? `Your new billing cycle's classes are scheduled from ${when}.`
          : `Your classes are scheduled to begin on ${when}.`,
        link: '/student/subscription',
      });
    }
    if (teacher?.userId) {
      messages.push({
        userId: teacher.userId,
        title: 'New schedule generated',
        body: renewed
          ? `A new 28-day schedule for ${studentName} starts ${when}.`
          : `A new schedule for ${studentName} begins ${when}.`,
        link: '/teacher/classes',
      });
    }
    if (student?.coachId) {
      messages.push({
        userId: student.coachId,
        title: 'Schedule generated successfully',
        body: renewed
          ? `${studentName}'s new cycle schedule is live from ${when}.`
          : `${studentName}'s schedule is live from ${when}.`,
        link: `/students/${studentId}`,
      });
    }
    await Promise.all(
      messages.map((m) =>
        this.notifications
          .createFor(m.userId, { type: kind, title: m.title, body: m.body, link: m.link })
          .catch(() => undefined),
      ),
    );
  }

  /*
   * A student reschedules one upcoming class, within the rules the spec lays
   * down: the plan's reschedule allowance (a counter that resets each cycle), at
   * least four hours' notice, the new time free for the teacher, and still
   * inside the current billing cycle. Every rule is a guard here rather than a
   * hope on the client, because the client cannot be trusted with any of them.
   */
  private static readonly RESCHEDULE_MIN_NOTICE_HOURS = 4;

  /** "HH:mm" → minutes from midnight, or null on anything malformed. */
  private hhmmToMinutes(v: unknown): number | null {
    if (typeof v !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  /** An instant's weekday name and minutes-from-midnight in a given timezone. */
  private localWeekdayAndMinutes(d: Date, tz: string): { weekday: string; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    if (hh === 24) hh = 0; // some engines emit 24:00 for midnight under hour12:false
    return { weekday, minutes: hh * 60 + mm };
  }

  /*
   * Whether a class slot falls inside the teacher's published availability.
   *
   * Permissive by design, matching how trial slotting falls back to standard
   * hours: a teacher who has published nothing for that weekday is treated as
   * available (the academy fills the gap). Returns false ONLY when the teacher
   * HAS published windows for that weekday and the slot sits outside all of them.
   * Availability windows are stored in the teacher's own timezone, so the
   * instant is converted to that timezone before comparing.
   */
  private async isWithinTeacherAvailability(teacherId: string, start: Date, end: Date): Promise<boolean> {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { availability: true, timeZone: true },
    });
    const availability = t?.availability;
    if (!availability || typeof availability !== 'object') return true;
    const tz = t?.timeZone || 'UTC';
    const s = this.localWeekdayAndMinutes(start, tz);
    const e = this.localWeekdayAndMinutes(end, tz);
    const dayConfig = (availability as Record<string, unknown>)[s.weekday];
    if (!Array.isArray(dayConfig) || dayConfig.length === 0) return true; // nothing published that day
    // If the slot rolls past midnight into the next weekday, clamp its end to
    // the end of the published day for this weekday's comparison.
    const endMinutes = e.weekday === s.weekday ? e.minutes : 24 * 60;
    for (const w of dayConfig) {
      if (!w || typeof w !== 'object') continue;
      const from = this.hhmmToMinutes((w as Record<string, unknown>).from);
      const to = this.hhmmToMinutes((w as Record<string, unknown>).to);
      if (from == null || to == null) continue;
      if (s.minutes >= from && endMinutes <= to) return true;
    }
    return false;
  }

  /*
   * Assert a recurring schedule (chosen weekdays + a start time) sits inside the
   * assigned teacher's published availability, so the enrolment cannot book a
   * teacher outside their hours — the spec's "schedule selection shall only
   * display available teacher time slots", enforced server-side at conversion.
   * Permissive when the teacher has published nothing for a given weekday.
   * A no-op when there is no teacher or no schedule yet.
   */
  async assertScheduleWithinAvailability(
    teacherId: string | null | undefined,
    days: string[] | null | undefined,
    time: string | null | undefined,
    durationMinutes: number,
  ): Promise<void> {
    if (!teacherId || !days?.length || !time) return;
    const startMins = this.hhmmToMinutes(time);
    if (startMins == null) return;
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    for (const dayName of days) {
      const idx = DAYS.indexOf(dayName);
      if (idx < 0) continue;
      // The next occurrence of this weekday (UTC), matching how sessions are
      // stamped (HH:mm as UTC wall-clock).
      const d = new Date(base);
      const delta = ((idx - d.getUTCDay() + 7) % 7) || 7;
      d.setUTCDate(d.getUTCDate() + delta);
      const start = new Date(d);
      start.setUTCHours(Math.floor(startMins / 60), startMins % 60, 0, 0);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      const ok = await this.isWithinTeacherAvailability(teacherId, start, end);
      if (!ok) {
        throw new BadRequestException(`The chosen time is outside the teacher's available hours on ${dayName}.`);
      }
    }
  }

  async requestReschedule(userId: string, sessionId: string, newStartsAtIso: string) {
    const student = await this.studentByUserId(userId);
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId: student.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) throw new BadRequestException('No active subscription to reschedule against.');

    // The allowance resets every billing cycle. Rather than depend on a sweep
    // running exactly on the boundary, refill lazily: if we are past the renewal
    // date, this is a new cycle — zero the counter and advance the stored renewal
    // so it only refills once per cycle.
    const nowTs = new Date();
    if (sub.renewalDate && nowTs > new Date(sub.renewalDate)) {
      let nextRenewal = new Date(sub.renewalDate);
      while (nextRenewal <= nowTs) nextRenewal = subscriptionCycleEnd(nextRenewal);
      await this.prisma.studentSubscription.update({
        where: { id: sub.id },
        data: { rescheduleCounter: 0, minutesUsed: 0, renewalDate: nextRenewal },
      });
      sub.rescheduleCounter = 0;
      sub.renewalDate = nextRenewal;
    }

    if (sub.rescheduleCounter >= sub.rescheduleLimit) {
      throw new BadRequestException(
        sub.rescheduleLimit === 0
          ? 'This plan does not allow rescheduling.'
          : `You have used all ${sub.rescheduleLimit} reschedules for this cycle.`,
      );
    }

    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teacherId: true, batchId: true, startsAt: true, endsAt: true, status: true, cycleLocked: true },
    });
    if (!session) throw new NotFoundException('Class not found.');

    // The class must be one of this student's, upcoming, and still scheduled.
    const attends = await this.prisma.classAttendee.count({ where: { classId: sessionId, studentId: student.id } });
    if (!attends) throw new ForbiddenException('That class is not yours to reschedule.');
    if (session.status !== 'SCHEDULED') throw new BadRequestException('Only a scheduled class can be moved.');
    // A class from a closed cycle is immutable — the cycle it belonged to has
    // been billed and locked.
    if (session.cycleLocked) throw new BadRequestException('That class belongs to a closed billing cycle and can no longer be moved.');
    const now = new Date();
    if (session.startsAt <= now) throw new BadRequestException('That class has already started or passed.');

    const newStart = new Date(newStartsAtIso);
    if (isNaN(newStart.getTime())) throw new BadRequestException('Invalid new time.');
    const durationMs = new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Rule: at least four hours' notice before the ORIGINAL class.
    const noticeMs = SubscriptionsService.RESCHEDULE_MIN_NOTICE_HOURS * 60 * 60 * 1000;
    if (new Date(session.startsAt).getTime() - now.getTime() < noticeMs) {
      throw new BadRequestException(`Rescheduling needs at least ${SubscriptionsService.RESCHEDULE_MIN_NOTICE_HOURS} hours' notice.`);
    }
    // Rule: the new time must be in the future and still inside this cycle.
    if (newStart.getTime() - now.getTime() < noticeMs) {
      throw new BadRequestException(`Pick a time at least ${SubscriptionsService.RESCHEDULE_MIN_NOTICE_HOURS} hours from now.`);
    }
    if (sub.renewalDate && newEnd > new Date(sub.renewalDate)) {
      throw new BadRequestException('The class must be rescheduled to before your current cycle ends.');
    }

    // Rule: the new time must fall inside the teacher's published availability
    // (when they have published any for that weekday) — the spec's "teacher
    // availability required", not merely "no clashing class".
    const withinAvailability = await this.isWithinTeacherAvailability(session.teacherId, newStart, newEnd);
    if (!withinAvailability) {
      throw new BadRequestException("That time is outside the teacher's available hours.");
    }

    // Rule: the teacher must also be free — no other scheduled class overlapping.
    const clash = await this.prisma.classSession.count({
      where: {
        teacherId: session.teacherId,
        id: { not: sessionId },
        status: 'SCHEDULED',
        startsAt: { lt: newEnd },
        endsAt: { gt: newStart },
      },
    });
    if (clash) throw new BadRequestException('The teacher is not available at that time.');

    await this.prisma.$transaction([
      this.prisma.classSession.update({ where: { id: sessionId }, data: { startsAt: newStart, endsAt: newEnd } }),
      this.prisma.studentSubscription.update({ where: { id: sub.id }, data: { rescheduleCounter: { increment: 1 } } }),
    ]);

    this.notifications
      .createForRoles([Role.ADMIN, Role.ACADEMIC_COACH], {
        type: 'CLASS_RESCHEDULED',
        title: 'Class rescheduled',
        body: `${student.studentCode} moved a class to ${newStart.toISOString().slice(0, 16).replace('T', ' ')}.`,
        link: `/students/${student.id}`,
      })
      .catch(() => undefined);

    return {
      sessionId,
      startsAt: newStart,
      endsAt: newEnd,
      reschedulesLeft: Math.max(0, sub.rescheduleLimit - (sub.rescheduleCounter + 1)),
    };
  }

  /*
   * Migrate a student from one subscription model to another (the spec's
   * Monthly → Hourly move, but general). Deliberately does NOT touch history:
   * past invoices, attendance and class sessions all reference their own rows
   * and are left exactly as they are. The current subscription is ENDed and a
   * fresh one created for the new plan, the enrolment is repointed at the new
   * package, and the existing schedule (batch) is kept — a migration changes how
   * a family is priced, not when their classes are. Admin-only.
   */
  async migrateModel(
    studentId: string,
    input: { newPackageId: string; durationMinutes?: number; weeklyClasses?: number },
    actor: Actor,
  ) {
    const current = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: { in: ['ACTIVE', 'PAUSED', 'PENDING'] } },
      orderBy: { createdAt: 'desc' },
    });

    const pkg = await this.prisma.package.findUnique({ where: { id: input.newPackageId } });
    if (!pkg) throw new BadRequestException('That plan no longer exists.');

    // Resolve the new plan's model + pricing mode.
    let modelId = pkg.modelId ?? null;
    let pricingMode: 'FIXED_MONTHLY' | 'HOURLY' = 'FIXED_MONTHLY';
    if (modelId) {
      const m = await this.prisma.subscriptionModel.findUnique({ where: { id: modelId }, select: { pricingMode: true } });
      pricingMode = (m?.pricingMode as 'FIXED_MONTHLY' | 'HOURLY') ?? 'FIXED_MONTHLY';
    } else {
      const monthly = await this.prisma.subscriptionModel.findUnique({ where: { key: 'MONTHLY' }, select: { id: true } });
      modelId = monthly?.id ?? null;
    }
    if (!modelId) throw new BadRequestException('No subscription model to migrate to.');

    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { billingCurrency: true },
    });
    const currency = (profile?.billingCurrency ?? DEFAULT_CURRENCY) as Currency;

    const durationMinutes = input.durationMinutes ?? (Number(pkg.durationMinutes) || current?.durationMinutes || 60);
    const weeklyClasses = input.weeklyClasses ?? (Number(pkg.weeklyClasses) || current?.weeklyClasses || 2);
    const monthlyPrice =
      pricingMode === 'HOURLY'
        ? monthlyTuition({ pricingMode, currency, hourlyRate: hourlyRateFor(pkg, currency), durationMinutes, weeklyClasses })
        : priceFor(pkg, currency);
    const hourlyRate = pricingMode === 'HOURLY' ? hourlyRateFor(pkg, currency) : null;

    // Repoint the active enrolment at the new package (keeps the same course).
    const enrolment = await this.prisma.enrollment.findFirst({
      where: { studentId, status: EnrollmentStatus.ACTIVE },
      orderBy: { startedAt: 'desc' },
      select: { id: true, courseId: true },
    });
    if (enrolment) {
      await this.prisma.enrollment.update({ where: { id: enrolment.id }, data: { packageId: pkg.id } });
    }

    // End the old subscription, keep it as history.
    if (current) {
      await this.prisma.studentSubscription.update({ where: { id: current.id }, data: { status: 'ENDED' } });
    }

    // Create the new one, keeping the existing schedule/fee links.
    const created = await this.createStudentSubscription({
      studentId,
      enrollmentId: enrolment?.id ?? current?.enrollmentId ?? null,
      courseId: enrolment?.courseId ?? current?.courseId ?? null,
      modelId,
      pricingMode,
      planId: pkg.id,
      tier: pkg.tier ?? null,
      currency,
      monthlyPrice,
      hourlyRate,
      durationMinutes,
      weeklyClasses,
      startDate: new Date(),
      renewalDate: current?.renewalDate ?? null,
      rescheduleLimit: Number(pkg.rescheduleLimit) || 0,
      familyDiscountPct: Number(pkg.familyDiscountPct) || 0,
      batchId: current?.batchId ?? null,
      feeAssignmentId: current?.feeAssignmentId ?? null,
      status: 'ACTIVE',
    });

    const student = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true } });
    if (student) {
      this.notifications
        .createFor(student.userId, {
          type: 'SUBSCRIPTION_MIGRATED',
          title: 'Your plan has changed',
          body: `You are now on ${pkg.name}. Your past invoices and classes are unchanged.`,
          link: '/student/subscription',
        })
        .catch(() => undefined);
    }
    // Audit trail on the student record.
    await this.prisma.studentActivity
      .create({
        data: {
          studentId,
          kind: 'AUDIT',
          type: 'SUBSCRIPTION_MIGRATED',
          title: `Migrated to ${pkg.name}`,
          description: `${current?.pricingMode ?? 'none'} → ${pricingMode}. History preserved.`,
          meta: { from: current?.id ?? null, to: created.id, packageId: pkg.id } as never,
          actorId: actor?.id,
          actorName: actor?.name,
        },
      })
      .catch(() => undefined);

    return { subscriptionId: created.id, endedId: current?.id ?? null, pricingMode, monthlyPrice };
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

    // A new cycle has begun — the reschedule allowance refills.
    await this.prisma.studentSubscription.updateMany({
      where: { studentId, status: 'ACTIVE' },
      data: { rescheduleCounter: 0 },
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

    // Subscriptions schedule in fixed 28-day cycles from the cycle start.
    const from = assignment?.nextRunAt ?? new Date();
    const to = subscriptionCycleEnd(from);

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

    const nowTs = new Date();
    let made = 0;
    for (const d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!batch.daysOfWeek.includes(DAYS[d.getUTCDay()])) continue;

      const startsAt = new Date(d);
      startsAt.setUTCHours(sh, sm, 0, 0);
      // No backdated classes, ever.
      if (startsAt < nowTs) continue;
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
