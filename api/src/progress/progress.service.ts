import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../generated/prisma/enums';
import {
  ProgressEngineService,
  type ProgressConfigPatch,
} from './progress-engine.service';
import type { AddRemarkDto, FlagStudentDto, ListProgressDto } from './dto';

type Actor = { id?: string; name?: string };

// Roster row with the metadata the progress views group/filter by.
type RosterStudent = {
  id: string;
  studentCode: string;
  name: string;
  country: string | null;
  courseId: string | null;
  courseTitle: string | null;
  teacherId: string | null;
  teacherName: string | null;
  batchId: string | null;
  batchName: string | null;
  coachId: string | null;
  coachName: string | null;
  parentEmail: string | null;
};

@Injectable()
export class ProgressService implements OnModuleInit {
  private readonly logger = new Logger(ProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProgressEngineService,
    private readonly notifications: NotificationsService,
  ) {}

  // Seed the badge catalogue on boot; run a daily sweep (no @nestjs/schedule in
  // this project — an in-process interval matches the attendance/lead modules).
  async onModuleInit() {
    await this.engine.seedBadges().catch((e) =>
      this.logger.error(`Badge seed failed: ${e.message}`),
    );
    const DAY = 24 * 60 * 60 * 1000;
    setInterval(() => {
      this.snapshotAll().catch((e) =>
        this.logger.error(`Progress sweep failed: ${e.message}`),
      );
    }, DAY).unref?.();
  }

  getConfig() {
    return this.engine.getConfig();
  }

  // ── Skills (admin CRUD) ──────────────────────────────────────────────────
  listSkills(courseId?: string) {
    return this.prisma.progressSkill.findMany({
      where: { archived: false, ...(courseId ? { courseId } : {}) },
      orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
    });
  }
  createSkill(dto: { courseId: string; name: string; order?: number }) {
    return this.prisma.progressSkill.create({
      data: { courseId: dto.courseId, name: dto.name, order: dto.order ?? 0 },
    });
  }
  async deleteSkill(id: string) {
    await this.prisma.progressSkill.update({
      where: { id },
      data: { archived: true },
    });
    return { success: true };
  }

  listBadges() {
    return this.prisma.badge.findMany({ orderBy: { createdAt: 'asc' } });
  }
  updateConfig(dto: ProgressConfigPatch) {
    return this.engine.updateConfig(dto);
  }

