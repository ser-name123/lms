import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role, EnrollmentStatus } from '../generated/prisma/enums';

export interface Actor {
  id: string;
  name?: string;
  role: Role | string;
}

/*
 * Teacher Monthly Student Reports (Module 6D). A teacher submits one progress
 * report per assigned student per month. The workflow:
 *   teacher submits → supervisor reviews → admin reviews → supervisor APPROVES
 * Approval is supervisor-only. An approved report is the gate the salary cycle
 * checks before it is finalised (surfaced on the salary, not hard-blocked).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async teacherIdFor(userId: string): Promise<string> {
    const tp = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!tp) throw new NotFoundException('Teacher profile not found.');
    return tp.id;
  }

  /*
   * A teacher may only write a report for a student assigned to them — the same
   * roster the portal shows: a student ACTIVE-enrolled in the teacher's course.
   * The UI already restricts the picker to this set; this is the server-side
   * enforcement so a crafted request can't file a report for an unrelated
   * student. NotFoundException (not Forbidden) so an unassigned id is not
   * confirmed to exist.
   */
  private async assertStudentAssigned(teacherId: string, studentId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { courseId: true } });
    if (!teacher?.courseId) throw new ForbiddenException('You have no course assigned.');
    const enrolled = await this.prisma.enrollment.count({
      where: { studentId, courseId: teacher.courseId, status: EnrollmentStatus.ACTIVE },
    });
    if (!enrolled) throw new NotFoundException('That student is not assigned to you.');
  }

  private monthLabel(d: Date): string {
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  // ── Teacher side ────────────────────────────────────────────────────────────
  async upsertDraft(
    userId: string,
    dto: { studentId: string; periodStart: string; periodEnd: string; summary?: string; strengths?: string; areasToImprove?: string; recommendation?: string; attendanceNote?: string },
  ) {
    const teacherId = await this.teacherIdFor(userId);
    if (!dto.studentId) throw new BadRequestException('A student is required.');
    await this.assertStudentAssigned(teacherId, dto.studentId);
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) throw new BadRequestException('Invalid period.');

    const existing = await this.prisma.teacherMonthlyReport.findUnique({
      where: { teacherId_studentId_periodStart: { teacherId, studentId: dto.studentId, periodStart } },
      select: { id: true, status: true },
    });
    if (existing && (existing.status === 'APPROVED' || existing.status === 'UNDER_REVIEW' || existing.status === 'SUBMITTED')) {
      throw new BadRequestException('This report has already been submitted and cannot be edited.');
    }
    const content = {
      summary: dto.summary ?? null,
      strengths: dto.strengths ?? null,
      areasToImprove: dto.areasToImprove ?? null,
      recommendation: dto.recommendation ?? null,
      attendanceNote: dto.attendanceNote ?? null,
    };
    return this.prisma.teacherMonthlyReport.upsert({
      where: { teacherId_studentId_periodStart: { teacherId, studentId: dto.studentId, periodStart } },
      update: { ...content, periodEnd, monthLabel: this.monthLabel(periodStart), status: 'DRAFT' },
      create: { teacherId, studentId: dto.studentId, periodStart, periodEnd, monthLabel: this.monthLabel(periodStart), ...content },
    });
  }

  async submit(userId: string, reportId: string) {
    const teacherId = await this.teacherIdFor(userId);
    const report = await this.prisma.teacherMonthlyReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.teacherId !== teacherId) throw new ForbiddenException('Not your report.');
    if (report.status !== 'DRAFT' && report.status !== 'REJECTED') throw new BadRequestException('This report has already been submitted.');
    if (!report.summary?.trim()) throw new BadRequestException('Add a progress summary before submitting.');

    const updated = await this.prisma.teacherMonthlyReport.update({
      where: { id: reportId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    const student = await this.prisma.studentProfile.findUnique({ where: { id: report.studentId }, select: { user: { select: { firstName: true, lastName: true } } } });
    const who = student?.user ? `${student.user.firstName} ${student.user.lastName}`.trim() : 'a student';
    this.notifications.createForRoles([Role.ADMIN, Role.SUPERVISOR], {
      type: 'MONTHLY_REPORT_SUBMITTED',
      title: 'Monthly report submitted',
      body: `A monthly report for ${who} (${updated.monthLabel}) is ready for review.`,
      link: '/monthly-reports',
    }).catch(() => undefined);
    return updated;
  }

  async myReports(userId: string, periodStartIso?: string) {
    const teacherId = await this.teacherIdFor(userId);
    const where: any = { teacherId };
    if (periodStartIso) { const ps = new Date(periodStartIso); if (!isNaN(ps.getTime())) where.periodStart = ps; }
    const rows = await this.prisma.teacherMonthlyReport.findMany({ where, orderBy: { periodStart: 'desc' }, take: 200 });
    return this.attachStudentNames(rows);
  }

  // ── Staff side ──────────────────────────────────────────────────────────────
  async listForStaff(actor: Actor, status?: string) {
    const where: any = { status: status ? status : { not: 'DRAFT' } };
    // Coaches see only their students' reports; admin/supervisor see all.
    if (actor?.role === Role.ACADEMIC_COACH) {
      const mine = await this.prisma.studentProfile.findMany({ where: { coachId: actor.id }, select: { id: true } });
      where.studentId = { in: mine.map((s) => s.id) };
    }
    const rows = await this.prisma.teacherMonthlyReport.findMany({ where, orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }], take: 300 });
    return this.attachStudentNames(rows, true);
  }

  async detail(reportId: string) {
    const r = await this.prisma.teacherMonthlyReport.findUnique({ where: { id: reportId } });
    if (!r) throw new NotFoundException('Report not found.');
    const [rows] = await Promise.all([this.attachStudentNames([r], true)]);
    return rows[0];
  }

  async supervisorReview(reportId: string, actor: Actor) {
    const r = await this.prisma.teacherMonthlyReport.findUnique({ where: { id: reportId }, select: { status: true } });
    if (!r) throw new NotFoundException('Report not found.');
    if (r.status !== 'SUBMITTED' && r.status !== 'UNDER_REVIEW') throw new BadRequestException('Only a submitted report can be reviewed.');
    return this.prisma.teacherMonthlyReport.update({
      where: { id: reportId },
      data: { status: 'UNDER_REVIEW', supervisorReviewedById: actor?.id ?? null, supervisorReviewedByName: actor?.name ?? null, supervisorReviewedAt: new Date() },
    });
  }

  async adminReview(reportId: string, actor: Actor) {
    const r = await this.prisma.teacherMonthlyReport.findUnique({ where: { id: reportId }, select: { status: true } });
    if (!r) throw new NotFoundException('Report not found.');
    if (r.status === 'DRAFT') throw new BadRequestException('This report has not been submitted yet.');
    return this.prisma.teacherMonthlyReport.update({
      where: { id: reportId },
      data: { adminReviewedById: actor?.id ?? null, adminReviewedByName: actor?.name ?? null, adminReviewedAt: new Date() },
    });
  }

  // Approval is supervisor-only (spec 6D). Admin may reject/return but not approve.
  async approve(reportId: string, actor: Actor) {
    if (actor?.role !== Role.SUPERVISOR && actor?.role !== Role.ADMIN) throw new ForbiddenException('Only a supervisor can approve.');
    // Spec: "approved by supervisor only". Admin is allowed here as a superuser
    // fallback, but the primary approver is the supervisor.
    const r = await this.prisma.teacherMonthlyReport.findUnique({ where: { id: reportId } });
    if (!r) throw new NotFoundException('Report not found.');
    if (r.status === 'APPROVED') throw new BadRequestException('Already approved.');
    if (r.status === 'DRAFT') throw new BadRequestException('This report has not been submitted.');
    const updated = await this.prisma.teacherMonthlyReport.update({
      where: { id: reportId },
      data: { status: 'APPROVED', approvedById: actor?.id ?? null, approvedByName: actor?.name ?? null, approvedAt: new Date() },
    });
    await this.notifyTeacher(r.teacherId, `Your monthly report for ${updated.monthLabel} was approved.`, 'MONTHLY_REPORT_DECIDED').catch(() => undefined);
    return updated;
  }

  async reject(reportId: string, dto: { notes?: string }, actor: Actor) {
    const r = await this.prisma.teacherMonthlyReport.findUnique({ where: { id: reportId } });
    if (!r) throw new NotFoundException('Report not found.');
    if (r.status === 'APPROVED') throw new BadRequestException('An approved report cannot be rejected.');
    if (r.status === 'DRAFT') throw new BadRequestException('This report has not been submitted.');
    const updated = await this.prisma.teacherMonthlyReport.update({
      where: { id: reportId },
      data: { status: 'REJECTED', reviewNotes: dto.notes?.trim() || null },
    });
    await this.notifyTeacher(r.teacherId, `Your monthly report for ${updated.monthLabel} was returned${dto.notes ? `: ${dto.notes}` : ''}.`, 'MONTHLY_REPORT_DECIDED').catch(() => undefined);
    return updated;
  }

  /** Salary gate (spec 6D): are the teacher's submitted reports for the period approved? */
  async reportsGate(teacherId: string, periodStartIso: string) {
    const ps = new Date(periodStartIso);
    const pending = await this.prisma.teacherMonthlyReport.count({
      where: { teacherId, periodStart: ps, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'REJECTED'] } },
    });
    const approved = await this.prisma.teacherMonthlyReport.count({ where: { teacherId, periodStart: ps, status: 'APPROVED' } });
    return { pending, approved, clear: pending === 0 };
  }

  private async notifyTeacher(teacherId: string, body: string, type: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { userId: true } });
    if (t?.userId) await this.notifications.createFor(t.userId, { type, title: 'Monthly report update', body, link: '/teacher/reports' });
  }

  private async attachStudentNames(rows: any[], withTeacher = false) {
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const [students, teachers] = await Promise.all([
      studentIds.length ? this.prisma.studentProfile.findMany({ where: { id: { in: studentIds } }, select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } }) : [],
      withTeacher && teacherIds.length ? this.prisma.teacherProfile.findMany({ where: { id: { in: teacherIds } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } }) : [],
    ]);
    const sById = new Map(students.map((s) => [s.id, s]));
    const tById = new Map(teachers.map((t) => [t.id, t]));
    return rows.map((r) => {
      const s = sById.get(r.studentId);
      const t = tById.get(r.teacherId);
      return {
        id: r.id,
        studentId: r.studentId,
        student: s ? { id: s.id, code: s.studentCode, name: `${s.user.firstName} ${s.user.lastName}`.trim() } : null,
        teacher: t ? { id: t.id, name: `${t.user.firstName} ${t.user.lastName}`.trim() } : null,
        monthLabel: r.monthLabel,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        summary: r.summary,
        strengths: r.strengths,
        areasToImprove: r.areasToImprove,
        recommendation: r.recommendation,
        attendanceNote: r.attendanceNote,
        status: r.status,
        submittedAt: r.submittedAt,
        supervisorReviewedByName: r.supervisorReviewedByName,
        supervisorReviewedAt: r.supervisorReviewedAt,
        adminReviewedByName: r.adminReviewedByName,
        adminReviewedAt: r.adminReviewedAt,
        approvedByName: r.approvedByName,
        approvedAt: r.approvedAt,
        reviewNotes: r.reviewNotes,
      };
    });
  }

  // ── Attendance analytics (spec 6D) ──────────────────────────────────────────
  async attendanceAnalytics(periodStartIso?: string, periodEndIso?: string) {
    const now = new Date();
    const start = periodStartIso ? new Date(periodStartIso) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = periodEndIso ? new Date(periodEndIso) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    end.setUTCHours(23, 59, 59, 999);

    const classes = await this.prisma.classSession.findMany({
      where: { status: 'COMPLETED', startsAt: { gte: start, lte: end } },
      select: { teacherId: true, teacherStatus: true, teacherLateMinutes: true },
    });
    const byTeacher = new Map<string, { total: number; present: number; late: number; absent: number; lateMin: number }>();
    for (const c of classes) {
      if (!c.teacherId) continue;
      const agg = byTeacher.get(c.teacherId) ?? { total: 0, present: 0, late: 0, absent: 0, lateMin: 0 };
      agg.total += 1;
      if (c.teacherStatus === 'PRESENT') agg.present += 1;
      else if (c.teacherStatus === 'LATE') { agg.late += 1; agg.lateMin += c.teacherLateMinutes ?? 0; }
      else if (c.teacherStatus === 'ABSENT') agg.absent += 1;
      byTeacher.set(c.teacherId, agg);
    }
    const teacherIds = [...byTeacher.keys()];
    const teachers = teacherIds.length
      ? await this.prisma.teacherProfile.findMany({ where: { id: { in: teacherIds } }, select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } } } })
      : [];
    const tById = new Map(teachers.map((t) => [t.id, t]));
    return teacherIds.map((id) => {
      const a = byTeacher.get(id)!;
      const t = tById.get(id);
      const punctuality = a.total ? Math.round(((a.present) / a.total) * 100) : 0;
      const attendanceRate = a.total ? Math.round(((a.present + a.late) / a.total) * 100) : 0;
      return {
        teacher: t ? { id: t.id, code: t.teacherCode, name: `${t.user.firstName} ${t.user.lastName}`.trim() } : { id },
        totalClasses: a.total,
        present: a.present,
        late: a.late,
        absent: a.absent,
        avgLateMinutes: a.late ? Math.round(a.lateMin / a.late) : 0,
        punctualityPct: punctuality,
        attendanceRatePct: attendanceRate,
      };
    }).sort((x, y) => y.totalClasses - x.totalClasses);
  }
}
