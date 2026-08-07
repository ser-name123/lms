import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveCategory, LeaveRequestStatus, Role } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type {
  ApproveLeaveDto, CancelLeaveDto, CreateLeaveDto, EditOwnLeaveDto, ListLeavesDto,
  RejectLeaveDto, RequestInfoDto, RespondInfoDto, SaveLeaveConfigDto, UpdateLeaveDto,
} from './dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DEFAULT_LEAVE_CONFIG, LEAVE_CONFIG_KEY, LeaveConfig, endOfUtcDay, paidByDefault,
  startOfUtcDay, totalLeaveDays, unpaidDeduction, windowsOverlap,
} from './leave.config';

/** "12 Mar" — leave windows read better than raw ISO in a notification body. */
const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const window = (a: Date, b: Date) => `${shortDate(a)} – ${shortDate(b)}`;

export interface Actor {
  id: string;
  role: string;
}

/** Everyone the spec routes leave traffic to. */
const STAFF_ROLES: string[] = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH];
/** §9.1 "Applicable Staff" — who may raise a request at all. */
const APPLICABLE_ROLES: string[] = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER];

/*
 * Salary states a leave deduction may still be attached to — or taken back off.
 * APPROVED is deliberately excluded: it is money signed off and queued for
 * payment, and changing it behind the approver is not a leave decision's place.
 * PROCESSING/PAID/FAILED are settled or in flight for the same reason.
 */
const OPEN_SALARY_STATUSES = ['CALCULATED', 'UNDER_REVIEW', 'ADJUSTMENT_APPLIED'] as const;

const LEAVE_SELECT = {
  id: true,
  userId: true,
  category: true,
  leaveType: true,
  startDate: true,
  endDate: true,
  totalDays: true,
  reason: true,
  remarks: true,
  documentUrl: true,
  documentName: true,
  status: true,
  adminNotes: true,
  isPaid: true,
  deductionAmount: true,
  deductionAppliedAt: true,
  salaryAdjustmentId: true,
  approvedById: true,
  approvedByName: true,
  approvedAt: true,
  rejectionReason: true,
  infoRequest: true,
  infoRequestedAt: true,
  infoResponse: true,
  cancelledAt: true,
  originalStartDate: true,
  originalEndDate: true,
  availabilityBlockedAt: true,
  returnedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  },
} satisfies Prisma.LeaveRequestSelect;

/*
 * Module 9 — Employee Leave & Teacher Unavailability.
 *
 * This service owns the REQUEST and its decision (§9.1–§9.3, §9.9). What an
 * approved teacher unavailability does to student classes (§9.4–§9.7) lives in
 * LeaveImpactService, which this one calls on approval — the two halves have
 * different owners in the spec (admin decides the leave, the coach decides the
 * classes) and keeping them apart keeps that visible.
 */
