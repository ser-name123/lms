import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ProgressEngineService } from './progress-engine.service';

@Injectable()
export class ProgressStudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProgressEngineService,
  ) {}

  private async studentProfileId(userId: string): Promise<string> {
    const sp = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!sp) throw new NotFoundException('Student profile not found');
    return sp.id;
  }

  /** The signed-in student's own progress — everything the student panel shows. */
  async dashboard(userId: string) {
    const studentId = await this.studentProfileId(userId);

    const [detail, goals, badges, snaps, latestSnap, certs, profile, activity] =
      await Promise.all([
        this.engine.computeStudent(studentId),
        this.prisma.learningGoal.findMany({
          where: { studentId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.studentBadge.findMany({
          where: { studentId },
          orderBy: { awardedAt: 'desc' },
          include: { badge: true },
        }),
        this.prisma.progressSnapshot.findMany({
          where: { studentId },
          orderBy: { periodStart: 'asc' },
          select: { monthLabel: true, overallScore: true },
        }),
        this.prisma.progressSnapshot.findFirst({
          where: { studentId },
          orderBy: { periodStart: 'desc' },
          select: { rank: true },
        }),
        this.prisma.assessmentAttempt.findMany({
          where: { studentId, certificateNo: { not: null } },
          orderBy: { publishedAt: 'desc' },
          select: {
            id: true,
            certificateNo: true,
            certificateUrl: true,
            percentage: true,
            publishedAt: true,
            assessment: { select: { title: true } },
          },
        }),
        this.prisma.studentProfile.findUnique({
          where: { id: studentId },
          select: {
            studentCode: true,
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        }),
        this.prisma.studentActivity.findMany({
          where: { studentId, kind: 'TIMELINE' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { type: true, title: true, description: true, createdAt: true },
        }),
      ]);

    const activeGoal = goals.find((g) => g.status === 'ACTIVE') ?? null;

    return {
      profile: {
        name: profile ? `${profile.user.firstName} ${profile.user.lastName}` : '',
        studentCode: profile?.studentCode ?? '',
        avatarUrl: profile?.user.avatarUrl ?? null,
      },
      cards: {
        overall: detail.scores.overall,
        attendancePct: detail.scores.attendancePct,
        assignmentPct: detail.scores.assignmentPct,
        assessmentPct: detail.scores.assessmentPct,
        rank: latestSnap?.rank ?? null,
        learningGoal: activeGoal
          ? { title: activeGoal.title, current: activeGoal.currentPct, target: activeGoal.targetPct }
          : null,
      },
      scores: detail.scores,
      subjects: detail.subjects,
      assessments: detail.assessments,
      skills: detail.skills,
      feedback: detail.feedback,
      timeline: snaps.map((s) => ({ month: s.monthLabel, overall: s.overallScore })),
      activityTimeline: activity.map((a) => ({
        type: a.type,
        title: a.title,
        description: a.description,
        at: a.createdAt,
      })),
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        current: g.currentPct,
        target: g.targetPct,
        deadline: g.deadline,
        status: g.status,
      })),
      badges: badges.map((b) => ({
        code: b.badge.code,
        name: b.badge.name,
        description: b.badge.description,
        icon: b.badge.icon,
        tone: b.badge.tone,
        awardedAt: b.awardedAt,
      })),
      certificates: certs.map((c) => ({
        id: c.id,
        title: c.assessment.title,
        certificateNo: c.certificateNo,
        certificateUrl: c.certificateUrl,
        percentage: c.percentage,
        issuedAt: c.publishedAt,
      })),
    };
  }
}
