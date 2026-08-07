import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CURRENCY, priceFor, type Currency } from '../common/currency';
import { nextBatchCodeFrom } from '../common/batch-code';
import { retryOnUniqueClash } from '../common/retry-unique';
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
  ModifyScheduleDto,
  RequestBreakDto,
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
      where: { studentId, status: { in: ['ACTIVE', 'PENDING', 'PENDING_PAYMENT', 'PAUSED', 'ON_BREAK'] } },
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
            // The approved break window, so the panel can say "on break until 12 Jan"
            // and offer a resume view. Null when no break is scheduled or running.
            breakStartDate: record.breakStartDate,
            breakEndDate: record.breakEndDate,
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
        teacherRescheduleCounter: 0,
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
   * Next sequential batch code (BATCH-0001…).
   *
   * Derived from the MAXIMUM, not a row count. The comment here used to claim
   * read-max while the code counted rows, which is only the same number until
   * the first batch is deleted — after that every attempt collides with an
   * existing code and the sequence falls through to the timestamp fallback
   * permanently. See `nextBatchCode` in attendance.service.ts, which mints the
   * same index and therefore races against this one.
   */
  private async nextBatchCode(): Promise<string> {
    return nextBatchCodeFrom(this.prisma);
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
    /*
     * §9.6 — "new classes shall not be scheduled during approved unavailability".
     *
     * The impact queue (§9.5) is built when leave is APPROVED, from the classes
     * that existed at that moment. A student enrolling afterwards would add
     * fresh classes into a window the coach has already worked through, and
     * nothing would ever flag them — the family would simply find nobody there.
     * So those days are not created at all. The leave window is fetched once for
     * the whole batch window rather than per day.
     */
    const leaveWindows = await this.approvedLeaveWindows(batch.teacherId, from, to);
    const duringLeave = (start: Date, end: Date) =>
      leaveWindows.some((w) => w.from < end && w.to > start);

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
      if (duringLeave(startsAt, endsAt)) continue;
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
        // The code is recomputed inside the retry: reusing a stale one just
        // collides again. Attendance mints the same index, so the loser here
        // may well be racing that service rather than another enrolment.
        const batch = await retryOnUniqueClash('code', async () =>
          this.prisma.batch.create({
            data: {
              code: await this.nextBatchCode(),
              name: `${sub.tier ?? 'Subscription'} — ${studentId.slice(0, 6)}`,
              courseId: sub.courseId!,
              teacherId: sub.pendingTeacherId,
              daysOfWeek: days,
              startTime: sub.pendingTime!,
              endTime: this.addMinutesToTime(sub.pendingTime!, sub.durationMinutes),
              startDate: actualStart,
              status: 'ACTIVE',
            },
          }),
        );
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
    return this.slotWithinWindows(t?.availability, t?.timeZone || 'UTC', start, end);
  }

  /*
   * The pure availability test, split out so slot enumeration can check hundreds
   * of candidate instants against a single already-fetched availability object
   * instead of re-querying the teacher for each. Permissive when the teacher has
   * published nothing for the slot's weekday.
   */
  private slotWithinWindows(availability: unknown, tz: string, start: Date, end: Date): boolean {
    if (!availability || typeof availability !== 'object') return true;
    const s = this.localWeekdayAndMinutes(start, tz);
    const e = this.localWeekdayAndMinutes(end, tz);
    const dayConfig = (availability as Record<string, unknown>)[s.weekday];
    if (!Array.isArray(dayConfig) || dayConfig.length === 0) return true; // nothing published that day
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
        data: { rescheduleCounter: 0, teacherRescheduleCounter: 0, minutesUsed: 0, renewalDate: nextRenewal },
      });
      sub.rescheduleCounter = 0;
      sub.teacherRescheduleCounter = 0;
      sub.renewalDate = nextRenewal;
    }

    // Package validation (spec step 2). A plan with a 0 allowance (Simple) cannot
    // reschedule at all; one that has spent its allowance is done for the cycle.
    if (sub.rescheduleLimit === 0) {
      throw new BadRequestException(
        'Your current package does not include class rescheduling. Please upgrade your package to enjoy class rescheduling benefits.',
      );
    }
    if (sub.rescheduleCounter >= sub.rescheduleLimit) {
      throw new BadRequestException('You have reached your reschedule limit for the current billing cycle.');
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

    // Rule (spec step 3): at least four hours' notice before the ORIGINAL class,
    // and the new time itself must be at least four hours out.
    const noticeMs = SubscriptionsService.RESCHEDULE_MIN_NOTICE_HOURS * 60 * 60 * 1000;
    const NOTICE_MSG = 'Classes can only be rescheduled at least 4 hours before the scheduled start time.';
    if (new Date(session.startsAt).getTime() - now.getTime() < noticeMs) {
      throw new BadRequestException(NOTICE_MSG);
    }
    if (newStart.getTime() - now.getTime() < noticeMs) {
      throw new BadRequestException(NOTICE_MSG);
    }
    // Rule (spec step 4): the rescheduled class must complete inside this cycle.
    if (sub.renewalDate && newEnd > new Date(sub.renewalDate)) {
      throw new BadRequestException('Rescheduled classes must be completed before the end of the current billing cycle.');
    }

    // Rule: the new date must not be a holiday (spec step 5 availability factor).
    if (await this.isHoliday(newStart)) {
      throw new BadRequestException('That date is a holiday. Please choose another slot.');
    }

    // Rule: the teacher must not be on approved leave then (spec step 5).
    if (await this.teacherOnLeave(session.teacherId, newStart, newEnd)) {
      throw new BadRequestException('The teacher is on leave then. Please choose another slot.');
    }

    // Rule: the new time must fall inside the teacher's published availability
    // (when they have published any for that weekday) — the spec's "teacher
    // availability required", not merely "no clashing class".
    const withinAvailability = await this.isWithinTeacherAvailability(session.teacherId, newStart, newEnd);
    if (!withinAvailability) {
      throw new BadRequestException("That time is outside the teacher's available hours.");
    }

    // Rule: the teacher must be free — no other scheduled class overlapping.
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

    // Rule: the student must be free too — their existing schedule (spec step 5).
    const studentClash = await this.prisma.classSession.count({
      where: {
        id: { not: sessionId },
        status: 'SCHEDULED',
        startsAt: { lt: newEnd },
        endsAt: { gt: newStart },
        attendees: { some: { studentId: student.id } },
      },
    });
    if (studentClash) throw new BadRequestException('You already have another class at that time.');

    await this.prisma.$transaction([
      this.prisma.classSession.update({ where: { id: sessionId }, data: { startsAt: newStart, endsAt: newEnd } }),
      this.prisma.studentSubscription.update({ where: { id: sub.id }, data: { rescheduleCounter: { increment: 1 } } }),
    ]);

    // Audit (spec: all rescheduling recorded), and notify the student, teacher,
    // coach and supervisor (spec step 7).
    await this.audit(
      student.id,
      'CLASS_RESCHEDULED',
      'Class rescheduled by student',
      `Moved to ${newStart.toISOString().slice(0, 16).replace('T', ' ')} (${sub.rescheduleCounter + 1}/${sub.rescheduleLimit} this cycle).`,
      { id: userId, name: student.studentCode, role: 'STUDENT' },
      { sessionId, oldStartsAt: session.startsAt, newStartsAt: newStart },
    ).catch(() => undefined);
    await this.notifyClassRescheduled(student.id, session.teacherId, newStart, 'by the student').catch(() => undefined);

    return {
      sessionId,
      startsAt: newStart,
      endsAt: newEnd,
      reschedulesLeft: Math.max(0, sub.rescheduleLimit - (sub.rescheduleCounter + 1)),
    };
  }

  /*
   * Whether the teacher (by profile id) is on APPROVED leave overlapping the
   * proposed class window (spec step 5 / step 4 availability factor — "teacher
   * leave must be considered when determining available slots"). A leave row
   * covers [startDate, end-of-day(endDate)] — the same window that
   * cancelClassesForLeave uses when it clears the teacher's classes.
   */
  private async teacherOnLeave(teacherProfileId: string | null, start: Date, end: Date): Promise<boolean> {
    const windows = await this.approvedLeaveWindows(teacherProfileId, start, end);
    return windows.some((w) => w.from < end && w.to > start);
  }

  /**
   * A teacher's approved leave as instant ranges, for any window.
   *
   * The end date is stored at 00:00 but a leave covers its own last day, so it
   * is expanded to end-of-day here. Every leave check in this service goes
   * through this one function — the expansion used to be written out at each
   * call site, and a copy that forgets it books a class on the teacher's last
   * day off. Cheap: a teacher has very few approved leaves.
   */
  private async approvedLeaveWindows(
    teacherProfileId: string | null | undefined,
    start: Date,
    end: Date,
  ): Promise<{ from: Date; to: Date }[]> {
    if (!teacherProfileId) return [];
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { userId: true },
    });
    if (!teacher) return [];
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        userId: teacher.userId,
        status: 'APPROVED',
        endDate: { gte: new Date(start.getTime() - 86400000) },
        startDate: { lte: end },
      },
      select: { startDate: true, endDate: true },
    });
    return leaves.map((l) => {
      const to = new Date(l.endDate);
      to.setHours(23, 59, 59, 999);
      return { from: new Date(l.startDate), to };
    });
  }

  /* Whether a given instant's calendar day is an academy holiday. */
  private async isHoliday(when: Date): Promise<boolean> {
    const dayStart = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), 0, 0, 0));
    const dayEnd = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), 23, 59, 59));
    const h = await this.prisma.announcement.findFirst({
      where: {
        type: 'HOLIDAY',
        active: true,
        publishedAt: { not: null, lte: dayEnd },
        OR: [
          { expiresAt: { gte: dayStart } },
          { expiresAt: null, publishedAt: { gte: dayStart, lte: dayEnd } },
        ],
      },
      select: { id: true },
    });
    return !!h;
  }

  /*
   * A class was moved — tell the student, their teacher, their coach and the
   * supervisors (spec step 7). Shared by the student self-reschedule and the
   * approved teacher reschedule; `movedByLabel` distinguishes the two.
   */
  private async notifyClassRescheduled(
    studentId: string,
    teacherProfileId: string | null,
    when: Date,
    movedByLabel: string,
  ): Promise<void> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true, coachId: true, studentCode: true, user: { select: { firstName: true, lastName: true } } },
    });
    const teacherUserId = teacherProfileId
      ? (await this.prisma.teacherProfile.findUnique({ where: { id: teacherProfileId }, select: { userId: true } }))?.userId ?? null
      : null;
    const name = student?.user ? `${student.user.firstName} ${student.user.lastName}`.trim() : student?.studentCode ?? 'A student';
    const whenStr = when.toISOString().slice(0, 16).replace('T', ' ');
    const jobs: Promise<unknown>[] = [];
    if (student?.userId) {
      jobs.push(this.notifications.createFor(student.userId, { type: 'CLASS_RESCHEDULED', title: 'Your class was rescheduled', body: `Your class has been moved to ${whenStr} (${movedByLabel}).`, link: '/student/subscription' }));
    }
    if (teacherUserId) {
      jobs.push(this.notifications.createFor(teacherUserId, { type: 'CLASS_RESCHEDULED', title: 'A class was rescheduled', body: `${name}'s class has been moved to ${whenStr} (${movedByLabel}).`, link: '/teacher/classes' }));
    }
    if (student?.coachId) {
      jobs.push(this.notifications.createFor(student.coachId, { type: 'CLASS_RESCHEDULED', title: 'Class rescheduled', body: `${name}'s class moved to ${whenStr} (${movedByLabel}).`, link: `/students/${studentId}` }));
    }
    jobs.push(this.notifications.createForRoles([Role.ADMIN, Role.SUPERVISOR], { type: 'CLASS_RESCHEDULED', title: 'Class rescheduled', body: `${name}'s class moved to ${whenStr} (${movedByLabel}).`, link: '/reschedule-requests' }));
    await Promise.all(jobs.map((p) => (p as Promise<unknown>).catch(() => undefined)));
  }

  // ── Available slots (spec step 5): shared by the student + teacher pickers ──

  private static readonly TEACHER_RESCHEDULE_LIMIT = 2;
  private static readonly RESCHEDULE_SLOT_HORIZON_DAYS = 14;

  /*
   * The bookable slots a class can be moved to, honouring every rule the confirm
   * step enforces: ≥4h ahead, inside the current cycle, on the teacher's published
   * hours, not on a holiday, and free for BOTH the teacher and the student. Bulk
   * fetches so a fortnight of 30-minute candidates is scored in memory, not with a
   * query per slot. Slot times are UTC wall-clock, matching how classes are stored.
   */
  async rescheduleSlotsFor(sessionId: string, studentId: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      select: { teacherId: true, startsAt: true, endsAt: true },
    });
    if (!session) throw new NotFoundException('Class not found.');
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { renewalDate: true, durationMinutes: true },
    });
    const durationMs = new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime();
    const durationMin = Math.round(durationMs / 60000) || sub?.durationMinutes || 60;
    const now = new Date();
    const earliest = new Date(now.getTime() + SubscriptionsService.RESCHEDULE_MIN_NOTICE_HOURS * 3600 * 1000);
    const cycleEnd = sub?.renewalDate ? new Date(sub.renewalDate) : subscriptionCycleEnd(now);
    const horizon = new Date(earliest.getTime() + SubscriptionsService.RESCHEDULE_SLOT_HORIZON_DAYS * 86400000);
    const windowEnd = new Date(Math.min(cycleEnd.getTime(), horizon.getTime()));
    const result = { durationMinutes: durationMin, cycleEnd: cycleEnd.toISOString(), days: [] as { date: string; slots: { startsAt: string; endsAt: string; label: string }[] }[] };
    if (windowEnd <= earliest) return result;

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: session.teacherId },
      select: { availability: true, timeZone: true, userId: true },
    });
    const tz = teacher?.timeZone || 'UTC';
    const avail = teacher?.availability ?? null;

    const [teacherBusy, studentBusy, holidays, leaves] = await Promise.all([
      this.prisma.classSession.findMany({
        where: { teacherId: session.teacherId, status: 'SCHEDULED', id: { not: sessionId }, startsAt: { lt: windowEnd }, endsAt: { gt: earliest } },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.classSession.findMany({
        where: { status: 'SCHEDULED', id: { not: sessionId }, attendees: { some: { studentId } }, startsAt: { lt: windowEnd }, endsAt: { gt: earliest } },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.announcement.findMany({
        where: { type: 'HOLIDAY', active: true, publishedAt: { not: null, lte: windowEnd }, OR: [{ expiresAt: { gte: earliest } }, { expiresAt: null, publishedAt: { gte: earliest } }] },
        select: { publishedAt: true, expiresAt: true },
      }),
      teacher?.userId
        ? this.prisma.leaveRequest.findMany({
            where: { userId: teacher.userId, status: 'APPROVED', endDate: { gte: new Date(earliest.getTime() - 86400000) }, startDate: { lte: windowEnd } },
            select: { startDate: true, endDate: true },
          })
        : Promise.resolve([] as { startDate: Date; endDate: Date }[]),
    ]);
    const overlaps = (list: { startsAt: Date; endsAt: Date }[], s: Date, e: Date) =>
      list.some((x) => new Date(x.startsAt) < e && new Date(x.endsAt) > s);
    // Approved teacher leave, expanded to end-of-day on the last day (matches
    // teacherOnLeave + cancelClassesForLeave). A slot inside any leave is dropped.
    const leaveWindows = leaves.map((l) => {
      const to = new Date(l.endDate);
      to.setHours(23, 59, 59, 999);
      return { from: new Date(l.startDate), to };
    });
    const onLeave = (s: Date, e: Date) => leaveWindows.some((w) => w.from < e && w.to > s);
    const holOnDay = (dayStart: Date, dayEnd: Date) =>
      holidays.some((h) => {
        const p = h.publishedAt ? new Date(h.publishedAt) : null;
        if (!p) return false;
        const x = h.expiresAt ? new Date(h.expiresAt) : p;
        return p <= dayEnd && x >= dayStart;
      });

    const STEP = 30;
    const MAX_TOTAL = 300;
    let total = 0;
    const cursor = new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), earliest.getUTCDate()));
    for (; cursor < windowEnd && total < MAX_TOTAL; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const dayStart = new Date(cursor);
      const dayEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 23, 59, 59));
      if (holOnDay(dayStart, dayEnd)) continue;
      const slots: { startsAt: string; endsAt: string; label: string }[] = [];
      for (let m = 0; m < 24 * 60 && total < MAX_TOTAL; m += STEP) {
        const start = new Date(cursor);
        start.setUTCHours(Math.floor(m / 60), m % 60, 0, 0);
        const end = new Date(start.getTime() + durationMin * 60000);
        if (start < earliest || end > cycleEnd) continue;
        if (!this.slotWithinWindows(avail, tz, start, end)) continue;
        if (onLeave(start, end)) continue;
        if (overlaps(teacherBusy, start, end)) continue;
        if (overlaps(studentBusy, start, end)) continue;
        slots.push({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          label: `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`,
        });
        total++;
      }
      if (slots.length) {
        result.days.push({
          date: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`,
          slots,
        });
      }
    }
    return result;
  }

  /** Student's own slot picker — verifies the class is theirs first. */
  async myRescheduleSlots(userId: string, sessionId: string) {
    const student = await this.studentByUserId(userId);
    const attends = await this.prisma.classAttendee.count({ where: { classId: sessionId, studentId: student.id } });
    if (!attends) throw new ForbiddenException('That class is not yours.');
    return this.rescheduleSlotsFor(sessionId, student.id);
  }

  // ── Teacher-initiated reschedule (spec: requires academic-coach approval) ────

  private async teacherByUserId(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new NotFoundException('Teacher profile not found.');
    return teacher;
  }

  /** The one student on a class (solo subscription batches), if any. */
  private async classStudentId(classId: string): Promise<string | null> {
    const a = await this.prisma.classAttendee.findFirst({ where: { classId }, select: { studentId: true } });
    return a?.studentId ?? null;
  }

  /** The teacher's upcoming reschedulable classes, with the per-student counter. */
  async teacherReschedulableClasses(userId: string) {
    const teacher = await this.teacherByUserId(userId);
    const now = new Date();
    const sessions = await this.prisma.classSession.findMany({
      where: { teacherId: teacher.id, status: 'SCHEDULED', cycleLocked: false, startsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      take: 100,
      select: {
        id: true, title: true, startsAt: true, endsAt: true,
        attendees: { take: 1, select: { student: { select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } } } },
      },
    });
    const studentIds = [...new Set(sessions.map((s) => s.attendees[0]?.student?.id).filter(Boolean) as string[])];
    const subs = studentIds.length
      ? await this.prisma.studentSubscription.findMany({
          where: { studentId: { in: studentIds }, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          select: { studentId: true, teacherRescheduleCounter: true },
        })
      : [];
    const counterByStudent = new Map(subs.map((s) => [s.studentId, s.teacherRescheduleCounter]));
    const pending = await this.prisma.classRescheduleRequest.findMany({
      where: { teacherId: teacher.id, status: 'PENDING' },
      select: { classSessionId: true },
    });
    const pendingSet = new Set(pending.map((p) => p.classSessionId));
    return sessions.map((s) => {
      const st = s.attendees[0]?.student;
      const used = st ? counterByStudent.get(st.id) ?? 0 : 0;
      return {
        id: s.id,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        student: st ? { id: st.id, code: st.studentCode, name: `${st.user.firstName} ${st.user.lastName}`.trim() } : null,
        used,
        limit: SubscriptionsService.TEACHER_RESCHEDULE_LIMIT,
        left: Math.max(0, SubscriptionsService.TEACHER_RESCHEDULE_LIMIT - used),
        pending: pendingSet.has(s.id),
      };
    });
  }

  /** Teacher slot picker — verifies the class is theirs, then lists slots. */
  async teacherRescheduleSlots(userId: string, sessionId: string) {
    const teacher = await this.teacherByUserId(userId);
    const session = await this.prisma.classSession.findUnique({ where: { id: sessionId }, select: { teacherId: true } });
    if (!session) throw new NotFoundException('Class not found.');
    if (session.teacherId !== teacher.id) throw new ForbiddenException('That class is not yours.');
    const studentId = await this.classStudentId(sessionId);
    if (!studentId) throw new BadRequestException('That class has no student to reschedule for.');
    return this.rescheduleSlotsFor(sessionId, studentId);
  }

  async teacherRequestReschedule(userId: string, sessionId: string, newStartsAtIso: string, reason?: string) {
    const teacher = await this.teacherByUserId(userId);
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teacherId: true, startsAt: true, endsAt: true, status: true, cycleLocked: true },
    });
    if (!session) throw new NotFoundException('Class not found.');
    if (session.teacherId !== teacher.id) throw new ForbiddenException('That class is not yours to reschedule.');
    if (session.status !== 'SCHEDULED') throw new BadRequestException('Only a scheduled class can be moved.');
    if (session.cycleLocked) throw new BadRequestException('That class belongs to a closed billing cycle and can no longer be moved.');
    const now = new Date();
    if (new Date(session.startsAt) <= now) throw new BadRequestException('That class has already started or passed.');

    const studentId = await this.classStudentId(sessionId);
    if (!studentId) throw new BadRequestException('That class has no student to reschedule for.');
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) throw new BadRequestException('This student has no active subscription.');

    // Lazy per-cycle reset (mirrors the student flow) so the counter is fresh.
    if (sub.renewalDate && now > new Date(sub.renewalDate)) {
      let nextRenewal = new Date(sub.renewalDate);
      while (nextRenewal <= now) nextRenewal = subscriptionCycleEnd(nextRenewal);
      await this.prisma.studentSubscription.update({
        where: { id: sub.id },
        data: { rescheduleCounter: 0, teacherRescheduleCounter: 0, minutesUsed: 0, renewalDate: nextRenewal },
      });
      sub.teacherRescheduleCounter = 0;
      sub.renewalDate = nextRenewal;
    }

    if (sub.teacherRescheduleCounter >= SubscriptionsService.TEACHER_RESCHEDULE_LIMIT) {
      throw new BadRequestException('You have reached the maximum reschedule limit for this student during the current billing cycle.');
    }

    const noticeMs = SubscriptionsService.RESCHEDULE_MIN_NOTICE_HOURS * 3600 * 1000;
    const NOTICE_MSG = 'Classes can only be rescheduled at least 4 hours before the scheduled start time.';
    if (new Date(session.startsAt).getTime() - now.getTime() < noticeMs) throw new BadRequestException(NOTICE_MSG);

    const newStart = new Date(newStartsAtIso);
    if (isNaN(newStart.getTime())) throw new BadRequestException('Invalid new time.');
    const durationMs = new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);
    if (newStart.getTime() - now.getTime() < noticeMs) throw new BadRequestException(NOTICE_MSG);
    if (sub.renewalDate && newEnd > new Date(sub.renewalDate)) {
      throw new BadRequestException('Rescheduled classes must be completed before the end of the current billing cycle.');
    }
    if (await this.isHoliday(newStart)) throw new BadRequestException('That date is a holiday. Please choose another slot.');
    if (await this.teacherOnLeave(teacher.id, newStart, newEnd)) throw new BadRequestException('You are on approved leave then. Please choose another slot.');
    if (!(await this.isWithinTeacherAvailability(teacher.id, newStart, newEnd))) {
      throw new BadRequestException("That time is outside your available hours.");
    }
    const clash = await this.prisma.classSession.count({
      where: { teacherId: teacher.id, id: { not: sessionId }, status: 'SCHEDULED', startsAt: { lt: newEnd }, endsAt: { gt: newStart } },
    });
    if (clash) throw new BadRequestException('You already have another class at that time.');
    const studentClash = await this.prisma.classSession.count({
      where: { id: { not: sessionId }, status: 'SCHEDULED', startsAt: { lt: newEnd }, endsAt: { gt: newStart }, attendees: { some: { studentId } } },
    });
    if (studentClash) throw new BadRequestException('The student already has another class at that time.');
    const open = await this.prisma.classRescheduleRequest.findFirst({ where: { classSessionId: sessionId, status: 'PENDING' }, select: { id: true } });
    if (open) throw new BadRequestException('A reschedule request for this class is already awaiting approval.');

    const request = await this.prisma.classRescheduleRequest.create({
      data: {
        classSessionId: sessionId,
        studentId,
        teacherId: teacher.id,
        requestedById: userId,
        oldStartsAt: session.startsAt,
        oldEndsAt: session.endsAt,
        newStartsAt: newStart,
        newEndsAt: newEnd,
        reason: reason?.trim() || null,
      },
    });

    const whenOld = new Date(session.startsAt).toISOString().slice(0, 16).replace('T', ' ');
    const whenNew = newStart.toISOString().slice(0, 16).replace('T', ' ');
    await this.audit(
      studentId,
      'TEACHER_RESCHEDULE_REQUESTED',
      'Teacher requested a reschedule',
      `${whenOld} → ${whenNew} (awaiting coach approval).`,
      { id: userId, role: 'TEACHER' },
      { requestId: request.id, sessionId },
    ).catch(() => undefined);
    await this.notifyTeacherRescheduleSubmitted(studentId, whenNew).catch(() => undefined);
    return request;
  }

  /* On submit: notify the student, the coach and the supervisors (spec step 7). */
  private async notifyTeacherRescheduleSubmitted(studentId: string, whenNew: string): Promise<void> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true, coachId: true, user: { select: { firstName: true, lastName: true } } },
    });
    const name = student?.user ? `${student.user.firstName} ${student.user.lastName}`.trim() : 'A student';
    const jobs: Promise<unknown>[] = [];
    if (student?.userId) {
      jobs.push(this.notifications.createFor(student.userId, { type: 'TEACHER_RESCHEDULE_REQUEST', title: 'Your teacher requested a reschedule', body: `Your teacher has asked to move a class to ${whenNew}. It is awaiting coach approval.`, link: '/student/subscription' }));
    }
    if (student?.coachId) {
      jobs.push(this.notifications.createFor(student.coachId, { type: 'TEACHER_RESCHEDULE_REQUEST', title: 'Teacher reschedule pending approval', body: `A teacher asked to move ${name}'s class to ${whenNew}.`, link: '/reschedule-requests' }));
    }
    jobs.push(this.notifications.createForRoles([Role.ADMIN, Role.SUPERVISOR], { type: 'TEACHER_RESCHEDULE_REQUEST', title: 'Teacher reschedule pending', body: `A teacher asked to move ${name}'s class to ${whenNew}.`, link: '/reschedule-requests' }));
    await Promise.all(jobs.map((p) => (p as Promise<unknown>).catch(() => undefined)));
  }

  // ── Staff: list + review teacher reschedule requests ────────────────────────

  async listRescheduleRequests(dto: { status?: string; page?: number; limit?: number }, actor: Actor) {
    const { status, page = 1, limit = 50 } = dto;
    const where: any = { ...(await this.scopeFor(actor)), ...(status ? { status } : {}) };
    const rows = await this.prisma.classRescheduleRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const [students, teachers] = await Promise.all([
      studentIds.length
        ? this.prisma.studentProfile.findMany({ where: { id: { in: studentIds } }, select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } })
        : [],
      teacherIds.length
        ? this.prisma.teacherProfile.findMany({ where: { id: { in: teacherIds } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } })
        : [],
    ]);
    const sById = new Map(students.map((s) => [s.id, s]));
    const tById = new Map(teachers.map((t) => [t.id, t]));
    return rows.map((r) => {
      const s = sById.get(r.studentId);
      const t = tById.get(r.teacherId);
      return {
        id: r.id,
        status: r.status,
        oldStartsAt: r.oldStartsAt,
        newStartsAt: r.newStartsAt,
        reason: r.reason,
        reviewNotes: r.reviewNotes,
        reviewedByName: r.reviewedByName,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        appliedAt: r.appliedAt,
        student: s ? { id: s.id, code: s.studentCode, name: `${s.user.firstName} ${s.user.lastName}`.trim() } : null,
        teacher: t ? { id: t.id, name: `${t.user.firstName} ${t.user.lastName}`.trim() } : null,
      };
    });
  }

  /*
   * Student-initiated reschedules are auto-applied — they never create an
   * approval row, so they don't appear in listRescheduleRequests. They ARE
   * audited (type='CLASS_RESCHEDULED'), so this read-only feed lets staff see
   * them alongside the teacher-approval queue for a complete picture. Coach-
   * scoped the same way as everything else here.
   */
  async listStudentReschedules(dto: { page?: number; limit?: number }, actor: Actor) {
    const { page = 1, limit = 50 } = dto;
    const where: any = { kind: 'AUDIT', type: 'CLASS_RESCHEDULED', ...(await this.scopeFor(actor)) };
    const rows = await this.prisma.studentActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const students = studentIds.length
      ? await this.prisma.studentProfile.findMany({ where: { id: { in: studentIds } }, select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } })
      : [];
    const sById = new Map(students.map((s) => [s.id, s]));
    return rows.map((r) => {
      const s = sById.get(r.studentId);
      const meta = (r.meta ?? {}) as any;
      return {
        id: r.id,
        createdAt: r.createdAt,
        description: r.description,
        oldStartsAt: meta.oldStartsAt ?? null,
        newStartsAt: meta.newStartsAt ?? null,
        actorName: r.actorName,
        student: s ? { id: s.id, code: s.studentCode, name: `${s.user.firstName} ${s.user.lastName}`.trim() } : null,
      };
    });
  }

  async reviewTeacherReschedule(id: string, dto: { approve: boolean; notes?: string }, actor: Actor) {
    const request = await this.prisma.classRescheduleRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found.');
    await this.assertStaffScope(actor, request.studentId);
    if (request.status !== 'PENDING') throw new BadRequestException('This request has already been decided.');

    const teacherUser = await this.prisma.teacherProfile.findUnique({ where: { id: request.teacherId }, select: { userId: true } });
    const student = await this.prisma.studentProfile.findUnique({ where: { id: request.studentId }, select: { userId: true } });

    if (!dto.approve) {
      const rejected = await this.prisma.classRescheduleRequest.update({
        where: { id },
        data: { status: 'REJECTED', reviewNotes: dto.notes?.trim() || null, reviewedById: actor?.id ?? null, reviewedByName: actor?.name ?? null, reviewedAt: new Date() },
      });
      await this.audit(request.studentId, 'TEACHER_RESCHEDULE_REJECTED', 'Teacher reschedule rejected', dto.notes?.trim() || 'No schedule change made.', actor, { requestId: id }).catch(() => undefined);
      // Spec step 7 on rejection: notify Teacher and Student.
      if (teacherUser) {
        this.notifications.createFor(teacherUser.userId, { type: 'TEACHER_RESCHEDULE_DECIDED', title: 'Your reschedule request was not approved', body: dto.notes?.trim() || 'The academic coach did not approve the reschedule.', link: '/teacher/classes' }).catch(() => undefined);
      }
      if (student) {
        this.notifications.createFor(student.userId, { type: 'TEACHER_RESCHEDULE_DECIDED', title: 'A reschedule request was declined', body: 'Your class stays at its scheduled time.', link: '/student/subscription' }).catch(() => undefined);
      }
      return rejected;
    }

    // Approve — re-validate the class is still moveable and the slot still free.
    const session = await this.prisma.classSession.findUnique({
      where: { id: request.classSessionId },
      select: { status: true, cycleLocked: true },
    });
    if (!session || session.status !== 'SCHEDULED' || session.cycleLocked) {
      throw new BadRequestException('That class can no longer be moved.');
    }
    const clash = await this.prisma.classSession.count({
      where: { teacherId: request.teacherId, id: { not: request.classSessionId }, status: 'SCHEDULED', startsAt: { lt: request.newEndsAt }, endsAt: { gt: request.newStartsAt } },
    });
    if (clash) throw new BadRequestException('The teacher is no longer free at that time.');
    // Leave may have been approved between the request and this review.
    if (await this.teacherOnLeave(request.teacherId, new Date(request.newStartsAt), new Date(request.newEndsAt))) {
      throw new BadRequestException('The teacher is now on approved leave at that time.');
    }

    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId: request.studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.classSession.update({ where: { id: request.classSessionId }, data: { startsAt: request.newStartsAt, endsAt: request.newEndsAt } }),
      this.prisma.classRescheduleRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewNotes: dto.notes?.trim() || null, reviewedById: actor?.id ?? null, reviewedByName: actor?.name ?? null, reviewedAt: new Date(), appliedAt: new Date() },
      }),
      ...(sub ? [this.prisma.studentSubscription.update({ where: { id: sub.id }, data: { teacherRescheduleCounter: { increment: 1 } } })] : []),
    ]);

    const whenNew = new Date(request.newStartsAt).toISOString().slice(0, 16).replace('T', ' ');
    await this.audit(request.studentId, 'TEACHER_RESCHEDULE_APPROVED', 'Teacher reschedule approved', `Class moved to ${whenNew}.`, actor, { requestId: id, sessionId: request.classSessionId }).catch(() => undefined);
    // The moved-class notification (student + teacher + coach + supervisor)…
    await this.notifyClassRescheduled(request.studentId, request.teacherId, new Date(request.newStartsAt), 'by the teacher').catch(() => undefined);
    // …plus the decision itself to the teacher.
    if (teacherUser) {
      this.notifications.createFor(teacherUser.userId, { type: 'TEACHER_RESCHEDULE_DECIDED', title: 'Your reschedule request was approved', body: `The class has been moved to ${whenNew}.`, link: '/teacher/classes' }).catch(() => undefined);
    }
    return this.prisma.classRescheduleRequest.findUnique({ where: { id } });
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

  /*
   * The current teacher's published availability, so the student's package /
   * schedule pickers can show ONLY the days and times that teacher can actually
   * teach — the spec's "time displayed should be only Teacher Availability time
   * and Day". Windows are returned as stored (same clock the approval check and
   * the coach's schedule-check compare against). Null teacher when the student
   * has no batch yet.
   */
  async myScheduleAvailability(userId: string) {
    const student = await this.studentByUserId(userId);
    const current = await this.currentFor(student.id);
    const batchId = current.schedule[0]?.batchId ?? null;
    const durationMinutes = current.record?.durationMinutes ?? 60;
    let teacher:
      | { id: string; name: string; timeZone: string | null; windows: Record<string, { from?: string; to?: string }[]> }
      | null = null;
    if (batchId) {
      const batch = await this.prisma.batch.findUnique({ where: { id: batchId }, select: { teacherId: true } });
      if (batch?.teacherId) {
        const tp = await this.prisma.teacherProfile.findUnique({
          where: { id: batch.teacherId },
          select: { availability: true, timeZone: true, user: { select: { firstName: true, lastName: true } } },
        });
        if (tp) {
          teacher = {
            id: batch.teacherId,
            name: `${tp.user.firstName} ${tp.user.lastName}`.trim(),
            timeZone: tp.timeZone ?? null,
            windows: (tp.availability ?? {}) as Record<string, { from?: string; to?: string }[]>,
          };
        }
      }
    }
    return { batchId, durationMinutes, teacher };
  }

  /* The userId of the teacher currently teaching this student, if any. */
  private async currentTeacherUserId(studentId: string): Promise<string | null> {
    const sub = await this.activeSubscriptionFor(studentId);
    let batchId = sub?.batchId ?? null;
    if (!batchId) {
      const bl = await this.prisma.batchStudent.findFirst({ where: { studentId }, select: { batchId: true } });
      batchId = bl?.batchId ?? null;
    }
    if (!batchId) return null;
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId }, select: { teacherId: true } });
    if (!batch?.teacherId) return null;
    const tp = await this.prisma.teacherProfile.findUnique({ where: { id: batch.teacherId }, select: { userId: true } });
    return tp?.userId ?? null;
  }

  private async studentDisplayName(studentId: string): Promise<string> {
    const s = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { user: { select: { firstName: true, lastName: true } } },
    });
    return s?.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : 'A student';
  }

  /*
   * Tell the current teacher that a student's package/schedule change was
   * approved — the spec's "Student (name) has changed the package or the Time
   * and Day". Fired at approval; the change itself lands next cycle.
   */
  private async notifyTeacherOfStudentChange(studentId: string, summary: string): Promise<void> {
    const teacherUserId = await this.currentTeacherUserId(studentId);
    if (!teacherUserId) return;
    const name = await this.studentDisplayName(studentId);
    this.notifications
      .createFor(teacherUserId, {
        type: 'SCHEDULE_CHANGED',
        title: 'A student change was approved',
        body: `${name}: ${summary}. It applies from the next billing cycle.`,
        link: '/teacher/students',
      })
      .catch(() => undefined);
  }

  /*
   * A break lifecycle event (submitted / approved-for-later / rejected) reaching
   * the teacher, coach and supervisor. The student is notified separately with a
   * message written for them, so `studentUserId` is omitted here to avoid a
   * duplicate. Start/resume use notifyBreakAll instead (richer, dated messages).
   */
  private async notifyBreakLifecycle(
    studentId: string,
    opts: { type: 'BREAK_REQUESTED' | 'BREAK_DECIDED'; title: string; body: string },
  ): Promise<void> {
    const student = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, select: { coachId: true } });
    const teacherUserId = await this.currentTeacherUserId(studentId);
    const jobs: Promise<unknown>[] = [];
    if (teacherUserId) {
      jobs.push(this.notifications.createFor(teacherUserId, { type: opts.type, title: opts.title, body: opts.body, link: '/teacher/students' }));
    }
    if (student?.coachId) {
      jobs.push(this.notifications.createFor(student.coachId, { type: opts.type, title: opts.title, body: opts.body, link: `/students/${studentId}` }));
    }
    jobs.push(this.notifications.createForRoles([Role.SUPERVISOR], { type: opts.type, title: opts.title, body: opts.body, link: '/subscription-requests' }));
    await Promise.all(jobs.map((p) => (p as Promise<unknown>).catch(() => undefined)));
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

    // A running break derives ACTIVE from the fee assignment (autoGenerate stays
    // on), so it has to be caught on the stored record — no change can be raised
    // while classes are paused; it lands once the break resumes.
    const stored = await this.activeSubscriptionFor(studentId);
    if (stored?.status === 'ON_BREAK') {
      throw new BadRequestException(
        'Your subscription is on a break. Changes can be requested once it resumes.',
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
          : type === SubscriptionRequestType.BREAK_REQUEST
            ? 'You already have a break request waiting for approval.'
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

    /*
     * A package change may carry a new schedule chosen for the new class count.
     * When it does, the days and time must sit inside the current teacher's
     * published hours — the same rule a schedule change obeys — so a coach is
     * never asked to approve a slot the teacher cannot actually teach.
     */
    const wantsSchedule = !!(dto.days?.length && dto.time);
    let scheduleBatchId: string | null = null;
    if (wantsSchedule) {
      const batchLink = current.schedule[0];
      scheduleBatchId = batchLink?.batchId ?? null;
      const batch = scheduleBatchId
        ? await this.prisma.batch.findUnique({
            where: { id: scheduleBatchId },
            select: { teacherId: true },
          })
        : null;
      const duration = current.record?.durationMinutes ?? 60;
      await this.assertScheduleWithinAvailability(batch?.teacherId, dto.days, dto.time, duration);
    }

    const request = await this.prisma.subscriptionRequest.create({
      data: {
        studentId: student.id,
        type: SubscriptionRequestType.PACKAGE_CHANGE,
        requestedPackageId: wanted.id,
        requestedDays: wantsSchedule ? dto.days! : [],
        requestedTime: wantsSchedule ? dto.time! : null,
        batchId: scheduleBatchId,
        reason: dto.reason?.trim() || null,
        fromLabel: current.package
          ? `${current.package.name} · ${current.package.classesPerMonth} classes/month`
          : 'No package on record',
        toLabel: `${wanted.name} · ${wanted.classesPerMonth} classes/month${
          wantsSchedule ? ` · ${dto.days!.join(', ')} ${dto.time}` : ''
        }`,
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
      breakStartDate: r.breakStartDate,
      breakEndDate: r.breakEndDate,
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
            id: true, name: true, classesPerMonth: true, feePlanId: true, rescheduleLimit: true,
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
        // Reschedule allowance the new package carries — the spec's impact
        // preview lists "reschedules" alongside price and hours.
        reschedulesFrom: current.record?.rescheduleLimit ?? 0,
        reschedulesTo: request.requestedPackage.rescheduleLimit ?? 0,
      };
    }

    /*
     * The schedule feasibility block. Shown for a schedule change, and also for
     * a package change that carries a new day/time — so the coach sees the
     * teacher-availability check for the timetable coming with the bigger package.
     */
    let schedule: any = null;
    if (request.batchId && request.requestedDays.length && request.requestedTime) {
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

    // The student's own clashes at the requested time (their other active batches).
    const studentClashes = await this.studentScheduleClashes(
      request.studentId,
      batch.id,
      request.requestedDays,
      request.requestedTime,
    );

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
      studentClashes,
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
      // A rejected break is still a break lifecycle event (§8.4) — the teacher,
      // coach and supervisor are told it will not happen.
      if (request.type === SubscriptionRequestType.BREAK_REQUEST) {
        await this.notifyBreakLifecycle(request.studentId, {
          type: 'BREAK_DECIDED',
          title: 'A student break was declined',
          body: `${request.toLabel} was not approved.`,
        }).catch(() => undefined);
      }
      return rejected;
    }

    // ── Approve a BREAK: not a next-cycle change — schedule the break window ──
    if (request.type === SubscriptionRequestType.BREAK_REQUEST) {
      return this.approveBreak(request, dto, actor, student?.userId);
    }

    // ── Approve: write the next cycle ───────────────────────────────────────
    const next: any = {};
    let targetBatchId: string | null = null;

    if (request.type === SubscriptionRequestType.PACKAGE_CHANGE) {
      if (!request.requestedPackageId) {
        throw new BadRequestException('This request has no package on it.');
      }
      next.nextPackageId = request.requestedPackageId;
      /*
       * A package change that carried a new schedule queues that schedule too,
       * retimed in place on the student's own batch — so the bigger package and
       * the days/time chosen for it land together at the cycle turn.
       */
      if (request.requestedDays.length && request.requestedTime && request.batchId) {
        const ctx = await this.scheduleContext({
          batchId: request.batchId,
          studentId: request.studentId,
          requestedDays: request.requestedDays,
          requestedTime: request.requestedTime,
        });
        if (ctx?.canRetimeInPlace) {
          next.nextDays = request.requestedDays;
          next.nextTime = request.requestedTime;
          next.nextBatchId = ctx.batch.id;
        }
      }
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

    // The teacher hears about it too — "Student X has changed the package / the
    // Time and Day" — at approval, with the details of what is coming next cycle.
    await this.notifyTeacherOfStudentChange(
      request.studentId,
      request.type === SubscriptionRequestType.PACKAGE_CHANGE
        ? `package change (${request.toLabel})`
        : `schedule change (${request.toLabel})`,
    ).catch(() => undefined);

    return updated;
  }

  // ── Break management (spec §8) ─────────────────────────────────────────────

  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  /** UTC-midnight of a date — a break is measured in whole days. */
  private toUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /*
   * Raise a break request. Shared by the student's own portal and a coach
   * raising one on their behalf. Validates the window and the current state
   * (must have an ACTIVE subscription that is not already on / scheduled for a
   * break), records it, and alerts the coach, admins and the supervisor.
   */
  private async createBreakRequest(
    studentId: string,
    ackUserId: string | null,
    dto: RequestBreakDto,
    actor: Actor,
  ) {
    await this.assertCanRequest(studentId, SubscriptionRequestType.BREAK_REQUEST);

    const sub = await this.activeSubscriptionFor(studentId);
    if (!sub) throw new BadRequestException('No active subscription to pause.');
    if (sub.status === 'ON_BREAK') throw new BadRequestException('This subscription is already on a break.');
    if (sub.breakStartDate || sub.breakEndDate) {
      throw new BadRequestException('A break is already scheduled for this subscription.');
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Enter valid break dates.');
    }
    const startDay = this.toUtcDay(start);
    const endDay = this.toUtcDay(end);
    const todayDay = this.toUtcDay(new Date());
    if (startDay < todayDay) throw new BadRequestException('A break cannot start in the past.');
    if (endDay <= startDay) throw new BadRequestException('The break end date must be after the start date.');

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const request = await this.prisma.subscriptionRequest.create({
      data: {
        studentId,
        type: SubscriptionRequestType.BREAK_REQUEST,
        breakStartDate: startDay,
        breakEndDate: endDay,
        reason: dto.reason?.trim() || null,
        fromLabel: 'Active subscription',
        toLabel: `Break ${fmt(startDay)} → ${fmt(endDay)}`,
      },
    });

    await this.audit(
      studentId,
      'SUBSCRIPTION_BREAK_REQUESTED',
      'Break requested',
      request.toLabel ?? 'Break requested',
      actor,
      { requestId: request.id },
    );
    if (ackUserId) {
      this.notifications
        .createFor(ackUserId, {
          type: 'SUBSCRIPTION_REQUEST_SUBMITTED',
          title: 'Your break request has been submitted',
          body: 'A coach will review your break request.',
          link: '/student/subscription',
        })
        .catch(() => undefined);
    }
    await this.notifyStaff(studentId, 'New break request pending', `Break: ${request.toLabel}`);
    this.notifications
      .createForRoles([Role.SUPERVISOR], {
        type: 'BREAK_REQUESTED',
        title: 'New break request',
        body: `A student requested a break (${request.toLabel}).`,
        link: '/subscription-requests',
      })
      .catch(() => undefined);
    // The teacher is told a break has been asked for (§8.4 — student, teacher,
    // coach and supervisor are all notified on submission).
    const teacherUserId = await this.currentTeacherUserId(studentId);
    if (teacherUserId) {
      this.notifications
        .createFor(teacherUserId, {
          type: 'BREAK_REQUESTED',
          title: 'A student requested a break',
          body: `${request.toLabel} — pending coach approval.`,
          link: '/teacher/students',
        })
        .catch(() => undefined);
    }

    return request;
  }

  /** Student raising their own break from the portal. */
  async requestBreak(userId: string, dto: RequestBreakDto, actor: Actor) {
    const student = await this.studentByUserId(userId);
    return this.createBreakRequest(student.id, userId, dto, actor);
  }

  /** Coach/admin raising a break on a student's behalf (phone / WhatsApp / chat). */
  async requestBreakForStudent(studentId: string, dto: RequestBreakDto, actor: Actor) {
    await this.assertStaffScope(actor, studentId);
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true },
    });
    if (!student) throw new NotFoundException('Student not found.');
    return this.createBreakRequest(studentId, student.userId, dto, actor);
  }

  /*
   * Approve a break: it is NOT a next-cycle change. The approved window is
   * copied onto the subscription, and the cron drives the ON_BREAK / resume
   * transitions. A break whose start is already here begins immediately rather
   * than waiting for the next sweep.
   */
  private async approveBreak(
    request: {
      id: string;
      studentId: string;
      breakStartDate: Date | null;
      breakEndDate: Date | null;
      toLabel: string | null;
    },
    dto: ReviewSubscriptionRequestDto,
    actor: Actor,
    studentUserId?: string,
  ) {
    if (!request.breakStartDate || !request.breakEndDate) {
      throw new BadRequestException('This break request has no dates.');
    }
    const sub = await this.activeSubscriptionFor(request.studentId);
    if (!sub) throw new BadRequestException('This student has no active subscription to pause.');
    if (sub.status === 'ON_BREAK') throw new BadRequestException('This student is already on a break.');

    const updated = await this.prisma.subscriptionRequest.update({
      where: { id: request.id },
      data: {
        status: SubscriptionRequestStatus.APPROVED,
        reviewNotes: dto.notes?.trim() || null,
        decidedAt: new Date(),
        decidedById: actor?.id ?? null,
        decidedByName: actor?.name ?? null,
      },
    });
    await this.prisma.studentSubscription.update({
      where: { id: sub.id },
      data: { breakStartDate: request.breakStartDate, breakEndDate: request.breakEndDate },
    });

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    await this.audit(
      request.studentId,
      'SUBSCRIPTION_BREAK_APPROVED',
      'Break approved',
      `${request.toLabel} (applies on the start date)`,
      actor,
      { requestId: request.id },
    );
    if (studentUserId) {
      this.notifications
        .createFor(studentUserId, {
          type: 'BREAK_DECIDED',
          title: 'Your break has been approved',
          body: `Your subscription will pause from ${fmt(request.breakStartDate)} and resume on ${fmt(request.breakEndDate)}.`,
          link: '/student/subscription',
        })
        .catch(() => undefined);
    }

    // Already within (or past) the start — begin now instead of waiting a day
    // (startBreak notifies all four roles). A future-dated break is not running
    // yet, so tell the teacher, coach and supervisor it is scheduled.
    if (request.breakStartDate <= new Date()) {
      await this.startBreak(sub.id).catch(() => undefined);
    } else {
      await this.notifyBreakLifecycle(request.studentId, {
        type: 'BREAK_DECIDED',
        title: 'A student break was approved',
        body: `${request.toLabel} — classes will pause on the start date and the teacher slot stays reserved.`,
      }).catch(() => undefined);
    }
    return updated;
  }

  /*
   * Begin an approved break: pause the classes inside the window (cancelled, so
   * no hours are consumed), extend the cycle (renewalDate + fee run) by the break
   * duration so the next invoice is postponed, flip to ON_BREAK, and notify all
   * four roles. Idempotent — only acts on an ACTIVE subscription with a window.
   */
  /**
   * Module 9 §9.5 option 1 — "wait for the same teacher".
   *
   * The student is not taking a break; their TEACHER is away. The mechanics are
   * identical (pause the classes, push the cycle out by the same span, keep the
   * batch and its reserved slot untouched) so this reuses the break path rather
   * than growing a second copy of the billing arithmetic — the one place a
   * divergence would quietly cost a family money. What differs is the wording,
   * which is why it is a separate entry point and not a flag.
   *
   * Returns the days the cycle moved, so the coach can be shown the answer.
   */
  async pauseForTeacherUnavailability(subId: string, from: Date, to: Date): Promise<number> {
    const sub = await this.prisma.studentSubscription.findUnique({ where: { id: subId } });
    if (!sub || sub.status !== 'ACTIVE') return 0;

    // The window runs to the END of the teacher's last day off, so a class that
    // evening is paused too. `startBreak` reads these fields.
    const start = new Date(from);
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999);
    if (end <= start) return 0;

    await this.prisma.studentSubscription.update({
      where: { id: subId },
      data: { breakStartDate: start, breakEndDate: end },
    });
    const ok = await this.startBreak(subId, 'TEACHER_UNAVAILABILITY');
    if (!ok) {
      // Put the window back rather than leaving a half-applied pause behind.
      await this.prisma.studentSubscription
        .update({ where: { id: subId }, data: { breakStartDate: null, breakEndDate: null } })
        .catch(() => undefined);
      return 0;
    }
    return Math.round((end.getTime() - start.getTime()) / SubscriptionsService.DAY_MS);
  }

  async startBreak(subId: string, cause: 'STUDENT_BREAK' | 'TEACHER_UNAVAILABILITY' = 'STUDENT_BREAK'): Promise<boolean> {
    const sub = await this.prisma.studentSubscription.findUnique({ where: { id: subId } });
    if (!sub || sub.status !== 'ACTIVE' || !sub.breakStartDate || !sub.breakEndDate) return false;
    const start = new Date(sub.breakStartDate);
    const end = new Date(sub.breakEndDate);
    const durationMs = Math.max(0, end.getTime() - start.getTime());
    const durationDays = Math.round(durationMs / SubscriptionsService.DAY_MS);

    if (sub.batchId) {
      await this.prisma.classSession
        .updateMany({
          where: { batchId: sub.batchId, status: 'SCHEDULED', startsAt: { gte: start, lt: end } },
          data: { status: 'CANCELLED' },
        })
        .catch(() => undefined);
    }

    const newRenewal = sub.renewalDate ? new Date(sub.renewalDate.getTime() + durationMs) : null;
    await this.prisma.studentSubscription.update({
      where: { id: sub.id },
      data: { status: 'ON_BREAK', ...(newRenewal ? { renewalDate: newRenewal } : {}) },
    });
    if (sub.feeAssignmentId) {
      const fa = await this.prisma.studentFeeAssignment.findUnique({
        where: { id: sub.feeAssignmentId },
        select: { nextRunAt: true },
      });
      if (fa?.nextRunAt) {
        await this.prisma.studentFeeAssignment
          .update({
            where: { id: sub.feeAssignmentId },
            data: { nextRunAt: new Date(fa.nextRunAt.getTime() + durationMs) },
          })
          .catch(() => undefined);
      }
    }
    // Only a student-requested break closes a BREAK_REQUEST. A teacher's
    // unavailability has no such request, and marking someone else's pending
    // break APPLIED would silently consume it.
    if (cause === 'STUDENT_BREAK') {
      await this.prisma.subscriptionRequest
        .updateMany({
          where: { studentId: sub.studentId, type: SubscriptionRequestType.BREAK_REQUEST, status: SubscriptionRequestStatus.APPROVED },
          data: { status: SubscriptionRequestStatus.APPLIED, appliedAt: new Date() },
        })
        .catch(() => undefined);
    }

    const byTeacher = cause === 'TEACHER_UNAVAILABILITY';
    await this.audit(
      sub.studentId,
      'SUBSCRIPTION_BREAK_STARTED',
      byTeacher ? 'Classes paused — teacher unavailable' : 'Break started',
      `${byTeacher ? 'Paused while the teacher is away' : 'Paused'} until ${end.toISOString().slice(0, 10)}; cycle extended ${durationDays} day(s). Teacher slot reserved.`,
      undefined,
    );
    await this.notifyBreakAll(sub.studentId, sub.batchId, 'BREAK_STARTED', start, end, cause).catch(() => undefined);
    return true;
  }

  /*
   * Resume after a break: flip to ACTIVE, clear the window, and regenerate the
   * classes from the resume date to the (extended) cycle end so the paused
   * classes are made up and none are lost. Idempotent — only acts on ON_BREAK.
   */
  async resumeBreak(subId: string, cause: 'STUDENT_BREAK' | 'TEACHER_UNAVAILABILITY' = 'STUDENT_BREAK'): Promise<boolean> {
    const sub = await this.prisma.studentSubscription.findUnique({ where: { id: subId } });
    if (!sub || sub.status !== 'ON_BREAK') return false;
    const end = sub.breakEndDate ? new Date(sub.breakEndDate) : new Date();

    await this.prisma.studentSubscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', breakStartDate: null, breakEndDate: null },
    });

    if (sub.batchId) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: sub.batchId },
        select: {
          courseId: true, teacherId: true, name: true,
          daysOfWeek: true, startTime: true,
          students: { select: { studentId: true } },
        },
      });
      const now = new Date();
      const from = end > now ? end : now;
      const to = sub.renewalDate ? new Date(sub.renewalDate) : subscriptionCycleEnd(from);
      if (batch?.teacherId && batch.startTime && batch.daysOfWeek.length && from < to) {
        await this.createSessionsFor({
          batchId: sub.batchId,
          courseId: batch.courseId,
          teacherId: batch.teacherId,
          name: batch.name,
          days: batch.daysOfWeek,
          startTime: batch.startTime,
          durationMinutes: sub.durationMinutes,
          from,
          to,
          studentIds: batch.students.map((s) => s.studentId),
        }).catch(() => 0);
      }
    }

    await this.audit(
      sub.studentId,
      'SUBSCRIPTION_BREAK_RESUMED',
      'Subscription resumed',
      'Break ended; classes resumed with the same teacher.',
      undefined,
    );
    await this.notifyBreakAll(sub.studentId, sub.batchId, 'BREAK_RESUMED', end, end, cause).catch(() => undefined);
    return true;
  }

  /*
   * The daily break sweep: start every break whose window has begun, resume every
   * one whose window has ended, and mop up any window that is already entirely in
   * the past (start then immediately resume) so nothing gets stuck ACTIVE.
   */
  async processBreaks(now: Date): Promise<{ started: number; resumed: number }> {
    let started = 0;
    let resumed = 0;

    const toStart = await this.prisma.studentSubscription.findMany({
      where: { status: 'ACTIVE', breakStartDate: { not: null, lte: now }, breakEndDate: { not: null, gt: now } },
      select: { id: true },
      take: 500,
    });
    for (const s of toStart) if (await this.startBreak(s.id).catch(() => false)) started++;

    const toResume = await this.prisma.studentSubscription.findMany({
      where: { status: 'ON_BREAK', breakEndDate: { not: null, lte: now } },
      select: { id: true },
      take: 500,
    });
    for (const s of toResume) if (await this.resumeBreak(s.id).catch(() => false)) resumed++;

    const stale = await this.prisma.studentSubscription.findMany({
      where: { status: 'ACTIVE', breakStartDate: { not: null, lte: now }, breakEndDate: { not: null, lte: now } },
      select: { id: true },
      take: 200,
    });
    for (const s of stale) {
      await this.startBreak(s.id).catch(() => undefined);
      await this.resumeBreak(s.id).catch(() => undefined);
    }

    return { started, resumed };
  }

  /* Break start / resume reaches student + teacher + coach + supervisor. */
  private async notifyBreakAll(
    studentId: string,
    batchId: string | null,
    kind: 'BREAK_STARTED' | 'BREAK_RESUMED',
    _start: Date,
    end: Date,
    cause: 'STUDENT_BREAK' | 'TEACHER_UNAVAILABILITY' = 'STUDENT_BREAK',
  ): Promise<void> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true, coachId: true, user: { select: { firstName: true, lastName: true } } },
    });
    let teacherUserId: string | null = null;
    if (batchId) {
      const b = await this.prisma.batch.findUnique({ where: { id: batchId }, select: { teacherId: true } });
      if (b?.teacherId) {
        const tp = await this.prisma.teacherProfile.findUnique({ where: { id: b.teacherId }, select: { userId: true } });
        teacherUserId = tp?.userId ?? null;
      }
    }
    const name = student?.user ? `${student.user.firstName} ${student.user.lastName}`.trim() : 'A student';
    const started = kind === 'BREAK_STARTED';
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    /*
     * A teacher's absence is not the family's break, and telling them "your
     * break has started" would read as something they asked for. Same pause,
     * different sentence.
     */
    const byTeacher = cause === 'TEACHER_UNAVAILABILITY';
    const title = started
      ? byTeacher ? 'Classes paused — your teacher is away' : 'Subscription break started'
      : byTeacher ? 'Your teacher is back — classes resumed' : 'Subscription resumed';
    const studentBody = started
      ? byTeacher
        ? `Your teacher is unavailable until ${fmt(end)}. Your classes are paused, your billing cycle has been extended by the same time, and your slot is held.`
        : `Your classes are paused until ${fmt(end)}. Your billing cycle has been extended and your teacher is reserved.`
      : byTeacher
        ? 'Your teacher is available again and your classes have resumed.'
        : 'Your break has ended and your classes have resumed.';
    const staffBody = started
      ? byTeacher
        ? `${name}'s classes are paused until ${fmt(end)} while their teacher is away (slot reserved, cycle extended).`
        : `${name}'s subscription is paused until ${fmt(end)} (teacher slot reserved).`
      : byTeacher
        ? `${name}'s classes resumed — their teacher is back.`
        : `${name}'s break has ended and classes resumed.`;

    const jobs: Promise<unknown>[] = [];
    if (student?.userId) {
      jobs.push(this.notifications.createFor(student.userId, { type: kind, title, body: studentBody, link: '/student/subscription' }));
    }
    if (teacherUserId) {
      jobs.push(
        this.notifications.createFor(teacherUserId, {
          type: kind,
          title: started ? `${name} is on a break` : `${name} has resumed`,
          body: staffBody,
          link: '/teacher/students',
        }),
      );
    }
    if (student?.coachId) {
      jobs.push(this.notifications.createFor(student.coachId, { type: kind, title, body: staffBody, link: `/students/${studentId}` }));
    }
    jobs.push(this.notifications.createForRoles([Role.SUPERVISOR], { type: kind, title, body: staffBody, link: '/subscription-requests' }));
    await Promise.all(jobs.map((p) => (p as Promise<unknown>).catch(() => undefined)));
  }

  // ── AC "Modify Schedule" with an explicit scope (the flow's scope dialog) ───

  /** A coach may only touch students they own; admin/supervisor anyone. */
  private async assertStaffScope(actor: Actor, studentId: string): Promise<void> {
    if (actor?.role !== Role.ACADEMIC_COACH) return;
    const p = await this.prisma.studentProfile.findFirst({
      where: { id: studentId, coachId: actor.id },
      select: { id: true },
    });
    if (!p) throw new ForbiddenException('This student is not one of yours.');
  }

  private async resolveModify(studentId: string, dto: ModifyScheduleDto) {
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { studentId, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) throw new BadRequestException('This student has no active subscription.');
    if (!sub.batchId) throw new BadRequestException('This student has no schedule to modify yet.');
    const batch = await this.prisma.batch.findUnique({
      where: { id: sub.batchId },
      select: {
        id: true, name: true, courseId: true, teacherId: true,
        daysOfWeek: true, startTime: true, endTime: true,
        students: { select: { studentId: true } },
      },
    });
    if (!batch) throw new BadRequestException('The batch no longer exists.');
    if (!dto.days?.length && !dto.time && !dto.teacherId) {
      throw new BadRequestException('Choose what to change — days, time or teacher.');
    }
    const newDays = dto.days?.length ? dto.days : batch.daysOfWeek;
    const newTime = dto.time ?? batch.startTime ?? '';
    const newTeacherId = dto.teacherId ?? batch.teacherId;
    const teacherChanged = !!dto.teacherId && dto.teacherId !== batch.teacherId;
    const otherStudents = batch.students.filter((s) => s.studentId !== studentId).length;
    return { sub, batch, newDays, newTime, newTeacherId, teacherChanged, otherStudents };
  }

  /*
   * The student's OWN clashes: another active batch they sit in that runs on any
   * of the requested days at the same start time. A student cannot be in two
   * classes at once, so this is surfaced before a schedule change or modify lands
   * them there — the spec's "Student conflicts / clashes" check.
   */
  private async studentScheduleClashes(
    studentId: string,
    excludeBatchId: string | null,
    days: string[],
    time: string | null,
  ): Promise<{ name: string; days: string[] }[]> {
    if (!days.length || !time) return [];
    const links = await this.prisma.batchStudent.findMany({ where: { studentId }, select: { batchId: true } });
    const otherIds = links.map((l) => l.batchId).filter((id) => id !== excludeBatchId);
    if (!otherIds.length) return [];
    const batches = await this.prisma.batch.findMany({
      where: { id: { in: otherIds }, status: 'ACTIVE', startTime: time },
      select: { name: true, daysOfWeek: true },
    });
    return batches
      .filter((b) => b.daysOfWeek.some((d) => days.includes(d)))
      .map((b) => ({ name: b.name, days: b.daysOfWeek }));
  }

  private async modifyConflicts(
    studentId: string,
    newTeacherId: string | null,
    newDays: string[],
    newTime: string,
    excludeBatchId: string,
  ) {
    const availabilityWarnings: string[] = [];
    let teacherClashes: { name: string; days: string[] }[] = [];
    if (newTeacherId && newTime) {
      const tp = await this.prisma.teacherProfile.findUnique({
        where: { id: newTeacherId },
        select: { availability: true },
      });
      const windows = (tp?.availability ?? {}) as Record<string, { from?: string; to?: string }[]>;
      for (const d of newDays) if (!this.withinWindow(windows[d], newTime)) availabilityWarnings.push(d);

      const sameTime = await this.prisma.batch.findMany({
        where: { teacherId: newTeacherId, id: { not: excludeBatchId }, startTime: newTime },
        select: { name: true, daysOfWeek: true },
      });
      teacherClashes = sameTime
        .filter((b) => b.daysOfWeek.some((d) => newDays.includes(d)))
        .map((b) => ({ name: b.name, days: b.daysOfWeek }));
    }
    const studentClashes = await this.studentScheduleClashes(studentId, excludeBatchId, newDays, newTime);
    return { availabilityWarnings, teacherClashes, studentClashes };
  }

  /** Preview: what would change and what conflicts, for the confirm dialog. */
  async previewModifySchedule(studentId: string, dto: ModifyScheduleDto, actor: Actor) {
    await this.assertStaffScope(actor, studentId);
    const r = await this.resolveModify(studentId, dto);
    const conflicts = await this.modifyConflicts(studentId, r.newTeacherId, r.newDays, r.newTime, r.batch.id);
    const now = new Date();
    const to = r.sub.renewalDate ? new Date(r.sub.renewalDate) : subscriptionCycleEnd(now);
    const affectedCount =
      dto.scope === 'NEXT_ONLY'
        ? 0
        : await this.prisma.classSession.count({
            where: {
              batchId: r.batch.id,
              status: 'SCHEDULED',
              cycleLocked: false,
              attendanceLocked: false,
              startsAt: { gte: now, lt: to },
            },
          });
    return {
      scope: dto.scope,
      batch: { id: r.batch.id, name: r.batch.name, days: r.batch.daysOfWeek, startTime: r.batch.startTime, teacherId: r.batch.teacherId },
      newDays: r.newDays,
      newTime: r.newTime,
      newTeacherId: r.newTeacherId,
      teacherChanged: r.teacherChanged,
      otherStudentsInBatch: r.otherStudents,
      affectedCount,
      ...conflicts,
    };
  }

  /*
   * Apply an AC schedule modification at the chosen scope:
   *  CURRENT_REMAINING — cancel this cycle's remaining editable sessions and
   *                      regenerate them on the new pattern; the batch template
   *                      is untouched, so next cycle reverts.
   *  CURRENT_AND_NEXT  — the above AND rewrite the batch template (permanent).
   *  NEXT_ONLY         — queue it for the next cycle; current classes untouched.
   * The teacher's availability is a hard guard; clashes are warnings surfaced in
   * the preview. Audited, and student + teacher + coach are notified.
   */
  async modifySchedule(studentId: string, dto: ModifyScheduleDto, actor: Actor) {
    await this.assertStaffScope(actor, studentId);
    const r = await this.resolveModify(studentId, dto);
    await this.assertScheduleWithinAvailability(r.newTeacherId, r.newDays, r.newTime, r.sub.durationMinutes);

    const now = new Date();
    const to = r.sub.renewalDate ? new Date(r.sub.renewalDate) : subscriptionCycleEnd(now);
    const endTime = this.addMinutesToTime(r.newTime, r.sub.durationMinutes);
    const applied: string[] = [];
    let cancelled = 0;
    let created = 0;

    const touchCurrent = dto.scope === 'CURRENT_REMAINING' || dto.scope === 'CURRENT_AND_NEXT';
    if (touchCurrent) {
      /*
       * Only the classes that still sit on the OLD pattern (the batch's current
       * days + start time) are cancelled and re-laid on the new pattern. A class
       * the student individually rescheduled has moved off the pattern, so it is
       * left exactly where they put it — the flow's "update only if it matches the
       * old pattern; skip already-rescheduled classes".
       */
      const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const oldDays = r.batch.daysOfWeek;
      const oldTime = r.batch.startTime;
      const editable = await this.prisma.classSession.findMany({
        where: {
          batchId: r.batch.id,
          status: 'SCHEDULED',
          cycleLocked: false,
          attendanceLocked: false,
          startsAt: { gte: now, lt: to },
        },
        select: { id: true, startsAt: true },
      });
      const onPattern = editable.filter((s) => {
        const d = new Date(s.startsAt);
        const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        return oldDays.includes(DAYS[d.getUTCDay()]) && hhmm === oldTime;
      });
      const preserved = editable.length - onPattern.length; // off-pattern (rescheduled) kept
      if (onPattern.length) {
        const res = await this.prisma.classSession.updateMany({
          where: { id: { in: onPattern.map((s) => s.id) } },
          data: { status: 'CANCELLED' },
        });
        cancelled = res.count;
      }
      // Never deliver more than the plan owes this cycle: cap the regeneration to
      // the remaining allowance, less the rescheduled classes already kept.
      const limit = Math.max(0, r.sub.remainingClasses - preserved);
      created = await this.createSessionsFor({
        batchId: r.batch.id,
        courseId: r.batch.courseId,
        teacherId: r.newTeacherId!,
        name: r.batch.name,
        days: r.newDays,
        startTime: r.newTime,
        durationMinutes: r.sub.durationMinutes,
        from: now,
        to,
        studentIds: r.batch.students.map((s) => s.studentId),
        limit,
      });
      applied.push(
        `${cancelled} class(es) cancelled, ${created} rescheduled${preserved ? `, ${preserved} rescheduled class(es) kept` : ''}`,
      );
    }

    if (dto.scope === 'CURRENT_AND_NEXT') {
      await this.prisma.batch.update({
        where: { id: r.batch.id },
        data: {
          daysOfWeek: r.newDays,
          startTime: r.newTime,
          endTime,
          ...(r.teacherChanged ? { teacherId: r.newTeacherId! } : {}),
        },
      });
      applied.push('applied to next cycle onwards (batch updated)');
    } else if (dto.scope === 'NEXT_ONLY') {
      const next = {
        nextDays: r.newDays,
        nextTime: r.newTime,
        nextBatchId: r.batch.id,
        ...(r.teacherChanged ? { nextTeacherId: r.newTeacherId } : {}),
      };
      await this.prisma.subscriptionNextCycle.upsert({
        where: { studentId },
        create: { studentId, ...next },
        update: next,
      });
      applied.push('queued for the next cycle');
    }

    // The schedule-changes log the flow asks for — old value, new value, applied
    // scope, who and why — recorded on the immutable StudentActivity audit table.
    await this.audit(
      studentId,
      'SUBSCRIPTION_SCHEDULE_MODIFIED',
      'Schedule modified by staff',
      `${dto.scope}: ${r.newDays.join(', ')} ${r.newTime}${r.teacherChanged ? ' · teacher changed' : ''}. ${applied.join('; ')}`,
      actor,
      {
        appliedScope: dto.scope,
        batchId: r.batch.id,
        oldValue: { days: r.batch.daysOfWeek, time: r.batch.startTime, teacherId: r.batch.teacherId },
        newValue: { days: r.newDays, time: r.newTime, teacherId: r.newTeacherId },
        reason: dto.reason?.trim() || null,
      },
    );
    await this.notifyScheduleModified(studentId, r.newTeacherId, r.newDays, r.newTime).catch(() => undefined);

    return { scope: dto.scope, cancelled, created, applied };
  }

  private async notifyScheduleModified(
    studentId: string,
    teacherProfileId: string | null,
    days: string[],
    time: string,
  ): Promise<void> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true, coachId: true, user: { select: { firstName: true, lastName: true } } },
    });
    const teacher = teacherProfileId
      ? await this.prisma.teacherProfile.findUnique({ where: { id: teacherProfileId }, select: { userId: true } })
      : null;
    const name = student?.user ? `${student.user.firstName} ${student.user.lastName}`.trim() : 'A student';
    const detail = `${days.join(', ')} at ${time}`;
    const jobs: Promise<unknown>[] = [];
    if (student?.userId) {
      jobs.push(this.notifications.createFor(student.userId, { type: 'SCHEDULE_CHANGED', title: 'Your class schedule has been updated', body: `Your classes are now ${detail}.`, link: '/student/subscription' }));
    }
    if (teacher?.userId) {
      jobs.push(this.notifications.createFor(teacher.userId, { type: 'SCHEDULE_CHANGED', title: 'A student schedule changed', body: `${name}'s classes are now ${detail}.`, link: '/teacher/classes' }));
    }
    if (student?.coachId) {
      jobs.push(this.notifications.createFor(student.coachId, { type: 'SCHEDULE_CHANGED', title: 'Schedule updated', body: `${name}'s classes are now ${detail}.`, link: `/students/${studentId}` }));
    }
    await Promise.all(jobs.map((p) => (p as Promise<unknown>).catch(() => undefined)));
  }

  /*
   * Generate SCHEDULED sessions for a batch on an explicit days/time/teacher over
   * [from, to), skipping past instants and any slot that already has a
   * non-cancelled session. Shared by AC schedule-modify and break-resume, both of
   * which fill a window the cycle generator's own from/to maths does not cover.
   */
  private async createSessionsFor(input: {
    batchId: string;
    courseId: string;
    teacherId: string;
    name: string;
    days: string[];
    startTime: string;
    durationMinutes: number;
    from: Date;
    to: Date;
    studentIds: string[];
    // Hard ceiling on how many sessions to mint — the plan's remaining class
    // allowance, so adding days never delivers more classes than the plan owes.
    limit?: number;
  }): Promise<number> {
    if (!input.days.length || !input.startTime || !input.teacherId) return 0;
    if (input.limit != null && input.limit <= 0) return 0;
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const [sh, sm] = input.startTime.split(':').map(Number);
    const endTime = this.addMinutesToTime(input.startTime, input.durationMinutes);
    const [eh, em] = endTime.split(':').map(Number);

    const existing = await this.prisma.$queryRaw<{ slot: string }[]>`
      SELECT to_char("startsAt", 'YYYY-MM-DD HH24:MI') AS slot
      FROM "ClassSession"
      WHERE "batchId" = ${input.batchId}
        AND "startsAt" >= ${input.from}
        AND "startsAt" < ${input.to}
        AND "status" <> 'CANCELLED'
    `;
    const taken = new Set(existing.map((e) => e.slot));
    const slotOf = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(
        d.getUTCMinutes(),
      ).padStart(2, '0')}`;

    // §9.6 — the same rule as generateSessionsForBatch: a renewal cycle must not
    // mint classes onto a teacher who is already signed off for those dates.
    const leaveWindows = await this.approvedLeaveWindows(input.teacherId, input.from, input.to);

    const now = new Date();
    let made = 0;
    for (const d = new Date(input.from); d < input.to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (input.limit != null && made >= input.limit) break;
      if (!input.days.includes(DAYS[d.getUTCDay()])) continue;
      const startsAt = new Date(d);
      startsAt.setUTCHours(sh, sm, 0, 0);
      if (startsAt < input.from || startsAt < now) continue;
      if (taken.has(slotOf(startsAt))) continue;
      const endsAt = new Date(d);
      endsAt.setUTCHours(eh, em, 0, 0);
      if (leaveWindows.some((w) => w.from < endsAt && w.to > startsAt)) continue;
      const session = await this.prisma.classSession.create({
        data: {
          courseId: input.courseId,
          teacherId: input.teacherId,
          batchId: input.batchId,
          title: `${input.name} — Class`,
          startsAt,
          endsAt,
          status: 'SCHEDULED',
        },
      });
      if (input.studentIds.length) {
        await this.prisma.classAttendee.createMany({
          data: input.studentIds.map((sid) => ({ classId: session.id, studentId: sid })),
          skipDuplicates: true,
        });
      }
      made += 1;
    }
    return made;
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
        nextTeacherId: string | null;
      }[]
    >`
      DELETE FROM "SubscriptionNextCycle"
      WHERE "studentId" = ${studentId}
      RETURNING "nextPackageId", "nextDays", "nextTime", "nextBatchId", "nextTeacherId"
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
      } else if (queued.nextDays.length || queued.nextTime || queued.nextTeacherId) {
        // Their own batch — retime it in place. A queued teacher change (from an
        // AC "Modify Schedule → Next cycle only") reassigns the batch teacher too,
        // so the generated sessions below carry the new teacher.
        await this.prisma.batch.update({
          where: { id: queued.nextBatchId },
          data: {
            ...(queued.nextDays.length ? { daysOfWeek: queued.nextDays } : {}),
            ...(queued.nextTime ? { startTime: queued.nextTime } : {}),
            ...(queued.nextTeacherId ? { teacherId: queued.nextTeacherId } : {}),
          },
        });
        applied.push(
          `schedule → ${queued.nextDays.join(', ')} ${queued.nextTime ?? ''}${queued.nextTeacherId ? ' · teacher changed' : ''}`.trim(),
        );
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

    // A new cycle has begun — both reschedule allowances refill (the student's
    // own, and the teacher's per-student counter — spec step 8, both sides).
    // Kept in step with refillCycle so whichever cycle-boundary path runs, the
    // counters reset the same way.
    await this.prisma.studentSubscription.updateMany({
      where: { studentId, status: 'ACTIVE' },
      data: { rescheduleCounter: 0, teacherRescheduleCounter: 0 },
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

    // §9.6 — no class is minted onto a teacher already signed off for that date.
    const leaveWindows = await this.approvedLeaveWindows(batch.teacherId, from, to);

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
      if (leaveWindows.some((w) => w.from < endsAt && w.to > startsAt)) continue;

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
