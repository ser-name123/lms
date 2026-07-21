import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus, StudentAttendanceStatus } from '../generated/prisma/enums';
import { ResolvedRange, bucketEdges, pct } from './dashboard.range';

/*
 * Academic Coach dashboard — learning monitoring for the coach's own roster.
 *
 * A coach owns a student via `StudentProfile.coachId` (a plain id column, not a
 * Prisma relation — see the schema comment), so every query here scopes on that.
 */

const PRESENT_STATES: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.PRESENT,
  StudentAttendanceStatus.LATE,
];

@Injectable()
export class CoachDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(coachUserId: string, range: ResolvedRange) {
    const students = await this.prisma.studentProfile.findMany({
      where: { coachId: coachUserId },
      select: {
        id: true,
        studentCode: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true, createdAt: true } },
      },
    });
    const studentIds = students.map((s) => s.id);

    /*
     * A coach with an empty roster still gets a well-formed payload — and
     * still gets their trial tasks. A coach whose work is all leads has no
     * students yet by definition, so returning an empty task list here left
     * exactly the people who most needed the reminder with a blank dashboard.
     */
    if (!studentIds.length) {
      return {
        range: range.key,
        cards: {
          studentsAssigned: 0,
          studentsAtRisk: 0,
          pendingReviews: 0,
          monthlyReviews: 0,
          parentMeetings: 0,
          improvementPlans: 0,
          goalsAchieved: 0,
        },
        performance: { topPerformers: [], needAttention: [], weakStudents: [], newAdmissions: [] },
        charts: { progress: [], assessment: [], assignment: [], attendance: [] },
        upcomingTasks: await this.upcomingTasks(coachUserId, []),
        generatedAt: new Date().toISOString(),
      };
    }

    const [cards, performance, charts, upcomingTasks] = await Promise.all([
      this.cards(coachUserId, studentIds),
      this.performance(students),
      this.charts(studentIds, range),
      this.upcomingTasks(coachUserId, studentIds),
    ]);

    return {
      range: range.key,
      cards,
      performance,
      charts,
      upcomingTasks,
      generatedAt: new Date().toISOString(),
    };
  }


  // ── Cards ──────────────────────────────────────────────────────────────────

  private async cards(coachUserId: string, studentIds: string[]) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [atRisk, monthlyReviews, reviewedThisMonth, parentMeetings, activeGoals, achievedGoals] =
      await Promise.all([
        this.prisma.progressRiskFlag.count({
          where: { studentId: { in: studentIds }, status: 'OPEN' },
        }),
        this.prisma.monthlyReview.count({
          where: { studentId: { in: studentIds }, periodStart: { gte: monthStart } },
        }),
        this.prisma.monthlyReview
          .findMany({
            where: { studentId: { in: studentIds }, periodStart: { gte: monthStart } },
            select: { studentId: true },
            distinct: ['studentId'],
          })
          .then((rows) => rows.length),
        this.prisma.parentMeeting.count({
          where: {
            studentId: { in: studentIds },
            status: 'SCHEDULED',
            scheduledAt: { gte: now },
          },
        }),
        this.prisma.learningGoal.count({
          where: { studentId: { in: studentIds }, status: 'ACTIVE' },
        }),
        this.prisma.learningGoal.count({
          where: { studentId: { in: studentIds }, status: 'ACHIEVED' },
        }),
      ]);

    return {
      studentsAssigned: studentIds.length,
      studentsAtRisk: atRisk,
      // Students on the roster who have not been reviewed yet this month.
      pendingReviews: Math.max(0, studentIds.length - reviewedThisMonth),
      monthlyReviews,
      parentMeetings,
      improvementPlans: activeGoals,
      goalsAchieved: achievedGoals,
    };
  }

  // ── Student performance buckets ────────────────────────────────────────────

  private async performance(
    students: {
      id: string;
      studentCode: string;
      user: { firstName: string; lastName: string; avatarUrl: string | null; createdAt: Date };
    }[],
  ) {
    const studentIds = students.map((s) => s.id);
    const nameById = new Map(
      students.map((s) => [
        s.id,
        {
          studentId: s.id,
          studentCode: s.studentCode,
          name: `${s.user.firstName} ${s.user.lastName}`.trim(),
          avatarUrl: s.user.avatarUrl,
        },
      ]),
    );

    // Latest snapshot per student drives the ranking.
    const snapshots = await this.prisma.progressSnapshot.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { periodStart: 'desc' },
      select: {
        studentId: true,
        overallScore: true,
        attendancePct: true,
        assignmentPct: true,
        assessmentPct: true,
        statusLabel: true,
        periodStart: true,
      },
    });

    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snap of snapshots) {
      if (!latest.has(snap.studentId)) latest.set(snap.studentId, snap);
    }

    const scored = [...latest.values()]
      .map((s) => ({ ...nameById.get(s.studentId)!, ...s }))
      .filter((s) => s.studentId);

    const byScoreDesc = [...scored].sort((a, b) => b.overallScore - a.overallScore);
    const openRisks = await this.prisma.progressRiskFlag.findMany({
      where: { studentId: { in: studentIds }, status: 'OPEN' },
      select: { studentId: true, level: true, reasons: true },
    });
    const riskByStudent = new Map(openRisks.map((r) => [r.studentId, r]));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

    /*
     * Top and weak are drawn from the same ranking, so on a roster of fewer
     * than ten scored students they used to overlap and the same name showed
     * up as both the best and the worst. Weak is now the bottom of whatever is
     * left after the top has been taken.
     */
    const topPerformers = byScoreDesc.slice(0, 5);
    const topIds = new Set(topPerformers.map((s) => s.studentId));
    const weakStudents = [...byScoreDesc]
      .reverse()
      .filter((s) => !topIds.has(s.studentId))
      .slice(0, 5);

    return {
      topPerformers,
      needAttention: byScoreDesc
        .filter((s) => riskByStudent.has(s.studentId))
        .slice(0, 5)
        .map((s) => ({ ...s, risk: riskByStudent.get(s.studentId) })),
      weakStudents,
      newAdmissions: students
        .filter((s) => s.user.createdAt >= thirtyDaysAgo)
        .slice(0, 5)
        .map((s) => ({
          studentId: s.id,
          studentCode: s.studentCode,
          name: `${s.user.firstName} ${s.user.lastName}`.trim(),
          avatarUrl: s.user.avatarUrl,
          joinedAt: s.user.createdAt.toISOString(),
        })),
    };
  }

  // ── Charts ─────────────────────────────────────────────────────────────────

  private async charts(studentIds: string[], range: ResolvedRange) {
    const edges = bucketEdges(range);

    const [progress, assessment, assignment, attendance] = await Promise.all([
      Promise.all(
        edges.map((e) =>
          this.prisma.progressSnapshot.aggregate({
            _avg: { overallScore: true },
            where: {
              studentId: { in: studentIds },
              periodStart: { gte: e.start, lt: e.end },
            },
          }),
        ),
      ),
      Promise.all(
        edges.map((e) =>
          this.prisma.assessmentAttempt.aggregate({
            _avg: { percentage: true },
            where: {
              studentId: { in: studentIds },
              submittedAt: { gte: e.start, lt: e.end },
            },
          }),
        ),
      ),
      Promise.all(
        edges.map(async (e) => {
          const [assigned, submitted] = await Promise.all([
            this.prisma.submission.count({
              where: {
                studentId: { in: studentIds },
                assignment: { dueAt: { gte: e.start, lt: e.end } },
              },
            }),
            this.prisma.submission.count({
              where: {
                studentId: { in: studentIds },
                assignment: { dueAt: { gte: e.start, lt: e.end } },
                submittedAt: { not: null },
              },
            }),
          ]);
          return pct(submitted, assigned);
        }),
      ),
      Promise.all(
        edges.map(async (e) => {
          const [total, present] = await Promise.all([
            this.prisma.classAttendee.count({
              where: {
                studentId: { in: studentIds },
                class: { startsAt: { gte: e.start, lt: e.end } },
                status: { not: null },
              },
            }),
            this.prisma.classAttendee.count({
              where: {
                studentId: { in: studentIds },
                class: { startsAt: { gte: e.start, lt: e.end } },
                status: { in: PRESENT_STATES },
              },
            }),
          ]);
          return pct(present, total);
        }),
      ),
    ]);

    return {
      progress: edges.map((e, i) => ({
        label: e.label,
        score: Math.round((progress[i]._avg.overallScore ?? 0) * 10) / 10,
      })),
      assessment: edges.map((e, i) => ({
        label: e.label,
        score: Math.round((assessment[i]._avg.percentage ?? 0) * 10) / 10,
      })),
      assignment: edges.map((e, i) => ({ label: e.label, completion: assignment[i] })),
      attendance: edges.map((e, i) => ({ label: e.label, rate: attendance[i] })),
    };
  }

  // ── Upcoming tasks ─────────────────────────────────────────────────────────

  private async upcomingTasks(coachUserId: string, studentIds: string[]) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86_400_000);

    const [meetings, dueReviews, trialEvaluations, counseling, unassignedTrials] = await Promise.all([
      this.prisma.parentMeeting.findMany({
        where: {
          studentId: { in: studentIds },
          status: 'SCHEDULED',
          scheduledAt: { gte: now, lte: horizon },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
        select: { id: true, studentId: true, scheduledAt: true, agenda: true },
      }),
      // Reviews whose next-review date has arrived.
      this.prisma.parentMeeting.findMany({
        where: {
          studentId: { in: studentIds },
          nextReviewAt: { gte: now, lte: horizon },
        },
        orderBy: { nextReviewAt: 'asc' },
        take: 10,
        select: { id: true, studentId: true, nextReviewAt: true },
      }),
      /*
       * Trials this coach owns that have happened but have no decision yet.
       *
       * WAITING_PARENT_DECISION belongs here as much as TRIAL_COMPLETED: that
       * is the status a trial moves to the moment the teacher files their
       * report, which is precisely when the coach can finally decide. Listing
       * only TRIAL_COMPLETED inverted the task — it nagged while the coach
       * could do nothing, then vanished when they could.
       */
      this.prisma.lead.findMany({
        where: {
          assignedCoachId: coachUserId,
          status: { in: [LeadStatus.TRIAL_COMPLETED, LeadStatus.WAITING_PARENT_DECISION] },
          coachDecision: null,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          leadNumber: true,
          studentFirstName: true,
          studentLastName: true,
          updatedAt: true,
        },
      }),
      /*
       * Student counseling: a risk flag the engine raised on one of this
       * coach's students that nobody has acknowledged or resolved yet. The
       * flag *is* the counseling task — there is no separate booking model.
       */
      this.prisma.progressRiskFlag.findMany({
        where: { studentId: { in: studentIds }, status: 'OPEN' },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: { id: true, studentId: true, level: true, reasons: true, createdAt: true },
      }),
      /*
       * Upcoming trials on this coach's leads with nobody to teach them. This
       * is the failure that used to pass silently: the class shows on no
       * teacher's screen, but the Zoom room exists and the family still gets
       * their reminder, so nothing looks wrong until the day itself.
       *
       * No horizon filter, unlike the other tasks — a teacherless class three
       * weeks out is still a task, and hiding it until it is nearly due is how
       * it got missed in the first place.
       */
      this.prisma.leadTrial.findMany({
        where: {
          teacherId: null,
          scheduledAt: { gte: now },
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
          lead: { assignedCoachId: coachUserId },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
        select: {
          id: true,
          scheduledAt: true,
          lead: {
            select: {
              id: true,
              leadNumber: true,
              studentFirstName: true,
              studentLastName: true,
            },
          },
        },
      }),
    ]);

    const names = await this.prisma.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    const nameById = new Map(
      names.map((n) => [n.id, `${n.user.firstName} ${n.user.lastName}`.trim()]),
    );

    return [
      ...meetings.map((m) => ({
        kind: 'PARENT_MEETING' as const,
        id: m.id,
        title: `Parent meeting — ${nameById.get(m.studentId) ?? 'Student'}`,
        detail: m.agenda,
        at: m.scheduledAt.toISOString(),
        link: `/students/${m.studentId}`,
      })),
      ...dueReviews.map((r) => ({
        kind: 'MONTHLY_REVIEW' as const,
        id: r.id,
        title: `Monthly review — ${nameById.get(r.studentId) ?? 'Student'}`,
        detail: null,
        at: r.nextReviewAt!.toISOString(),
        link: `/students/${r.studentId}`,
      })),
      ...unassignedTrials.map((t) => ({
        kind: 'TRIAL_NEEDS_TEACHER' as const,
        id: t.id,
        title: `Assign a teacher — ${t.lead.studentFirstName} ${t.lead.studentLastName}`.trim(),
        detail: t.lead.leadNumber,
        at: t.scheduledAt.toISOString(),
        link: `/leads/${t.lead.id}`,
      })),
      ...trialEvaluations.map((l) => ({
        kind: 'TRIAL_EVALUATION' as const,
        id: l.id,
        title: `Trial decision — ${l.studentFirstName} ${l.studentLastName}`.trim(),
        detail: l.leadNumber,
        at: l.updatedAt.toISOString(),
        // The lead itself, like every sibling task — not a hundred-row list
        // the coach then has to search for the name they just clicked.
        link: `/leads/${l.id}`,
      })),
      ...counseling.map((f) => ({
        kind: 'STUDENT_COUNSELING' as const,
        id: f.id,
        title: `Counseling — ${nameById.get(f.studentId) ?? 'Student'}`,
        detail: f.reasons.length ? f.reasons.join(', ') : f.level,
        at: f.createdAt.toISOString(),
        link: `/students/${f.studentId}`,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));
  }
}
