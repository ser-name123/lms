import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  ClassStatus,
  EnrollmentStatus,
  StudentAttendanceStatus,
  SubmissionStatus,
} from '../generated/prisma/enums';
import { ResolvedRange, bucketEdges, endOfDay, pct, startOfDay } from './dashboard.range';

/*
 * Student dashboard — learning information only. No fee amounts beyond the
 * student's own dues, no academy-wide figures.
 */

const PRESENT_STATES: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.PRESENT,
  StudentAttendanceStatus.LATE,
];

const OPEN_SUBMISSION: SubmissionStatus[] = [SubmissionStatus.ASSIGNED, SubmissionStatus.DRAFT];

@Injectable()
export class StudentDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async studentProfileId(userId: string) {
    const s = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return s?.id ?? null;
  }

  async dashboard(userId: string, range: ResolvedRange) {
    const studentId = await this.studentProfileId(userId);
    if (!studentId) return this.empty(range);
    return this.forStudent(studentId, range);
  }

  /** Shared with the parent dashboard, which renders the same child data. */
  async forStudent(studentId: string, range: ResolvedRange) {
    const [cards, schedule, pendingWork, progress, achievements] = await Promise.all([
      this.cards(studentId),
      this.todaySchedule(studentId),
      this.pendingWork(studentId),
      this.progress(studentId, range),
      this.achievements(studentId),
    ]);

    return {
      range: range.key,
      studentId,
      cards,
      schedule,
      pendingWork,
      progress,
      achievements,
      generatedAt: new Date().toISOString(),
    };
  }

  private empty(range: ResolvedRange) {
    return {
      range: range.key,
      studentId: null,
      cards: {
        todayClasses: 0,
        attendancePct: 0,
        assignments: { pending: 0, submitted: 0, total: 0 },
        upcomingTests: 0,
        overallProgress: 0,
        certificates: 0,
        learningGoal: null,
      },
      schedule: [],
      pendingWork: [],
      progress: { attendance: [], assignments: [], assessment: [], skills: [], overall: 0 },
      achievements: { certificates: [], completedCourses: [], badges: [] },
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  private async cards(studentId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [
      todayClasses,
      attendanceTotal,
      attendancePresent,
      pendingAssignments,
      submittedAssignments,
      totalAssignments,
      upcomingTests,
      certificates,
      goal,
      snapshot,
    ] = await Promise.all([
      this.prisma.classAttendee.count({
        where: { studentId, class: { startsAt: { gte: todayStart, lt: todayEnd } } },
      }),
      this.prisma.classAttendee.count({ where: { studentId, status: { not: null } } }),
      this.prisma.classAttendee.count({ where: { studentId, status: { in: PRESENT_STATES } } }),
      this.prisma.submission.count({ where: { studentId, status: { in: OPEN_SUBMISSION } } }),
      this.prisma.submission.count({ where: { studentId, submittedAt: { not: null } } }),
      this.prisma.submission.count({ where: { studentId } }),
      this.prisma.assessment.count({
        where: {
          status: { in: ['PUBLISHED', 'SCHEDULED', 'LIVE'] },
          startAt: { gte: now },
          OR: [
            { targetType: 'BATCH', batch: { students: { some: { studentId } } } },
            { targetType: 'SELECTED', targetStudentIds: { has: studentId } },
          ],
        },
      }),
      this.prisma.assessmentAttempt.count({
        where: { studentId, certificateNo: { not: null } },
      }),
      this.prisma.learningGoal.findFirst({
        where: { studentId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, currentPct: true, targetPct: true, deadline: true },
      }),
      this.prisma.progressSnapshot.findFirst({
        where: { studentId },
        orderBy: { periodStart: 'desc' },
        select: { overallScore: true },
      }),
    ]);

    return {
      todayClasses,
      attendancePct: pct(attendancePresent, attendanceTotal),
      assignments: {
        pending: pendingAssignments,
        submitted: submittedAssignments,
        total: totalAssignments,
      },
      upcomingTests,
      overallProgress: Math.round((snapshot?.overallScore ?? 0) * 10) / 10,
      certificates,
      learningGoal: goal,
    };
  }

  // ── Today's schedule ───────────────────────────────────────────────────────

  private async todaySchedule(studentId: string) {
    const now = new Date();
    const rows = await this.prisma.classAttendee.findMany({
      where: { studentId, class: { startsAt: { gte: startOfDay(now), lt: endOfDay(now) } } },
      select: {
        class: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            status: true,
            meetingUrl: true,
            course: { select: { title: true } },
            teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    return rows
      .map((r) => ({
        id: r.class.id,
        title: r.class.title,
        time: r.class.startsAt.toISOString(),
        endsAt: r.class.endsAt.toISOString(),
        subject: r.class.course.title,
        teacher: `${r.class.teacher.user.firstName} ${r.class.teacher.user.lastName}`.trim(),
        status: r.class.status,
        // Only a live class is actually joinable.
        meetingUrl: r.class.status === ClassStatus.LIVE ? r.class.meetingUrl : null,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  // ── Pending work ───────────────────────────────────────────────────────────

  private async pendingWork(studentId: string) {
    const now = new Date();
    const tomorrowEnd = new Date(startOfDay(now).getTime() + 2 * 86_400_000);

    const [dueAssignments, testsTomorrow, feedback] = await Promise.all([
      this.prisma.submission.findMany({
        where: {
          studentId,
          status: { in: OPEN_SUBMISSION },
          assignment: { dueAt: { gte: now } },
        },
        orderBy: { assignment: { dueAt: 'asc' } },
        take: 5,
        select: {
          id: true,
          assignment: { select: { id: true, title: true, dueAt: true, maxMarks: true } },
        },
      }),
      this.prisma.assessment.findMany({
        where: {
          status: { in: ['PUBLISHED', 'SCHEDULED', 'LIVE'] },
          startAt: { gte: now, lte: tomorrowEnd },
          OR: [
            { targetType: 'BATCH', batch: { students: { some: { studentId } } } },
            { targetType: 'SELECTED', targetStudentIds: { has: studentId } },
          ],
        },
        orderBy: { startAt: 'asc' },
        take: 5,
        select: { id: true, title: true, startAt: true, durationMin: true },
      }),
      this.prisma.teacherFeedback.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, remarks: true, createdAt: true },
      }),
    ]);

    return [
      ...dueAssignments.map((s) => ({
        kind: 'ASSIGNMENT_DUE' as const,
        id: s.assignment.id,
        title: s.assignment.title,
        at: s.assignment.dueAt?.toISOString() ?? null,
        link: `/student/assignments`,
      })),
      ...testsTomorrow.map((a) => ({
        kind: 'ASSESSMENT_UPCOMING' as const,
        id: a.id,
        title: a.title,
        at: a.startAt?.toISOString() ?? null,
        link: `/student/assessments`,
      })),
      ...feedback.map((f) => ({
        kind: 'TEACHER_FEEDBACK' as const,
        id: f.id,
        title: f.remarks ?? 'New teacher feedback',
        at: f.createdAt.toISOString(),
        link: `/student/progress`,
      })),
    ];
  }

  // ── Progress ───────────────────────────────────────────────────────────────

  private async progress(studentId: string, range: ResolvedRange) {
    const edges = bucketEdges(range);

    const [attendance, assignments, assessment, skills, snapshot] = await Promise.all([
      Promise.all(
        edges.map(async (e) => {
          const [total, present] = await Promise.all([
            this.prisma.classAttendee.count({
              where: {
                studentId,
                class: { startsAt: { gte: e.start, lt: e.end } },
                status: { not: null },
              },
            }),
            this.prisma.classAttendee.count({
              where: {
                studentId,
                class: { startsAt: { gte: e.start, lt: e.end } },
                status: { in: PRESENT_STATES },
              },
            }),
          ]);
          return pct(present, total);
        }),
      ),
      Promise.all(
        edges.map(async (e) => {
          const [assigned, submitted] = await Promise.all([
            this.prisma.submission.count({
              where: { studentId, assignment: { dueAt: { gte: e.start, lt: e.end } } },
            }),
            this.prisma.submission.count({
              where: {
                studentId,
                assignment: { dueAt: { gte: e.start, lt: e.end } },
                submittedAt: { not: null },
              },
            }),
          ]);
          return pct(submitted, assigned);
        }),
      ),
      Promise.all(
        edges.map((e) =>
          this.prisma.assessmentAttempt.aggregate({
            _avg: { percentage: true },
            where: { studentId, submittedAt: { gte: e.start, lt: e.end } },
          }),
        ),
      ),
      this.prisma.studentSkillProgress.findMany({
        where: { studentId },
        select: { skillId: true, percentage: true },
        orderBy: { percentage: 'desc' },
        take: 10,
      }),
      this.prisma.progressSnapshot.findFirst({
        where: { studentId },
        orderBy: { periodStart: 'desc' },
        select: { overallScore: true },
      }),
    ]);

    const skillNames = await this.prisma.progressSkill.findMany({
      where: { id: { in: skills.map((s) => s.skillId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(skillNames.map((s) => [s.id, s.name]));

    return {
      attendance: edges.map((e, i) => ({ label: e.label, rate: attendance[i] })),
      assignments: edges.map((e, i) => ({ label: e.label, completion: assignments[i] })),
      assessment: edges.map((e, i) => ({
        label: e.label,
        score: Math.round((assessment[i]._avg.percentage ?? 0) * 10) / 10,
      })),
      skills: skills.map((s) => ({
        name: nameById.get(s.skillId) ?? 'Skill',
        percentage: Math.round(s.percentage * 10) / 10,
      })),
      overall: Math.round((snapshot?.overallScore ?? 0) * 10) / 10,
    };
  }

  // ── Achievements ───────────────────────────────────────────────────────────

  private async achievements(studentId: string) {
    const [certificates, completedCourses, badges] = await Promise.all([
      this.prisma.assessmentAttempt.findMany({
        where: { studentId, certificateNo: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          certificateNo: true,
          certificateUrl: true,
          percentage: true,
          publishedAt: true,
          assessment: { select: { title: true } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId, status: EnrollmentStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          completedAt: true,
          progress: true,
          course: { select: { title: true } },
        },
      }),
      this.prisma.studentBadge.findMany({
        where: { studentId },
        orderBy: { awardedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          awardedAt: true,
          badge: { select: { code: true, name: true, description: true, icon: true, tone: true } },
        },
      }),
    ]);

    return {
      certificates: certificates.map((c) => ({
        id: c.id,
        title: c.assessment.title,
        certificateNo: c.certificateNo,
        url: c.certificateUrl,
        score: c.percentage,
        issuedAt: c.publishedAt?.toISOString() ?? null,
      })),
      completedCourses: completedCourses.map((e) => ({
        id: e.id,
        title: e.course.title,
        progress: e.progress,
        completedAt: e.completedAt?.toISOString() ?? null,
      })),
      badges: badges.map((b) => ({
        id: b.id,
        code: b.badge.code,
        name: b.badge.name,
        description: b.badge.description,
        icon: b.badge.icon,
        tone: b.badge.tone,
        awardedAt: b.awardedAt.toISOString(),
      })),
    };
  }
}
