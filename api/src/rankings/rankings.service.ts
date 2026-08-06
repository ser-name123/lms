import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role, type RankingBadgeRule } from '../generated/prisma/enums';
import { AssessmentTemplatesService, actorName, type Actor } from '../monthly-assessments/templates.service';
import { clamp100, rankingScore, round2 } from '../monthly-assessments/assessment.config';
import type { GenerateRankingDto, ListRankingsQuery } from '../monthly-assessments/dto';

/*
 * Module 7B — course-wise monthly ranking.
 *
 * Rankings are derived, never entered: every input comes from a PUBLISHED
 * assessment and the figures snapshotted on it. That matters twice —
 *
 *  - regenerating a cycle is safe and idempotent, because nothing is lost by
 *    recomputing it; and
 *  - a ranking can never disagree with the report it came from, which is the
 *    first thing a parent checks.
 *
 * Only published assessments count. An unpublished one is still being argued
 * about internally, and ranking a student on a mark that later changes would
 * hand out a badge that has to be taken back.
 */
@Injectable()
export class RankingsService implements OnModuleInit {
  private readonly logger = new Logger(RankingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AssessmentTemplatesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Generation ─────────────────────────────────────────────────────────────

  /**
   * Build (or rebuild) the league table for a cycle.
   *
   * `publish` defaults to true: the spec's flow is "assessments published →
   * ranking published". Passing false produces the table without telling
   * anybody, so staff can look at it first.
   */
  async generate(dto: GenerateRankingDto, actor: Actor) {
    const publish = dto.publish ?? true;

    const cycleStart = dto.cycleStart ? new Date(dto.cycleStart) : await this.latestPublishedCycle(dto.courseId);
    if (!cycleStart || isNaN(cycleStart.getTime())) {
      throw new BadRequestException('No published assessments to rank yet.');
    }

    const assessments = await this.prisma.monthlyAssessment.findMany({
      where: {
        status: 'PUBLISHED',
        cycleStart,
        ...(dto.courseId ? { courseId: dto.courseId } : {}),
      },
      select: {
        id: true, studentId: true, courseId: true, teacherId: true, cycleEnd: true,
        monthLabel: true, percentage: true, attendancePct: true, assignmentPct: true,
        homeworkPct: true,
      },
    });
    if (!assessments.length) {
      throw new BadRequestException('No published assessments in that cycle to rank.');
    }

    const cfg = await this.config.config();
    const weights = cfg.ranking;

    // Teacher ratings are 0..5 on the profile; the score wants 0..100.
    const teacherIds = [...new Set(assessments.map((a) => a.teacherId).filter(Boolean) as string[])];
    const teachers = teacherIds.length
      ? await this.prisma.teacherProfile.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, rating: true },
        })
      : [];
    const ratingOf = new Map(teachers.map((t) => [t.id, Number(t.rating ?? 0)]));

    // Previous cycle's ranks, for the movement column and the improvement badge.
    const previous = await this.prisma.studentRanking.findMany({
      where: {
        cycleStart: { lt: cycleStart },
        ...(dto.courseId ? { courseId: dto.courseId } : {}),
      },
      orderBy: { cycleStart: 'desc' },
      select: { studentId: true, courseId: true, rank: true, cycleStart: true },
    });
    const prevRank = new Map<string, number>();
    for (const p of previous) {
      const key = `${p.courseId}:${p.studentId}`;
      // findMany is ordered newest-first, so the first hit for a key is the most
      // recent cycle before this one — later (older) rows must not overwrite it.
      if (!prevRank.has(key)) prevRank.set(key, p.rank);
    }

    const byCourse = new Map<string, typeof assessments>();
    for (const a of assessments) {
      if (!byCourse.has(a.courseId)) byCourse.set(a.courseId, []);
      byCourse.get(a.courseId)!.push(a);
    }

    const courses: { courseId: string; ranked: number }[] = [];
    for (const [courseId, rows] of byCourse) {
      const scored = rows.map((a) => {
        const parts = {
          assessment: clamp100(Number(a.percentage)),
          attendance: clamp100(a.attendancePct),
          assignment: clamp100(a.assignmentPct),
          homework: clamp100(a.homeworkPct),
          teacherRating: clamp100((ratingOf.get(a.teacherId ?? '') ?? 0) * 20),
        };
        return { a, parts, total: rankingScore(parts, weights) };
      });

      /*
       * Ties are broken by assessment percentage, then attendance, then the
       * student id. Without a deterministic tail, regenerating the same cycle
       * could shuffle two tied students and silently move a badge between them.
       */
      scored.sort(
        (x, y) =>
          y.total - x.total ||
          y.parts.assessment - x.parts.assessment ||
          y.parts.attendance - x.parts.attendance ||
          x.a.studentId.localeCompare(y.a.studentId),
      );

      const totalStudents = scored.length;
      const publishedAt = publish ? new Date() : null;

      for (let i = 0; i < scored.length; i++) {
        const { a, parts, total } = scored[i];
        const rank = i + 1;
        await this.prisma.studentRanking.upsert({
          where: {
            courseId_cycleStart_studentId: { courseId, cycleStart, studentId: a.studentId },
          },
          update: {
            cycleEnd: a.cycleEnd,
            monthLabel: a.monthLabel,
            assessmentScore: parts.assessment,
            attendancePct: parts.attendance,
            assignmentScore: parts.assignment,
            homeworkPct: parts.homework,
            teacherRating: parts.teacherRating,
            totalScore: total,
            rank,
            previousRank: prevRank.get(`${courseId}:${a.studentId}`) ?? null,
            totalStudents,
            publishedAt,
          },
          create: {
            studentId: a.studentId,
            courseId,
            cycleStart,
            cycleEnd: a.cycleEnd,
            monthLabel: a.monthLabel,
            assessmentScore: parts.assessment,
            attendancePct: parts.attendance,
            assignmentScore: parts.assignment,
            homeworkPct: parts.homework,
            teacherRating: parts.teacherRating,
            totalScore: total,
            rank,
            previousRank: prevRank.get(`${courseId}:${a.studentId}`) ?? null,
            totalStudents,
            publishedAt,
          },
        });
      }
      courses.push({ courseId, ranked: totalStudents });

      await this.logRankingAudit(courseId, cycleStart, scored.length, weights, actor);
    }

    let badges = 0;
    if (publish) {
      badges = await this.awardBadges(cycleStart, dto.courseId ?? null);
      await this.notifyPublished(cycleStart, dto.courseId ?? null).catch((e) =>
        this.logger.warn(`Ranking published but notifications failed: ${(e as Error).message}`),
      );
    }

    return {
      cycleStart,
      monthLabel: assessments[0].monthLabel,
      published: publish,
      courses: courses.length,
      studentsRanked: courses.reduce((a, c) => a + c.ranked, 0),
      badgesAwarded: badges,
    };
  }

  private async latestPublishedCycle(courseId?: string): Promise<Date | null> {
    const row = await this.prisma.monthlyAssessment.findFirst({
      where: { status: 'PUBLISHED', ...(courseId ? { courseId } : {}) },
      orderBy: { cycleStart: 'desc' },
      select: { cycleStart: true },
    });
    return row?.cycleStart ?? null;
  }

  /*
   * Auto-ranking.
   *
   * This is a sweep rather than a call from the publish handler, for two
   * reasons. Publishing happens one report at a time, so a direct call would
   * try to rank the cycle after every single publish and succeed only on the
   * last one — thirty attempts to do one job. And wiring it the other way would
   * make MonthlyAssessmentsService depend on RankingsService while
   * RankingsService already depends on the assessment config, which is a
   * circular module graph this codebase has so far avoided entirely (there is
   * not one `forwardRef` in it).
   *
   * A five-minute pass, on the project's setInterval convention, gets the same
   * outcome with a one-directional dependency.
   */
  onModuleInit() {
    setTimeout(() => {
      setInterval(() => void this.autoRankSweep().catch(() => undefined), 5 * 60_000).unref();
    }, 70_000).unref();
  }

  /**
   * Rank every course-cycle whose assessments are ALL published and which has
   * no ranking yet.
   *
   * Deliberately conservative about "all": ranking a half-published cycle would
   * publish a league table that reorders itself as the remaining reports land,
   * and every student would be notified twice with different numbers.
   */
  async autoRankSweep() {
    const cfg = await this.config.config();
    if (!cfg.autoRankOnPublish) return { generated: 0 };

    const candidates = await this.generatable();
    const systemActor: Actor = { id: '', email: 'system', role: 'ADMIN' };
    let generated = 0;

    for (const c of candidates) {
      if (c.alreadyRanked) continue;
      const pending = await this.prisma.monthlyAssessment.count({
        where: {
          courseId: c.courseId,
          cycleStart: c.cycleStart,
          status: { in: ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED'] },
        },
      });
      if (pending > 0) continue;
      try {
        await this.generate(
          { courseId: c.courseId, cycleStart: c.cycleStart.toISOString(), publish: true },
          systemActor,
        );
        generated += 1;
      } catch (e) {
        this.logger.warn(`Auto-ranking skipped for ${c.courseTitle ?? c.courseId}: ${(e as Error).message}`);
      }
    }
    if (generated) this.logger.log(`Auto-ranked ${generated} course-cycle(s).`);
    return { generated };
  }

  // ── Badges ─────────────────────────────────────────────────────────────────

  private async awardBadges(cycleStart: Date, courseId: string | null): Promise<number> {
    const configs = await this.prisma.rankingBadgeConfig.findMany({ where: { enabled: true } });
    if (!configs.length) return 0;
    const byRule = new Map(configs.map((c) => [c.rule, c]));

    const rows = await this.prisma.studentRanking.findMany({
      where: { cycleStart, ...(courseId ? { courseId } : {}) },
      select: {
        studentId: true, courseId: true, rank: true, previousRank: true,
        attendancePct: true, monthLabel: true,
        student: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } },
        course: { select: { title: true } },
      },
    });
    if (!rows.length) return 0;

    /*
     * Which badges already exist for this cycle. Generation is re-runnable, and
     * the upsert below always succeeds — without this, regenerating a cycle
     * re-announces every badge that was already awarded.
     */
    const existing = new Set(
      (
        await this.prisma.rankingBadge.findMany({
          where: { cycleStart, ...(courseId ? { courseId } : {}) },
          select: { studentId: true, courseId: true, rule: true },
        })
      ).map((b) => `${b.studentId}:${b.courseId}:${b.rule}`),
    );

    // The spec's matrix sends a badge to the student AND their teacher. The
    // ranking row has no teacher on it, so the teacher comes from the published
    // assessment that produced it — resolved once for the whole cycle.
    const teacherUserIdOf = await this.teacherUserIdsForCycle(cycleStart, courseId);

    let awarded = 0;
    for (const r of rows) {
      const earned: RankingBadgeRule[] = [];
      if (r.rank === 1) earned.push('RANK_1' as RankingBadgeRule);
      if (r.rank === 2) earned.push('RANK_2' as RankingBadgeRule);
      if (r.rank === 3) earned.push('RANK_3' as RankingBadgeRule);

      const topN = byRule.get('TOP_10' as RankingBadgeRule)?.threshold ?? 10;
      // Top-N is for the places that get no medal of their own, otherwise every
      // winner collects two badges for one result.
      if (r.rank > 3 && r.rank <= topN) earned.push('TOP_10' as RankingBadgeRule);

      const perfect = byRule.get('PERFECT_ATTENDANCE' as RankingBadgeRule)?.threshold ?? 100;
      if (Number(r.attendancePct) >= perfect) earned.push('PERFECT_ATTENDANCE' as RankingBadgeRule);

      const jump = byRule.get('MOST_IMPROVED' as RankingBadgeRule)?.threshold ?? 3;
      if (r.previousRank != null && r.previousRank - r.rank >= jump) {
        earned.push('MOST_IMPROVED' as RankingBadgeRule);
      }

      for (const rule of earned) {
        const cfg = byRule.get(rule);
        if (!cfg) continue;
        try {
          await this.prisma.rankingBadge.upsert({
            where: {
              studentId_courseId_rule_cycleStart: {
                studentId: r.studentId, courseId: r.courseId, rule, cycleStart,
              },
            },
            // Re-running a generation must not duplicate a badge; the label and
            // icon are refreshed so an admin's rename shows up on old awards too.
            update: { label: cfg.label, icon: cfg.icon },
            create: {
              studentId: r.studentId,
              courseId: r.courseId,
              rule,
              label: cfg.label,
              icon: cfg.icon,
              cycleStart,
              monthLabel: r.monthLabel,
            },
          });
          awarded += 1;
          if (existing.has(`${r.studentId}:${r.courseId}:${rule}`)) continue;
          await this.notifyBadge({
            studentUserId: r.student.userId,
            studentName: `${r.student.user.firstName ?? ''} ${r.student.user.lastName ?? ''}`.trim(),
            teacherUserId: teacherUserIdOf.get(`${r.courseId}:${r.studentId}`) ?? null,
            courseTitle: r.course?.title ?? 'their course',
            label: cfg.label,
            icon: cfg.icon,
            monthLabel: r.monthLabel,
          }).catch(() => undefined);
        } catch {
          /* a losing upsert race is a duplicate we did not want anyway */
        }
      }
    }
    return awarded;
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /** The full leaderboard — staff view. */
  async leaderboard(q: ListRankingsQuery) {
    const cycleStart = q.cycleStart ? new Date(q.cycleStart) : await this.latestRankedCycle(q.courseId);
    if (!cycleStart) return { cycleStart: null, monthLabel: null, courses: [] };

    const rows = await this.prisma.studentRanking.findMany({
      where: { cycleStart, ...(q.courseId ? { courseId: q.courseId } : {}) },
      include: {
        course: { select: { id: true, title: true } },
        student: {
          select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ courseId: 'asc' }, { rank: 'asc' }],
      take: q.limit ? q.limit * 20 : 2000,
    });

    const badges = await this.prisma.rankingBadge.findMany({
      where: { cycleStart, ...(q.courseId ? { courseId: q.courseId } : {}) },
      select: { studentId: true, courseId: true, label: true, icon: true, rule: true },
    });
    const badgeKey = (s: string, c: string) => `${c}:${s}`;
    const badgeMap = new Map<string, { label: string; icon: string; rule: string }[]>();
    for (const b of badges) {
      const k = badgeKey(b.studentId, b.courseId);
      if (!badgeMap.has(k)) badgeMap.set(k, []);
      badgeMap.get(k)!.push({ label: b.label, icon: b.icon, rule: b.rule });
    }

    const byCourse = new Map<string, { course: { id: string; title: string }; rows: any[] }>();
    for (const r of rows) {
      const cid = r.courseId;
      if (!byCourse.has(cid)) {
        byCourse.set(cid, {
          course: { id: cid, title: r.course?.title ?? 'Course' },
          rows: [],
        });
      }
      const list = byCourse.get(cid)!;
      if (q.limit && list.rows.length >= q.limit) continue;
      list.rows.push(this.shapeRanking(r, badgeMap.get(badgeKey(r.studentId, cid)) ?? []));
    }

    return {
      cycleStart,
      monthLabel: rows[0]?.monthLabel ?? null,
      published: !!rows[0]?.publishedAt,
      courses: [...byCourse.values()],
    };
  }

  private shapeRanking(r: any, badges: { label: string; icon: string; rule: string }[]) {
    return {
      studentId: r.studentId,
      studentCode: r.student?.studentCode ?? null,
      studentName: r.student
        ? `${r.student.user.firstName} ${r.student.user.lastName}`.trim()
        : 'Student',
      rank: r.rank,
      previousRank: r.previousRank,
      movement: r.previousRank == null ? null : r.previousRank - r.rank,
      totalStudents: r.totalStudents,
      totalScore: Number(r.totalScore),
      breakdown: {
        assessment: Number(r.assessmentScore),
        attendance: Number(r.attendancePct),
        assignment: Number(r.assignmentScore),
        homework: Number(r.homeworkPct),
        teacherRating: Number(r.teacherRating),
      },
      badges,
      monthLabel: r.monthLabel,
      publishedAt: r.publishedAt,
    };
  }

  private async latestRankedCycle(courseId?: string): Promise<Date | null> {
    const row = await this.prisma.studentRanking.findFirst({
      where: { ...(courseId ? { courseId } : {}), publishedAt: { not: null } },
      orderBy: { cycleStart: 'desc' },
      select: { cycleStart: true },
    });
    if (row) return row.cycleStart;
    const any = await this.prisma.studentRanking.findFirst({
      where: courseId ? { courseId } : {},
      orderBy: { cycleStart: 'desc' },
      select: { cycleStart: true },
    });
    return any?.cycleStart ?? null;
  }

  /**
   * What a STUDENT is allowed to see: their own rank and score in every course,
   * plus the configured top-N of each of those courses. Never the full table,
   * and never another course they are not in.
   */
  async myRanking(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) return { cycles: [], badges: [] };

    const mine = await this.prisma.studentRanking.findMany({
      where: { studentId: student.id, publishedAt: { not: null } },
      include: { course: { select: { id: true, title: true } } },
      orderBy: [{ cycleStart: 'desc' }, { courseId: 'asc' }],
      take: 60,
    });

    const cfg = await this.config.config();
    const topN = cfg.studentVisibleTopN;

    const cycles = await Promise.all(
      mine.map(async (r) => {
        const leaders = topN
          ? await this.prisma.studentRanking.findMany({
              where: { courseId: r.courseId, cycleStart: r.cycleStart, rank: { lte: topN } },
              include: {
                student: {
                  select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } },
                },
              },
              orderBy: { rank: 'asc' },
            })
          : [];
        return {
          cycleStart: r.cycleStart,
          monthLabel: r.monthLabel,
          course: { id: r.courseId, title: r.course?.title ?? 'Course' },
          myRank: r.rank,
          previousRank: r.previousRank,
          movement: r.previousRank == null ? null : r.previousRank - r.rank,
          totalStudents: r.totalStudents,
          myScore: Number(r.totalScore),
          breakdown: {
            assessment: Number(r.assessmentScore),
            attendance: Number(r.attendancePct),
            assignment: Number(r.assignmentScore),
            homework: Number(r.homeworkPct),
            teacherRating: Number(r.teacherRating),
          },
          leaderboard: leaders.map((l) => ({
            rank: l.rank,
            studentName: `${l.student.user.firstName} ${l.student.user.lastName}`.trim(),
            score: Number(l.totalScore),
            isMe: l.studentId === student.id,
          })),
        };
      }),
    );

    const badges = await this.prisma.rankingBadge.findMany({
      where: { studentId: student.id },
      include: { course: { select: { title: true } } },
      orderBy: { awardedAt: 'desc' },
      take: 100,
    });

    return {
      cycles,
      badges: badges.map((b) => ({
        id: b.id,
        rule: b.rule,
        label: b.label,
        icon: b.icon,
        courseTitle: b.course?.title ?? null,
        monthLabel: b.monthLabel,
        awardedAt: b.awardedAt,
      })),
    };
  }

  /** One student's ranking history — the admin student hub. */
  async forStudent(studentId: string) {
    const [rows, badges] = await Promise.all([
      this.prisma.studentRanking.findMany({
        where: { studentId },
        include: { course: { select: { id: true, title: true } } },
        orderBy: { cycleStart: 'desc' },
      }),
      this.prisma.rankingBadge.findMany({
        where: { studentId },
        include: { course: { select: { title: true } } },
        orderBy: { awardedAt: 'desc' },
      }),
    ]);
    return {
      rankings: rows.map((r) => ({
        cycleStart: r.cycleStart,
        monthLabel: r.monthLabel,
        course: { id: r.courseId, title: r.course?.title ?? 'Course' },
        rank: r.rank,
        previousRank: r.previousRank,
        movement: r.previousRank == null ? null : r.previousRank - r.rank,
        totalStudents: r.totalStudents,
        totalScore: Number(r.totalScore),
        breakdown: {
          assessment: Number(r.assessmentScore),
          attendance: Number(r.attendancePct),
          assignment: Number(r.assignmentScore),
          homework: Number(r.homeworkPct),
          teacherRating: Number(r.teacherRating),
        },
        publishedAt: r.publishedAt,
      })),
      badges: badges.map((b) => ({
        id: b.id,
        rule: b.rule,
        label: b.label,
        icon: b.icon,
        courseTitle: b.course?.title ?? null,
        monthLabel: b.monthLabel,
        awardedAt: b.awardedAt,
      })),
    };
  }

  /** Cycles that have a ranking, for the period picker. */
  async cycles() {
    const rows = await this.prisma.studentRanking.findMany({
      distinct: ['cycleStart'],
      select: { cycleStart: true, monthLabel: true, publishedAt: true },
      orderBy: { cycleStart: 'desc' },
      take: 36,
    });
    return rows.map((r) => ({
      cycleStart: r.cycleStart,
      monthLabel: r.monthLabel,
      published: !!r.publishedAt,
    }));
  }

  /** Cycles with published assessments but no ranking yet — the "generate" picker. */
  async generatable() {
    const published = await this.prisma.monthlyAssessment.findMany({
      where: { status: 'PUBLISHED' },
      distinct: ['cycleStart', 'courseId'],
      select: { cycleStart: true, monthLabel: true, courseId: true, course: { select: { title: true } } },
      orderBy: { cycleStart: 'desc' },
      take: 200,
    });
    const ranked = await this.prisma.studentRanking.findMany({
      distinct: ['cycleStart', 'courseId'],
      select: { cycleStart: true, courseId: true },
    });
    const rankedKeys = new Set(ranked.map((r) => `${r.courseId}:${r.cycleStart.toISOString()}`));
    return published.map((p) => ({
      cycleStart: p.cycleStart,
      monthLabel: p.monthLabel,
      courseId: p.courseId,
      courseTitle: p.course?.title ?? null,
      alreadyRanked: rankedKeys.has(`${p.courseId}:${p.cycleStart.toISOString()}`),
    }));
  }

  async teacherLeaderboard(userId: string, q: ListRankingsQuery) {
    // A teacher sees the full table for the courses they teach — they are the
    // ones parents ask about it, and they cannot act on a redacted view.
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!teacher) return { cycleStart: null, monthLabel: null, courses: [] };
    const courseIds = (
      await this.prisma.enrollment.findMany({
        where: { teacherId: teacher.id },
        distinct: ['courseId'],
        select: { courseId: true },
      })
    ).map((e) => e.courseId);
    if (!courseIds.length) return { cycleStart: null, monthLabel: null, courses: [] };
    if (q.courseId && !courseIds.includes(q.courseId)) {
      throw new NotFoundException('You do not teach that course.');
    }
    const board = await this.leaderboard({ ...q, courseId: q.courseId });
    return {
      ...board,
      courses: board.courses.filter((c: any) => courseIds.includes(c.course.id)),
    };
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  private async notifyPublished(cycleStart: Date, courseId: string | null) {
    const rows = await this.prisma.studentRanking.findMany({
      where: { cycleStart, ...(courseId ? { courseId } : {}) },
      select: {
        studentId: true, courseId: true, rank: true, totalStudents: true, monthLabel: true,
        student: { select: { userId: true } },
        course: { select: { title: true } },
      },
    });
    if (!rows.length) return;

    const jobs: Promise<unknown>[] = [];
    for (const r of rows) {
      const course = r.course?.title ?? 'your course';
      jobs.push(
        this.notifications.createFor(r.student.userId, {
          type: 'RANKING_PUBLISHED',
          title: `${r.monthLabel} ranking published`,
          body: `You are ranked ${r.rank} of ${r.totalStudents} in ${course}.`,
          link: '/student/ranking',
        }),
      );
      if (r.rank <= 3) {
        jobs.push(
          this.notifications.createFor(r.student.userId, {
            type: 'RANKING_TOP3',
            title: `Top ${r.rank} in ${course}!`,
            body: `Congratulations — you finished ${r.rank === 1 ? '1st' : r.rank === 2 ? '2nd' : '3rd'} in ${course} for ${r.monthLabel}.`,
            link: '/student/ranking',
          }),
        );
      }
    }

    // Teachers and coaches hear about it once per cycle, not once per student.
    const label = rows[0].monthLabel;
    jobs.push(
      this.notifications.createForRoles([Role.TEACHER, Role.ACADEMIC_COACH, Role.SUPERVISOR, Role.ADMIN], {
        type: 'RANKING_PUBLISHED',
        title: `${label} rankings published`,
        body: `Course-wise rankings for ${label} are now available.`,
        link: '/rankings',
      }),
    );

    // Top 3 per course, announced to staff as one message rather than three.
    const topByCourse = new Map<string, typeof rows>();
    for (const r of rows) {
      if (r.rank > 3) continue;
      if (!topByCourse.has(r.courseId)) topByCourse.set(r.courseId, []);
      topByCourse.get(r.courseId)!.push(r);
    }
    if (topByCourse.size) {
      jobs.push(
        this.notifications.createForRoles([Role.TEACHER, Role.ACADEMIC_COACH], {
          type: 'RANKING_TOP3',
          title: `${label} top performers`,
          body: `Top-3 places have been decided across ${topByCourse.size} course(s) for ${label}.`,
          link: '/rankings',
        }),
      );
    }

    await Promise.all(jobs.map((p) => p.catch(() => undefined)));
  }

  /*
   * `TeacherProfile.id` → `User.id` for every teacher who published an
   * assessment in this cycle, keyed by `courseId:studentId`. One pair of
   * queries for the whole cycle rather than two per badge.
   */
  private async teacherUserIdsForCycle(cycleStart: Date, courseId: string | null) {
    const assessments = await this.prisma.monthlyAssessment.findMany({
      where: { cycleStart, status: 'PUBLISHED', ...(courseId ? { courseId } : {}) },
      select: { studentId: true, courseId: true, teacherId: true },
    });
    const teacherIds = [...new Set(assessments.map((a) => a.teacherId).filter(Boolean) as string[])];
    const profiles = teacherIds.length
      ? await this.prisma.teacherProfile.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, userId: true },
        })
      : [];
    const userIdOf = new Map(profiles.map((p) => [p.id, p.userId]));

    const out = new Map<string, string>();
    for (const a of assessments) {
      const userId = a.teacherId ? userIdOf.get(a.teacherId) : null;
      if (userId) out.set(`${a.courseId}:${a.studentId}`, userId);
    }
    return out;
  }

  /*
   * Badges go to the student and their teacher; the spec's matrix explicitly
   * leaves the academic coach off this one. Called only for a badge that did
   * not already exist, so regenerating a cycle stays silent.
   */
  private async notifyBadge(b: {
    studentUserId: string;
    studentName: string;
    teacherUserId: string | null;
    courseTitle: string;
    label: string;
    icon: string;
    monthLabel: string;
  }) {
    const jobs = [
      this.notifications.createFor(b.studentUserId, {
        type: 'BADGE_AWARDED',
        title: `${b.icon} ${b.label}`,
        body: `You earned the "${b.label}" badge for ${b.monthLabel}.`,
        link: '/student/ranking',
      }),
    ];
    if (b.teacherUserId) {
      jobs.push(
        this.notifications.createFor(b.teacherUserId, {
          type: 'BADGE_AWARDED',
          title: `${b.icon} ${b.label} — ${b.studentName || 'your student'}`,
          body: `${b.studentName || 'Your student'} earned the "${b.label}" badge in ${b.courseTitle} for ${b.monthLabel}.`,
          link: '/teacher/rankings',
        }),
      );
    }
    await Promise.all(jobs.map((p) => p.catch(() => undefined)));
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  /*
   * "All ranking calculations shall be recorded in the audit log." The weights
   * are stamped into the row because they are configurable: without them, a
   * historical score cannot be explained six months later when the weighting
   * has since changed.
   */
  private async logRankingAudit(
    courseId: string,
    cycleStart: Date,
    count: number,
    weights: unknown,
    actor: Actor,
  ) {
    const course = await this.prisma.course
      .findUnique({ where: { id: courseId }, select: { title: true } })
      .catch(() => null);
    const rows = await this.prisma.studentRanking.findMany({
      where: { courseId, cycleStart },
      select: { studentId: true, rank: true, totalScore: true },
    });
    const name = await actorName(this.prisma, actor);
    await Promise.all(
      rows.map((r) =>
        this.prisma.studentActivity
          .create({
            data: {
              studentId: r.studentId,
              kind: 'AUDIT',
              type: 'RANKING_GENERATED',
              title: `Ranked #${r.rank} in ${course?.title ?? 'course'}`,
              description: `Score ${Number(r.totalScore)} of 100, against ${count} student(s).`,
              meta: { courseId, cycleStart, weights, totalScore: Number(r.totalScore), rank: r.rank } as never,
              actorId: actor?.id ?? null,
              actorName: name,
            },
          })
          .catch(() => undefined),
      ),
    );
  }

  /** Ranking analytics for the admin charts. */
  async analytics(courseId?: string) {
    const cycleStart = await this.latestRankedCycle(courseId);
    if (!cycleStart) return { cycleStart: null, courses: [], scoreBands: [], movers: [] };

    const rows = await this.prisma.studentRanking.findMany({
      where: { cycleStart, ...(courseId ? { courseId } : {}) },
      include: {
        course: { select: { id: true, title: true } },
        student: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    const byCourse = new Map<string, { title: string; scores: number[] }>();
    for (const r of rows) {
      const k = r.courseId;
      if (!byCourse.has(k)) byCourse.set(k, { title: r.course?.title ?? 'Course', scores: [] });
      byCourse.get(k)!.scores.push(Number(r.totalScore));
    }

    const bands = [
      { name: '90–100', min: 90 }, { name: '80–89', min: 80 }, { name: '70–79', min: 70 },
      { name: '60–69', min: 60 }, { name: 'Below 60', min: 0 },
    ];
    const scoreBands = bands.map((b, i) => {
      const upper = i === 0 ? 101 : bands[i - 1].min;
      return {
        name: b.name,
        count: rows.filter((r) => Number(r.totalScore) >= b.min && Number(r.totalScore) < upper).length,
      };
    });

    const movers = rows
      .filter((r) => r.previousRank != null)
      .map((r) => ({
        studentName: `${r.student.user.firstName} ${r.student.user.lastName}`.trim(),
        courseTitle: r.course?.title ?? 'Course',
        movement: (r.previousRank ?? 0) - r.rank,
        rank: r.rank,
      }))
      .sort((a, b) => b.movement - a.movement)
      .slice(0, 10);

    return {
      cycleStart,
      courses: [...byCourse.entries()].map(([id, c]) => ({
        courseId: id,
        title: c.title,
        students: c.scores.length,
        averageScore: c.scores.length
          ? round2(c.scores.reduce((a, s) => a + s, 0) / c.scores.length)
          : 0,
        topScore: c.scores.length ? round2(Math.max(...c.scores)) : 0,
      })),
      scoreBands,
      movers,
    };
  }
}
