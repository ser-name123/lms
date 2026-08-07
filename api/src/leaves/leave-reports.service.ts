import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveCategory, LeaveRequestStatus } from '../generated/prisma/enums';
import { round2, startOfUtcDay } from './leave.config';

/*
 * §9.10 — the five reports.
 *
 * All of them count APPROVED requests only. A pending request is a intention,
 * not an absence, and a rejected one never happened — mixing them in would make
 * "days taken" a number nobody could reconcile against the register.
 */
@Injectable()
export class LeaveReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Default window: the last 12 months up to today. */
  private window(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 365 * 86_400_000);
    return { gte: startOfUtcDay(start), lte: end };
  }

  private name(u: { firstName: string | null; lastName: string | null; email: string }) {
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
  }

  /** Overlap, not containment — a leave straddling the window still belongs in it. */
  private overlapping(w: { gte: Date; lte: Date }) {
    return { startDate: { lte: w.lte }, endDate: { gte: w.gte } };
  }

  // ── 1. Staff leave summary ────────────────────────────────────────────────

  async staffLeaveSummary(from?: string, to?: string) {
    const w = this.window(from, to);
    const rows = await this.prisma.leaveRequest.findMany({
      where: { status: LeaveRequestStatus.APPROVED, ...this.overlapping(w) },
      select: {
        userId: true, leaveType: true, totalDays: true, isPaid: true, category: true,
        user: { select: { firstName: true, lastName: true, email: true, role: true } },
      },
    });

    const byUser = new Map<string, {
      userId: string; name: string; email: string; role: string;
      requests: number; totalDays: number; paidDays: number; unpaidDays: number;
      byType: Record<string, number>;
    }>();

    for (const r of rows) {
      if (!byUser.has(r.userId)) {
        byUser.set(r.userId, {
          userId: r.userId,
          name: this.name(r.user),
          email: r.user.email,
          role: r.user.role,
          requests: 0, totalDays: 0, paidDays: 0, unpaidDays: 0, byType: {},
        });
      }
      const acc = byUser.get(r.userId)!;
      acc.requests += 1;
      acc.totalDays += r.totalDays;
      // isPaid is null on rows approved before §9.3 existed. They are counted in
      // the total but in neither bucket, so paid + unpaid never exceeds total
      // and the gap is visible rather than invented.
      if (r.isPaid === true) acc.paidDays += r.totalDays;
      else if (r.isPaid === false) acc.unpaidDays += r.totalDays;
      acc.byType[r.leaveType] = (acc.byType[r.leaveType] ?? 0) + r.totalDays;
    }

    const staff = [...byUser.values()].sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name));
    return {
      staff,
      totals: {
        people: staff.length,
        requests: staff.reduce((a, s) => a + s.requests, 0),
        days: staff.reduce((a, s) => a + s.totalDays, 0),
        paidDays: staff.reduce((a, s) => a + s.paidDays, 0),
        unpaidDays: staff.reduce((a, s) => a + s.unpaidDays, 0),
      },
      from: w.gte,
      to: w.lte,
    };
  }

  // ── 2. Paid vs unpaid ─────────────────────────────────────────────────────

  async paidVsUnpaid(from?: string, to?: string) {
    const w = this.window(from, to);
    const rows = await this.prisma.leaveRequest.findMany({
      where: { status: LeaveRequestStatus.APPROVED, ...this.overlapping(w) },
      select: {
        id: true, userId: true, leaveType: true, totalDays: true, isPaid: true,
        deductionAmount: true, deductionAppliedAt: true, startDate: true, endDate: true,
        user: { select: { firstName: true, lastName: true, email: true, role: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    const paid = rows.filter((r) => r.isPaid === true);
    const unpaid = rows.filter((r) => r.isPaid === false);
    const unclassified = rows.filter((r) => r.isPaid === null);

    const deducted = unpaid.reduce((a, r) => a + Number(r.deductionAmount ?? 0), 0);
    const notYetCharged = unpaid
      .filter((r) => !r.deductionAppliedAt)
      .reduce((a, r) => a + Number(r.deductionAmount ?? 0), 0);

    return {
      paid: { requests: paid.length, days: paid.reduce((a, r) => a + r.totalDays, 0) },
      unpaid: {
        requests: unpaid.length,
        days: unpaid.reduce((a, r) => a + r.totalDays, 0),
        deductionTotal: round2(deducted),
        // What payroll still owes: an unpaid leave approved before the salary
        // for its month was calculated shows here until it is charged.
        pendingDeduction: round2(notYetCharged),
      },
      // Approved before §9.3 existed, so nobody ever said which it was.
      unclassified: { requests: unclassified.length, days: unclassified.reduce((a, r) => a + r.totalDays, 0) },
      rows: unpaid.map((r) => ({
        id: r.id,
        name: this.name(r.user),
        role: r.user.role,
        leaveType: r.leaveType,
        from: r.startDate,
        to: r.endDate,
        days: r.totalDays,
        deduction: Number(r.deductionAmount ?? 0),
        charged: !!r.deductionAppliedAt,
      })),
      from: w.gte,
      to: w.lte,
    };
  }

  // ── 3. Teacher unavailability ─────────────────────────────────────────────

  async teacherUnavailability(from?: string, to?: string) {
    const w = this.window(from, to);
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        category: LeaveCategory.TEACHER_UNAVAILABILITY,
        status: LeaveRequestStatus.APPROVED,
        ...this.overlapping(w),
      },
      select: {
        id: true, userId: true, leaveType: true, totalDays: true, startDate: true, endDate: true,
        returnedAt: true, availabilityBlockedAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { impacts: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    const now = new Date();
    const byTeacher = new Map<string, { userId: string; name: string; spells: number; days: number; studentsAffected: number }>();
    for (const r of rows) {
      if (!byTeacher.has(r.userId)) {
        byTeacher.set(r.userId, { userId: r.userId, name: this.name(r.user), spells: 0, days: 0, studentsAffected: 0 });
      }
      const acc = byTeacher.get(r.userId)!;
      acc.spells += 1;
      acc.days += r.totalDays;
      acc.studentsAffected += r._count.impacts;
    }

    return {
      rows: rows.map((r) => ({
        id: r.id,
        teacher: this.name(r.user),
        type: r.leaveType,
        from: r.startDate,
        to: r.endDate,
        days: r.totalDays,
        studentsAffected: r._count.impacts,
        // Three states a coach actually cares about, not just a date compare.
        state: r.returnedAt ? 'RETURNED' : r.startDate <= now && r.endDate >= startOfUtcDay(now) ? 'AWAY_NOW' : r.startDate > now ? 'UPCOMING' : 'ENDED_PENDING_RETURN',
      })),
      byTeacher: [...byTeacher.values()].sort((a, b) => b.days - a.days),
      totals: {
        spells: rows.length,
        days: rows.reduce((a, r) => a + r.totalDays, 0),
        awayNow: rows.filter((r) => !r.returnedAt && r.startDate <= now && r.endDate >= startOfUtcDay(now)).length,
      },
      from: w.gte,
      to: w.lte,
    };
  }

  // ── 4. Unavailability impact ──────────────────────────────────────────────

  async unavailabilityImpact(from?: string, to?: string) {
    const w = this.window(from, to);
    const impacts = await this.prisma.leaveImpact.findMany({
      where: { leave: { status: LeaveRequestStatus.APPROVED, ...this.overlapping(w) } },
      include: {
        student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true, email: true } } } },
        leave: {
          select: {
            startDate: true, endDate: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const byOption: Record<string, number> = {
      PENDING_REVIEW: 0, WAIT_FOR_TEACHER: 0, TEMPORARY_TEACHER: 0, RESCHEDULE: 0,
    };
    for (const i of impacts) byOption[i.option] = (byOption[i.option] ?? 0) + 1;

    const open = impacts.filter((i) => i.status === 'OPEN');
    const classesDisrupted = impacts.reduce((a, i) => a + i.affectedClassCount, 0);
    const cycleDaysGiven = impacts.reduce((a, i) => a + (i.cycleExtendedDays ?? 0), 0);

    return {
      rows: impacts.map((i) => ({
        id: i.id,
        student: i.student.user
          ? this.name(i.student.user)
          : (i.student.studentCode ?? ''),
        studentCode: i.student.studentCode,
        course: i.courseTitle,
        teacher: this.name(i.leave.user),
        from: i.leave.startDate,
        to: i.leave.endDate,
        classes: i.affectedClassCount,
        option: i.option,
        status: i.status,
        temporaryTeacher: i.temporaryTeacherName,
        cycleExtendedDays: i.cycleExtendedDays,
        decidedBy: i.decidedByName,
        decidedAt: i.decidedAt,
      })),
      byOption,
      totals: {
        studentsAffected: impacts.length,
        classesDisrupted,
        awaitingDecision: open.length,
        cycleDaysGiven,
        // The figure that says whether the coach is keeping up.
        resolvedPct: impacts.length
          ? round2(((impacts.length - open.length) / impacts.length) * 100)
          : 0,
      },
      from: w.gte,
      to: w.lte,
    };
  }

  // ── 5. Monthly leave register ─────────────────────────────────────────────

  /** `month` as "2026-08"; defaults to the current month. */
  async monthlyRegister(month?: string) {
    const base = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : new Date();
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const rows = await this.prisma.leaveRequest.findMany({
      where: { status: LeaveRequestStatus.APPROVED, startDate: { lte: end }, endDate: { gte: start } },
      select: {
        id: true, leaveType: true, category: true, startDate: true, endDate: true, totalDays: true,
        isPaid: true, deductionAmount: true, reason: true, remarks: true, documentUrl: true,
        approvedByName: true, approvedAt: true, originalStartDate: true, originalEndDate: true,
        user: { select: { firstName: true, lastName: true, email: true, role: true } },
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });

    const monthLabel = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      monthLabel,
      // §9.9's field list, in the order the spec gives it.
      rows: rows.map((r) => ({
        id: r.id,
        name: this.name(r.user),
        role: r.user.role,
        category: r.category,
        type: r.leaveType,
        from: r.startDate,
        to: r.endDate,
        totalDays: r.totalDays,
        // A window that spilled in from last month is shown as the days that
        // actually fall in THIS month, or the register would not add up.
        daysInMonth: this.daysWithin(r.startDate, r.endDate, start, end),
        paid: r.isPaid,
        deduction: Number(r.deductionAmount ?? 0),
        approvalStatus: 'APPROVED',
        approvedBy: r.approvedByName,
        approvedAt: r.approvedAt,
        reason: r.reason,
        remarks: r.remarks,
        hasDocument: !!r.documentUrl,
        datesModified: !!r.originalStartDate,
      })),
      totals: {
        requests: rows.length,
        days: rows.reduce((a, r) => a + this.daysWithin(r.startDate, r.endDate, start, end), 0),
        paidDays: rows.filter((r) => r.isPaid === true).reduce((a, r) => a + this.daysWithin(r.startDate, r.endDate, start, end), 0),
        unpaidDays: rows.filter((r) => r.isPaid === false).reduce((a, r) => a + this.daysWithin(r.startDate, r.endDate, start, end), 0),
        deduction: round2(rows.reduce((a, r) => a + Number(r.deductionAmount ?? 0), 0)),
      },
    };
  }

  /** Calendar days of [start,end] that fall inside [wStart,wEnd], inclusive. */
  private daysWithin(start: Date, end: Date, wStart: Date, wEnd: Date): number {
    const from = startOfUtcDay(start > wStart ? start : wStart);
    const to = startOfUtcDay(end < wEnd ? end : wEnd);
    if (to < from) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  }
}
