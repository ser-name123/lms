import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StudentManagementService } from '../student-management/student-management.service';
import { AssessmentsService } from '../assessments/assessments.service';
import {
  COMPLETED_ATTEMPT_STATUSES,
  DEFAULT_PROGRESS_CONFIG,
  PROGRESS_CONFIG_KEY,
  ProgressConfig,
  ProgressRiskThresholds,
  ProgressThresholds,
  ProgressWeights,
  statusFromScore,
} from './progress.config';

export type ProgressConfigPatch = {
  weights?: Partial<ProgressWeights>;
  thresholds?: Partial<ProgressThresholds>;
  risk?: Partial<ProgressRiskThresholds>;
};

const STAR_KEYS = [
  'participation',
  'homework',
  'communication',
  'understanding',
  'behavior',
] as const;

const REVIEW_KEYS = [
  'academic',
  'attendance',
  'behavior',
  'participation',
  'learningSpeed',
  'homework',
  'communication',
] as const;

/** The 5 weighted components of a progress score. null = no data yet. */
export type ProgressComponents = {
  attendance: number | null;
  assignments: number | null;
  assessments: number | null;
  feedback: number | null;
  coach: number | null;
};

@Injectable()
export class ProgressEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentMgmt: StudentManagementService,
    private readonly assessments: AssessmentsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Config (SystemSetting JSON blob) ─────────────────────────────────────
  async getConfig(): Promise<ProgressConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: PROGRESS_CONFIG_KEY },
    });
    if (!row) return this.cloneDefault();
    try {
      const p = JSON.parse(row.value) as Partial<ProgressConfig>;
      return {
        weights: { ...DEFAULT_PROGRESS_CONFIG.weights, ...(p.weights ?? {}) },
        thresholds: {
          ...DEFAULT_PROGRESS_CONFIG.thresholds,
          ...(p.thresholds ?? {}),
        },
        risk: { ...DEFAULT_PROGRESS_CONFIG.risk, ...(p.risk ?? {}) },
      };
    } catch {
      return this.cloneDefault();
    }
  }

  async updateConfig(dto: ProgressConfigPatch): Promise<ProgressConfig> {
    const cur = await this.getConfig();
    const merged: ProgressConfig = {
      weights: { ...cur.weights, ...(dto.weights ?? {}) },
      thresholds: { ...cur.thresholds, ...(dto.thresholds ?? {}) },
      risk: { ...cur.risk, ...(dto.risk ?? {}) },
    };
    await this.prisma.systemSetting.upsert({
      where: { key: PROGRESS_CONFIG_KEY },
      update: { value: JSON.stringify(merged) },
      create: { key: PROGRESS_CONFIG_KEY, value: JSON.stringify(merged) },
    });
    return merged;
  }

  private cloneDefault(): ProgressConfig {
    return {
      weights: { ...DEFAULT_PROGRESS_CONFIG.weights },
      thresholds: { ...DEFAULT_PROGRESS_CONFIG.thresholds },
      risk: { ...DEFAULT_PROGRESS_CONFIG.risk },
    };
  }

  // ── Small numeric helpers ────────────────────────────────────────────────
  private avg(nums: number[]): number | null {
    const v = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  /** Turn 1..5 star ratings into a 0..100 percentage (5★ = 100%). */
  private starsToPct(values: (number | null | undefined)[]): number | null {
    const s = values.filter(
      (v): v is number => typeof v === 'number' && v > 0,
    );
    return s.length ? (s.reduce((a, b) => a + b, 0) / s.length) * 20 : null;
  }

  private round(n: number | null): number | null {
    return n == null ? null : Math.round(n * 10) / 10;
  }

  // ── Raw data gather (one round-trip set per student) ─────────────────────
  private async gather(studentId: string) {
    const [attendance, assignments, attempts, feedbacks, review] =
      await Promise.all([
        this.studentMgmt.getAttendance(studentId),
        this.studentMgmt.getAssignments(studentId),
        this.assessments.studentAttempts(studentId),
        this.prisma.teacherFeedback.findMany({
          where: { studentId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.monthlyReview.findFirst({
          where: { studentId },
          orderBy: { periodStart: 'desc' },
        }),
      ]);
    return { attendance, assignments, attempts, feedbacks, review };
  }

  private scoreFrom(
    raw: Awaited<ReturnType<ProgressEngineService['gather']>>,
    cfg: ProgressConfig,
  ) {
    const { attendance, assignments, attempts, feedbacks, review } = raw;

    const attendancePct =
      attendance.summary.total > 0 ? attendance.summary.rate : null;
    const assignmentPct = assignments.summary.avgMark; // 0..100 | null

    const completed = attempts.filter((a) =>
      COMPLETED_ATTEMPT_STATUSES.includes(a.status),
    );
    const assessmentPct = completed.length
      ? this.avg(completed.map((a) => a.percentage))
      : null;

    const feedbackScore = this.starsToPct(
      feedbacks.flatMap((f) => STAR_KEYS.map((k) => f[k])),
    );
    const coachScore = review
      ? this.starsToPct(REVIEW_KEYS.map((k) => review[k]))
      : null;

    const components: ProgressComponents = {
      attendance: attendancePct,
      assignments: assignmentPct,
      assessments: assessmentPct,
      feedback: feedbackScore,
      coach: coachScore,
    };

    // Weighted average, renormalised over the components that actually have
    // data (so a student with no coach review yet isn't unfairly penalised).
    const parts: { pct: number; w: number }[] = [
      { pct: attendancePct, w: cfg.weights.attendance },
      { pct: assignmentPct, w: cfg.weights.assignments },
      { pct: assessmentPct, w: cfg.weights.assessments },
      { pct: feedbackScore, w: cfg.weights.feedback },
      { pct: coachScore, w: cfg.weights.coach },
    ].filter((p): p is { pct: number; w: number } => p.pct != null && p.w > 0);

    const wSum = parts.reduce((a, p) => a + p.w, 0);
    const hasData = parts.length > 0;
    const overall = wSum
      ? Math.round(parts.reduce((a, p) => a + p.w * p.pct, 0) / wSum)
      : 0;
    // Students with no attendance/assignment/assessment/feedback yet read as
    // NO_DATA rather than being mislabelled CRITICAL at 0%.
    const status = hasData ? statusFromScore(overall, cfg.thresholds) : 'NO_DATA';

    return { components, overall, status, hasData };
  }

  /** Lightweight score for lists / dashboards. */
  async computeCore(studentId: string, cfg?: ProgressConfig) {
    const config = cfg ?? (await this.getConfig());
    const raw = await this.gather(studentId);
    const s = this.scoreFrom(raw, config);
    return {
      attendancePct: this.round(s.components.attendance),
      assignmentPct: this.round(s.components.assignments),
      assessmentPct: this.round(s.components.assessments),
      feedbackScore: this.round(s.components.feedback),
      coachScore: this.round(s.components.coach),
      overall: s.overall,
      status: s.status,
      hasData: s.hasData,
    };
  }

  /** Full detail (breakdowns) for a single-student progress view. */
  async computeStudent(studentId: string, cfg?: ProgressConfig) {
    const config = cfg ?? (await this.getConfig());
    const raw = await this.gather(studentId);
    const core = this.scoreFrom(raw, config);
    const { attendance, assignments, attempts, feedbacks, review } = raw;

    // Assessment breakdown by type (QUIZ / WEEKLY_TEST / MONTHLY_TEST / ...).
    const completed = attempts.filter((a) =>
      COMPLETED_ATTEMPT_STATUSES.includes(a.status),
    );
    const byTypeMap = new Map<string, number[]>();
    for (const a of completed) {
      const key = a.type || 'OTHER';
      (byTypeMap.get(key) ?? byTypeMap.set(key, []).get(key)!).push(
        a.percentage,
      );
    }
    const assessmentByType = [...byTypeMap.entries()].map(([type, pcts]) => ({
      type,
      avg: Math.round(this.avg(pcts) ?? 0),
      count: pcts.length,
    }));

    // Subject-wise progress (blend assignment grades + assessment %).
    const subjMap = new Map<string, number[]>();
    for (const a of completed) {
      if (!a.subject) continue;
      (subjMap.get(a.subject) ?? subjMap.set(a.subject, []).get(a.subject)!).push(
        a.percentage,
      );
    }
    const subjects = [...subjMap.entries()]
      .map(([subject, pcts]) => ({
        subject,
        progress: Math.round(this.avg(pcts) ?? 0),
      }))
      .sort((x, y) => y.progress - x.progress);

    // Skill-wise progress (cached rows).
    const skillRows = await this.prisma.studentSkillProgress.findMany({
      where: { studentId },
    });
    const skillIds = skillRows.map((r) => r.skillId);
    const skillDefs = skillIds.length
      ? await this.prisma.progressSkill.findMany({
          where: { id: { in: skillIds } },
          select: { id: true, name: true },
        })
      : [];
    const skillName = new Map(skillDefs.map((s) => [s.id, s.name]));
    const skills = skillRows.map((r) => ({
      skillId: r.skillId,
      name: skillName.get(r.skillId) ?? 'Skill',
      percentage: Math.round(r.percentage),
    }));

    // Feedback category averages + recent remarks.
    const feedbackAverages = STAR_KEYS.map((k) => ({
      key: k,
      avg: this.round(this.avg(
        feedbacks.map((f) => f[k]).filter((v): v is number => typeof v === 'number' && v > 0),
      ) ?? 0),
    }));

    return {
      scores: {
        attendancePct: this.round(core.components.attendance),
        assignmentPct: this.round(core.components.assignments),
        assessmentPct: this.round(core.components.assessments),
        feedbackScore: this.round(core.components.feedback),
        coachScore: this.round(core.components.coach),
        overall: core.overall,
        status: core.status,
      },
      attendance: {
        rate: attendance.summary.rate,
        present: attendance.summary.present,
        late: attendance.summary.late,
        total: attendance.summary.total,
        trend: attendance.trend,
      },
      assignments: assignments.summary,
      assessments: {
        overall: Math.round(core.components.assessments ?? 0),
        count: completed.length,
        byType: assessmentByType,
      },
      subjects,
      skills,
      feedback: {
        averages: feedbackAverages,
        recent: feedbacks.slice(0, 8).map((f) => ({
          id: f.id,
          kind: f.kind,
          participation: f.participation,
          homework: f.homework,
          communication: f.communication,
          understanding: f.understanding,
          behavior: f.behavior,
          remarks: f.remarks,
          suggestions: f.suggestions,
          actorName: f.actorName,
          createdAt: f.createdAt,
        })),
      },
      latestReview: review,
    };
  }

  // ── Risk detection ───────────────────────────────────────────────────────
  detectRisk(
    core: {
      attendancePct: number | null;
      assignmentPct: number | null;
      assessmentPct: number | null;
    },
    cfg: ProgressConfig,
  ): { atRisk: boolean; level: 'AT_RISK' | 'CRITICAL'; reasons: string[] } {
    const reasons: string[] = [];
    if (core.attendancePct != null && core.attendancePct < cfg.risk.attendance)
      reasons.push(`Attendance ${Math.round(core.attendancePct)}% < ${cfg.risk.attendance}%`);
    if (core.assignmentPct != null && core.assignmentPct < cfg.risk.assignment)
      reasons.push(`Assignment ${Math.round(core.assignmentPct)}% < ${cfg.risk.assignment}%`);
    if (core.assessmentPct != null && core.assessmentPct < cfg.risk.assessment)
      reasons.push(`Assessment ${Math.round(core.assessmentPct)}% < ${cfg.risk.assessment}%`);
    return {
      atRisk: reasons.length > 0,
      level: reasons.length >= 2 ? 'CRITICAL' : 'AT_RISK',
      reasons,
    };
  }

  // ── Skills: recompute per-student mastery from skill-linked graded work ────
  async refreshStudentSkills(studentId: string): Promise<void> {
    const [subs, attempts] = await Promise.all([
      this.prisma.submission.findMany({
        where: { studentId, grade: { not: null }, assignment: { skillId: { not: null } } },
        select: { grade: true, assignment: { select: { skillId: true, maxMarks: true } } },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: {
          studentId,
          status: { in: COMPLETED_ATTEMPT_STATUSES },
          assessment: { skillId: { not: null } },
        },
        select: { percentage: true, assessment: { select: { skillId: true } } },
      }),
    ]);

    const bySkill = new Map<string, number[]>();
    for (const s of subs) {
      const sid = s.assignment.skillId!;
      const max = s.assignment.maxMarks || 100;
      const pct = Math.max(0, Math.min(100, ((s.grade ?? 0) / max) * 100));
      (bySkill.get(sid) ?? bySkill.set(sid, []).get(sid)!).push(pct);
    }
    for (const a of attempts) {
      const sid = a.assessment.skillId!;
      (bySkill.get(sid) ?? bySkill.set(sid, []).get(sid)!).push(a.percentage);
    }

    for (const [skillId, pcts] of bySkill) {
      const percentage = Math.round(this.avg(pcts) ?? 0);
      await this.prisma.studentSkillProgress.upsert({
        where: { studentId_skillId: { studentId, skillId } },
        update: { percentage, sampleSize: pcts.length },
        create: { studentId, skillId, percentage, sampleSize: pcts.length },
      });
    }
  }

  // ── Badges: seed catalogue + auto-award ───────────────────────────────────
  private static readonly DEFAULT_BADGES = [
    { code: 'PERFECT_ATTENDANCE', name: 'Perfect Attendance', description: '100% attendance', icon: '🎯', tone: 'good' },
    { code: 'ASSIGNMENT_CHAMPION', name: 'Assignment Champion', description: '90%+ assignment average', icon: '🏆', tone: 'accent' },
    { code: 'TOP_PERFORMER', name: 'Top Performer', description: 'Excellent overall progress', icon: '⭐', tone: 'good' },
    { code: 'FAST_LEARNER', name: 'Fast Learner', description: '90%+ assessment average', icon: '⚡', tone: 'accent' },
    { code: 'EXCELLENT_IMPROVEMENT', name: 'Excellent Improvement', description: '10%+ month-over-month gain', icon: '📈', tone: 'good' },
    { code: 'CONSISTENCY_AWARD', name: 'Consistency Award', description: 'High attendance + assignments', icon: '🔥', tone: 'warning' },
  ];

  async seedBadges(): Promise<void> {
    for (const b of ProgressEngineService.DEFAULT_BADGES) {
      await this.prisma.badge.upsert({
        where: { code: b.code },
        update: {},
        create: b,
      });
    }
  }

  /** Auto-award badges a student now qualifies for (idempotent). */
  async awardBadges(studentId: string, cfg?: ProgressConfig): Promise<string[]> {
    const config = cfg ?? (await this.getConfig());
    const core = await this.computeCore(studentId, config);

    const earned: string[] = [];
    if (core.attendancePct === 100) earned.push('PERFECT_ATTENDANCE');
    if ((core.assignmentPct ?? 0) >= 90) earned.push('ASSIGNMENT_CHAMPION');
    if ((core.assessmentPct ?? 0) >= 90) earned.push('FAST_LEARNER');
    if (core.status === 'EXCELLENT') earned.push('TOP_PERFORMER');
    if ((core.attendancePct ?? 0) >= 90 && (core.assignmentPct ?? 0) >= 80)
      earned.push('CONSISTENCY_AWARD');

    // Improvement badge from last two snapshots.
    const snaps = await this.prisma.progressSnapshot.findMany({
      where: { studentId },
      orderBy: { periodStart: 'desc' },
      take: 2,
      select: { overallScore: true },
    });
    if (snaps.length === 2 && snaps[0].overallScore - snaps[1].overallScore >= 10)
      earned.push('EXCELLENT_IMPROVEMENT');

    if (!earned.length) return [];

    const badges = await this.prisma.badge.findMany({
      where: { code: { in: earned } },
      select: { id: true, code: true, name: true },
    });
    const already = new Set(
      (
        await this.prisma.studentBadge.findMany({
          where: { studentId, badgeId: { in: badges.map((b) => b.id) } },
          select: { badgeId: true },
        })
      ).map((x) => x.badgeId),
    );

    const fresh = badges.filter((b) => !already.has(b.id));
    if (!fresh.length) return [];

    await this.prisma.studentBadge.createMany({
      data: fresh.map((b) => ({ studentId, badgeId: b.id })),
      skipDuplicates: true,
    });

    const sp = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true },
    });
    if (sp) {
      for (const b of fresh) {
        this.notifications
          .createFor(sp.userId, {
            type: 'PROGRESS_BADGE',
            title: 'New badge earned 🏅',
            body: `You earned the "${b.name}" badge!`,
            link: '/student/progress',
          })
          .catch(() => undefined);
      }
    }
    return fresh.map((b) => b.code);
  }
}
