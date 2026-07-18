import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { Role } from '../generated/prisma/enums';
import { ProgressEngineService } from './progress-engine.service';
import type {
  CreateGoalDto,
  CreateMonthlyReviewDto,
  CreateParentMeetingDto,
  ResolveRiskDto,
  UpdateGoalDto,
  UpdateParentMeetingDto,
} from './dto';

type Caller = { id: string; role: Role; name?: string };

@Injectable()
export class ProgressCoachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProgressEngineService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
  ) {}

  private isAdmin(c: Caller) {
    return c.role === Role.ADMIN;
  }

  /** Students this caller may act on (coach → assigned; admin → all active). */
  private async myStudentIds(c: Caller): Promise<string[]> {
    const rows = await this.prisma.studentProfile.findMany({
      where: {
        user: { status: 'ACTIVE' },
        ...(this.isAdmin(c) ? {} : { coachId: c.id }),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertAccess(studentId: string, c: Caller) {
    const s = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, coachId: true, userId: true },
    });
    if (!s) throw new NotFoundException('Student not found');
    if (!this.isAdmin(c) && s.coachId !== c.id)
      throw new ForbiddenException('This student is not assigned to you');
    return s;
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  async dashboard(c: Caller) {
    const cfg = await this.engine.getConfig();
    const ids = await this.myStudentIds(c);
    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        studentCode: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    const computed = await Promise.all(
      students.map(async (s) => {
        const detail = await this.engine.computeStudent(s.id, cfg);
        const risk = this.engine.detectRisk(
          {
            attendancePct: detail.scores.attendancePct,
            assignmentPct: detail.scores.assignmentPct,
            assessmentPct: detail.scores.assessmentPct,
          },
          cfg,
        );
        const weak = detail.subjects.filter((sub) => sub.progress < 60);
        return {
          studentId: s.id,
          studentCode: s.studentCode,
          name: `${s.user.firstName} ${s.user.lastName}`,
          avatarUrl: s.user.avatarUrl,
          overall: detail.scores.overall,
          status: detail.scores.status,
          attendance: detail.scores.attendancePct,
          atRisk: risk.atRisk,
          weakAreas: weak.map((w) => w.subject),
        };
      }),
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const reviewed = new Set(
      (
        await this.prisma.monthlyReview.findMany({
          where: { studentId: { in: ids }, periodStart: { gte: monthStart } },
          select: { studentId: true },
        })
      ).map((r) => r.studentId),
    );
    const [activeGoals, openRisks] = await Promise.all([
      this.prisma.learningGoal.count({
        where: { studentId: { in: ids }, status: 'ACTIVE' },
      }),
      this.prisma.progressRiskFlag.count({
        where: { studentId: { in: ids }, status: { not: 'RESOLVED' } },
      }),
    ]);

    // Aggregate weak areas across the cohort.
    const weakMap = new Map<string, number>();
    for (const c2 of computed)
      for (const w of c2.weakAreas) weakMap.set(w, (weakMap.get(w) ?? 0) + 1);
    const weakAreas = [...weakMap.entries()]
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      cards: {
        totalStudents: students.length,
        studentsAtRisk: computed.filter((x) => x.atRisk).length,
        pendingReviews: ids.filter((id) => !reviewed.has(id)).length,
        activeGoals,
        openRisks,
      },
      students: computed.sort((a, b) => a.overall - b.overall),
      weakAreas,
    };
  }

  // ── Monthly reviews ──────────────────────────────────────────────────────
  async createReview(dto: CreateMonthlyReviewDto, c: Caller) {
    const student = await this.assertAccess(dto.studentId, c);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthLabel =
      dto.monthLabel ??
      periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const data = {
      coachId: c.id,
      periodEnd,
      monthLabel,
      academic: dto.academic ?? null,
      attendance: dto.attendance ?? null,
      behavior: dto.behavior ?? null,
      participation: dto.participation ?? null,
      learningSpeed: dto.learningSpeed ?? null,
      homework: dto.homework ?? null,
      communication: dto.communication ?? null,
      recommendation: dto.recommendation ?? null,
      remarks: dto.remarks ?? null,
      actorId: c.id,
      actorName: c.name ?? null,
    };
    const review = await this.prisma.monthlyReview.upsert({
      where: { studentId_periodStart: { studentId: dto.studentId, periodStart } },
      update: data,
      create: { studentId: dto.studentId, periodStart, ...data },
    });

    // Notify the student (in-app) + the parent (email).
    this.notifications
      .createFor(student.userId, {
        type: 'PROGRESS_REVIEW',
        title: 'Monthly review completed',
        body: `Your coach completed your ${monthLabel} review.`,
        link: '/student/progress',
      })
      .catch(() => undefined);
    const full = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentId },
      select: {
        parentEmail: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (full?.parentEmail) {
      const nm = `${full.user.firstName} ${full.user.lastName}`;
      this.emails
        .sendMail(
          full.parentEmail,
          `${nm}'s ${monthLabel} progress review`,
          `The academic coach completed ${nm}'s monthly progress review${dto.recommendation ? ` with the recommendation: ${dto.recommendation.replace(/_/g, ' ')}` : ''}.${dto.remarks ? `\n\nRemarks: ${dto.remarks}` : ''}`,
        )
        .catch(() => undefined);
    }
    return review;
  }

  async listReviews(studentId: string, c: Caller) {
    await this.assertAccess(studentId, c);
    return this.prisma.monthlyReview.findMany({
      where: { studentId },
      orderBy: { periodStart: 'desc' },
    });
  }

  // ── Learning goals ───────────────────────────────────────────────────────
  async createGoal(dto: CreateGoalDto, c: Caller) {
    const student = await this.assertAccess(dto.studentId, c);
    const goal = await this.prisma.learningGoal.create({
      data: {
        studentId: dto.studentId,
        title: dto.title,
        description: dto.description ?? null,
        skillId: dto.skillId ?? null,
        currentPct: dto.currentPct ?? 0,
        targetPct: dto.targetPct ?? 100,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        createdById: c.id,
        createdByName: c.name ?? null,
      },
    });
    this.notifications
      .createFor(student.userId, {
        type: 'PROGRESS_GOAL',
        title: 'New learning goal',
        body: `Your coach set a new goal: ${goal.title}.`,
        link: '/student/progress',
      })
      .catch(() => undefined);
    return goal;
  }

  async updateGoal(id: string, dto: UpdateGoalDto, c: Caller) {
    const goal = await this.prisma.learningGoal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    const student = await this.assertAccess(goal.studentId, c);

    const achieved =
      dto.status === 'ACHIEVED' ||
      (dto.currentPct != null &&
        dto.currentPct >= (dto.targetPct ?? goal.targetPct));
    const updated = await this.prisma.learningGoal.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        currentPct: dto.currentPct ?? undefined,
        targetPct: dto.targetPct ?? undefined,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        status: dto.status ?? (achieved ? 'ACHIEVED' : undefined),
        achievedAt: achieved && goal.status !== 'ACHIEVED' ? new Date() : undefined,
      },
    });
    if (achieved && goal.status !== 'ACHIEVED') {
      this.notifications
        .createFor(student.userId, {
          // Distinct from PROGRESS_GOAL (goal *set*) so the two can be told
          // apart in the feed and filtered separately.
          type: 'GOAL_COMPLETED',
          title: 'Goal achieved 🎉',
          body: `You reached your goal: ${updated.title}.`,
          link: '/student/progress',
        })
        .catch(() => undefined);
    }
    return updated;
  }

  async listGoals(studentId: string, c: Caller) {
    await this.assertAccess(studentId, c);
    return this.prisma.learningGoal.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Parent meetings (schedule counseling) ────────────────────────────────
  async createMeeting(dto: CreateParentMeetingDto, c: Caller) {
    await this.assertAccess(dto.studentId, c);
    return this.prisma.parentMeeting.create({
      data: {
        studentId: dto.studentId,
        coachId: c.id,
        scheduledAt: new Date(dto.scheduledAt),
        agenda: dto.agenda ?? null,
        notes: dto.notes ?? null,
        actionItems: (dto.actionItems as object) ?? undefined,
        nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : null,
        actorId: c.id,
        actorName: c.name ?? null,
      },
    });
  }

  async updateMeeting(id: string, dto: UpdateParentMeetingDto, c: Caller) {
    const m = await this.prisma.parentMeeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found');
    await this.assertAccess(m.studentId, c);
    return this.prisma.parentMeeting.update({
      where: { id },
      data: {
        status: dto.status ?? undefined,
        agenda: dto.agenda ?? undefined,
        notes: dto.notes ?? undefined,
        actionItems:
          dto.actionItems !== undefined ? (dto.actionItems as object) : undefined,
        nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : undefined,
      },
    });
  }

  async listMeetings(studentId: string, c: Caller) {
    await this.assertAccess(studentId, c);
    return this.prisma.parentMeeting.findMany({
      where: { studentId },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  // ── Risk flags ───────────────────────────────────────────────────────────
  async listRisks(c: Caller) {
    const ids = await this.myStudentIds(c);
    const flags = await this.prisma.progressRiskFlag.findMany({
      where: { studentId: { in: ids }, status: { not: 'RESOLVED' } },
      orderBy: { createdAt: 'desc' },
    });
    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: flags.map((f) => f.studentId) } },
      select: {
        id: true,
        studentCode: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const nameById = new Map(
      students.map((s) => [s.id, `${s.user.firstName} ${s.user.lastName}`]),
    );
    return flags.map((f) => ({ ...f, studentName: nameById.get(f.studentId) ?? '' }));
  }

  async resolveRisk(id: string, dto: ResolveRiskDto, c: Caller) {
    const flag = await this.prisma.progressRiskFlag.findUnique({ where: { id } });
    if (!flag) throw new NotFoundException('Risk flag not found');
    await this.assertAccess(flag.studentId, c);
    return this.prisma.progressRiskFlag.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        note: dto.note ?? flag.note,
        resolvedById: c.id,
        resolvedAt: new Date(),
      },
    });
  }

  async escalateRisk(id: string, c: Caller) {
    const flag = await this.prisma.progressRiskFlag.findUnique({ where: { id } });
    if (!flag) throw new NotFoundException('Risk flag not found');
    const student = await this.assertAccess(flag.studentId, c);
    void student;
    this.notifications
      .createForRoles([Role.ADMIN], {
        type: 'PROGRESS_ESCALATION',
        title: 'Risk escalated by coach',
        body: `A coach escalated a ${flag.level} risk flag.`,
        link: `/students/${flag.studentId}?tab=progress`,
      })
      .catch(() => undefined);
    return this.prisma.progressRiskFlag.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', level: 'CRITICAL' },
    });
  }
}
