import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { ProgressEngineService } from './progress-engine.service';
import type { CreateFeedbackDto } from './dto';

type Actor = { id?: string; name?: string };

@Injectable()
export class ProgressTeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProgressEngineService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
  ) {}

  private async teacherProfileId(userId: string): Promise<string> {
    const tp = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tp) throw new NotFoundException('Teacher profile not found');
    return tp.id;
  }

  /** Distinct student ids this teacher teaches (via enrolments or batches). */
  private async studentIds(teacherId: string): Promise<string[]> {
    const [enr, batchStudents] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { teacherId, status: { in: ['ACTIVE', 'TRIAL', 'PAUSED'] } },
        select: { studentId: true },
      }),
      this.prisma.batchStudent.findMany({
        where: { batch: { teacherId } },
        select: { studentId: true },
      }),
    ]);
    return [
      ...new Set([
        ...enr.map((e) => e.studentId),
        ...batchStudents.map((b) => b.studentId),
      ]),
    ];
  }

  private async assertOwns(teacherId: string, studentId: string) {
    const ids = await this.studentIds(teacherId);
    if (!ids.includes(studentId))
      throw new ForbiddenException('This student is not in your classes');
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  async dashboard(userId: string) {
    const teacherId = await this.teacherProfileId(userId);
    const cfg = await this.engine.getConfig();
    const ids = await this.studentIds(teacherId);

    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        studentCode: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    const rows = await Promise.all(
      students.map(async (s) => {
        const core = await this.engine.computeCore(s.id, cfg);
        const risk = this.engine.detectRisk(
          {
            attendancePct: core.attendancePct,
            assignmentPct: core.assignmentPct,
            assessmentPct: core.assessmentPct,
          },
          cfg,
        );
        return {
          studentId: s.id,
          studentCode: s.studentCode,
          name: `${s.user.firstName} ${s.user.lastName}`,
          avatarUrl: s.user.avatarUrl,
          attendance: core.attendancePct,
          avgScore: core.assessmentPct ?? core.assignmentPct ?? null,
          progress: core.overall,
          status: core.status,
          atRisk: risk.atRisk,
        };
      }),
    );

    // Feedback given in the last 7 days → who's still pending.
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const recentFb = await this.prisma.teacherFeedback.findMany({
      where: { teacherId, createdAt: { gte: weekAgo } },
      select: { studentId: true },
    });
    const feedbackGiven = new Set(recentFb.map((f) => f.studentId));
    const pendingFeedback = ids.filter((id) => !feedbackGiven.has(id)).length;

    // Submissions awaiting this teacher's review.
    const pendingReviews = await this.prisma.submission.count({
      where: {
        assignment: { teacherId },
        status: { in: ['SUBMITTED', 'LATE_SUBMITTED', 'UNDER_REVIEW'] },
      },
    });

    const improving = await this.countImproving(ids);

    return {
      cards: {
        totalStudents: students.length,
        studentsImproving: improving,
        studentsAtRisk: rows.filter((r) => r.atRisk).length,
        pendingFeedback,
        pendingReviews,
      },
      students: rows.sort((a, b) => a.progress - b.progress),
    };
  }

  private async countImproving(studentIds: string[]): Promise<number> {
    if (!studentIds.length) return 0;
    const snaps = await this.prisma.progressSnapshot.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { periodStart: 'desc' },
      select: { studentId: true, overallScore: true },
    });
    const by = new Map<string, number[]>();
    for (const s of snaps) {
      const arr = by.get(s.studentId) ?? [];
      if (arr.length < 2) arr.push(s.overallScore);
      by.set(s.studentId, arr);
    }
    let n = 0;
    for (const arr of by.values()) if (arr.length === 2 && arr[0] > arr[1]) n++;
    return n;
  }

  // ── Per-student detail (scoped) ──────────────────────────────────────────
  async studentDetail(userId: string, studentId: string) {
    const teacherId = await this.teacherProfileId(userId);
    await this.assertOwns(teacherId, studentId);
    const [detail, feedbacks] = await Promise.all([
      this.engine.computeStudent(studentId),
      this.prisma.teacherFeedback.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { ...detail, feedbackHistory: feedbacks };
  }

  // ── Quick feedback ───────────────────────────────────────────────────────
  async addFeedback(userId: string, dto: CreateFeedbackDto, actor: Actor) {
    const teacherId = await this.teacherProfileId(userId);
    await this.assertOwns(teacherId, dto.studentId);

    const fb = await this.prisma.teacherFeedback.create({
      data: {
        studentId: dto.studentId,
        teacherId,
        classSessionId: dto.classSessionId ?? null,
        kind: dto.kind ?? 'CLASS',
        participation: dto.participation ?? null,
        homework: dto.homework ?? null,
        communication: dto.communication ?? null,
        understanding: dto.understanding ?? null,
        behavior: dto.behavior ?? null,
        remarks: dto.remarks ?? null,
        suggestions: dto.suggestions ?? null,
        actorId: actor.id ?? null,
        actorName: actor.name ?? null,
      },
    });

    // Notify the student (in-app) + the parent (email, no login).
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentId },
      select: {
        userId: true,
        parentEmail: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (student) {
      this.notifications
        .createFor(student.userId, {
          type: 'PROGRESS_FEEDBACK',
          title: 'New teacher feedback',
          body: 'Your teacher added feedback on your progress.',
          link: '/student/progress',
        })
        .catch(() => undefined);
      if (student.parentEmail) {
        const nm = `${student.user.firstName} ${student.user.lastName}`;
        this.emails
          .sendMail(
            student.parentEmail,
            `New progress feedback for ${nm}`,
            `A teacher added new feedback on ${nm}'s progress.${dto.remarks ? `\n\nRemarks: ${dto.remarks}` : ''}`,
          )
          .catch(() => undefined);
      }
    }
    return fb;
  }

  async listFeedback(userId: string, studentId: string) {
    const teacherId = await this.teacherProfileId(userId);
    await this.assertOwns(teacherId, studentId);
    return this.prisma.teacherFeedback.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
