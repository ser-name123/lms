import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { amountFor, DEFAULT_CURRENCY, type Currency } from '../common/currency';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { FinanceSettingsService } from './finance-settings.service';
import {
  InvoiceStatus,
  ScholarshipStatus,
  FeeComponentType,
} from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import {
  GenerateInvoiceDto,
  InvoiceItemInput,
  ListInvoicesDto,
  RecordPaymentDto,
} from './dto';
import {
  addMonths,
  computeInvoiceTotals,
  cycleMonths,
  formatDocNumber,
  periodLabelFor,
  round2,
} from './finance.config';
import type { FinanceActor } from './scholarships.service';

const STUDENT_SELECT = {
  id: true,
  studentCode: true,
  parentEmail: true,
  parentName: true,
  user: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.StudentProfileSelect;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
    private readonly settings: FinanceSettingsService,
  ) {}

  // ── Document numbering ──────────────────────────────────────────────────────
  /*
   * The sequence is the highest number *numerically*, not the last one in
   * lexical order.
   *
   * Ordering by the string breaks the moment two zero-padding widths coexist:
   * "INV-2026-105" sorts above "INV-2026-000106", so the max never advances
   * past the legacy row and every subsequent invoice is handed the same
   * number — the second one in any batch dies on the unique index. Parsing the
   * tail costs one small per-year scan and cannot be fooled by the format.
   */
  private async nextNumber(
    prefix: 'INV' | 'RCPT',
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const stem = `${prefix}-${year}-`;

    const rows =
      prefix === 'INV'
        ? await tx.invoice.findMany({
            where: { number: { startsWith: stem } },
            select: { number: true },
          })
        : await tx.receipt.findMany({
            where: { number: { startsWith: stem } },
            select: { number: true },
          });

    const highest = rows.reduce((max, r) => {
      const seq = Number(r.number.slice(stem.length));
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);

    return formatDocNumber(prefix, year, highest + 1);
  }

  // ── Listing ─────────────────────────────────────────────────────────────────
  async list(dto: ListInvoicesDto) {
    const { page = 1, limit = 20, search, status, studentId, sortBy } = dto;
    const where: Prisma.InvoiceWhereInput = {
      ...(status ? { status: status as InvoiceStatus } : {}),
      ...(studentId ? { studentId } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              {
                student: {
                  user: {
                    OR: [
                      { firstName: { contains: search, mode: 'insensitive' } },
                      { lastName: { contains: search, mode: 'insensitive' } },
                      { email: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    let orderBy: Prisma.InvoiceOrderByWithRelationInput = { issuedAt: 'desc' };
    if (sortBy === 'amount-desc') orderBy = { amount: 'desc' };
    else if (sortBy === 'amount-asc') orderBy = { amount: 'asc' };
    else if (sortBy === 'date-asc') orderBy = { issuedAt: 'asc' };

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { select: STUDENT_SELECT },
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const items = rows.map((r) => ({
      ...r,
      balance: round2(Number(r.amount) - Number(r.paidAmount)),
    }));
    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        student: { select: STUDENT_SELECT },
        items: true,
        payments: { orderBy: { createdAt: 'desc' } },
        receipts: { orderBy: { issuedAt: 'desc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!inv) throw new NotFoundException(`Invoice ${id} not found`);
    return {
      ...inv,
      balance: round2(Number(inv.amount) - Number(inv.paidAmount)),
    };
  }

  // ── Invoice generation ──────────────────────────────────────────────────────
  async generate(dto: GenerateInvoiceDto) {
    const cfg = await this.settings.getConfig();

    // Resolve line items — explicit items win, else expand a fee plan.
    let items: InvoiceItemInput[] = dto.items ?? [];
    /*
     * Whoever raises this invoice says which currency, then the student they
     * are raising it for, then the academy default — a fee plan no longer has
     * one of its own to fall back to.
     */
    let currency = (dto.currency ?? cfg.currency) as Currency;
    if (dto.studentId && !dto.currency) {
      const billing = await this.prisma.studentProfile.findUnique({
        where: { id: dto.studentId },
        select: { billingCurrency: true },
      });
      if (billing) currency = billing.billingCurrency as Currency;
    }
    if ((!items || items.length === 0) && dto.feePlanId) {
      const plan = await this.prisma.feePlan.findUnique({
        where: { id: dto.feePlanId },
        include: { components: true },
      });
      if (!plan) throw new NotFoundException('Fee plan not found');
      const unpriced = plan.components.filter((c) => amountFor(c, currency) == null);
      if (unpriced.length) {
        throw new BadRequestException(
          `"${plan.name}" has no ${currency} amount for ` +
            `${unpriced.map((c) => `"${c.label}"`).join(', ')}. Set it on the fee plans page — ` +
            'billing it at the dollar figure would charge the wrong amount.',
        );
      }
      items = plan.components.map((c) => ({
        type: c.type,
        label: c.label,
        amount: amountFor(c, currency)!,
      }));
    }
    if (!items || items.length === 0) {
      throw new BadRequestException(
        'An invoice needs at least one line item or a fee plan.',
      );
    }

    if (dto.studentId) {
      const student = await this.prisma.studentProfile.findUnique({
        where: { id: dto.studentId },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Student not found');
    }

    // Resolve discount + (approved) scholarship for the arithmetic.
    const discount = dto.discountId
      ? await this.prisma.discount.findUnique({ where: { id: dto.discountId } })
      : null;
    const scholarship = dto.scholarshipId
      ? await this.prisma.scholarship.findUnique({
          where: { id: dto.scholarshipId },
        })
      : null;
    if (scholarship && scholarship.status === ScholarshipStatus.REJECTED) {
      throw new BadRequestException('That scholarship was rejected.');
    }

    const totals = computeInvoiceTotals({
      items,
      discount: discount
        ? { type: discount.type, value: Number(discount.value) }
        : null,
      scholarship: scholarship
        ? { type: scholarship.type, value: Number(scholarship.value) }
        : null,
      taxEnabled: dto.taxPct != null ? true : cfg.taxEnabled,
      taxPct: dto.taxPct ?? cfg.taxPct,
    });

    const status = this.normalizeStatus(dto.status) ?? InvoiceStatus.DRAFT;
    const notesParts: string[] = [];
    if (dto.customName) notesParts.push(`Recipient: ${dto.customName}`);
    if (dto.customEmail) notesParts.push(`Email: ${dto.customEmail}`);
    if (dto.notes) notesParts.push(dto.notes);

    const number = await this.nextNumber('INV');
    const invoice = await this.prisma.invoice.create({
      data: {
        number,
        studentId: dto.studentId ?? null,
        amount: totals.total,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        paidAmount: 0,
        currency,
        status,
        feePlanId: dto.feePlanId ?? null,
        discountId: dto.discountId ?? null,
        scholarshipId: dto.scholarshipId ?? null,
        periodLabel: dto.periodLabel ?? null,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        notes: notesParts.join(' · ') || null,
        items: {
          create: items.map((it) => ({
            type: it.type,
            label: it.label,
            amount: it.amount,
          })),
        },
      },
      include: { items: true, student: { select: STUDENT_SELECT } },
    });

    // A used scholarship is marked APPLIED.
    if (scholarship && scholarship.status === ScholarshipStatus.APPROVED) {
      await this.prisma.scholarship.update({
        where: { id: scholarship.id },
        data: { status: ScholarshipStatus.APPLIED, appliedAt: new Date() },
      });
    }

    if (status !== InvoiceStatus.DRAFT) {
      await this.notifyIssued(invoice.id);
    }
    return invoice;
  }

  /**
   * The first invoice for a student who has just been converted from a lead.
   *
   * Lives here rather than in the leads module so it goes through the same
   * numbering, tax config and issue notification as every other invoice —
   * a second INV-YYYY-NNN generator would eventually collide with this one.
   *
   * Returns null rather than throwing when there is no package to bill: a
   * conversion must not fail because finance is not set up yet.
   */
  async createEnrolmentInvoice(input: {
    studentId: string;
    label: string;
    amount: number;
    dueInDays?: number;
    // The family's billing currency. Falls back to the academy default only
    // when a caller has none to give — never converted from another.
    currency?: string;
  }) {
    if (!(input.amount > 0)) return null;

    const cfg = await this.settings.getConfig();
    const items: InvoiceItemInput[] = [
      { type: FeeComponentType.COURSE, label: input.label, amount: round2(input.amount) },
    ];
    const totals = computeInvoiceTotals({
      items,
      taxEnabled: cfg.taxEnabled,
      taxPct: cfg.taxPct,
    });

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + (input.dueInDays ?? 7));

    const number = await this.nextNumber('INV');
    const invoice = await this.prisma.invoice.create({
      data: {
        number,
        studentId: input.studentId,
        amount: totals.total,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        currency: input.currency ?? cfg.currency,
        // SENT, not DRAFT: the family is told about it in the welcome email,
        // so it has to be a real bill they can see in their portal.
        status: InvoiceStatus.SENT,
        issuedAt: new Date(),
        dueAt,
        notes: 'First invoice on enrolment',
        items: { create: items.map((it) => ({ type: it.type, label: it.label, amount: it.amount })) },
      },
      select: { id: true, number: true, amount: true, currency: true, dueAt: true },
    });

    return {
      id: invoice.id,
      number: invoice.number,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      dueAt: invoice.dueAt,
    };
  }

  /** Generate the recurring invoice for a fee assignment + advance its schedule. */
  async generateForAssignment(assignmentId: string, forDate: Date) {
    const assignment = await this.prisma.studentFeeAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        plan: { include: { components: true } },
        student: { select: { billingCurrency: true } },
      },
    });
    if (!assignment || !assignment.plan) return null;
    if (!assignment.plan.components.length) return null;

    /*
     * The currency comes from the family, not from the plan.
     *
     * The plan used to carry one, so a student enrolled in dirhams was
     * invoiced in dirhams once and in dollars every cycle after — same
     * package, two currencies, two amounts, and nothing on screen said so.
     *
     * A component the academy has not priced in this currency stops the
     * invoice rather than being billed at the dollar figure. Loud on purpose:
     * a missing price is a five-second fix on the fee plans page, whereas a
     * family charged 40 dirhams instead of 160 may not notice for months.
     */
    const currency = (assignment.student?.billingCurrency ??
      DEFAULT_CURRENCY) as Currency;
    const unpriced = assignment.plan.components.filter(
      (c) => amountFor(c, currency) == null,
    );
    if (unpriced.length) {
      this.logger.error(
        `Fee plan "${assignment.plan.name}" has no ${currency} amount for ` +
          `${unpriced.map((c) => `"${c.label}"`).join(', ')}, so no invoice was raised ` +
          `for student ${assignment.studentId}. Set it on the fee plans page.`,
      );
      return null;
    }

    const periodStart = new Date(forDate);
    // Skip if we already billed this assignment for this period.
    const existing = await this.prisma.invoice.findFirst({
      where: {
        assignmentId,
        periodStart: {
          gte: new Date(periodStart.getFullYear(), periodStart.getMonth(), 1),
          lt: new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1),
        },
      },
      select: { id: true, number: true },
    });
    if (existing) return existing;

    const months = cycleMonths(assignment.plan.cycle);
    const periodEnd = months > 0 ? addMonths(periodStart, months) : periodStart;
    const cfg = await this.settings.getConfig();

    const discount = assignment.discountId
      ? await this.prisma.discount.findUnique({
          where: { id: assignment.discountId },
        })
      : null;
    const items = assignment.plan.components.map((c) => ({
      type: c.type as FeeComponentType,
      label: c.label,
      amount: amountFor(c, currency)!,
    }));
    const totals = computeInvoiceTotals({
      items,
      discount: discount
        ? { type: discount.type, value: Number(discount.value) }
        : null,
      taxEnabled: cfg.taxEnabled,
      taxPct: cfg.taxPct,
    });

    const number = await this.nextNumber('INV');
    const invoice = await this.prisma.invoice.create({
      data: {
        number,
        studentId: assignment.studentId,
        amount: totals.total,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        currency,
        status: InvoiceStatus.SENT,
        feePlanId: assignment.planId,
        assignmentId: assignment.id,
        discountId: assignment.discountId,
        periodLabel: periodLabelFor(periodStart),
        periodStart,
        periodEnd,
        issuedAt: new Date(),
        dueAt: addMonths(periodStart, 0), // due at period start by default
        items: {
          create: items.map((it) => ({
            type: it.type,
            label: it.label,
            amount: it.amount,
          })),
        },
      },
      include: { items: true },
    });

    // Advance the recurring schedule.
    if (months > 0) {
      await this.prisma.studentFeeAssignment.update({
        where: { id: assignment.id },
        data: { nextRunAt: addMonths(periodStart, months) },
      });
    } else {
      await this.prisma.studentFeeAssignment.update({
        where: { id: assignment.id },
        data: { nextRunAt: null, active: false },
      });
    }

    await this.notifyIssued(invoice.id);
    return { id: invoice.id, number: invoice.number };
  }

  // ── Payments ────────────────────────────────────────────────────────────────
  async recordPayment(invoiceId: string, dto: RecordPaymentDto, actor: FinanceActor) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { student: { select: STUDENT_SELECT } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      invoice.status === InvoiceStatus.CANCELLED ||
      invoice.status === InvoiceStatus.VOID
    ) {
      throw new BadRequestException('This invoice is not payable.');
    }

    const balance = round2(Number(invoice.amount) - Number(invoice.paidAmount));
    const amount = round2(dto.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be positive.');
    if (amount > balance + 0.001) {
      throw new BadRequestException(
        `Payment exceeds the outstanding balance (${invoice.currency} ${balance}).`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount,
          provider: 'manual',
          status: 'SUCCEEDED',
          method: dto.method,
          reference: dto.reference ?? null,
          receivedById: actor.id ?? null,
          notes: dto.notes ?? null,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        },
      });

      const newPaid = round2(Number(invoice.paidAmount) + amount);
      const fullyPaid = newPaid >= Number(invoice.amount) - 0.001;
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaid,
          status: fullyPaid
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIALLY_PAID,
          paidAt: fullyPaid ? new Date() : undefined,
        },
      });

      const receiptNo = await this.nextNumber('RCPT', tx);
      const receipt = await tx.receipt.create({
        data: {
          number: receiptNo,
          invoiceId,
          paymentId: payment.id,
          studentId: invoice.studentId,
          amount,
          currency: invoice.currency,
          method: dto.method,
        },
      });

      return { payment, receipt, newPaid, fullyPaid };
    });

    // Update student's payment dates for the fee profile.
    if (invoice.studentId) {
      await this.prisma.studentProfile
        .update({
          where: { id: invoice.studentId },
          data: { lastPaymentDate: new Date() },
        })
        .catch(() => undefined);
    }

    await this.notifyPaid(invoice, result.receipt.number, amount, result.fullyPaid);
    return {
      payment: result.payment,
      receipt: result.receipt,
      paidAmount: result.newPaid,
      balance: round2(Number(invoice.amount) - result.newPaid),
    };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  async cancel(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
    });
  }

  async send(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
    });
    await this.notifyIssued(id);
    return updated;
  }

  async remove(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, paidAmount: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (Number(inv.paidAmount) > 0) {
      throw new BadRequestException(
        'An invoice with payments cannot be deleted — cancel it instead.',
      );
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { success: true };
  }

  // ── Receipts ────────────────────────────────────────────────────────────────
  async receipts(studentId?: string) {
    const rows = await this.prisma.receipt.findMany({
      where: { ...(studentId ? { studentId } : {}) },
      orderBy: { issuedAt: 'desc' },
      include: {
        invoice: { select: { number: true, periodLabel: true } },
      },
      take: 500,
    });
    return { items: rows };
  }

  async receipt(id: string) {
    const r = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            items: true,
            student: { select: STUDENT_SELECT },
          },
        },
      },
    });
    if (!r) throw new NotFoundException('Receipt not found');
    return r;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private normalizeStatus(status?: string): InvoiceStatus | null {
    if (!status) return null;
    const up = status.toUpperCase();
    if (up === 'DRAFT') return InvoiceStatus.DRAFT;
    if (up === 'PENDING') return InvoiceStatus.PENDING;
    if (up === 'SENT') return InvoiceStatus.SENT;
    return InvoiceStatus.SENT;
  }

  private async notifyIssued(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { student: { select: STUDENT_SELECT } },
    });
    if (!inv?.student) return;
    const userId = inv.student.user?.id;
    if (userId) {
      await this.notifications.createFor(userId, {
        type: 'INVOICE_ISSUED',
        title: `Invoice ${inv.number}`,
        body: `A ${inv.currency} ${Number(inv.amount)} invoice is due${
          inv.dueAt ? ` by ${inv.dueAt.toLocaleDateString('en-US')}` : ''
        }.`,
        link: '/student/invoices',
      });
    }
    if (inv.student.parentEmail) {
      const name = inv.student.user
        ? `${inv.student.user.firstName} ${inv.student.user.lastName}`
        : 'your child';
      await this.emails
        .sendMail(
          inv.student.parentEmail,
          `Invoice ${inv.number} — ${inv.currency} ${Number(inv.amount)}`,
          `A new invoice (${inv.number}) for ${name} of ${inv.currency} ${Number(
            inv.amount,
          )} has been issued${
            inv.dueAt
              ? `, due by ${inv.dueAt.toLocaleDateString('en-US')}`
              : ''
          }.`,
        )
        .catch(() => undefined);
    }
  }

  private async notifyPaid(
    inv: { number: string; currency: string; studentId: string | null; student: { parentEmail: string | null; user: { id: string; firstName: string; lastName: string } | null } | null },
    receiptNo: string,
    amount: number,
    fullyPaid: boolean,
  ) {
    const userId = inv.student?.user?.id;
    if (userId) {
      await this.notifications.createFor(userId, {
        type: 'PAYMENT_RECEIVED',
        title: `Payment received — ${receiptNo}`,
        body: `We received ${inv.currency} ${amount} for invoice ${inv.number}.${
          fullyPaid ? ' It is now fully paid.' : ''
        }`,
        link: '/student/invoices',
      });
    }
    if (inv.student?.parentEmail) {
      await this.emails
        .sendMail(
          inv.student.parentEmail,
          `Payment received — receipt ${receiptNo}`,
          `We received a payment of ${inv.currency} ${amount} towards invoice ${inv.number}. Receipt no: ${receiptNo}.`,
        )
        .catch(() => undefined);
    }
  }
}
