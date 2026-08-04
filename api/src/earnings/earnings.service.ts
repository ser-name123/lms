import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../generated/prisma/enums';
import {
  DEFAULT_FINANCE_CONFIG,
  FINANCE_CONFIG_KEY,
  FinanceConfig,
  round2,
} from '../finance/finance.config';

/*
 * Teacher Earnings (Module 6A). Books one immutable earning row per completed
 * class (and per completed trial). Earnings are ALWAYS computed from the
 * SCHEDULED class duration × the teacher's hourly rate — never from actual
 * join/leave timestamps (spec step 3). The four attendance scenarios:
 *
 *   teacher present/late + any student present → COMPLETED        → paid
 *   teacher present/late + no student showed   → STUDENT_NO_SHOW   → paid
 *   teacher absent       + a student showed    → TEACHER_ABSENT    → NOT paid + coach reschedule task
 *   teacher absent       + no student showed   → BOTH_NO_SHOW      → NOT paid (student marked absent already)
 *
 * recordForClass is idempotent (classSessionId is @unique) so the attendance
 * lock step can call it freely — the second call is a no-op.
 */
@Injectable()
export class EarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async financeConfig(): Promise<FinanceConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: FINANCE_CONFIG_KEY } });
    if (!row) return { ...DEFAULT_FINANCE_CONFIG };
    try {
      return { ...DEFAULT_FINANCE_CONFIG, ...(JSON.parse(row.value) as Partial<FinanceConfig>) };
    } catch {
      return { ...DEFAULT_FINANCE_CONFIG };
    }
  }

  // ── Regular class earning (called from the attendance lock step) ────────────
  async recordForClass(classSessionId: string): Promise<void> {
    const existing = await this.prisma.teacherEarning.findUnique({ where: { classSessionId } });
    if (existing) return; // idempotent — one earning per class

    const cls = await this.prisma.classSession.findUnique({
      where: { id: classSessionId },
      include: { attendees: { select: { studentId: true, status: true } } },
    });
    if (!cls || cls.status !== 'COMPLETED' || !cls.teacherId) return;
    // An academy-cancelled class is not a teacher no-show — no earning, no task.
    if (cls.teacherStatus === 'CLASS_CANCELLED') return;

    const cfg = await this.financeConfig();
    if (!cfg.teacherEarningsEnabled) return;

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: cls.teacherId },
      select: { hourlyRate: true },
    });
    const rate = Number(teacher?.hourlyRate ?? 0);
    const scheduledMinutes = Math.max(
      0,
      Math.round((new Date(cls.endsAt).getTime() - new Date(cls.startsAt).getTime()) / 60000),
    );

    const teacherPresent = cls.teacherStatus === 'PRESENT' || cls.teacherStatus === 'LATE';
    const anyStudentShowed = cls.attendees.some((a) => a.status === 'PRESENT' || a.status === 'LATE');

    let outcome: 'COMPLETED' | 'STUDENT_NO_SHOW' | 'TEACHER_ABSENT' | 'BOTH_NO_SHOW';
    let paid: boolean;
    if (teacherPresent) {
      paid = true;
      outcome = anyStudentShowed ? 'COMPLETED' : 'STUDENT_NO_SHOW';
    } else {
      paid = false;
      outcome = anyStudentShowed ? 'TEACHER_ABSENT' : 'BOTH_NO_SHOW';
    }

    const amount = paid ? round2(rate * (scheduledMinutes / 60)) : 0;
    const studentId = cls.attendees[0]?.studentId ?? null;

    await this.prisma.teacherEarning.create({
      data: {
        teacherId: cls.teacherId,
        classSessionId,
        studentId,
        courseId: cls.courseId ?? null,
        classType: 'REGULAR',
        scheduledMinutes,
        hourlyRate: rate,
        amount,
        currency: cfg.earningsCurrency,
        outcome,
        paid,
      },
    });

    // Scenario 3 — teacher absent while the student was there: raise a coach
    // reschedule task and notify the coach, the student and the supervisors.
    if (outcome === 'TEACHER_ABSENT') {
      await this.raiseAbsenceTask(cls.id, cls.teacherId, studentId, cls.courseId ?? null, cls.startsAt).catch(
        () => undefined,
      );
    }
  }

  private async raiseAbsenceTask(
    classSessionId: string,
    teacherId: string,
    studentId: string | null,
    courseId: string | null,
    originalStartsAt: Date,
  ): Promise<void> {
    await this.prisma.teacherAbsenceTask.upsert({
      where: { classSessionId },
      update: {},
      create: { classSessionId, teacherId, studentId, courseId, originalStartsAt },
    });

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { user: { select: { firstName: true, lastName: true } } },
    });
    const teacherName = teacher?.user ? `${teacher.user.firstName} ${teacher.user.lastName}`.trim() : 'A teacher';
    const when = new Date(originalStartsAt).toISOString().slice(0, 16).replace('T', ' ');

    const jobs: Promise<unknown>[] = [];
    let coachId: string | null = null;
    if (studentId) {
      const student = await this.prisma.studentProfile.findUnique({
        where: { id: studentId },
        select: { userId: true, coachId: true },
      });
      coachId = student?.coachId ?? null;
      if (student?.userId) {
        jobs.push(
          this.notifications.createFor(student.userId, {
            type: 'TEACHER_ABSENT',
            title: 'Your class needs rescheduling',
            body: `Your teacher missed the class on ${when}. Your academic coach will reschedule it.`,
            link: '/student/classes',
          }),
        );
      }
    }
    if (coachId) {
      jobs.push(
        this.notifications.createFor(coachId, {
          type: 'TEACHER_ABSENT',
          title: 'Teacher absent — reschedule needed',
          body: `${teacherName} missed the class on ${when}. Please reschedule it from the Teacher Absences list.`,
          link: '/teacher-absences',
        }),
      );
    }
    jobs.push(
      this.notifications.createForRoles([Role.ADMIN, Role.SUPERVISOR], {
        type: 'TEACHER_ABSENT',
        title: 'Teacher absent',
        body: `${teacherName} missed the class on ${when}. A reschedule task has been created for the coach.`,
        link: '/teacher-absences',
      }),
    );
    await Promise.all(jobs.map((p) => (p as Promise<unknown>).catch(() => undefined)));
  }

  // ── Trial class earning (spec step 4) ───────────────────────────────────────
  async recordTrial(leadTrialId: string): Promise<void> {
    const existing = await this.prisma.teacherEarning.findFirst({ where: { leadTrialId, classType: 'TRIAL' } });
    if (existing) return;
    const trial = await this.prisma.leadTrial.findUnique({
      where: { id: leadTrialId },
      select: { teacherId: true, durationMins: true, status: true, attendance: true, recommendedCourseId: true },
    });
    if (!trial || !trial.teacherId) return;
    if (trial.status !== 'COMPLETED' || trial.attendance !== 'PRESENT') return;

    const cfg = await this.financeConfig();
    if (!cfg.teacherEarningsEnabled) return;

    await this.prisma.teacherEarning.create({
      data: {
        teacherId: trial.teacherId,
        leadTrialId,
        courseId: trial.recommendedCourseId ?? null,
        classType: 'TRIAL',
        scheduledMinutes: trial.durationMins ?? 0,
        hourlyRate: 0,
        amount: round2(cfg.trialClassPayout),
        currency: cfg.earningsCurrency,
        outcome: 'COMPLETED',
        paid: true,
      },
    });
  }

  // Optional enrolment bonus when a trial's student successfully enrols. Booked
  // as a second row keyed to the same trial (leadTrialId is unique on the trial
  // row, so the bonus row carries leadTrialId=null and a synthetic guard).
  async recordTrialEnrollBonus(leadTrialId: string): Promise<void> {
    const cfg = await this.financeConfig();
    if (!cfg.teacherEarningsEnabled || round2(cfg.trialEnrollBonus) <= 0) return;
    const trial = await this.prisma.leadTrial.findUnique({
      where: { id: leadTrialId },
      select: { teacherId: true, recommendedCourseId: true },
    });
    if (!trial || !trial.teacherId) return;
    // One bonus per trial (compound unique on leadTrialId+classType).
    const already = await this.prisma.teacherEarning.findFirst({
      where: { leadTrialId, classType: 'TRIAL_ENROLL_BONUS' },
    });
    if (already) return;
    await this.prisma.teacherEarning.create({
      data: {
        teacherId: trial.teacherId,
        leadTrialId,
        courseId: trial.recommendedCourseId ?? null,
        classType: 'TRIAL_ENROLL_BONUS',
        scheduledMinutes: 0,
        hourlyRate: 0,
        amount: round2(cfg.trialEnrollBonus),
        currency: cfg.earningsCurrency,
        outcome: 'COMPLETED',
        paid: true,
      },
    });
  }

  // ── Teacher-facing ledger + dashboard summary ───────────────────────────────
  private async teacherIdFor(userId: string): Promise<string | null> {
    const tp = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    return tp?.id ?? null;
  }

  async myLedger(userId: string, limit = 100) {
    const teacherId = await this.teacherIdFor(userId);
    if (!teacherId) return [];
    return this.ledgerFor(teacherId, limit);
  }

  async ledgerFor(teacherId: string, limit = 100) {
    const rows = await this.prisma.teacherEarning.findMany({
      where: { teacherId },
      orderBy: { earnedAt: 'desc' },
      take: limit,
    });
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean) as string[])];
    const courseIds = [...new Set(rows.map((r) => r.courseId).filter(Boolean) as string[])];
    const [students, courses] = await Promise.all([
      studentIds.length
        ? this.prisma.studentProfile.findMany({ where: { id: { in: studentIds } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } })
        : [],
      courseIds.length
        ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
        : [],
    ]);
    const sName = new Map(students.map((s) => [s.id, `${s.user.firstName} ${s.user.lastName}`.trim()]));
    const cName = new Map(courses.map((c) => [c.id, c.title]));
    return rows.map((r) => ({
      id: r.id,
      date: r.earnedAt,
      student: r.studentId ? sName.get(r.studentId) ?? null : null,
      course: r.courseId ? cName.get(r.courseId) ?? null : null,
      classType: r.classType,
      scheduledMinutes: r.scheduledMinutes,
      hourlyRate: Number(r.hourlyRate),
      amount: Number(r.amount),
      currency: r.currency,
      outcome: r.outcome,
      paid: r.paid,
      settled: !!r.salaryId,
    }));
  }

  async mySummary(userId: string) {
    const teacherId = await this.teacherIdFor(userId);
    if (!teacherId) return this.emptySummary();
    return this.summaryFor(teacherId);
  }

  private emptySummary() {
    return { currency: 'USD', today: 0, week: 0, month: 0, pending: 0, paid: 0, unpaidClasses: 0 };
  }

  async summaryFor(teacherId: string) {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = startOfToday.getUTCDay();
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setUTCDate(startOfToday.getUTCDate() - ((day + 6) % 7)); // Monday
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const rows = await this.prisma.teacherEarning.findMany({
      where: { teacherId, paid: true },
      select: { amount: true, earnedAt: true, salaryId: true, currency: true },
    });
    let today = 0, week = 0, month = 0, pending = 0, paidOut = 0;
    let currency = 'USD';
    for (const r of rows) {
      const amt = Number(r.amount);
      currency = r.currency || currency;
      const when = new Date(r.earnedAt);
      if (when >= startOfToday) today += amt;
      if (when >= startOfWeek) week += amt;
      if (when >= startOfMonth) month += amt;
      // Settled into a PAID salary counts as paid; otherwise it is pending.
      if (r.salaryId) paidOut += amt;
      else pending += amt;
    }
    // "Paid" should reflect money actually disbursed — count only earnings whose
    // salary reached PAID. Recompute paidOut against paid salaries.
    const paidSalaryIds = new Set(
      (
        await this.prisma.teacherSalary.findMany({ where: { teacherId, status: 'PAID' }, select: { id: true } })
      ).map((s) => s.id),
    );
    today = round2(today); week = round2(week); month = round2(month);
    let paidReal = 0, pendingReal = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.salaryId && paidSalaryIds.has(r.salaryId)) paidReal += amt;
      else pendingReal += amt;
    }
    const unpaidClasses = await this.prisma.teacherEarning.count({ where: { teacherId, paid: false } });
    return {
      currency,
      today,
      week,
      month,
      pending: round2(pendingReal),
      paid: round2(paidReal),
      unpaidClasses,
    };
  }
}