@Injectable()
export class LeavesService {
  private readonly logger = new Logger(LeavesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Set once at bootstrap by LeaveImpactService.
   *
   * A plain setter rather than constructor injection because the two services
   * call each other — approval creates impacts, and the return sweep closes the
   * leave. This codebase has zero `forwardRef` anywhere and this keeps it that
   * way.
   */
  private impacts?: {
    buildForLeave(leaveId: string, actor: Actor | null): Promise<number>;
    openImpactsForLeave(leaveId: string): Promise<number>;
    revertForLeave(leaveId: string, actor: Actor | null): Promise<void>;
  };
  registerImpactService(svc: NonNullable<LeavesService['impacts']>) {
    this.impacts = svc;
  }

  // ══ §9.11 configuration ═════════════════════════════════════════════════════

  async config(): Promise<LeaveConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: LEAVE_CONFIG_KEY } });
    if (!row) return { ...DEFAULT_LEAVE_CONFIG };
    try {
      const parsed = JSON.parse(row.value) as Partial<LeaveConfig>;
      return { ...DEFAULT_LEAVE_CONFIG, ...parsed };
    } catch {
      // A corrupt blob must not take leave management down with it.
      this.logger.warn('LEAVE_CONFIG is not valid JSON; using defaults.');
      return { ...DEFAULT_LEAVE_CONFIG };
    }
  }

  async saveConfig(dto: SaveLeaveConfigDto): Promise<LeaveConfig> {
    const next = { ...(await this.config()), ...dto };
    await this.prisma.systemSetting.upsert({
      where: { key: LEAVE_CONFIG_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: LEAVE_CONFIG_KEY, value: JSON.stringify(next) },
    });
    return next;
  }

  // ══ §9.1 requests ═══════════════════════════════════════════════════════════

  /**
   * Raise a leave or unavailability request.
   *
   * `dto.userId` is honoured only for an admin filing on someone's behalf.
   * Anyone else gets their own id whatever they posted — otherwise a teacher
   * could book leave in a colleague's name.
   */
  async create(dto: CreateLeaveDto, actor: Actor) {
    const onBehalf = dto.userId && dto.userId !== actor.id;
    if (onBehalf && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an admin may file a leave request for someone else.');
    }
    const userId = onBehalf ? dto.userId! : actor.id;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, firstName: true, lastName: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException('That staff member does not exist.');
    if (!APPLICABLE_ROLES.includes(user.role)) {
      throw new BadRequestException('Leave is for academy staff — this account cannot request it.');
    }

    const cfg = await this.config();
    const start = startOfUtcDay(new Date(dto.startDate));
    const end = startOfUtcDay(new Date(dto.endDate));
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('Those dates are not valid.');
    }
    if (end < start) throw new BadRequestException('The end date cannot be before the start date.');

    const totalDays = totalLeaveDays(start, end, cfg.nonWorkingWeekdays);
    if (totalDays <= 0) {
      throw new BadRequestException('That window contains no working days.');
    }
    if (cfg.maxConsecutiveDays > 0 && totalDays > cfg.maxConsecutiveDays) {
      throw new BadRequestException(
        `A single request may not exceed ${cfg.maxConsecutiveDays} day(s). Split it or ask an admin.`,
      );
    }

    /*
     * A person cannot be away twice over the same day. Checked against live
     * requests only — a rejected or cancelled one is history and must not block
     * a fresh attempt at the same dates.
     */
    await this.assertNoOverlap(userId, start, end, cfg, null);

    // A teacher's absence is unavailability; anyone else's is staff leave. The
    // client may say so explicitly, but it does not get to mislabel a teacher.
    const category =
      user.role === Role.TEACHER
        ? LeaveCategory.TEACHER_UNAVAILABILITY
        : (dto.category ?? LeaveCategory.STAFF_LEAVE);

    const created = await this.prisma.leaveRequest.create({
      data: {
        userId,
        category,
        leaveType: dto.leaveType,
        startDate: start,
        endDate: end,
        totalDays,
        reason: dto.reason.trim(),
        remarks: dto.remarks?.trim() || null,
        documentUrl: dto.documentUrl || null,
        documentName: dto.documentName || null,
      },
      select: LEAVE_SELECT,
    });

    await this.audit(created.id, actor, 'SUBMITTED',
      `${created.leaveType} ${window(start, end)} (${totalDays} day(s))`,
      { category, totalDays, onBehalf: !!onBehalf });

    await this.notifySubmitted(created).catch(() => undefined);
    return created;
  }

  /** A staff member correcting their own request before anyone has acted on it. */
  async editOwn(id: string, dto: EditOwnLeaveDto, actor: Actor) {
    const existing = await this.mustFind(id);
    if (existing.userId !== actor.id) throw new ForbiddenException('That is not your request.');
    if (existing.status !== LeaveRequestStatus.PENDING && existing.status !== LeaveRequestStatus.INFO_REQUESTED) {
      throw new BadRequestException('Only a pending request can be edited.');
    }

    const cfg = await this.config();
    const start = dto.startDate ? startOfUtcDay(new Date(dto.startDate)) : existing.startDate;
    const end = dto.endDate ? startOfUtcDay(new Date(dto.endDate)) : existing.endDate;
    if (end < start) throw new BadRequestException('The end date cannot be before the start date.');

    const totalDays = totalLeaveDays(start, end, cfg.nonWorkingWeekdays);
    if (totalDays <= 0) throw new BadRequestException('That window contains no working days.');
    await this.assertNoOverlap(existing.userId, start, end, cfg, id);

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        ...(dto.leaveType ? { leaveType: dto.leaveType } : {}),
        startDate: start,
        endDate: end,
        totalDays,
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
        ...(dto.documentUrl !== undefined ? { documentUrl: dto.documentUrl || null } : {}),
        ...(dto.documentName !== undefined ? { documentName: dto.documentName || null } : {}),
      },
      select: LEAVE_SELECT,
    });
    await this.audit(id, actor, 'EDITED', `Updated to ${window(start, end)} (${totalDays} day(s))`, { totalDays });
    return updated;
  }

  /**
   * §9.2 "Cancelled".
   *
   * The requester may withdraw while it is still pending; an admin may cancel
   * an already-approved leave, which has to undo everything the approval did.
   */
  async cancel(id: string, dto: CancelLeaveDto, actor: Actor) {
    const existing = await this.mustFind(id);
    const isOwner = existing.userId === actor.id;
    const isAdmin = actor.role === Role.ADMIN || actor.role === Role.SUPERVISOR;
    if (!isOwner && !isAdmin) throw new ForbiddenException('That is not your request.');

    if (existing.status === LeaveRequestStatus.CANCELLED) return this.findOne(id);
    if (existing.status === LeaveRequestStatus.DECLINED) {
      throw new BadRequestException('A rejected request cannot be cancelled.');
    }
    if (existing.status === LeaveRequestStatus.APPROVED && !isAdmin) {
      throw new BadRequestException('An approved leave can only be cancelled by an admin.');
    }
    const cfg = await this.config();
    if (isOwner && !isAdmin && !cfg.allowSelfCancel) {
      throw new BadRequestException('Withdrawing your own request is switched off — ask an admin.');
    }

    /*
     * Cancelling an approved leave must put the world back: the teacher becomes
     * available again, paused subscriptions resume, stand-in teachers step back.
     * Leaving those in place would keep a teacher blocked for a leave that no
     * longer exists.
     */
    if (existing.status === LeaveRequestStatus.APPROVED) {
      await this.impacts?.revertForLeave(id, actor).catch(() => undefined);
      await this.restoreAvailability(id).catch(() => undefined);
      await this.reverseDeduction(id, actor).catch(() => undefined);
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveRequestStatus.CANCELLED, cancelledAt: new Date() },
      select: LEAVE_SELECT,
    });
    await this.audit(id, actor, 'CANCELLED', dto.reason?.trim() || 'Request cancelled', {});
    await this.notifications
      .createFor(existing.userId, {
        type: 'LEAVE_DECISION',
        title: 'Leave cancelled',
        body: `Your ${existing.leaveType.toLowerCase()} leave for ${window(existing.startDate, existing.endDate)} was cancelled.`,
        link: this.linkFor(existing.user.role),
      })
      .catch(() => undefined);
    return updated;
  }

  // ══ §9.2 approval workflow ══════════════════════════════════════════════════

  /**
   * Approve, optionally over a modified window, marking the leave paid or unpaid.
   *
   * For a teacher this is the moment the world changes: availability is blocked
   * (§9.6) and the affected students become the coach's queue (§9.4/§9.5).
   */
  async approve(id: string, dto: ApproveLeaveDto, actor: Actor) {
    const existing = await this.mustFind(id);
    if (existing.status === LeaveRequestStatus.APPROVED) {
      throw new BadRequestException('That request is already approved.');
    }
    if (existing.status === LeaveRequestStatus.CANCELLED) {
      throw new BadRequestException('A cancelled request cannot be approved.');
    }

    const cfg = await this.config();
    const modified = !!(dto.startDate || dto.endDate);
    const start = dto.startDate ? startOfUtcDay(new Date(dto.startDate)) : existing.startDate;
    const end = dto.endDate ? startOfUtcDay(new Date(dto.endDate)) : existing.endDate;
    if (end < start) throw new BadRequestException('The end date cannot be before the start date.');

    const totalDays = totalLeaveDays(start, end, cfg.nonWorkingWeekdays);
    if (totalDays <= 0) throw new BadRequestException('That window contains no working days.');
    if (modified) await this.assertNoOverlap(existing.userId, start, end, cfg, id);

    const deduction = dto.isPaid
      ? 0
      : dto.deductionAmount !== undefined
        ? Number(dto.deductionAmount)
        : await this.computeDeduction(existing.userId, totalDays, cfg);

    const actorName = await this.nameOf(actor.id);
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.APPROVED,
        startDate: start,
        endDate: end,
        totalDays,
        isPaid: dto.isPaid,
        deductionAmount: dto.isPaid ? null : deduction,
        approvedById: actor.id,
        approvedByName: actorName,
        approvedAt: new Date(),
        rejectionReason: null,
        ...(modified
          ? {
              originalStartDate: existing.originalStartDate ?? existing.startDate,
              originalEndDate: existing.originalEndDate ?? existing.endDate,
            }
          : {}),
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes.trim() || null } : {}),
      },
      select: LEAVE_SELECT,
    });

    if (modified) {
      await this.audit(id, actor, 'DATES_MODIFIED',
        `Approved for ${window(start, end)} instead of ${window(existing.startDate, existing.endDate)}`,
        { from: existing.startDate, to: existing.endDate, newFrom: start, newTo: end });
    }
    await this.audit(id, actor, 'APPROVED',
      `${dto.isPaid ? 'Paid' : 'Unpaid'} — ${totalDays} day(s), ${window(start, end)}`,
      { isPaid: dto.isPaid, totalDays, deduction });

    // §9.3 — the deduction becomes a real payroll line, not a note.
    if (!dto.isPaid && deduction > 0) {
      await this.applyDeduction(updated.id, actor).catch((e) =>
        this.logger.warn(`Leave ${id}: could not queue the salary deduction — ${e?.message ?? e}`),
      );
    }

    // §9.6 — block the teacher's availability for the approved window, then
    // §9.4 — hand the affected students to the coach.
    //
    // Note what does NOT happen here: the classes are not cancelled. Before
    // Module 9 approval cancelled every class in the window outright and locked
    // their attendance, so a family lost lessons they had paid for and nobody
    // was consulted. §9.5 makes that the coach's decision, per student.
    if (updated.user.role === Role.TEACHER) {
      await this.blockAvailability(updated.id).catch((e) =>
        this.logger.warn(`Leave ${id}: could not block availability — ${e?.message ?? e}`),
      );
      await this.impacts?.buildForLeave(updated.id, actor).catch((e) =>
        this.logger.warn(`Leave ${id}: could not build the impact queue — ${e?.message ?? e}`),
      );
    }

    await this.notifyDecision(updated, 'APPROVED').catch(() => undefined);
    return updated;
  }

  async reject(id: string, dto: RejectLeaveDto, actor: Actor) {
    const existing = await this.mustFind(id);
    if (existing.status === LeaveRequestStatus.APPROVED) {
      throw new BadRequestException('Cancel the approved leave instead of rejecting it.');
    }
    if (!dto.reason?.trim()) throw new BadRequestException('Give a reason for the rejection.');

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.DECLINED,
        rejectionReason: dto.reason.trim(),
        approvedById: actor.id,
        approvedByName: await this.nameOf(actor.id),
        approvedAt: new Date(),
      },
      select: LEAVE_SELECT,
    });
    await this.audit(id, actor, 'REJECTED', dto.reason.trim(), {});
    await this.notifyDecision(updated, 'REJECTED').catch(() => undefined);
    return updated;
  }

  /** §9.2 "Request Additional Information" — back to the requester, not a decision. */
  async requestInfo(id: string, dto: RequestInfoDto, actor: Actor) {
    const existing = await this.mustFind(id);
    if (existing.status === LeaveRequestStatus.APPROVED || existing.status === LeaveRequestStatus.DECLINED) {
      throw new BadRequestException('That request has already been decided.');
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.INFO_REQUESTED,
        infoRequest: dto.question.trim(),
        infoRequestedAt: new Date(),
        infoResponse: null,
      },
      select: LEAVE_SELECT,
    });
    await this.audit(id, actor, 'INFO_REQUESTED', dto.question.trim(), {});
    await this.notifications
      .createFor(existing.userId, {
        type: 'LEAVE_INFO_REQUESTED',
        title: 'More information needed',
        body: `About your leave for ${window(existing.startDate, existing.endDate)}: ${dto.question.trim()}`,
        link: this.linkFor(existing.user.role),
      })
      .catch(() => undefined);
    return updated;
  }

  async respondInfo(id: string, dto: RespondInfoDto, actor: Actor) {
    const existing = await this.mustFind(id);
    if (existing.userId !== actor.id) throw new ForbiddenException('That is not your request.');
    if (existing.status !== LeaveRequestStatus.INFO_REQUESTED) {
      throw new BadRequestException('Nothing has been asked about this request.');
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      // Back into the queue: the question is answered, so it is pending again.
      data: { status: LeaveRequestStatus.PENDING, infoResponse: dto.response.trim() },
      select: LEAVE_SELECT,
    });
    await this.audit(id, actor, 'INFO_PROVIDED', dto.response.trim(), {});
    await this.notifications
      .createForRoles([Role.ADMIN], {
        type: 'LEAVE_REQUESTED',
        title: 'Leave question answered',
        body: `${this.displayName(existing.user)} answered your question about ${window(existing.startDate, existing.endDate)}.`,
        link: '/leaves',
      })
      .catch(() => undefined);
    return updated;
  }

  /**
   * The pre-Module-9 admin screen PATCHes a raw status. Kept working, but routed
   * through the real workflow so a leave approved from the old screen still
   * blocks availability, builds the coach's queue and deducts pay.
   */
  async update(id: string, dto: UpdateLeaveDto, actor: Actor) {
    if (dto.status === LeaveRequestStatus.APPROVED) {
      const existing = await this.mustFind(id);
      const cfg = await this.config();
      return this.approve(
        id,
        { isPaid: dto.isPaid ?? paidByDefault(existing.leaveType, cfg), adminNotes: dto.adminNotes },
        actor,
      );
    }
    if (dto.status === LeaveRequestStatus.DECLINED) {
      return this.reject(id, { reason: dto.adminNotes?.trim() || 'Declined.' }, actor);
    }
    if (dto.status === LeaveRequestStatus.CANCELLED) {
      return this.cancel(id, { reason: dto.adminNotes }, actor);
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes } : {}),
      },
      select: LEAVE_SELECT,
    });
    await this.audit(id, actor, 'EDITED', 'Updated by an administrator', { status: dto.status });
    return updated;
  }

  // ══ §9.3 payroll ════════════════════════════════════════════════════════════

  /** What this person's unpaid day is worth, from their salary or hourly rate. */
  private async computeDeduction(userId: string, days: number, cfg: LeaveConfig): Promise<number> {
    if (cfg.deductionMode === 'FIXED') return unpaidDeduction(days, cfg, null, null);

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true, hourlyRate: true },
    });
    if (!teacher) return 0;

    /*
     * A teacher's pay is per class, not per month, so "a day's pay" is derived
     * from what they actually earned recently rather than from a salary figure
     * that does not exist. The last settled salary is the honest source.
     */
    const lastSalary = await this.prisma.teacherSalary.findFirst({
      where: { teacherId: teacher.id, status: { in: ['APPROVED', 'PAID', 'PROCESSING'] } },
      orderBy: { periodStart: 'desc' },
      select: { grossAmount: true },
    });
    const monthly = lastSalary ? Number(lastSalary.grossAmount) : null;
    return unpaidDeduction(days, cfg, monthly, null);
  }

  /**
   * Turn an approved unpaid leave into a salary deduction.
   *
   * Attaches to the CALCULATED salary covering the leave if one exists; if
   * payroll has not run yet, the deduction is left on the leave and picked up
   * when the salary is calculated (see SalaryService). Either way it is applied
   * exactly once — `deductionAppliedAt` is the guard.
   */
  private async applyDeduction(leaveId: string, actor: Actor | null) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: {
        id: true, userId: true, startDate: true, endDate: true, totalDays: true,
        isPaid: true, deductionAmount: true, deductionAppliedAt: true, leaveType: true,
      },
    });
    if (!leave || leave.isPaid !== false || leave.deductionAppliedAt) return;
    const amount = Number(leave.deductionAmount ?? 0);
    if (!(amount > 0)) return;

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: leave.userId },
      select: { id: true },
    });
    if (!teacher) return;

    const salary = await this.prisma.teacherSalary.findFirst({
      where: {
        teacherId: teacher.id,
        periodStart: { lte: leave.endDate },
        periodEnd: { gte: leave.startDate },
        status: { in: [...OPEN_SALARY_STATUSES] },
      },
      orderBy: { periodStart: 'desc' },
      select: { id: true },
    });
    if (!salary) return; // Picked up when payroll next runs for this period.

    const adjustment = await this.prisma.salaryAdjustment.create({
      data: {
        salaryId: salary.id,
        type: 'DEDUCTION',
        amount,
        reason: `Unpaid leave — ${leave.totalDays} day(s), ${window(leave.startDate, leave.endDate)}`,
        createdById: actor?.id ?? null,
        createdByName: actor ? await this.nameOf(actor.id) : 'System',
      },
    });
    await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { salaryAdjustmentId: adjustment.id, deductionAppliedAt: new Date() },
    });
    await this.audit(leaveId, actor, 'DEDUCTION_APPLIED', `${amount} deducted from salary`, {
      salaryId: salary.id,
      adjustmentId: adjustment.id,
    });
  }

  /**
   * Called by SalaryService when a salary is (re)calculated: pull in any
   * approved unpaid leave for the period that has not been charged yet.
   */
  async applyPendingDeductions(teacherUserId: string, periodStart: Date, periodEnd: Date) {
    const pending = await this.prisma.leaveRequest.findMany({
      where: {
        userId: teacherUserId,
        status: LeaveRequestStatus.APPROVED,
        isPaid: false,
        deductionAppliedAt: null,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      select: { id: true },
    });
    for (const p of pending) await this.applyDeduction(p.id, null).catch(() => undefined);
    return { applied: pending.length };
  }

  /** Undo the payroll line when an approved leave is cancelled. */
  private async reverseDeduction(leaveId: string, actor: Actor) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: { salaryAdjustmentId: true },
    });
    if (!leave?.salaryAdjustmentId) return;
    // Only while the salary is still open; a paid salary is settled money.
    const adj = await this.prisma.salaryAdjustment.findUnique({
      where: { id: leave.salaryAdjustmentId },
      select: { id: true, salaryId: true },
    });
    if (adj) {
      const salary = await this.prisma.teacherSalary.findUnique({
        where: { id: adj.salaryId },
        select: { status: true },
      });
      if (salary && (OPEN_SALARY_STATUSES as readonly string[]).includes(salary.status)) {
        await this.prisma.salaryAdjustment.delete({ where: { id: adj.id } }).catch(() => undefined);
      }
    }
    await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { salaryAdjustmentId: null, deductionAppliedAt: null },
    });
    await this.audit(leaveId, actor, 'DEDUCTION_APPLIED', 'Deduction reversed — leave cancelled', {});
  }

  // ══ §9.6 / §9.7 availability ════════════════════════════════════════════════

  /**
   * §9.6 — take the approved window out of the teacher's availability.
   *
   * The weekly availability is a recurring pattern with no dates in it, so it
   * cannot express "except next Tuesday". What is stored is a SNAPSHOT plus a
   * flag; every consumer already asks `teacherOnLeave()` for the dated part, and
   * §9.7 restores the snapshot verbatim. Blanking the pattern instead would lose
   * the teacher's real working hours the moment they took a day off.
   */
  private async blockAvailability(leaveId: string) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: { id: true, userId: true, availabilityBlockedAt: true },
    });
    if (!leave || leave.availabilityBlockedAt) return;

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: leave.userId },
      select: { id: true, availability: true },
    });
    await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        availabilityBlockedAt: new Date(),
        availabilitySnapshot: (profile?.availability ?? null) as never,
      },
    });
    await this.audit(leaveId, null, 'AVAILABILITY_BLOCKED',
      'Teacher marked unavailable for the approved window', { teacherId: profile?.id });
  }

  /** §9.7 — put the weekly pattern back exactly as it was. */
  async restoreAvailability(leaveId: string) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: { id: true, userId: true, availabilityBlockedAt: true, availabilitySnapshot: true, returnedAt: true },
    });
    if (!leave?.availabilityBlockedAt) return;

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: leave.userId },
      select: { id: true, availability: true },
    });
    if (profile && leave.availabilitySnapshot !== null && leave.availabilitySnapshot !== undefined) {
      await this.prisma.teacherProfile.update({
        where: { id: profile.id },
        data: { availability: leave.availabilitySnapshot as never },
      });
    }
    await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { availabilityBlockedAt: null, returnedAt: leave.returnedAt ?? new Date() },
    });
    await this.audit(leaveId, null, 'AVAILABILITY_RESTORED', 'Teacher available again', {});
  }

  /**
   * Is this person away across the given instant range?
   *
   * The single answer to "on leave?" for the whole codebase. The end date is
   * expanded to end-of-day because a leave stored at 00:00 still covers its own
   * last day — a plain instant compare would let a class be booked that evening.
   */
  async isAway(userId: string, from: Date, to: Date): Promise<boolean> {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        status: LeaveRequestStatus.APPROVED,
        endDate: { gte: new Date(from.getTime() - 86_400_000) },
        startDate: { lte: to },
      },
      select: { startDate: true, endDate: true },
    });
    return rows.some((r) => r.startDate < to && endOfUtcDay(r.endDate) > from);
  }

  /** Teacher-profile ids that are away at any point in the window (for pickers). */
  async unavailableTeacherIds(from: Date, to: Date): Promise<Set<string>> {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveRequestStatus.APPROVED,
        category: LeaveCategory.TEACHER_UNAVAILABILITY,
        endDate: { gte: new Date(from.getTime() - 86_400_000) },
        startDate: { lte: to },
      },
      select: { userId: true, startDate: true, endDate: true },
    });
    const overlapping = rows.filter((r) => r.startDate < to && endOfUtcDay(r.endDate) > from);
    if (!overlapping.length) return new Set();
    const profiles = await this.prisma.teacherProfile.findMany({
      where: { userId: { in: overlapping.map((r) => r.userId) } },
      select: { id: true },
    });
    return new Set(profiles.map((p) => p.id));
  }

  // ══ §9.9 history + reads ════════════════════════════════════════════════════

  async list(dto: ListLeavesDto, actor?: Actor) {
    const { page, limit } = dto;
    const where: Prisma.LeaveRequestWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.category ? { category: dto.category } : {}),
      ...(dto.leaveType ? { leaveType: dto.leaveType } : {}),
      ...(dto.userId ? { userId: dto.userId } : {}),
      ...(dto.paid === 'true' ? { isPaid: true } : dto.paid === 'false' ? { isPaid: false } : {}),
      ...(dto.from || dto.to
        ? {
            startDate: { ...(dto.to ? { lte: new Date(dto.to) } : {}) },
            endDate: { ...(dto.from ? { gte: new Date(dto.from) } : {}) },
          }
        : {}),
      ...(dto.role || dto.search
        ? {
            user: {
              ...(dto.role ? { role: dto.role as never } : {}),
              ...(dto.search
                ? {
                    OR: [
                      { firstName: { contains: dto.search, mode: 'insensitive' as const } },
                      { lastName: { contains: dto.search, mode: 'insensitive' as const } },
                      { email: { contains: dto.search, mode: 'insensitive' as const } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };

    // A non-admin viewer only ever sees their own history, enforced in SQL so
    // they cannot page past it.
    if (actor && !STAFF_ROLES.includes(actor.role)) where.userId = actor.id;

    let orderBy: Prisma.LeaveRequestOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];
    if (dto.sortBy === 'date_asc') orderBy = [{ startDate: 'asc' }, { id: 'asc' }];
    else if (dto.sortBy === 'date_desc') orderBy = [{ startDate: 'desc' }, { id: 'desc' }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where, select: LEAVE_SELECT, orderBy, skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      items: items.map((i) => this.shape(i)),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** The caller's own requests — the "My Leave" screen on every portal. */
  async mine(actor: Actor) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: { userId: actor.id },
      select: LEAVE_SELECT,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const now = new Date();
    const shaped = rows.map((r) => this.shape(r));
    return {
      items: shaped,
      pending: shaped.filter((r) => r.status === 'PENDING' || r.status === 'INFO_REQUESTED').length,
      approvedDays: shaped
        .filter((r) => r.status === 'APPROVED')
        .reduce((a, r) => a + (r.totalDays ?? 0), 0),
      unpaidDays: shaped
        .filter((r) => r.status === 'APPROVED' && r.isPaid === false)
        .reduce((a, r) => a + (r.totalDays ?? 0), 0),
      currentlyAway: shaped.some(
        (r) => r.status === 'APPROVED' &&
          new Date(r.startDate) <= now && endOfUtcDay(new Date(r.endDate)) >= now,
      ),
    };
  }

  async findOne(id: string, actor?: Actor) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id }, select: LEAVE_SELECT });
    if (!leave) throw new NotFoundException(`Leave request ${id} not found`);
    if (actor && !STAFF_ROLES.includes(actor.role) && leave.userId !== actor.id) {
      // 404, not 403 — a stranger should not learn the request exists.
      throw new NotFoundException(`Leave request ${id} not found`);
    }
    return this.shape(leave);
  }

  async auditTrail(id: string) {
    await this.mustFind(id);
    return this.prisma.leaveAuditLog.findMany({
      where: { leaveId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getStats() {
    const [total, approved, declined, pending, infoRequested, cancelled, unavailability, unpaid] =
      await Promise.all([
        this.prisma.leaveRequest.count(),
        this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.APPROVED } }),
        this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.DECLINED } }),
        this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.PENDING } }),
        this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.INFO_REQUESTED } }),
        this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.CANCELLED } }),
        this.prisma.leaveRequest.count({
          where: { category: LeaveCategory.TEACHER_UNAVAILABILITY, status: LeaveRequestStatus.APPROVED },
        }),
        this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.APPROVED, isPaid: false } }),
      ]);
    return { total, approved, declined, pending, infoRequested, cancelled, unavailability, unpaid };
  }

  async remove(id: string) {
    await this.mustFind(id);
    await this.prisma.leaveRequest.delete({ where: { id } });
  }

  /**
   * Demo data for an empty academy.
   *
   * It used to open with `deleteMany({})`. That was survivable when a leave row
   * was just a note; under Module 9 an approved leave blocks a teacher's
   * availability, holds a paused subscription and carries a payroll deduction,
   * so wiping the table would strand all three with nothing left pointing at
   * them. It now refuses rather than seeding over real records.
   */
  async seed() {
    const real = await this.prisma.leaveRequest.count({
      where: {
        OR: [
          { status: LeaveRequestStatus.APPROVED },
          { deductionAppliedAt: { not: null } },
          { impacts: { some: {} } },
        ],
      },
    });
    if (real > 0) {
      throw new BadRequestException(
        `There are ${real} live leave record(s) — approved leave, payroll deductions or affected students depend on them. Seeding would strand those; clear them deliberately first if this really is a demo database.`,
      );
    }
    await this.prisma.leaveRequest.deleteMany({});

    const users = await this.prisma.user.findMany({
      where: { role: { in: [Role.TEACHER, Role.SUPERVISOR, Role.ACADEMIC_COACH] }, status: 'ACTIVE' },
      take: 8,
      select: { id: true, role: true },
    });
    if (!users.length) {
      throw new BadRequestException('No staff to attach sample leave to. Seed users first.');
    }

    const cfg = await this.config();
    const samples = [
      { type: 'SICK', reason: 'Recovering from severe flu and fever.', status: LeaveRequestStatus.APPROVED, offset: -5, days: 2, paid: true },
      { type: 'PERSONAL', reason: 'Family wedding in my hometown.', status: LeaveRequestStatus.APPROVED, offset: -2, days: 3, paid: true },
      { type: 'ANNUAL', reason: 'Scheduled annual vacation.', status: LeaveRequestStatus.PENDING, offset: 15, days: 9, paid: null },
      { type: 'UNPAID', reason: 'Personal emergency at home.', status: LeaveRequestStatus.DECLINED, offset: -12, days: 4, paid: null },
      { type: 'MEDICAL', reason: 'Dental surgery.', status: LeaveRequestStatus.APPROVED, offset: -1, days: 1, paid: true },
      { type: 'SCHEDULE_CONFLICT', reason: 'University examination duty.', status: LeaveRequestStatus.PENDING, offset: 3, days: 1, paid: null },
      { type: 'VACATION', reason: 'Travelling out of station.', status: LeaveRequestStatus.APPROVED, offset: -20, days: 5, paid: false },
      { type: 'TRAINING', reason: 'Tajweed certification workshop.', status: LeaveRequestStatus.PENDING, offset: 6, days: 2, paid: null },
      { type: 'EMERGENCY', reason: 'Urgent family matter.', status: LeaveRequestStatus.INFO_REQUESTED, offset: 2, days: 1, paid: null },
      { type: 'RELIGIOUS_HOLIDAY', reason: 'Religious observance.', status: LeaveRequestStatus.APPROVED, offset: -30, days: 2, paid: true },
    ];

    let seeded = 0;
    for (let i = 0; i < samples.length; i++) {
      const user = users[i % users.length];
      const s = samples[i];
      const startDate = startOfUtcDay(new Date(Date.now() + s.offset * 86_400_000));
      const endDate = startOfUtcDay(new Date(startDate.getTime() + (s.days - 1) * 86_400_000));
      // Seeded rows are never APPROVED for a teacher: that would build an impact
      // queue and block availability off fabricated data.
      const status =
        user.role === Role.TEACHER && s.status === LeaveRequestStatus.APPROVED
          ? LeaveRequestStatus.PENDING
          : s.status;
      await this.prisma.leaveRequest.create({
        data: {
          userId: user.id,
          category: user.role === Role.TEACHER ? LeaveCategory.TEACHER_UNAVAILABILITY : LeaveCategory.STAFF_LEAVE,
          leaveType: s.type as never,
          startDate,
          endDate,
          totalDays: totalLeaveDays(startDate, endDate, cfg.nonWorkingWeekdays),
          reason: s.reason,
          status,
          ...(status === LeaveRequestStatus.APPROVED ? { isPaid: s.paid ?? true, approvedByName: 'Seed' , approvedAt: new Date() } : {}),
          ...(status === LeaveRequestStatus.DECLINED ? { rejectionReason: 'Insufficient cover for this period.' } : {}),
          ...(status === LeaveRequestStatus.INFO_REQUESTED
            ? { infoRequest: 'Could you confirm the exact return date?', infoRequestedAt: new Date() }
            : {}),
        },
      });
      seeded += 1;
    }
    return { seededCount: seeded };
  }

  // ══ Internals ═══════════════════════════════════════════════════════════════

  private async mustFind(id: string) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id }, select: LEAVE_SELECT });
    if (!leave) throw new NotFoundException(`Leave request ${id} not found`);
    return leave;
  }

  private async assertNoOverlap(
    userId: string,
    start: Date,
    end: Date,
    _cfg: LeaveConfig,
    excludeId: string | null,
  ) {
    const live = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        // Rejected and cancelled requests are history and must not block a
        // fresh attempt at the same dates.
        status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED, LeaveRequestStatus.INFO_REQUESTED] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });
    const clash = live.find((l) => windowsOverlap(start, end, l.startDate, l.endDate));
    if (clash) {
      throw new BadRequestException(
        `That overlaps an existing ${clash.status.toLowerCase()} request for ${window(clash.startDate, clash.endDate)}.`,
      );
    }
  }

  private shape<T extends { deductionAmount: unknown }>(row: T) {
    return { ...row, deductionAmount: row.deductionAmount === null ? null : Number(row.deductionAmount) };
  }

  private displayName(u: { firstName: string | null; lastName: string | null; email: string }) {
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
  }

  private async nameOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    return u ? this.displayName(u) : 'System';
  }

  /** Where a decision notification should take this role. */
  private linkFor(role: string): string {
    if (role === Role.TEACHER) return '/teacher/leave';
    return '/leaves';
  }

  async audit(leaveId: string, actor: Actor | null, action: string, description: string, meta: unknown) {
    await this.prisma.leaveAuditLog
      .create({
        data: {
          leaveId,
          action,
          description,
          meta: (meta ?? {}) as never,
          actorId: actor?.id ?? null,
          actorName: actor ? await this.nameOf(actor.id) : 'System',
        },
      })
      .catch(() => undefined);
  }

  // ══ §9.8 notifications ══════════════════════════════════════════════════════

  /**
   * §9.8 row 1 — Request Submitted goes to Teacher (the requester), Academic
   * Coach, Supervisor and Admin. The coach is on this row precisely because a
   * teacher's absence becomes their problem (§9.5), so they are told before the
   * approval rather than after it.
   */
  private async notifySubmitted(leave: { id: string; userId: string; leaveType: string; startDate: Date; endDate: Date; totalDays: number; category: string; user: { firstName: string | null; lastName: string | null; email: string; role: string } }) {
    const who = this.displayName(leave.user);
    const isUnavailability = leave.category === LeaveCategory.TEACHER_UNAVAILABILITY;
    const body = `${who} requested ${leave.leaveType.toLowerCase().replace(/_/g, ' ')} ${isUnavailability ? 'unavailability' : 'leave'}, ${window(leave.startDate, leave.endDate)} (${leave.totalDays} day(s)).`;

    await this.notifications
      .createForRoles([Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH], {
        type: 'LEAVE_REQUESTED',
        title: isUnavailability ? 'Teacher unavailability requested' : 'Leave request pending',
        body,
        link: '/leaves',
      })
      .catch(() => undefined);

    // The requester gets their own copy — the matrix ticks Teacher on this row,
    // and a request that vanishes silently is indistinguishable from one lost.
    await this.notifications
      .createFor(leave.userId, {
        type: 'LEAVE_REQUESTED',
        title: 'Request submitted',
        body: `Your request for ${window(leave.startDate, leave.endDate)} is with the admin.`,
        link: this.linkFor(leave.user.role),
      })
      .catch(() => undefined);
  }

  /**
   * §9.8 rows 2–3.
   *
   * Approved goes to all four roles; REJECTED goes to the requester and Admin
   * ONLY — the matrix marks the coach and supervisor ✗, and a rejection is
   * nobody else's business.
   */
  private async notifyDecision(
    leave: { id: string; userId: string; leaveType: string; startDate: Date; endDate: Date; isPaid: boolean | null; rejectionReason: string | null; user: { firstName: string | null; lastName: string | null; email: string; role: string } },
    outcome: 'APPROVED' | 'REJECTED',
  ) {
    const who = this.displayName(leave.user);
    const win = window(leave.startDate, leave.endDate);

    await this.notifications
      .createFor(leave.userId, {
        type: 'LEAVE_DECISION',
        title: outcome === 'APPROVED' ? 'Leave approved' : 'Leave rejected',
        body:
          outcome === 'APPROVED'
            ? `${win} — approved${leave.isPaid === false ? ' as unpaid leave' : ''}.`
            : `${win} — ${leave.rejectionReason ?? 'not approved'}.`,
        link: this.linkFor(leave.user.role),
      })
      .catch(() => undefined);

    if (outcome === 'APPROVED') {
      await this.notifications
        .createForRoles([Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH], {
          type: 'LEAVE_DECISION',
          title: 'Leave approved',
          body: `${who} is away ${win}.`,
          link: '/leaves',
        })
        .catch(() => undefined);
    } else {
      await this.notifications
        .createForRoles([Role.ADMIN], {
          type: 'LEAVE_DECISION',
          title: 'Leave rejected',
          body: `${who}'s request for ${win} was rejected.`,
          link: '/leaves',
        })
        .catch(() => undefined);
    }
  }
}
