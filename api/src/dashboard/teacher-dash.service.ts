import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ClassStatus, StudentAttendanceStatus, SubmissionStatus } from '../generated/prisma/enums';
import { ResolvedRange, bucketEdges, endOfDay, pct, startOfDay } from './dashboard.range';

/*
 * Teacher dashboard — the teacher's own working day.
 *
 * `req.user` carries only {id, email, role}, so the TeacherProfile is resolved
 * here (the same idiom every other service uses). A teacher without a profile
 * gets a zeroed payload rather than a 500.
 */

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
export class TeacherDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async teacherProfileId(userId: string) {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return t?.id ?? null;
  }

  async dashboard(userId: string, range: ResolvedRange) {
    const teacherId = await this.teacherProfileId(userId);
    if (!teacherId) return this.empty(range);

    const [cards, schedule, pendingWork, students, charts] = await Promise.all([
      this.cards(teacherId),
      this.todaySchedule(teacherId),
      this.pendingWork(teacherId),
      this.studentSummary(teacherId),
      this.charts(teacherId, range),
    ]);

    return {
      range: range.key,
      cards,
      schedule,
      pendingWork,
      students,
      charts,
      generatedAt: new Date().toISOString(),
    };
  }

  private empty(range: ResolvedRange) {
    return {
      range: range.key,
      cards: {
        todayClasses: 0,
        upcomingClasses: 0,
        students: 0,
        assignmentsPendingReview: 0,
        assessmentsPendingEvaluation: 0,
        attendancePending: 0,
        trialClasses: 0,
      },
      schedule: [],
      pendingWork: [],
      students: { highestPerformer: null, lowAttendance: [], lateSubmissions: [], weakStudents: [] },
      charts: { classCompletion: [], attendance: [], assignmentStatus: [], assessmentAverage: [] },
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  private async cards(teacherId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [
      todayClasses,
      upcomingClasses,
      students,
      assignmentsPendingReview,
      assessmentsPending,
      attendancePending,
      trialClasses,
    ] = await Promise.all([
      this.prisma.classSession.count({
        where: { teacherId, startsAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.classSession.count({
        where: { teacherId, startsAt: { gte: now }, status: ClassStatus.SCHEDULED },
      }),
      this.prisma.enrollment
        .findMany({ where: { teacherId }, select: { studentId: true }, distinct: ['studentId'] })
        .then((rows) => rows.length),
      this.prisma.submission.count({
        where: { assignment: { teacherId }, status: { in: PENDING_SUBMISSION } },
      }),
      this.prisma.assessmentAttempt.count({
        where: { assessment: { teacherId }, status: { in: ['SUBMITTED', 'UNDER_EVALUATION'] } },
      }),
      // Finished classes whose attendance was never filled in and never locked.
      this.prisma.classSession.count({
        where: {
          teacherId,
          status: ClassStatus.COMPLETED,
          attendanceLocked: false,
          attendees: { some: { status: null } },
        },
      }),
      this.prisma.leadTrial.count({
        where: { teacherId, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
      }),
    ]);

    return {
      todayClasses,
      upcomingClasses,
      students,
      assignmentsPendingReview,
      assessmentsPendingEvaluation: assessmentsPending,
      attendancePending,
      trialClasses,
    };
  }

  // ── Today's schedule ───────────────────────────────────────────────────────

  private async todaySchedule(teacherId: string) {
    const now = new Date();
    const sessions = await this.prisma.classSession.findMany({
      where: { teacherId, startsAt: { gte: startOfDay(now), lt: endOfDay(now) } },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        meetingUrl: true,
        course: { select: { title: true } },
        batch: { select: { name: true } },
        _count: { select: { attendees: true } },
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      time: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      course: s.course.title,
      batch: s.batch?.name ?? null,
      students: s._count.attendees,
      status: s.status,
      meetingUrl: s.meetingUrl,
    }));
  }

  // ── Pending work queue ─────────────────────────────────────────────────────

  private async pendingWork(teacherId: string) {
    const [assignments, assessments, attendance, recentClasses] = await Promise.all([
      this.prisma.submission.count({
        where: { assignment: { teacherId }, status: { in: PENDING_SUBMISSION } },
      }),
      this.prisma.assessmentAttempt.count({
        where: { assessment: { teacherId }, status: { in: ['SUBMITTED', 'UNDER_EVALUATION'] } },
      }),
      this.prisma.classSession.count({
        where: {
          teacherId,
          status: ClassStatus.COMPLETED,
          attendanceLocked: false,
          attendees: { some: { status: null } },
        },
      }),
      // Completed classes in the last week — feedback is subtracted below.
      this.prisma.classSession.findMany({
        where: {
          teacherId,
          status: ClassStatus.COMPLETED,
          actualEndAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
        select: { id: true },
      }),
    ]);

    /*
     * TeacherFeedback.classSessionId is a plain column with no relation
     * declared, so the "has no feedback yet" test cannot be pushed into the
     * ClassSession query — it is a second lookup and a set difference.
     * Without this the count was simply "classes taught this week".
     */
    const sessionIds = recentClasses.map((c) => c.id);
    const withFeedback = sessionIds.length
      ? await this.prisma.teacherFeedback.findMany({
          // Not filtered on teacherId: the sessions are already this teacher's,
          // and feedback rows may be logged with a null teacherId.
          where: { classSessionId: { in: sessionIds } },
          select: { classSessionId: true },
          distinct: ['classSessionId'],
        })
      : [];
    const covered = new Set(withFeedback.map((f) => f.classSessionId));
    const feedbackDue = sessionIds.filter((id) => !covered.has(id)).length;

    return [
      { key: 'check-assignments', label: 'Check Assignments', count: assignments, link: '/teacher/assignments' },
      { key: 'evaluate-tests', label: 'Evaluate Tests', count: assessments, link: '/teacher/assessments' },
      { key: 'take-attendance', label: 'Take Attendance', count: attendance, link: '/teacher/attendance' },
      { key: 'give-feedback', label: 'Give Feedback', count: feedbackDue, link: '/teacher/progress' },
    ].filter((t) => t.count > 0);
  }

  // ── Student summary ────────────────────────────────────────────────────────

  private async studentSummary(teacherId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { teacherId },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const studentIds = enrollments.map((e) => e.studentId);
    if (!studentIds.length) {
      return { highestPerformer: null, lowAttendance: [], lateSubmissions: [], weakStudents: [] };
    }

    const profiles = await this.prisma.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        studentCode: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    const label = (id: string) => {
      const p = profiles.find((x) => x.id === id);
      return p
        ? {
            studentId: p.id,
            studentCode: p.studentCode,
            name: `${p.user.firstName} ${p.user.lastName}`.trim(),
            avatarUrl: p.user.avatarUrl,
          }
        : { studentId: id, studentCode: '', name: 'Unknown', avatarUrl: null };
    };

    const since = new Date(Date.now() - 30 * 86_400_000);

    const [snapshots, attendanceRows, lateRows] = await Promise.all([
      this.prisma.progressSnapshot.findMany({
        where: { studentId: { in: studentIds } },
        orderBy: { periodStart: 'desc' },
        select: { studentId: true, overallScore: true, statusLabel: true, periodStart: true },
      }),
      Promise.all(
        studentIds.map(async (studentId) => {
          const [total, present] = await Promise.all([
            this.prisma.classAttendee.count({
              where: { studentId, class: { teacherId, startsAt: { gte: since } }, status: { not: null } },
            }),
            this.prisma.classAttendee.count({
              where: {
                studentId,
                class: { teacherId, startsAt: { gte: since } },
                status: { in: PRESENT_STATES },
              },
            }),
          ]);
          return { studentId, total, rate: pct(present, total) };
        }),
      ),
      this.prisma.submission.groupBy({
        by: ['studentId'],
        where: { assignment: { teacherId }, isLate: true },
        _count: { _all: true },
        orderBy: { _count: { studentId: 'desc' } },
        take: 5,
      }),
    ]);

    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) if (!latest.has(s.studentId)) latest.set(s.studentId, s);
    const ranked = [...latest.values()].sort((a, b) => b.overallScore - a.overallScore);

    // The highest performer must not reappear at the bottom of the same list,
    // which is what happened whenever fewer than six students were scored.
    const highest = ranked[0];

    return {
      highestPerformer: highest
        ? { ...label(highest.studentId), score: highest.overallScore }
        : null,
      lowAttendance: attendanceRows
        .filter((r) => r.total > 0 && r.rate < 75)
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 5)
        .map((r) => ({ ...label(r.studentId), attendance: r.rate })),
      lateSubmissions: lateRows.map((r) => ({ ...label(r.studentId), lateCount: r._count._all })),
      weakStudents: [...ranked]
        .reverse()
        .filter((r) => r.studentId !== highest?.studentId)
        .slice(0, 5)
        .map((r) => ({ ...label(r.studentId), score: r.overallScore, status: r.statusLabel })),
    };
  }

  // ── Charts ─────────────────────────────────────────────────────────────────

  private async charts(teacherId: string, range: ResolvedRange) {
    const edges = bucketEdges(range);

    const [completion, attendance, assignmentStatus, assessmentAvg] = await Promise.all([
      Promise.all(
        edges.map(async (e) => {
          const [scheduled, completed] = await Promise.all([
            this.prisma.classSession.count({
              where: { teacherId, startsAt: { gte: e.start, lt: e.end } },
            }),
            this.prisma.classSession.count({
              where: {
                teacherId,
                startsAt: { gte: e.start, lt: e.end },
                status: ClassStatus.COMPLETED,
              },
            }),
          ]);
          return { scheduled, completed };
        }),
      ),
      Promise.all(
        edges.map(async (e) => {
          const [total, present] = await Promise.all([
            this.prisma.classAttendee.count({
              where: {
                class: { teacherId, startsAt: { gte: e.start, lt: e.end } },
                status: { not: null },
              },
            }),
            this.prisma.classAttendee.count({
              where: {
                class: { teacherId, startsAt: { gte: e.start, lt: e.end } },
                status: { in: PRESENT_STATES },
              },
            }),
          ]);
          return pct(present, total);
        }),
      ),
      this.prisma.submission.groupBy({
        by: ['status'],
        where: { assignment: { teacherId } },
        _count: { _all: true },
      }),
      Promise.all(
        edges.map((e) =>
          this.prisma.assessmentAttempt.aggregate({
            _avg: { percentage: true },
            where: { assessment: { teacherId }, submittedAt: { gte: e.start, lt: e.end } },
          }),
        ),
      ),
    ]);

    return {
      classCompletion: edges.map((e, i) => ({ label: e.label, ...completion[i] })),
      attendance: edges.map((e, i) => ({ label: e.label, rate: attendance[i] })),
      assignmentStatus: assignmentStatus.map((r) => ({ name: r.status, value: r._count._all })),
      assessmentAverage: edges.map((e, i) => ({
        label: e.label,
        score: Math.round((assessmentAvg[i]._avg.percentage ?? 0) * 10) / 10,
      })),
    };
  }
}
