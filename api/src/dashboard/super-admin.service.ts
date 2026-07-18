import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  ClassStatus,
  EnrollmentStatus,
  ExpenseStatus,
  InvoiceStatus,
  PaymentStatus,
  Role,
  StudentAttendanceStatus,
  SubmissionStatus,
  UserStatus,
} from '../generated/prisma/enums';
import {
  ResolvedRange,
  bucketEdges,
  delta,
  endOfDay,
  pct,
  startOfDay,
  toNumber,
} from './dashboard.range';

/*
 * Super Admin dashboard — whole-academy monitoring.
 *
 * Everything is computed with DB-side counts/aggregates. The previous
 * `/dashboard/overview` pulled every student, payment and enrollment row into
 * Node and reduced them in JS, which grew linearly with the table size; nothing
 * here does that.
 */

const UNPAID_INVOICE: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PENDING,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

const PENDING_SUBMISSION: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.LATE_SUBMITTED,
  SubmissionStatus.UNDER_REVIEW,
];

const PRESENT_STATES: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.PRESENT,
  StudentAttendanceStatus.LATE,
];

@Injectable()
export class SuperAdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(range: ResolvedRange) {
    const [kpis, live, charts] = await Promise.all([
      this.kpis(range),
      this.liveStats(),
      this.charts(range),
    ]);
    return { range: range.key, kpis, live, charts, generatedAt: new Date().toISOString() };
  }

  // ── KPI cards ──────────────────────────────────────────────────────────────

  private async kpis(range: ResolvedRange) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalStudents,
      prevTotalStudents,
      activeStudents,
      totalTeachers,
      coaches,
      courses,
      activeBatches,
      todayClasses,
      runningClasses,
      completedClasses,
      assignmentsPending,
      assessmentsLive,
      revenueThisMonth,
      revenuePrevMonth,
      unpaidInvoices,
      expensesThisMonth,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
      this.prisma.user.count({ where: { role: Role.STUDENT, createdAt: { lt: range.from } } }),
      this.prisma.user.count({ where: { role: Role.STUDENT, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { role: Role.TEACHER } }),
      this.prisma.user.count({ where: { role: Role.ACADEMIC_COACH } }),
      this.prisma.course.count(),
      this.prisma.batch.count({ where: { status: 'ACTIVE' } }),
      this.prisma.classSession.count({ where: { startsAt: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.classSession.count({ where: { status: ClassStatus.LIVE } }),
      this.prisma.classSession.count({
        where: { status: ClassStatus.COMPLETED, startsAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.submission.count({ where: { status: { in: PENDING_SUBMISSION } } }),
      this.prisma.assessment.count({ where: { status: 'LIVE' } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: PaymentStatus.SUCCEEDED, paidAt: { gte: monthStart } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: { gte: prevMonthStart, lt: monthStart },
        },
      }),
      this.prisma.invoice.aggregate({
        _sum: { amount: true, paidAmount: true },
        where: { status: { in: UNPAID_INVOICE } },
      }),
      this.prisma.expense.aggregate({
        _sum: { amount: true },
        where: { status: ExpenseStatus.APPROVED, paymentDate: { gte: monthStart } },
      }),
    ]);

    const revenue = toNumber(revenueThisMonth._sum.amount);
    const prevRevenue = toNumber(revenuePrevMonth._sum.amount);
    const outstanding =
      toNumber(unpaidInvoices._sum.amount) - toNumber(unpaidInvoices._sum.paidAmount);
    const expenses = toNumber(expensesThisMonth._sum.amount);

    return {
      totalStudents: { value: totalStudents, delta: delta(totalStudents, prevTotalStudents) },
      activeStudents: { value: activeStudents },
      totalTeachers: { value: totalTeachers },
      academicCoaches: { value: coaches },
      courses: { value: courses },
      activeBatches: { value: activeBatches },
      todayClasses: { value: todayClasses },
      runningClasses: { value: runningClasses },
      completedClasses: { value: completedClasses },
      assignmentsPending: { value: assignmentsPending },
      assessmentsLive: { value: assessmentsLive },
      revenueThisMonth: { value: revenue, delta: delta(revenue, prevRevenue) },
      outstandingFees: { value: Math.max(0, outstanding) },
      expenses: { value: expenses },
      netProfit: { value: revenue - expenses },
    };
  }

  // ── Live statistics ────────────────────────────────────────────────────────

  private async liveStats() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [
      liveClasses,
      onlineStudents,
      teachingNow,
      todayAttendance,
      todayPresent,
      assignmentsDueToday,
      assignmentsSubmittedToday,
      attemptsToday,
      attemptsCompletedToday,
    ] = await Promise.all([
      this.prisma.classSession.count({ where: { status: ClassStatus.LIVE } }),
      // Joined the class and not left yet.
      this.prisma.classAttendee.count({
        where: {
          joinedAt: { not: null },
          leftAt: null,
          class: { status: ClassStatus.LIVE },
        },
      }),
      this.prisma.classSession
        .findMany({
          where: { status: ClassStatus.LIVE },
          select: { teacherId: true },
          distinct: ['teacherId'],
        })
        .then((rows) => rows.length),
      this.prisma.classAttendee.count({
        where: { class: { startsAt: { gte: todayStart, lt: todayEnd } }, status: { not: null } },
      }),
      this.prisma.classAttendee.count({
        where: {
          class: { startsAt: { gte: todayStart, lt: todayEnd } },
          status: { in: PRESENT_STATES },
        },
      }),
      this.prisma.submission.count({
        where: { assignment: { dueAt: { gte: todayStart, lt: todayEnd } } },
      }),
      this.prisma.submission.count({
        where: {
          assignment: { dueAt: { gte: todayStart, lt: todayEnd } },
          submittedAt: { not: null },
        },
      }),
      this.prisma.assessmentAttempt.count({
        where: { startedAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.assessmentAttempt.count({
        where: {
          startedAt: { gte: todayStart, lt: todayEnd },
          status: { in: ['SUBMITTED', 'UNDER_EVALUATION', 'EVALUATED', 'PUBLISHED'] },
        },
      }),
    ]);

    return {
      onlineStudents,
      teachersTeachingNow: teachingNow,
      activeLiveClasses: liveClasses,
      todayAttendancePct: pct(todayPresent, todayAttendance),
      todayAssignmentSubmissionPct: pct(assignmentsSubmittedToday, assignmentsDueToday),
      todayAssessmentCompletionPct: pct(attemptsCompletedToday, attemptsToday),
    };
  }

  // ── Charts ─────────────────────────────────────────────────────────────────

  private async charts(range: ResolvedRange) {
    const edges = bucketEdges(range);

    const [
      studentGrowth,
      revenueTrend,
      admissions,
      attendanceTrend,
      assessmentTrend,
      assignmentTrend,
      teacherPerformance,
      batchUtilization,
      countryMix,
      courseMix,
    ] = await Promise.all([
      this.studentGrowth(edges),
      this.revenueTrend(edges),
      this.admissions(edges),
      this.attendanceTrend(edges),
      this.assessmentTrend(edges),
      this.assignmentTrend(edges),
      this.teacherPerformance(),
      this.batchUtilization(),
      this.countryMix(),
      this.courseMix(),
    ]);

    return {
      studentGrowth,
      revenueTrend,
      admissions,
      attendanceTrend,
      assessmentTrend,
      assignmentTrend,
      teacherPerformance,
      batchUtilization,
      countryMix,
      courseMix,
    };
  }

  /** Cumulative student count at the end of each bucket. */
  private async studentGrowth(edges: { label: string; start: Date; end: Date }[]) {
    const counts = await Promise.all(
      edges.map((e) =>
        this.prisma.user.count({ where: { role: Role.STUDENT, createdAt: { lt: e.end } } }),
      ),
    );
    return edges.map((e, i) => ({ label: e.label, students: counts[i] }));
  }

  private async revenueTrend(edges: { label: string; start: Date; end: Date }[]) {
    const [revenue, expenses] = await Promise.all([
      Promise.all(
        edges.map((e) =>
          this.prisma.payment.aggregate({
            _sum: { amount: true },
            where: {
              status: PaymentStatus.SUCCEEDED,
              paidAt: { gte: e.start, lt: e.end },
            },
          }),
        ),
      ),
      Promise.all(
        edges.map((e) =>
          this.prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
              status: ExpenseStatus.APPROVED,
              paymentDate: { gte: e.start, lt: e.end },
            },
          }),
        ),
      ),
    ]);
    return edges.map((e, i) => {
      const rev = toNumber(revenue[i]._sum.amount);
      const exp = toNumber(expenses[i]._sum.amount);
      return { label: e.label, revenue: rev, expenses: exp, profit: rev - exp };
    });
  }

  private async admissions(edges: { label: string; start: Date; end: Date }[]) {
    const counts = await Promise.all(
      edges.map((e) =>
        this.prisma.user.count({
          where: { role: Role.STUDENT, createdAt: { gte: e.start, lt: e.end } },
        }),
      ),
    );
    return edges.map((e, i) => ({ label: e.label, admissions: counts[i] }));
  }

  private async attendanceTrend(edges: { label: string; start: Date; end: Date }[]) {
    const rows = await Promise.all(
      edges.map(async (e) => {
        const [total, present] = await Promise.all([
          this.prisma.classAttendee.count({
            where: { class: { startsAt: { gte: e.start, lt: e.end } }, status: { not: null } },
          }),
          this.prisma.classAttendee.count({
            where: {
              class: { startsAt: { gte: e.start, lt: e.end } },
              status: { in: PRESENT_STATES },
            },
          }),
        ]);
        return pct(present, total);
      }),
    );
    return edges.map((e, i) => ({ label: e.label, rate: rows[i] }));
  }

  private async assessmentTrend(edges: { label: string; start: Date; end: Date }[]) {
    const rows = await Promise.all(
      edges.map((e) =>
        this.prisma.assessmentAttempt.aggregate({
          _avg: { percentage: true },
          _count: { _all: true },
          where: { submittedAt: { gte: e.start, lt: e.end } },
        }),
      ),
    );
    return edges.map((e, i) => ({
      label: e.label,
      avgScore: Math.round((rows[i]._avg.percentage ?? 0) * 10) / 10,
      attempts: rows[i]._count._all,
    }));
  }

  private async assignmentTrend(edges: { label: string; start: Date; end: Date }[]) {
    const rows = await Promise.all(
      edges.map(async (e) => {
        const [assigned, submitted] = await Promise.all([
          this.prisma.submission.count({
            where: { assignment: { dueAt: { gte: e.start, lt: e.end } } },
          }),
          this.prisma.submission.count({
            where: {
              assignment: { dueAt: { gte: e.start, lt: e.end } },
              submittedAt: { not: null },
            },
          }),
        ]);
        return { assigned, submitted, rate: pct(submitted, assigned) };
      }),
    );
    return edges.map((e, i) => ({ label: e.label, ...rows[i] }));
  }

  /** Top teachers by cached system rating, with their active load. */
  private async teacherPerformance() {
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { archived: false },
      select: {
        id: true,
        rating: true,
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { classes: true, enrollments: true } },
      },
      orderBy: { rating: 'desc' },
      take: 8,
    });
    return teachers.map((t) => ({
      name: `${t.user.firstName} ${t.user.lastName}`.trim(),
      rating: t.rating ?? 0,
      classes: t._count.classes,
      students: t._count.enrollments,
    }));
  }

  /** Seat utilisation per active batch. Batches with no capacity are skipped. */
  private async batchUtilization() {
    const batches = await this.prisma.batch.findMany({
      where: { status: 'ACTIVE', capacity: { not: null } },
      select: {
        name: true,
        capacity: true,
        _count: { select: { students: true } },
      },
      take: 12,
    });
    return batches.map((b) => ({
      name: b.name,
      capacity: b.capacity ?? 0,
      enrolled: b._count.students,
      utilization: pct(b._count.students, b.capacity ?? 0),
    }));
  }

  private async countryMix() {
    const rows = await this.prisma.user.groupBy({
      by: ['country'],
      where: { role: Role.STUDENT },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
      take: 10,
    });
    return rows.map((r) => ({ name: r.country ?? 'Unknown', value: r._count._all }));
  }

  private async courseMix() {
    const rows = await this.prisma.enrollment.groupBy({
      by: ['courseId'],
      where: { status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.TRIAL] } },
      _count: { _all: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: 8,
    });
    const courses = await this.prisma.course.findMany({
      where: { id: { in: rows.map((r) => r.courseId) } },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));
    return rows.map((r) => ({
      name: titleById.get(r.courseId) ?? 'Unknown',
      value: r._count._all,
    }));
  }
}
