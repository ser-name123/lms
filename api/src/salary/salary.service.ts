import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../generated/prisma/enums';
import { round2 } from '../finance/finance.config';
import { WiseService, type WiseTransferResult } from './wise.service';
import { LeavesService } from '../leaves/leaves.service';

export interface Actor {
  id: string;
  name?: string;
  role: Role | string;
}

/*
 * Teacher Salary Management (Module 6B). Consolidates the per-class earnings
 * ledger into one monthly TeacherSalary per teacher, supports itemised
 * adjustments (each with a reason — the audit trail), and an approval workflow:
 *   CALCULATED → UNDER_REVIEW → ADJUSTMENT_APPLIED → APPROVED → (PAID | FAILED)
 * Payment (Wise) is handled by WiseService in this module.
 */
@Injectable()
export class SalaryService {
  private readonly logger = new Logger(SalaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly wise: WiseService,
    // Module 9 §9.3: unpaid leave becomes a deduction line during calculation.
    private readonly leaves: LeavesService,
  ) {}

  private monthLabel(d: Date): string {
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  /*
   * Calculate (or recalculate) salaries for a period. One TeacherSalary per
   * teacher who earned in the window; every earning in the window is linked to
   * it. Re-runnable — a PAID salary is left untouched so a settled month cannot
   * be silently rewritten.
   */
  async calculate(periodStartIso: string, periodEndIso: string) {
    const periodStart = new Date(periodStartIso);
    const periodEnd = new Date(periodEndIso);
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      throw new BadRequestException('Invalid period.');
    }
    const windowEnd = new Date(periodEnd);
    windowEnd.setUTCHours(23, 59, 59, 999);
    const label = this.monthLabel(periodStart);

    const earnings = await this.prisma.teacherEarning.findMany({
      where: { earnedAt: { gte: periodStart, lte: windowEnd } },
      select: { id: true, teacherId: true, classType: true, amount: true, paid: true, currency: true, salaryId: true },
    });
    const byTeacher = new Map<string, typeof earnings>();
    for (const e of earnings) {
      if (!byTeacher.has(e.teacherId)) byTeacher.set(e.teacherId, []);
      byTeacher.get(e.teacherId)!.push(e);
    }

    const results: string[] = [];
    const skipped: string[] = [];
    for (const [teacherId, rows] of byTeacher) {
      // A salary already paid or mid-payment for this exact period is immutable.
      const existing = await this.prisma.teacherSalary.findUnique({
        where: { teacherId_periodStart: { teacherId, periodStart } },
        select: { id: true, status: true },
      });
      if (existing?.status === 'PAID' || existing?.status === 'PROCESSING') {
        skipped.push(teacherId);
        continue;
      }

      /*
       * Every earning in the window lands in exactly one bucket.
       *
       * The default arm used to be missing: anything that was not REGULAR,
       * TRIAL or TRIAL_ENROLL_BONUS was silently dropped from `gross` and yet
       * still stamped with this salary's id below — the teacher was told it was
       * settled and never actually paid for it. A future `classType` must
       * therefore land somewhere, and `bonus` is the honest home for it.
       *
       * TRIAL_ENROLL_BONUS moves to `bonus` as well, which is what the column
       * was always for; it used to be folded into `trial`, leaving
       * `bonusEarnings` permanently zero and the two figures both wrong.
       */
      let regular = 0, trial = 0, bonus = 0, classes = 0;
      let currency = 'USD';
      for (const r of rows) {
        const amt = Number(r.amount);
        currency = r.currency || currency;
        switch (r.classType) {
          case 'REGULAR':
            regular += amt;
            if (r.paid) classes += 1;
            break;
          case 'TRIAL':
            trial += amt;
            break;
          default:
            bonus += amt;
            break;
        }
      }
      const gross = round2(regular + trial + bonus);

      // Existing adjustments (kept across recalculation).
      const salaryId = existing?.id;
      const adjTotal = salaryId ? await this.adjustmentsTotal(salaryId) : 0;
      const net = round2(gross + adjTotal);

      /*
       * Recalculating an APPROVED salary sends it back for approval.
       *
       * Only PAID used to be protected, so a recalculation could rewrite the
       * gross and net of an already-approved row while leaving `status`,
       * `approvedByName` and `approvedAt` untouched — and `pay()` would then
       * disburse a figure nobody had signed off. Whoever approved it approved a
       * NUMBER, not a row, so when the number moves the approval has to go.
       */
      const approvalReset =
        existing?.status === 'APPROVED'
          ? { status: 'CALCULATED' as const, approvedById: null, approvedByName: null, approvedAt: null }
          : {};

      const saved = await this.prisma.teacherSalary.upsert({
        where: { teacherId_periodStart: { teacherId, periodStart } },
        update: {
          periodEnd,
          monthLabel: label,
          totalClasses: classes,
          trialEarnings: round2(trial),
          regularEarnings: round2(regular),
          bonusEarnings: round2(bonus),
          grossAmount: gross,
          adjustmentsTotal: round2(adjTotal),
          netAmount: net,
          currency,
          ...approvalReset,
        },
        create: {
          teacherId,
          periodStart,
          periodEnd,
          monthLabel: label,
          totalClasses: classes,
          trialEarnings: round2(trial),
          regularEarnings: round2(regular),
          bonusEarnings: round2(bonus),
          grossAmount: gross,
          adjustmentsTotal: round2(adjTotal),
          netAmount: net,
          currency,
        },
      });
      if (existing?.status === 'APPROVED') {
        this.logger.warn(
          `Salary ${saved.id} was recalculated while APPROVED — approval cleared, it needs signing off again.`,
        );
      }
      // Link every earning in the window to this salary.
      await this.prisma.teacherEarning.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { salaryId: saved.id },
      });

