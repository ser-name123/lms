import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/* The admin dashboard reads one aggregated payload. Everything here is derived
   live from the database — there are no fixtures. Values that the schema cannot
   supply (a course "cover" image, for instance) are labelled as such below. */

type Trend = { label: string; value: number };

const SPARK_WEEKS = 8;
const COVERS = [
  '/images/edu_course_1.png',
  '/images/edu_course_2.png',
  '/images/edu_course_3.png',
  '/images/edu_course_4.png',
];

/** Percent change of `current` vs `previous`, rounded to one decimal. */
function delta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** End-of-week boundaries for the last `SPARK_WEEKS` weeks, oldest first. */
function weekEnds(now: Date): Date[] {
  const ends: Date[] = [];
  for (let i = SPARK_WEEKS - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(now.getDate() - i * 7);
    ends.push(end);
  }
  return ends;
}

/** Cumulative count of `dates` falling on or before each week end. */
function cumulativeSpark(dates: Date[], ends: Date[]): Trend[] {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  return ends.map((end, i) => ({
    label: `w${i + 1}`,
    value: sorted.filter((d) => d.getTime() <= end.getTime()).length,
  }));
}

/** Per-week sum of `entries` (each an amount stamped at a time) within window. */
function weeklySumSpark(
  entries: { at: Date; amount: number }[],
  ends: Date[],
): Trend[] {
  return ends.map((end, i) => {
    const start = new Date(end);
    start.setDate(end.getDate() - 7);
    const value = entries
      .filter((e) => e.at > start && e.at <= end)
      .reduce((sum, e) => sum + e.amount, 0);
    return { label: `w${i + 1}`, value: Math.round(value) };
  });
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ends = weekEnds(now);

    const [
      studentUsers,
      totalCourses,
      coursesThisMonth,
      coursesPrevMonth,
      succeededPayments,
      recentStudents,
      recentPayments,
      recentEnrollments,
      recentTrials,
      lmsCourses,
      enrollmentsByCourse,
      enrollmentEvents,
    ] = await Promise.all([
      // Every student's account creation timestamp (for totals + spark).
      this.prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: { createdAt: true },
      }),
      this.prisma.lmsCourse.count(),
      this.prisma.lmsCourse.count({
        where: { createdAt: { gte: monthStart.toISOString() } },
      }),
      this.prisma.lmsCourse.count({
        where: {
          createdAt: {
            gte: prevMonthStart.toISOString(),
            lt: monthStart.toISOString(),
          },
        },
      }),
      // Collected fees = every successful payment.
      this.prisma.payment.findMany({
        where: { status: 'SUCCEEDED' },
        select: { amount: true, paidAt: true, createdAt: true },
      }),
      this.prisma.studentProfile.findMany({
        take: 5,
        orderBy: { user: { createdAt: 'desc' } },
        select: {
          id: true,
          fees: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              status: true,
              createdAt: true,
            },
          },
          enrollments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              course: { select: { title: true } },
              teacher: {
                select: { user: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        take: 5,
        where: { status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          invoice: {
            select: {
              number: true,
              student: {
                select: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          course: { select: { title: true } },
          student: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.trialClass.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, course: true, createdAt: true },
      }),
      this.prisma.lmsCourse.findMany({
        take: 4,
        orderBy: { createdAt: 'desc' },
      }),
      // Course popularity for the mix chart.
      this.prisma.lmsCourse.findMany({
        select: { category: true, studentsCount: true },
      }),
      // New / churned enrollments over the last 6 months for the trend chart.
      this.prisma.enrollment.findMany({
        select: { createdAt: true, status: true, updatedAt: true },
      }),
    ]);

    // ── KPIs ──────────────────────────────────────────────────────────────
    const studentDates = studentUsers.map((u) => u.createdAt);
    const totalStudents = studentDates.length;
    const newThisMonth = studentDates.filter((d) => d >= monthStart).length;
    const newPrevMonth = studentDates.filter(
      (d) => d >= prevMonthStart && d < monthStart,
    ).length;

    const paymentEntries = succeededPayments.map((p) => ({
      at: p.paidAt ?? p.createdAt,
      amount: Number(p.amount),
    }));
    const feesTotal = paymentEntries.reduce((sum, p) => sum + p.amount, 0);
    const feesThisMonth = paymentEntries
      .filter((p) => p.at >= monthStart)
      .reduce((sum, p) => sum + p.amount, 0);
    const feesPrevMonth = paymentEntries
      .filter((p) => p.at >= prevMonthStart && p.at < monthStart)
      .reduce((sum, p) => sum + p.amount, 0);

    const kpis = [
      {
        id: 'students',
        label: 'TOTAL STUDENTS',
        value: String(totalStudents),
        raw: totalStudents,
        delta: delta(newThisMonth, newPrevMonth),
        hint: 'vs last month',
        spark: cumulativeSpark(studentDates, ends),
      },
      {
        // 'classes' keys the amber tile theme in stat-tile.tsx.
        id: 'classes',
        label: 'NEW STUDENTS',
        value: String(newThisMonth),
        raw: newThisMonth,
        delta: delta(newThisMonth, newPrevMonth),
        hint: 'vs last month',
        spark: cumulativeSpark(
          studentDates.filter((d) => d >= prevMonthStart),
          ends,
        ),
      },
      {
        // 'completion' keys the graduation-cap tile theme.
        id: 'completion',
        label: 'TOTAL COURSE',
        value: String(totalCourses),
        raw: totalCourses,
        delta: delta(coursesThisMonth, coursesPrevMonth),
        hint: 'vs last month',
        spark: ends.map((_, i) => ({ label: `w${i + 1}`, value: totalCourses })),
      },
      {
        id: 'revenue',
        label: 'FEES COLLECTION',
        value: `${Math.round(feesTotal)}$`,
        raw: Math.round(feesTotal),
        delta: delta(feesThisMonth, feesPrevMonth),
        hint: 'vs last month',
        spark: weeklySumSpark(paymentEntries, ends),
      },
    ];

    // ── New student list ──────────────────────────────────────────────────
    const newStudentList = recentStudents.map((s, i) => {
      const enrollment = s.enrollments[0];
      const teacher = enrollment?.teacher?.user;
      return {
        no: String(i + 1).padStart(2, '0'),
        name: `${s.user.firstName} ${s.user.lastName}`.trim(),
        professor: teacher
          ? `${teacher.firstName} ${teacher.lastName}`.trim()
          : 'Unassigned',
        date: s.user.createdAt.toISOString(),
        status: this.admitStatus(s.user.status),
        subject: enrollment?.course?.title ?? '—',
        fees: s.fees != null ? `${Number(s.fees)}$` : '—',
      };
    });

    // ── Recent activity (merged, newest first) ────────────────────────────
    const activity = [
      ...recentPayments.map((p) => ({
        id: `pay-${p.id}`,
        who: p.invoice?.student
          ? `${p.invoice.student.user.firstName} ${p.invoice.student.user.lastName}`.trim()
          : 'A student',
        action: 'paid invoice',
        target: `${p.invoice?.number ?? ''} · $${Number(p.amount)}`.trim(),
        at: p.createdAt.toISOString(),
        kind: 'payment' as const,
      })),
      ...recentEnrollments.map((e) => ({
        id: `enr-${e.id}`,
        who: `${e.student.user.firstName} ${e.student.user.lastName}`.trim(),
        action: 'enrolled in',
        target: e.course.title,
        at: e.createdAt.toISOString(),
        kind: 'enroll' as const,
      })),
      ...recentTrials.map((t) => ({
        id: `trial-${t.id}`,
        who: t.name,
        action: 'booked a trial for',
        target: t.course,
        at: t.createdAt.toISOString(),
        kind: 'class' as const,
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 6);

    // ── Education course cards ────────────────────────────────────────────
    // Cover images are static assets; the schema has no artwork field.
    const educationCourses = lmsCourses.map((c, i) => ({
      id: c.id,
      title: c.title,
      cover: COVERS[i % COVERS.length],
      date: c.createdAt,
      likes: c.studentsCount,
      duration: c.level,
      professor: c.category,
      students: `+${c.studentsCount}`,
    }));

    // ── Chart series ──────────────────────────────────────────────────────
    const mixMap = new Map<string, number>();
    for (const c of enrollmentsByCourse) {
      mixMap.set(c.category, (mixMap.get(c.category) ?? 0) + c.studentsCount);
    }
    const courseMix = [...mixMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const enrollmentSeries = this.monthlyEnrollment(enrollmentEvents, now);
    const revenueSeries = this.monthlyRevenue(paymentEntries, now);

    return {
      kpis,
      newStudentList,
      activity,
      educationCourses,
      courseMix,
      enrollmentSeries,
      revenueSeries,
    };
  }

  /** Maps a UserStatus onto the admit-status labels the table renders. */
  private admitStatus(status: string): 'Checkin' | 'Pending' | 'Canceled' {
    if (status === 'ACTIVE' || status === 'TRIAL') return 'Checkin';
    if (status === 'INACTIVE' || status === 'PAUSED') return 'Canceled';
    return 'Pending';
  }

  private monthlyEnrollment(
    events: { createdAt: Date; status: string; updatedAt: Date }[],
    now: Date,
  ) {
    const months = this.lastMonths(now, 6);
    return months.map(({ label, start, end }) => ({
      month: label,
      new: events.filter((e) => e.createdAt >= start && e.createdAt < end)
        .length,
      churned: events.filter(
        (e) =>
          e.status === 'CANCELLED' &&
          e.updatedAt >= start &&
          e.updatedAt < end,
      ).length,
    }));
  }

  private monthlyRevenue(entries: { at: Date; amount: number }[], now: Date) {
    const months = this.lastMonths(now, 12);
    return months.map(({ label, start, end }) => {
      const revenue = Math.round(
        entries
          .filter((e) => e.at >= start && e.at < end)
          .reduce((sum, e) => sum + e.amount, 0),
      );
      // No stored target — hold the collected amount as its own reference line.
      return { month: label, revenue, target: revenue };
    });
  }

  private lastMonths(now: Date, count: number) {
    const names = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const out: { label: string; start: Date; end: Date }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({ label: names[start.getMonth()], start, end });
    }
    return out;
  }
}