  // ── Roster (active students + grouping metadata) ─────────────────────────
  private async roster(where: {
    courseId?: string;
    batchId?: string;
    teacherId?: string;
    coachId?: string;
    country?: string;
    search?: string;
  }): Promise<RosterStudent[]> {
    const students = await this.prisma.studentProfile.findMany({
      where: {
        user: {
          status: 'ACTIVE',
          ...(where.country ? { country: where.country } : {}),
          ...(where.search
            ? {
                OR: [
                  { firstName: { contains: where.search, mode: 'insensitive' } },
                  { lastName: { contains: where.search, mode: 'insensitive' } },
                  { email: { contains: where.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        ...(where.coachId ? { coachId: where.coachId } : {}),
        ...(where.batchId ? { batches: { some: { batchId: where.batchId } } } : {}),
        ...(where.courseId || where.teacherId
          ? {
              enrollments: {
                some: {
                  ...(where.courseId ? { courseId: where.courseId } : {}),
                  ...(where.teacherId ? { teacherId: where.teacherId } : {}),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        studentCode: true,
        coachId: true,
        parentEmail: true,
        user: { select: { firstName: true, lastName: true, country: true } },
        enrollments: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            courseId: true,
            course: { select: { title: true } },
            teacherId: true,
            teacher: {
              select: { user: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        batches: {
          orderBy: { addedAt: 'desc' },
          take: 1,
          select: { batchId: true, batch: { select: { name: true } } },
        },
      },
      take: 500,
    });

    // Resolve coach display names (coachId is a plain User id).
    const coachIds = [...new Set(students.map((s) => s.coachId).filter(Boolean))] as string[];
    const coaches = coachIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: coachIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const coachName = new Map(
      coaches.map((c) => [c.id, `${c.firstName} ${c.lastName}`]),
    );

    return students.map((s) => {
      const enr = s.enrollments[0];
      const bat = s.batches[0];
      return {
        id: s.id,
        studentCode: s.studentCode,
        name: `${s.user.firstName} ${s.user.lastName}`,
        country: s.user.country,
        courseId: enr?.courseId ?? null,
        courseTitle: enr?.course.title ?? null,
        teacherId: enr?.teacherId ?? null,
        teacherName: enr?.teacher
          ? `${enr.teacher.user.firstName} ${enr.teacher.user.lastName}`
          : null,
        batchId: bat?.batchId ?? null,
        batchName: bat?.batch.name ?? null,
        coachId: s.coachId,
        coachName: s.coachId ? (coachName.get(s.coachId) ?? null) : null,
        parentEmail: s.parentEmail,
      };
    });
  }

  private groupAvg<T>(
    rows: { key: string | null; value: number }[],
  ): { name: string; value: number }[] {
    const m = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      if (!r.key) continue;
      const cur = m.get(r.key) ?? { sum: 0, n: 0 };
      cur.sum += r.value;
      cur.n++;
      m.set(r.key, cur);
    }
    return [...m.entries()]
      .map(([name, v]) => ({ name, value: Math.round(v.sum / v.n) }))
      .sort((a, b) => b.value - a.value);
  }

  // ── Admin dashboard ──────────────────────────────────────────────────────
  async adminDashboard() {
    const cfg = await this.engine.getConfig();
    const roster = await this.roster({});

    const computed = await Promise.all(
      roster.map(async (r) => ({
        r,
        core: await this.engine.computeCore(r.id, cfg),
      })),
    );

    const withData = computed.filter((c) => c.core.hasData);
    const nums = (pick: (c: (typeof computed)[number]) => number | null) =>
      withData
        .map(pick)
        .filter((n): n is number => typeof n === 'number');

    const mean = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const atRisk = computed.filter(
      (c) =>
        this.engine.detectRisk(
          {
            attendancePct: c.core.attendancePct,
            assignmentPct: c.core.assignmentPct,
            assessmentPct: c.core.assessmentPct,
          },
          cfg,
        ).atRisk,
    );
    const topPerformers = computed.filter(
      (c) => c.core.status === 'EXCELLENT',
    );

    // Pending reviews: active students without a MonthlyReview this month.
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const reviewedIds = new Set(
      (
        await this.prisma.monthlyReview.findMany({
          where: {
            studentId: { in: roster.map((r) => r.id) },
            periodStart: { gte: monthStart },
          },
          select: { studentId: true },
        })
      ).map((x) => x.studentId),
    );
    const pendingReviews = roster.filter((r) => !reviewedIds.has(r.id)).length;

    // Improving: students whose two latest snapshots trend up.
    const improving = await this.countImproving(roster.map((r) => r.id));

    return {
      cards: {
        totalActiveStudents: roster.length,
        averageAttendance: mean(nums((c) => c.core.attendancePct)),
        averageAssignmentScore: mean(nums((c) => c.core.assignmentPct)),
        averageAssessmentScore: mean(nums((c) => c.core.assessmentPct)),
        studentsImproving: improving,
        studentsAtRisk: atRisk.length,
        topPerformers: topPerformers.length,
        pendingReviews,
      },
      charts: {
        courseWise: this.groupAvg(
          computed.map((c) => ({ key: c.r.courseTitle, value: c.core.overall })),
        ),
        teacherWise: this.groupAvg(
          computed.map((c) => ({ key: c.r.teacherName, value: c.core.overall })),
        ),
        countryWise: this.groupAvg(
          computed.map((c) => ({ key: c.r.country, value: c.core.overall })),
        ),
        batchWise: this.groupAvg(
          computed.map((c) => ({ key: c.r.batchName, value: c.core.overall })),
        ),
        monthlyProgressTrend: await this.monthlyProgressTrend(),
        attendanceTrend: this.groupAvg(
          computed.map((c) => ({
            key: 'Attendance',
            value: c.core.attendancePct ?? 0,
          })),
        ),
      },
    };
  }

  private async countImproving(studentIds: string[]): Promise<number> {
    if (!studentIds.length) return 0;
    const snaps = await this.prisma.progressSnapshot.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { periodStart: 'desc' },
      select: { studentId: true, overallScore: true, periodStart: true },
    });
    const byStudent = new Map<string, number[]>();
    for (const s of snaps) {
      const arr = byStudent.get(s.studentId) ?? [];
      if (arr.length < 2) arr.push(s.overallScore);
      byStudent.set(s.studentId, arr);
    }
    let n = 0;
    for (const arr of byStudent.values())
      if (arr.length === 2 && arr[0] > arr[1]) n++;
    return n;
  }

  private async monthlyProgressTrend(): Promise<{ month: string; value: number }[]> {
    const snaps = await this.prisma.progressSnapshot.findMany({
      orderBy: { periodStart: 'asc' },
      select: { monthLabel: true, overallScore: true, periodStart: true },
    });
    const m = new Map<string, { sum: number; n: number; ord: number }>();
    for (const s of snaps) {
      const cur = m.get(s.monthLabel) ?? {
        sum: 0,
        n: 0,
        ord: s.periodStart.getTime(),
      };
      cur.sum += s.overallScore;
      cur.n++;
      m.set(s.monthLabel, cur);
    }
    return [...m.entries()]
      .sort((a, b) => a[1].ord - b[1].ord)
      .slice(-12)
      .map(([month, v]) => ({ month, value: Math.round(v.sum / v.n) }));
  }

  // ── Student progress list (filtered + paginated) ─────────────────────────
  async list(dto: ListProgressDto) {
    const cfg = await this.engine.getConfig();
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const roster = await this.roster({
      courseId: dto.courseId,
      batchId: dto.batchId,
      teacherId: dto.teacherId,
      coachId: dto.coachId,
      country: dto.country,
      search: dto.search,
    });

    let rows = await Promise.all(
      roster.map(async (r) => {
        const core = await this.engine.computeCore(r.id, cfg);
        const risk = this.engine.detectRisk(
          {
            attendancePct: core.attendancePct,
            assignmentPct: core.assignmentPct,
            assessmentPct: core.assessmentPct,
          },
          cfg,
        );
        return {
          studentId: r.id,
          studentCode: r.studentCode,
          name: r.name,
          course: r.courseTitle,
          teacher: r.teacherName,
          attendance: core.attendancePct,
          avgScore:
            core.assessmentPct ?? core.assignmentPct ?? null,
          progress: core.overall,
          status: core.status,
          atRisk: risk.atRisk,
        };
      }),
    );

    // Computed-value filters (applied after scoring).
    if (dto.status && dto.status !== 'All') {
      if (dto.status === 'AtRisk') rows = rows.filter((r) => r.atRisk);
      else rows = rows.filter((r) => r.status === dto.status);
    }
    if (typeof dto.minAttendance === 'number')
      rows = rows.filter((r) => (r.attendance ?? 0) >= dto.minAttendance!);

    // Sort
    switch (dto.sortBy) {
      case 'progress_asc':
        rows.sort((a, b) => a.progress - b.progress);
        break;
      case 'attendance_desc':
        rows.sort((a, b) => (b.attendance ?? 0) - (a.attendance ?? 0));
        break;
      case 'name_asc':
        rows.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        rows.sort((a, b) => b.progress - a.progress); // progress_desc
    }

    const total = rows.length;
    const items = rows.slice((page - 1) * limit, page * limit);
    return {
      items,
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  // ── Single student detail ────────────────────────────────────────────────
  async studentDetail(studentId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        studentCode: true,
        coachId: true,
        user: {
          select: { firstName: true, lastName: true, avatarUrl: true, country: true },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const [detail, goals, badges, risk, meetings] = await Promise.all([
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
      this.prisma.progressRiskFlag.findMany({
        where: { studentId, status: { not: 'RESOLVED' } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.parentMeeting.findMany({
        where: { studentId },
        orderBy: { scheduledAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      student: {
        id: student.id,
        studentCode: student.studentCode,
        name: `${student.user.firstName} ${student.user.lastName}`,
        avatarUrl: student.user.avatarUrl,
        country: student.user.country,
        coachId: student.coachId,
      },
      ...detail,
      goals,
      badges: badges.map((b) => ({
        code: b.badge.code,
        name: b.badge.name,
        icon: b.badge.icon,
        tone: b.badge.tone,
        awardedAt: b.awardedAt,
      })),
      riskFlags: risk,
      parentMeetings: meetings,
    };
  }

  /** Full snapshot history for a student (the "Archive History" view). */
  async studentHistory(studentId: string) {
    const snaps = await this.prisma.progressSnapshot.findMany({
      where: { studentId },
      orderBy: { periodStart: 'desc' },
    });
    return snaps.map((s) => ({
      monthLabel: s.monthLabel,
      periodStart: s.periodStart,
      attendancePct: s.attendancePct,
      assignmentPct: s.assignmentPct,
      assessmentPct: s.assessmentPct,
      overallScore: s.overallScore,
      statusLabel: s.statusLabel,
      rank: s.rank,
    }));
  }

  // ── Admin actions ────────────────────────────────────────────────────────
  async addRemark(studentId: string, dto: AddRemarkDto, actor: Actor) {
    await this.assertStudent(studentId);
    return this.prisma.studentActivity.create({
      data: {
        studentId,
        kind: 'NOTE',
        type: 'PROGRESS_REMARK',
        title: 'Progress remark',
        description: dto.text,
        visibility: 'STAFF',
        actorId: actor.id ?? null,
        actorName: actor.name ?? null,
      },
    });
  }

  async flagStudent(studentId: string, dto: FlagStudentDto, actor: Actor) {
    const student = await this.assertStudent(studentId);
    const core = await this.engine.computeCore(studentId);
    const flag = await this.prisma.progressRiskFlag.create({
      data: {
        studentId,
        level: dto.level === 'CRITICAL' ? 'CRITICAL' : 'AT_RISK',
        reasons: dto.note ? [dto.note] : ['Manually flagged'],
        attendancePct: core.attendancePct,
        assignmentPct: core.assignmentPct,
        assessmentPct: core.assessmentPct,
        note: dto.note ?? null,
        status: 'OPEN',
      },
    });
    // Notify the assigned coach (or all coaches if unassigned).
    const link = `/students/${studentId}?tab=progress`;
    if (student.coachId) {
      this.notifications
        .createFor(student.coachId, {
          type: 'PROGRESS_RISK',
          title: 'Student flagged at risk',
          body: `${student.name} was flagged (${flag.level}).`,
          link,
        })
        .catch(() => undefined);
    } else {
      this.notifications
        .createForRoles([Role.ACADEMIC_COACH, Role.ADMIN], {
          type: 'PROGRESS_RISK',
          title: 'Student flagged at risk',
          body: `${student.name} was flagged (${flag.level}).`,
          link,
        })
        .catch(() => undefined);
    }
    void actor;
    return flag;
  }

  private async assertStudent(studentId: string) {
    const s = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        coachId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    return {
      id: s.id,
      coachId: s.coachId,
      name: `${s.user.firstName} ${s.user.lastName}`,
    };
  }

  // ── Reports (tabular; frontend exports CSV/PDF) ──────────────────────────
  async report(type: string) {
    const cfg = await this.engine.getConfig();
    const roster = await this.roster({});
    const rows = await Promise.all(
      roster.map(async (r) => ({ r, core: await this.engine.computeCore(r.id, cfg) })),
    );

    const groupBy = (key: (x: (typeof rows)[number]) => string | null) => {
      const m = new Map<string, { overall: number[]; att: number[]; n: number }>();
      for (const x of rows) {
        const k = key(x);
        if (!k) continue;
        const cur = m.get(k) ?? { overall: [], att: [], n: 0 };
        cur.overall.push(x.core.overall);
        if (x.core.attendancePct != null) cur.att.push(x.core.attendancePct);
        cur.n++;
        m.set(k, cur);
      }
      const mean = (a: number[]) =>
        a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0;
      return [...m.entries()]
        .map(([name, v]) => ({
          name,
          students: v.n,
          avgProgress: mean(v.overall),
          avgAttendance: mean(v.att),
        }))
        .sort((a, b) => b.avgProgress - a.avgProgress);
    };

    if (type === 'course')
      return { type, columns: ['Course', 'Students', 'Avg Progress', 'Avg Attendance'], rows: groupBy((x) => x.r.courseTitle) };
    if (type === 'teacher')
      return { type, columns: ['Teacher', 'Students', 'Avg Progress', 'Avg Attendance'], rows: groupBy((x) => x.r.teacherName) };
    if (type === 'batch')
      return { type, columns: ['Batch', 'Students', 'Avg Progress', 'Avg Attendance'], rows: groupBy((x) => x.r.batchName) };
    if (type === 'country')
      return { type, columns: ['Country', 'Students', 'Avg Progress', 'Avg Attendance'], rows: groupBy((x) => x.r.country) };
    if (type === 'coach')
      return { type, columns: ['Coach', 'Students', 'Avg Progress', 'Avg Attendance'], rows: groupBy((x) => x.r.coachName) };
    if (type === 'monthly') {
      return {
        type,
        columns: ['Month', 'Avg Progress'],
        rows: (await this.monthlyProgressTrend()).map((t) => ({
          name: t.month,
          avgProgress: t.value,
        })),
      };
    }
    if (type === 'quarterly') {
      const snaps = await this.prisma.progressSnapshot.findMany({
        orderBy: { periodStart: 'asc' },
        select: { overallScore: true, periodStart: true },
      });
      const q = new Map<string, { sum: number; n: number; ord: number }>();
      for (const s of snaps) {
        const d = s.periodStart;
        const key = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
        const cur = q.get(key) ?? { sum: 0, n: 0, ord: d.getTime() };
        cur.sum += s.overallScore;
        cur.n++;
        q.set(key, cur);
      }
      return {
        type,
        columns: ['Quarter', 'Avg Progress'],
        rows: [...q.entries()]
          .sort((a, b) => a[1].ord - b[1].ord)
          .map(([name, v]) => ({ name, avgProgress: Math.round(v.sum / v.n) })),
      };
    }
    if (type === 'parent') {
      return {
        type,
        columns: ['Student', 'Parent Email', 'Attendance', 'Assignment', 'Assessment', 'Overall', 'Status'],
        rows: rows.map((x) => ({
          name: x.r.name,
          parentEmail: x.r.parentEmail ?? '—',
          attendance: x.core.attendancePct,
          assignment: x.core.assignmentPct,
          assessment: x.core.assessmentPct,
          overall: x.core.overall,
          status: x.core.status,
        })),
      };
    }
    if (type === 'certificate') {
      const certs = await this.prisma.assessmentAttempt.findMany({
        where: { studentId: { in: roster.map((r) => r.id) }, certificateNo: { not: null } },
        orderBy: { publishedAt: 'desc' },
        select: {
          certificateNo: true,
          percentage: true,
          publishedAt: true,
          studentId: true,
          assessment: { select: { title: true } },
        },
      });
      const nameById = new Map(roster.map((r) => [r.id, r.name]));
      return {
        type,
        columns: ['Student', 'Certificate No', 'Assessment', 'Score', 'Issued'],
        rows: certs.map((c) => ({
          name: nameById.get(c.studentId) ?? '',
          certificateNo: c.certificateNo,
          assessment: c.assessment.title,
          score: `${c.percentage}%`,
          issued: c.publishedAt ? c.publishedAt.toISOString().slice(0, 10) : '—',
        })),
      };
    }
    // default: per-student
    return {
      type: 'student',
      columns: ['Code', 'Student', 'Course', 'Teacher', 'Attendance', 'Assignment', 'Assessment', 'Overall', 'Status'],
      rows: rows.map((x) => ({
        studentCode: x.r.studentCode,
        name: x.r.name,
        course: x.r.courseTitle,
        teacher: x.r.teacherName,
        attendance: x.core.attendancePct,
        assignment: x.core.assignmentPct,
        assessment: x.core.assessmentPct,
        overall: x.core.overall,
        status: x.core.status,
      })),
    };
  }

  // ── Analytics ────────────────────────────────────────────────────────────
  async analytics() {
    const cfg = await this.engine.getConfig();
    const roster = await this.roster({});
    const ids = roster.map((r) => r.id);
    const computed = await Promise.all(
      roster.map(async (r) => ({ r, core: await this.engine.computeCore(r.id, cfg) })),
    );
    const mean = (a: number[]) =>
      a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0;
    const withData = computed.filter((c) => c.core.hasData);

    const [enrollAgg, goals, skillRows, skillDefs] = await Promise.all([
      this.prisma.enrollment.aggregate({
        where: { studentId: { in: ids }, status: 'ACTIVE' },
        _avg: { progress: true },
      }),
      this.prisma.learningGoal.findMany({
        where: { studentId: { in: ids } },
        select: { status: true },
      }),
      this.prisma.studentSkillProgress.findMany({
        where: { studentId: { in: ids } },
        select: { skillId: true, percentage: true },
      }),
      this.prisma.progressSkill.findMany({ select: { id: true, name: true } }),
    ]);

    const goalTotal = goals.length;
    const goalAchieved = goals.filter((g) => g.status === 'ACHIEVED').length;
    const goalStatusCount = new Map<string, number>();
    for (const g of goals)
      goalStatusCount.set(g.status, (goalStatusCount.get(g.status) ?? 0) + 1);

    const skillName = new Map(skillDefs.map((s) => [s.id, s.name]));
    const skillAgg = new Map<string, number[]>();
    for (const sr of skillRows) {
      const nm = skillName.get(sr.skillId) ?? 'Skill';
      (skillAgg.get(nm) ?? skillAgg.set(nm, []).get(nm)!).push(sr.percentage);
    }

    const atRisk = computed.filter(
      (c) =>
        this.engine.detectRisk(
          { attendancePct: c.core.attendancePct, assignmentPct: c.core.assignmentPct, assessmentPct: c.core.assessmentPct },
          cfg,
        ).atRisk,
    ).length;

    return {
      cards: {
        averageProgress: mean(withData.map((c) => c.core.overall)),
        topPerformers: computed.filter((c) => c.core.status === 'EXCELLENT').length,
        studentsAtRisk: atRisk,
        courseCompletion: Math.round(Number(enrollAgg._avg.progress ?? 0)),
        goalCompletion: goalTotal ? Math.round((goalAchieved / goalTotal) * 100) : 0,
        averageAttendance: mean(
          withData.map((c) => c.core.attendancePct).filter((n): n is number => n != null),
        ),
      },
      charts: {
        learningCurve: await this.monthlyProgressTrend(),
        skillDistribution: [...skillAgg.entries()]
          .map(([name, pcts]) => ({ name, value: mean(pcts) }))
          .sort((a, b) => b.value - a.value),
        goalAchievement: [...goalStatusCount.entries()].map(([name, value]) => ({ name, value })),
        teacherImpact: this.groupAvg(computed.map((c) => ({ key: c.r.teacherName, value: c.core.overall }))),
        batchComparison: this.groupAvg(computed.map((c) => ({ key: c.r.batchName, value: c.core.overall }))),
        weeklyGrowth: await this.weeklyAttendanceGrowth(ids),
      },
    };
  }

  private async weeklyAttendanceGrowth(
    studentIds: string[],
  ): Promise<{ name: string; value: number }[]> {
    if (!studentIds.length) return [];
    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 3600 * 1000);
    const rows = await this.prisma.classAttendee.findMany({
      where: { studentId: { in: studentIds }, class: { startsAt: { gte: eightWeeksAgo } } },
      select: { status: true, attended: true, class: { select: { startsAt: true } } },
    });
    const wk = new Map<string, { present: number; total: number; ord: number }>();
    for (const r of rows) {
      if (r.status === 'EXCUSED' || r.status === 'LEAVE_APPROVED') continue;
      const d = r.class.startsAt;
      const onejan = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      const key = `W${week}`;
      const cur = wk.get(key) ?? { present: 0, total: 0, ord: d.getTime() };
      cur.total++;
      if (r.status === 'PRESENT' || r.status === 'LATE' || (!r.status && r.attended)) cur.present++;
      wk.set(key, cur);
    }
    return [...wk.entries()]
      .sort((a, b) => a[1].ord - b[1].ord)
      .slice(-8)
      .map(([name, v]) => ({ name, value: v.total ? Math.round((v.present / v.total) * 100) : 0 }));
  }

  // Raise a risk flag automatically if thresholds trip and none is open yet.
  private async autoFlagRisk(
    studentId: string,
    core: {
      attendancePct: number | null;
      assignmentPct: number | null;
      assessmentPct: number | null;
      hasData: boolean;
    },
    cfg: Awaited<ReturnType<ProgressEngineService['getConfig']>>,
  ) {
    if (!core.hasData) return;
    const risk = this.engine.detectRisk(core, cfg);
    if (!risk.atRisk) return;

    const open = await this.prisma.progressRiskFlag.findFirst({
      where: { studentId, status: { not: 'RESOLVED' } },
      select: { id: true },
    });
    if (open) return;

    await this.prisma.progressRiskFlag.create({
      data: {
        studentId,
        level: risk.level,
        reasons: risk.reasons,
        attendancePct: core.attendancePct,
        assignmentPct: core.assignmentPct,
        assessmentPct: core.assessmentPct,
        status: 'OPEN',
      },
    });

    const s = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        coachId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!s) return;
    const name = `${s.user.firstName} ${s.user.lastName}`;
    const link = `/students/${studentId}?tab=progress`;
    if (s.coachId)
      this.notifications
        .createFor(s.coachId, {
          type: 'PROGRESS_RISK',
          title: 'Student auto-flagged at risk',
          body: `${name} tripped risk thresholds (${risk.level}).`,
          link,
        })
        .catch(() => undefined);
    else
      this.notifications
        .createForRoles([Role.ACADEMIC_COACH, Role.ADMIN], {
          type: 'PROGRESS_RISK',
          title: 'Student auto-flagged at risk',
          body: `${name} tripped risk thresholds (${risk.level}).`,
          link,
        })
        .catch(() => undefined);
  }

  // ── Monthly snapshot capture (manual trigger + daily auto-sweep) ──────────
  async snapshotAll() {
    const cfg = await this.engine.getConfig();
    const roster = await this.roster({});
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthLabel = periodStart.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    let written = 0;
    for (const r of roster) {
      // Recompute skills + auto-award badges + auto-detect risk for everyone.
      await this.engine.refreshStudentSkills(r.id).catch(() => undefined);
      await this.engine.awardBadges(r.id, cfg).catch(() => undefined);

      const core = await this.engine.computeCore(r.id, cfg);
      await this.autoFlagRisk(r.id, core, cfg).catch(() => undefined);

      if (!core.hasData) continue;
      await this.prisma.progressSnapshot.upsert({
        where: {
          studentId_periodStart: { studentId: r.id, periodStart },
        },
        update: {
          attendancePct: core.attendancePct ?? 0,
          assignmentPct: core.assignmentPct ?? 0,
          assessmentPct: core.assessmentPct ?? 0,
          feedbackScore: core.feedbackScore ?? 0,
          coachScore: core.coachScore ?? 0,
          overallScore: core.overall,
          statusLabel: core.status,
        },
        create: {
          studentId: r.id,
          periodStart,
          periodEnd,
          monthLabel,
          attendancePct: core.attendancePct ?? 0,
          assignmentPct: core.assignmentPct ?? 0,
          assessmentPct: core.assessmentPct ?? 0,
          feedbackScore: core.feedbackScore ?? 0,
          coachScore: core.coachScore ?? 0,
          overallScore: core.overall,
          statusLabel: core.status,
        },
      });
      written++;
    }

    // Assign ranks within this period (highest overall = rank 1).
    const period = await this.prisma.progressSnapshot.findMany({
      where: { periodStart },
      orderBy: { overallScore: 'desc' },
      select: { id: true },
    });
    await Promise.all(
      period.map((row, i) =>
        this.prisma.progressSnapshot.update({
          where: { id: row.id },
          data: { rank: i + 1 },
        }),
      ),
    );

    return { written, monthLabel };
  }
}