      /*
       * Module 9 §9.3 — unpaid leave is deducted here.
       *
       * It has to run AFTER the upsert, because the deduction attaches to a
       * salary row that may not have existed a moment ago: a leave approved
       * before payroll ran for its month has nothing to attach to at approval
       * time and waits for exactly this call. The totals are then recomputed,
       * since `adjTotal` above was read before the new line existed.
       */
      const teacherUser = await this.prisma.teacherProfile.findUnique({
        where: { id: teacherId },
        select: { userId: true },
      });
      if (teacherUser?.userId) {
        const { applied } = await this.leaves
          .applyPendingDeductions(teacherUser.userId, periodStart, windowEnd)
          .catch(() => ({ applied: 0 }));
        if (applied > 0) {
          const withLeave = await this.adjustmentsTotal(saved.id);
          await this.prisma.teacherSalary.update({
            where: { id: saved.id },
            data: { adjustmentsTotal: round2(withLeave), netAmount: round2(gross + withLeave) },
          });
          this.logger.log(`Salary ${saved.id}: applied ${applied} unpaid-leave deduction(s).`);
        }
      }
      results.push(saved.id);
    }
    return { period: label, salariesCalculated: results.length, skippedSettled: skipped.length };
  }

  private async adjustmentsTotal(salaryId: string): Promise<number> {
    const adjustments = await this.prisma.salaryAdjustment.findMany({ where: { salaryId }, select: { type: true, amount: true } });
    let total = 0;
    for (const a of adjustments) total += (a.type === 'DEDUCTION' ? -1 : 1) * Number(a.amount);
    return round2(total);
  }

  async list(periodStartIso?: string) {
    const where: any = {};
    if (periodStartIso) {
      const ps = new Date(periodStartIso);
      if (!isNaN(ps.getTime())) where.periodStart = ps;
    }
    const rows = await this.prisma.teacherSalary.findMany({ where, orderBy: [{ periodStart: 'desc' }, { netAmount: 'desc' }] });
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const teachers = teacherIds.length
      ? await this.prisma.teacherProfile.findMany({ where: { id: { in: teacherIds } }, select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } } } })
      : [];
    const tById = new Map(teachers.map((t) => [t.id, t]));
    return rows.map((r) => {
      const t = tById.get(r.teacherId);
      return {
        id: r.id,
        teacher: t ? { id: t.id, code: t.teacherCode, name: `${t.user.firstName} ${t.user.lastName}`.trim() } : null,
        monthLabel: r.monthLabel,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        totalClasses: r.totalClasses,
        regularEarnings: Number(r.regularEarnings),
        trialEarnings: Number(r.trialEarnings),
        bonusEarnings: Number(r.bonusEarnings),
        grossAmount: Number(r.grossAmount),
        adjustmentsTotal: Number(r.adjustmentsTotal),
        netAmount: Number(r.netAmount),
        currency: r.currency,
        status: r.status,
        approvedByName: r.approvedByName,
        approvedAt: r.approvedAt,
        paidAt: r.paidAt,
        wiseReference: r.wiseReference,
      };
    });
  }

  async detail(salaryId: string) {
    const s = await this.prisma.teacherSalary.findUnique({ where: { id: salaryId } });
    if (!s) throw new NotFoundException('Salary not found.');
    const [teacher, adjustments, earnings] = await Promise.all([
      this.prisma.teacherProfile.findUnique({ where: { id: s.teacherId }, select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } }, recipientName: true, payoutCountry: true, payoutBankName: true, iban: true, swift: true, wiseRecipientId: true, payoutCurrency: true } }),
      this.prisma.salaryAdjustment.findMany({ where: { salaryId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.teacherEarning.findMany({ where: { salaryId }, orderBy: { earnedAt: 'desc' }, take: 500 }),
    ]);
    return {
      id: s.id,
      teacher: teacher ? { id: teacher.id, code: teacher.teacherCode, name: `${teacher.user.firstName} ${teacher.user.lastName}`.trim() } : null,
      recipient: teacher ? { name: teacher.recipientName, country: teacher.payoutCountry, bank: teacher.payoutBankName, iban: teacher.iban, swift: teacher.swift, wiseRecipientId: teacher.wiseRecipientId, currency: teacher.payoutCurrency } : null,
      monthLabel: s.monthLabel,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      totalClasses: s.totalClasses,
      regularEarnings: Number(s.regularEarnings),
      trialEarnings: Number(s.trialEarnings),
      bonusEarnings: Number(s.bonusEarnings),
      grossAmount: Number(s.grossAmount),
      adjustmentsTotal: Number(s.adjustmentsTotal),
      netAmount: Number(s.netAmount),
      currency: s.currency,
      status: s.status,
      approvedByName: s.approvedByName,
      approvedAt: s.approvedAt,
      paidAt: s.paidAt,
      wiseReference: s.wiseReference,
      failureReason: s.failureReason,
      adjustments: adjustments.map((a) => ({ id: a.id, type: a.type, amount: Number(a.amount), reason: a.reason, by: a.createdByName, at: a.createdAt })),
      earnings: earnings.map((e) => ({ id: e.id, date: e.earnedAt, classType: e.classType, amount: Number(e.amount), outcome: e.outcome, paid: e.paid })),
    };
  }

  async addAdjustment(salaryId: string, dto: { type: 'EXTRA_PAY' | 'DEDUCTION'; amount: number; reason: string }, actor: Actor) {
    const s = await this.prisma.teacherSalary.findUnique({ where: { id: salaryId }, select: { id: true, status: true, grossAmount: true } });
    if (!s) throw new NotFoundException('Salary not found.');
    if (s.status === 'PAID' || s.status === 'APPROVED') {
      throw new BadRequestException('This salary is already approved/paid and can no longer be adjusted.');
    }
    if (!dto.reason || !dto.reason.trim()) throw new BadRequestException('A reason is required for every adjustment.');
    const amount = round2(Number(dto.amount));
    if (!(amount > 0)) throw new BadRequestException('Adjustment amount must be greater than 0.');
    if (dto.type !== 'EXTRA_PAY' && dto.type !== 'DEDUCTION') throw new BadRequestException('Invalid adjustment type.');

    await this.prisma.salaryAdjustment.create({
      data: { salaryId, type: dto.type, amount, reason: dto.reason.trim(), createdById: actor?.id ?? null, createdByName: actor?.name ?? null },
    });
    const adjTotal = await this.adjustmentsTotal(salaryId);
    const net = round2(Number(s.grossAmount) + adjTotal);
    return this.prisma.teacherSalary.update({
      where: { id: salaryId },
      data: { adjustmentsTotal: adjTotal, netAmount: net, status: 'ADJUSTMENT_APPLIED' },
    });
  }

  async setUnderReview(salaryId: string) {
    const s = await this.prisma.teacherSalary.findUnique({ where: { id: salaryId }, select: { status: true } });
    if (!s) throw new NotFoundException('Salary not found.');
    if (s.status === 'PAID' || s.status === 'APPROVED') throw new BadRequestException('Already approved/paid.');
    return this.prisma.teacherSalary.update({ where: { id: salaryId }, data: { status: 'UNDER_REVIEW' } });
  }

  async approve(salaryId: string, actor: Actor) {
    const s = await this.prisma.teacherSalary.findUnique({ where: { id: salaryId }, select: { status: true, teacherId: true } });
    if (!s) throw new NotFoundException('Salary not found.');
    if (s.status === 'PAID') throw new BadRequestException('Already paid.');
    if (s.status === 'APPROVED') throw new BadRequestException('Already approved.');
    const updated = await this.prisma.teacherSalary.update({
      where: { id: salaryId },
      data: { status: 'APPROVED', approvedById: actor?.id ?? null, approvedByName: actor?.name ?? null, approvedAt: new Date() },
    });
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { id: s.teacherId }, select: { userId: true } });
    if (teacher?.userId) {
      this.notifications.createFor(teacher.userId, { type: 'SALARY_APPROVED', title: 'Salary approved', body: `Your salary for ${updated.monthLabel} has been approved and is queued for payment.`, link: '/teacher/salary' }).catch(() => undefined);
    }
    return updated;
  }

  // ── Payment via Wise (Module 6C) ────────────────────────────────────────────
  /**
   * Pay an approved salary.
   *
   * The status transition is CLAIMED atomically before the transfer is created.
   * Reading the status and then paying left a window in which two callers — an
   * impatient double-click, or a retry racing the first attempt — both saw
   * APPROVED, both created a transfer and both wrote PAID. The teacher was paid
   * twice and the second SalaryPayment row was the only trace.
   *
   * `updateMany` with the status in the WHERE clause is a compare-and-set:
   * exactly one caller gets count === 1 and proceeds; everyone else is told the
   * payment is already running. The invoice side of this codebase solves the
   * same problem with SELECT … FOR UPDATE; a row lock is not usable here
   * because the Wise call is network I/O and must not be held inside a
   * transaction.
   */
  async pay(salaryId: string, actor: Actor) {
    const s = await this.prisma.teacherSalary.findUnique({ where: { id: salaryId } });
    if (!s) throw new NotFoundException('Salary not found.');
    if (s.status === 'PAID') throw new BadRequestException('This salary has already been paid.');
    if (s.status === 'PROCESSING') {
      throw new BadRequestException(
        'A payment for this salary is already in progress. Check the payment history before retrying.',
      );
    }
    // Only an approved salary can be paid (spec 6C business rule). A FAILED one
    // was approved before it failed, so a retry is allowed.
    if (s.status !== 'APPROVED' && s.status !== 'FAILED') {
      throw new BadRequestException('Only an approved salary can be paid.');
    }

    const claimed = await this.prisma.teacherSalary.updateMany({
      where: { id: salaryId, status: { in: ['APPROVED', 'FAILED'] } },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('This salary was just claimed by another payment attempt.');
    }

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: s.teacherId },
      select: { userId: true, recipientName: true, payoutCountry: true, payoutBankName: true, iban: true, swift: true, wiseRecipientId: true, payoutCurrency: true },
    });
    const recipient = {
      name: teacher?.recipientName,
      country: teacher?.payoutCountry,
      bankName: teacher?.payoutBankName,
      iban: teacher?.iban,
      swift: teacher?.swift,
      wiseRecipientId: teacher?.wiseRecipientId,
      currency: teacher?.payoutCurrency ?? s.currency,
    };
    const amount = Number(s.netAmount);

    /*
     * If the transfer call itself throws we do NOT release the claim. A thrown
     * network error cannot tell us whether the money left — releasing it to
     * FAILED would invite a retry that pays twice, which is the exact failure
     * this claim exists to prevent. The row stays PROCESSING so a human
     * reconciles it against Wise, and the log says so out loud.
     */
    let result: WiseTransferResult;
    try {
      result = this.wise.createTransfer({ recipient, amount, currency: s.currency });
    } catch (e) {
      this.logger.error(
        `Salary ${salaryId} is stuck PROCESSING — the transfer call threw and the outcome is unknown. ` +
          `Reconcile against Wise by hand before retrying: ${(e as Error).message}`,
      );
      throw new BadRequestException(
        'The payment provider did not respond. The salary is marked as processing — check Wise before retrying.',
      );
    }

    // Record the attempt (retries append — spec 6C payment history).
    await this.prisma.salaryPayment.create({
      data: {
        salaryId,
        teacherId: s.teacherId,
        amount,
        currency: s.currency,
        reference: result.reference ?? null,
        status: result.status,
        failureReason: result.failureReason ?? null,
        attemptedById: actor?.id ?? null,
        attemptedByName: actor?.name ?? null,
      },
    });

    if (result.status === 'SUCCESS') {
      const updated = await this.prisma.teacherSalary.update({
        where: { id: salaryId },
        data: { status: 'PAID', paidAt: new Date(), wiseReference: result.reference ?? null, failureReason: null },
      });
      if (teacher?.userId) {
        this.notifications.createFor(teacher.userId, { type: 'SALARY_PAID', title: 'Salary paid', body: `Your salary for ${updated.monthLabel} (${s.currency} ${amount.toFixed(2)}) has been paid. Ref: ${result.reference}.`, link: '/teacher/salary' }).catch(() => undefined);
      }
      return { status: 'PAID', reference: result.reference, salary: updated };
    }

    // Failure — mark FAILED, keep a retry open, alert the admins.
    const updated = await this.prisma.teacherSalary.update({
      where: { id: salaryId },
      data: { status: 'FAILED', failureReason: result.failureReason ?? 'Payment failed.' },
    });
    this.notifications.createForRoles([Role.ADMIN], { type: 'SALARY_PAYMENT_FAILED', title: 'Salary payment failed', body: `Payment for ${updated.monthLabel} failed: ${result.failureReason}. Fix the details and retry.`, link: '/salary' }).catch(() => undefined);
    if (teacher?.userId) {
      this.notifications.createFor(teacher.userId, { type: 'SALARY_PAYMENT_FAILED', title: 'Salary payment issue', body: `We hit a problem paying your ${updated.monthLabel} salary. Our team is on it.`, link: '/teacher/salary' }).catch(() => undefined);
    }
    return { status: 'FAILED', failureReason: result.failureReason, salary: updated };
  }

  async paymentHistory(salaryId: string) {
    const rows = await this.prisma.salaryPayment.findMany({ where: { salaryId }, orderBy: { attemptedAt: 'desc' } });
    return rows.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      reference: p.reference,
      status: p.status,
      failureReason: p.failureReason,
      by: p.attemptedByName,
      at: p.attemptedAt,
    }));
  }

  // ── Teacher-facing: a teacher's own salary records ──────────────────────────
  // Powers /teacher/salary — the new Module-6 salary the SALARY_APPROVED/PAID
  // notifications point at (distinct from the legacy /teacher/payroll payslips).
  // Ownership is enforced by resolving the teacher from the caller's userId, so a
  // teacher can only ever see their own rows. Adjustments + payment attempts are
  // embedded per row (a teacher has few salaries, one per period).
  async mySalaries(userId: string) {
    const tp = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!tp) return [];
    const rows = await this.prisma.teacherSalary.findMany({ where: { teacherId: tp.id }, orderBy: { periodStart: 'desc' } });
    const ids = rows.map((r) => r.id);
    const [adjustments, payments] = await Promise.all([
      ids.length ? this.prisma.salaryAdjustment.findMany({ where: { salaryId: { in: ids } }, orderBy: { createdAt: 'desc' } }) : [],
      ids.length ? this.prisma.salaryPayment.findMany({ where: { salaryId: { in: ids } }, orderBy: { attemptedAt: 'desc' } }) : [],
    ]);
    const adjBy = new Map<string, typeof adjustments>();
    for (const a of adjustments) (adjBy.get(a.salaryId) ?? adjBy.set(a.salaryId, []).get(a.salaryId)!).push(a);
    const payBy = new Map<string, typeof payments>();
    for (const p of payments) (payBy.get(p.salaryId) ?? payBy.set(p.salaryId, []).get(p.salaryId)!).push(p);
    return rows.map((r) => ({
      id: r.id,
      monthLabel: r.monthLabel,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      totalClasses: r.totalClasses,
      regularEarnings: Number(r.regularEarnings),
      trialEarnings: Number(r.trialEarnings),
      bonusEarnings: Number(r.bonusEarnings),
      grossAmount: Number(r.grossAmount),
      adjustmentsTotal: Number(r.adjustmentsTotal),
      netAmount: Number(r.netAmount),
      currency: r.currency,
      status: r.status,
      approvedAt: r.approvedAt,
      paidAt: r.paidAt,
      wiseReference: r.wiseReference,
      failureReason: r.failureReason,
      // Reason shown so the teacher understands a deduction; amount is signed.
      adjustments: (adjBy.get(r.id) ?? []).map((a) => ({ id: a.id, type: a.type, amount: Number(a.amount), reason: a.reason, at: a.createdAt })),
      payments: (payBy.get(r.id) ?? []).map((p) => ({ id: p.id, amount: Number(p.amount), currency: p.currency, reference: p.reference, status: p.status, at: p.attemptedAt })),
    }));
  }

  // ── Teacher payout (recipient) details — admin-editable ─────────────────────
  async getPayoutDetails(teacherId: string) {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { recipientName: true, payoutCountry: true, payoutBankName: true, iban: true, swift: true, wiseRecipientId: true, payoutCurrency: true },
    });
    if (!t) throw new NotFoundException('Teacher not found.');
    const validation = this.wise.validate({ name: t.recipientName, country: t.payoutCountry, bankName: t.payoutBankName, iban: t.iban, swift: t.swift, wiseRecipientId: t.wiseRecipientId, currency: t.payoutCurrency });
    return { ...t, complete: validation.ok, missing: validation.missing };
  }

  async updatePayoutDetails(
    teacherId: string,
    dto: { recipientName?: string; payoutCountry?: string; payoutBankName?: string; iban?: string; swift?: string; wiseRecipientId?: string; payoutCurrency?: string },
  ) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!t) throw new NotFoundException('Teacher not found.');
    await this.prisma.teacherProfile.update({
      where: { id: teacherId },
      data: {
        ...(dto.recipientName !== undefined ? { recipientName: dto.recipientName || null } : {}),
        ...(dto.payoutCountry !== undefined ? { payoutCountry: dto.payoutCountry || null } : {}),
        ...(dto.payoutBankName !== undefined ? { payoutBankName: dto.payoutBankName || null } : {}),
        ...(dto.iban !== undefined ? { iban: dto.iban || null } : {}),
        ...(dto.swift !== undefined ? { swift: dto.swift || null } : {}),
        ...(dto.wiseRecipientId !== undefined ? { wiseRecipientId: dto.wiseRecipientId || null } : {}),
        ...(dto.payoutCurrency !== undefined ? { payoutCurrency: dto.payoutCurrency || null } : {}),
      },
    });
    return this.getPayoutDetails(teacherId);
  }
}
