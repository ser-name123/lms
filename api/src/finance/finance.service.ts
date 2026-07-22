import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceSettingsService } from './finance-settings.service';
import { round2 } from './finance.config';
import { SUPPORTED_CURRENCIES } from '../common/currency';

interface MonthBucket {
  start: Date;
  end: Date;
  label: string;
}

// Invoice statuses that still owe money.
const OPEN_STATUSES = ['SENT', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE'];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: FinanceSettingsService,
  ) {}

  private monthsBack(n: number, now = new Date()): MonthBucket[] {
    const out: MonthBucket[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      out.push({
        start,
        end,
        label: start.toLocaleString('en-US', { month: 'short' }),
      });
    }
    return out;
  }

  /*
   * Money taken, in ONE currency.
   *
   * This used to sum every payment regardless of the invoice it settled, so an
   * AED 1000 payment added 1000 to a figure the screen labelled in dollars —
   * roughly 3.7x the real amount — and net profit then subtracted USD payroll
   * from that inflated total. Nothing warned, because the sum is arithmetically
   * fine; only the units were wrong.
   *
   * The academy prices every currency by hand and stores no exchange rate, so
   * there is no honest way to add two of them together. Callers name the
   * currency they want and get only that.
   */
  private async paidSum(where: object, currency: string): Promise<number> {
    const agg = await this.prisma.payment.aggregate({
      where: { status: 'SUCCEEDED', ...where, invoice: { currency } },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount || 0);
  }

  /** Which currencies actually have invoices — drives the per-currency strip. */
  private async activeCurrencies(): Promise<string[]> {
    const rows = await this.prisma.invoice.groupBy({
      by: ['currency'],
      _count: { _all: true },
    });
    const seen = rows.map((r) => r.currency);
    return SUPPORTED_CURRENCIES.filter((c) => seen.includes(c));
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  async dashboard() {
    const cfg = await this.settings.getConfig();
    /*
     * Every card, chart and the profit line below is ONE currency — the
     * academy's reporting currency. Costs are only ever in it (staff are paid
     * in USD, expenses are recorded in it), so a profit computed against
     * revenue from another currency would be subtracting apples from oranges.
     * Revenue billed in the other currencies is reported beside it, unconverted
     * and never folded in — see `byCurrency`.
     */
    const reportingCurrency = cfg.currency;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalRevenue,
      collectedThisMonth,
      collectedToday,
      openInvoices,
      refundAgg,
      scholarshipCount,
      scholarshipDiscountAgg,
      expenseAgg,
      payrollPaidAgg,
      payrollPendingAgg,
      overdueCount,
    ] = await Promise.all([
      this.paidSum({}, reportingCurrency),
      this.paidSum({ paidAt: { gte: monthStart } }, reportingCurrency),
      this.paidSum({ paidAt: { gte: dayStart } }, reportingCurrency),
      this.prisma.invoice.findMany({
        where: { status: { in: OPEN_STATUSES as never }, currency: reportingCurrency },
        select: { amount: true, paidAmount: true },
      }),
      this.prisma.refund.aggregate({
        where: { status: 'PROCESSED', currency: reportingCurrency },
        _sum: { amount: true },
      }),
      this.prisma.scholarship.count({
        where: { status: { in: ['APPROVED', 'APPLIED'] as never } },
      }),
      this.prisma.invoice.aggregate({
        where: { scholarshipId: { not: null }, currency: reportingCurrency },
        _sum: { discountAmount: true },
      }),
      this.prisma.expense.aggregate({
        where: { status: 'APPROVED' },
        _sum: { amount: true },
      }),
      this.prisma.payout.aggregate({
        where: { status: 'PAID' },
        _sum: { netAmount: true },
      }),
      this.prisma.payout.aggregate({
        where: { status: { in: ['PENDING', 'PROCESSING'] as never } },
        _sum: { netAmount: true },
      }),
      this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
    ]);

    const outstanding = round2(
      openInvoices.reduce(
        (s, i) => s + (Number(i.amount) - Number(i.paidAmount)),
        0,
      ),
    );
    const refunds = Number(refundAgg._sum.amount || 0);
    const expenses = Number(expenseAgg._sum.amount || 0);
    const payrollPaid = Number(payrollPaidAgg._sum.netAmount || 0);
    const payrollPending = Number(payrollPendingAgg._sum.netAmount || 0);
    const netProfit = round2(totalRevenue - expenses - payrollPaid);

    // Charts (12-month revenue + 6-month expense/profit trend).
    const rev12 = this.monthsBack(12, now);
    const revenueSeries = await Promise.all(
      rev12.map(async (m) => ({
        month: m.label,
        revenue: await this.paidSum(
          { paidAt: { gte: m.start, lte: m.end } },
          reportingCurrency,
        ),
      })),
    );

    const trend6 = this.monthsBack(6, now);
    const profitTrend = await Promise.all(
      trend6.map(async (m) => {
        const [rev, exp, pay] = await Promise.all([
          this.paidSum({ paidAt: { gte: m.start, lte: m.end } }, reportingCurrency),
          this.prisma.expense.aggregate({
            where: { status: 'APPROVED', paymentDate: { gte: m.start, lte: m.end } },
            _sum: { amount: true },
          }),
          this.prisma.payout.aggregate({
            where: { status: 'PAID', paymentDate: { gte: m.start, lte: m.end } },
            _sum: { netAmount: true },
          }),
        ]);
        const expense = Number(exp._sum.amount || 0);
        const payroll = Number(pay._sum.netAmount || 0);
        return {
          month: m.label,
          revenue: round2(rev),
          expense: round2(expense + payroll),
          profit: round2(rev - expense - payroll),
        };
      }),
    );

    const [courseWise, countryWise, methodDist] = await Promise.all([
      this.courseWiseRevenue(),
      this.countryWiseRevenue(),
      this.paymentMethodDistribution(),
    ]);

    /*
     * Revenue in every currency the academy has actually invoiced in, each on
     * its own line. No total across them and no conversion: with no stored rate
     * there is no honest single number, and a wrong one is worse than none.
     */
    const currencies = await this.activeCurrencies();
    const byCurrency = await Promise.all(
      currencies.map(async (currency) => {
        const [revenue, thisMonth, open] = await Promise.all([
          this.paidSum({}, currency),
          this.paidSum({ paidAt: { gte: monthStart } }, currency),
          this.prisma.invoice.findMany({
            where: { status: { in: OPEN_STATUSES as never }, currency },
            select: { amount: true, paidAmount: true },
          }),
        ]);
        return {
          currency,
          totalRevenue: round2(revenue),
          collectedThisMonth: round2(thisMonth),
          outstanding: round2(
            open.reduce((s, i) => s + (Number(i.amount) - Number(i.paidAmount)), 0),
          ),
          isReportingCurrency: currency === reportingCurrency,
        };
      }),
    );

    return {
      currency: reportingCurrency,
      byCurrency,
      cards: {
        totalRevenue: round2(totalRevenue),
        collectedToday: round2(collectedToday),
        collectedThisMonth: round2(collectedThisMonth),
        pendingFees: outstanding,
        outstandingBalance: outstanding,
        refunds: round2(refunds),
        scholarships: {
          count: scholarshipCount,
          amount: round2(Number(scholarshipDiscountAgg._sum.discountAmount || 0)),
        },
        teacherPayroll: { paid: round2(payrollPaid), pending: round2(payrollPending) },
        expenses: round2(expenses),
        netProfit,
        overdueInvoices: overdueCount,
      },
      charts: {
        revenueSeries,
        profitTrend,
        courseWise,
        countryWise,
        methodDist,
      },
    };
  }

  private async courseWiseRevenue() {
    const payments = await this.prisma.payment.findMany({
      where: { status: 'SUCCEEDED' },
      select: { amount: true, invoice: { select: { feePlanId: true } } },
      take: 5000,
    });
    const planIds = [
      ...new Set(
        payments.map((p) => p.invoice?.feePlanId).filter(Boolean) as string[],
      ),
    ];
    const plans = planIds.length
      ? await this.prisma.feePlan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, courseId: true, name: true },
        })
      : [];
    const courseIds = [
      ...new Set(plans.map((p) => p.courseId).filter(Boolean) as string[]),
    ];
    const courses = courseIds.length
      ? await this.prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, title: true },
        })
      : [];
    const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
    const planLabel = new Map(
      plans.map((p) => [
        p.id,
        p.courseId ? courseTitle.get(p.courseId) ?? p.name : p.name,
      ]),
    );
    const byLabel = new Map<string, number>();
    for (const p of payments) {
      const label = p.invoice?.feePlanId
        ? planLabel.get(p.invoice.feePlanId) ?? 'Other'
        : 'Ad-hoc / Manual';
      byLabel.set(label, (byLabel.get(label) ?? 0) + Number(p.amount));
    }
    return [...byLabel.entries()]
      .map(([label, amount]) => ({ label, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }

  private async countryWiseRevenue() {
    const payments = await this.prisma.payment.findMany({
      where: { status: 'SUCCEEDED' },
      select: {
        amount: true,
        invoice: {
          select: { student: { select: { user: { select: { country: true } } } } },
        },
      },
      take: 5000,
    });
    const byCountry = new Map<string, number>();
    for (const p of payments) {
      const c = p.invoice?.student?.user?.country || 'Unknown';
      byCountry.set(c, (byCountry.get(c) ?? 0) + Number(p.amount));
    }
    return [...byCountry.entries()]
      .map(([label, amount]) => ({ label, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }

  private async paymentMethodDistribution() {
    const grouped = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
      _count: true,
    });
    return grouped.map((g) => ({
      method: g.method || 'Unspecified',
      amount: round2(Number(g._sum.amount || 0)),
      count: g._count,
    }));
  }

  // ── Analytics (dedicated page) ──────────────────────────────────────────────
  async analytics() {
    // Both trends are plotted as one line, so both are one currency.
    const { currency } = await this.settings.getConfig();
    const now = new Date();
    const months = this.monthsBack(12, now);
    const [collectionTrend, outstandingTrend, methodDist, expenseBreakdown] =
      await Promise.all([
        Promise.all(
          months.map(async (m) => ({
            month: m.label,
            collected: await this.paidSum(
              { paidAt: { gte: m.start, lte: m.end } },
              currency,
            ),
          })),
        ),
        Promise.all(
          months.map(async (m) => {
            const invoices = await this.prisma.invoice.findMany({
              where: {
                issuedAt: { gte: m.start, lte: m.end },
                status: { in: OPEN_STATUSES as never },
                currency,
              },
              select: { amount: true, paidAmount: true },
            });
            return {
              month: m.label,
              outstanding: round2(
                invoices.reduce(
                  (s, i) => s + (Number(i.amount) - Number(i.paidAmount)),
                  0,
                ),
              ),
            };
          }),
        ),
        this.paymentMethodDistribution(),
        this.expenseBreakdown(),
      ]);
    return { currency, collectionTrend, outstandingTrend, methodDist, expenseBreakdown };
  }

  private async expenseBreakdown() {
    const grouped = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: { status: 'APPROVED' },
      _sum: { amount: true },
    });
    const cats = await this.prisma.expenseCategory.findMany({
      select: { id: true, name: true },
    });
    const name = new Map(cats.map((c) => [c.id, c.name]));
    return grouped
      .map((g) => ({
        category: name.get(g.categoryId) ?? 'Other',
        amount: round2(Number(g._sum.amount || 0)),
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  // ── Reports ─────────────────────────────────────────────────────────────────
  async report(type: string) {
    switch (type) {
      case 'revenue':
      case 'collection':
        return this.collectionReport();
      case 'outstanding':
        return this.outstandingReport();
      case 'discount':
        return this.discountReport();
      case 'scholarship':
        return this.scholarshipReport();
      case 'refund':
        return this.refundReport();
      case 'payroll':
        return this.payrollReport();
      case 'expense':
        return this.expenseReport();
      case 'pnl':
        return this.pnlReport();
      case 'paid-students':
        return this.studentsReport('paid');
      case 'pending-students':
        return this.studentsReport('pending');
      case 'overdue-students':
        return this.studentsReport('overdue');
      case 'top-courses':
        return this.topCoursesReport();
      case 'country-revenue':
        return this.countryReport();
      default:
        return this.collectionReport();
    }
  }

  private async collectionReport() {
    const payments = await this.prisma.payment.findMany({
      where: { status: 'SUCCEEDED' },
      orderBy: { paidAt: 'desc' },
      take: 2000,
      include: {
        invoice: {
          select: {
            number: true,
            currency: true,
            student: {
              select: { user: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    const rows = payments.map((p) => ({
      receiptDate: p.paidAt,
      invoice: p.invoice?.number ?? '',
      student: p.invoice?.student?.user
        ? `${p.invoice.student.user.firstName} ${p.invoice.student.user.lastName}`
        : 'External',
      method: p.method ?? '',
      amount: Number(p.amount),
      currency: p.invoice?.currency ?? 'USD',
    }));
    /*
     * Each row already names its currency, but the summary added them all into
     * one number — so a page of AED and USD receipts footed to a total in
     * neither. One total per currency instead.
     */
    const totals: Record<string, number> = {};
    for (const r of rows) {
      totals[r.currency] = round2((totals[r.currency] ?? 0) + r.amount);
    }
    return {
      type: 'collection',
      columns: ['receiptDate', 'invoice', 'student', 'method', 'amount', 'currency'],
      rows,
      summary: { count: rows.length, totalsByCurrency: totals },
    };
  }

  private async outstandingReport() {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { in: OPEN_STATUSES as never } },
      orderBy: { dueAt: 'asc' },
      include: {
        student: {
          select: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    const rows = invoices.map((i) => ({
      invoice: i.number,
      student: i.student?.user
        ? `${i.student.user.firstName} ${i.student.user.lastName}`
        : 'External',
      status: i.status,
      dueAt: i.dueAt,
      amount: Number(i.amount),
      paid: Number(i.paidAmount),
      balance: round2(Number(i.amount) - Number(i.paidAmount)),
    }));
    return {
      type: 'outstanding',
      columns: ['invoice', 'student', 'status', 'dueAt', 'amount', 'paid', 'balance'],
      rows,
      summary: {
        count: rows.length,
        total: round2(rows.reduce((s, r) => s + r.balance, 0)),
      },
    };
  }

  private async discountReport() {
    const invoices = await this.prisma.invoice.findMany({
      where: { discountAmount: { gt: 0 } },
      orderBy: { issuedAt: 'desc' },
      select: {
        number: true,
        discountAmount: true,
        subtotal: true,
        amount: true,
        issuedAt: true,
      },
    });
    const rows = invoices.map((i) => ({
      invoice: i.number,
      issuedAt: i.issuedAt,
      subtotal: Number(i.subtotal ?? 0),
      discount: Number(i.discountAmount),
      net: Number(i.amount),
    }));
    return {
      type: 'discount',
      columns: ['invoice', 'issuedAt', 'subtotal', 'discount', 'net'],
      rows,
      summary: {
        count: rows.length,
        total: round2(rows.reduce((s, r) => s + r.discount, 0)),
      },
    };
  }

  private async scholarshipReport() {
    const rows = await this.prisma.scholarship.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    const mapped = rows.map((s) => ({
      student: s.student?.user
        ? `${s.student.user.firstName} ${s.student.user.lastName}`
        : '',
      name: s.name,
      type: s.type,
      value: Number(s.value),
      status: s.status,
      createdAt: s.createdAt,
    }));
    return {
      type: 'scholarship',
      columns: ['student', 'name', 'type', 'value', 'status', 'createdAt'],
      rows: mapped,
      summary: { count: mapped.length },
    };
  }

  private async refundReport() {
    const rows = await this.prisma.refund.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const mapped = rows.map((r) => ({
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      method: r.method ?? '',
      createdAt: r.createdAt,
      processedAt: r.processedAt,
    }));
    return {
      type: 'refund',
      columns: ['amount', 'reason', 'status', 'method', 'createdAt', 'processedAt'],
      rows: mapped,
      summary: {
        count: mapped.length,
        total: round2(
          mapped
            .filter((r) => r.status === 'PROCESSED')
            .reduce((s, r) => s + r.amount, 0),
        ),
      },
    };
  }

  private async payrollReport() {
    const rows = await this.prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });
    const mapped = rows.map((p) => ({
      employee: `${p.user.firstName} ${p.user.lastName}`,
      role: p.user.role,
      model: p.payrollModel ?? 'FIXED',
      classes: p.classesCount ?? 0,
      hours: p.hoursCount ?? 0,
      gross: Number(p.amount),
      bonus: Number(p.bonus),
      deductions: Number(p.deductions),
      net: Number(p.netAmount),
      status: p.status,
    }));
    return {
      type: 'payroll',
      columns: ['employee', 'role', 'model', 'classes', 'hours', 'gross', 'bonus', 'deductions', 'net', 'status'],
      rows: mapped,
      summary: {
        count: mapped.length,
        total: round2(mapped.reduce((s, r) => s + r.net, 0)),
      },
    };
  }

  private async expenseReport() {
    const rows = await this.prisma.expense.findMany({
      orderBy: { paymentDate: 'desc' },
      include: { category: { select: { name: true } } },
    });
    const mapped = rows.map((e) => ({
      title: e.title,
      category: e.category?.name ?? '',
      merchant: e.merchant ?? '',
      amount: Number(e.amount),
      status: e.status,
      paymentDate: e.paymentDate,
    }));
    return {
      type: 'expense',
      columns: ['title', 'category', 'merchant', 'amount', 'status', 'paymentDate'],
      rows: mapped,
      summary: {
        count: mapped.length,
        total: round2(
          mapped
            .filter((r) => r.status === 'APPROVED')
            .reduce((s, r) => s + r.amount, 0),
        ),
      },
    };
  }

  private async pnlReport() {
    // One currency, for the same reason as the dashboard: costs are only ever
    // in the reporting currency, so profit against revenue billed in another
    // would be subtracting units that were never comparable.
    const { currency } = await this.settings.getConfig();
    const months = this.monthsBack(12);
    const rows = await Promise.all(
      months.map(async (m) => {
        const [rev, exp, pay] = await Promise.all([
          this.paidSum({ paidAt: { gte: m.start, lte: m.end } }, currency),
          this.prisma.expense.aggregate({
            where: { status: 'APPROVED', paymentDate: { gte: m.start, lte: m.end } },
            _sum: { amount: true },
          }),
          this.prisma.payout.aggregate({
            where: { status: 'PAID', paymentDate: { gte: m.start, lte: m.end } },
            _sum: { netAmount: true },
          }),
        ]);
        const revenue = round2(rev);
        const expenses = round2(Number(exp._sum.amount || 0));
        const payroll = round2(Number(pay._sum.netAmount || 0));
        return {
          month: m.label,
          revenue,
          expenses,
          payroll,
          profit: round2(revenue - expenses - payroll),
        };
      }),
    );
    return {
      type: 'pnl',
      currency,
      columns: ['month', 'revenue', 'expenses', 'payroll', 'profit'],
      rows,
      summary: {
        revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
        expenses: round2(rows.reduce((s, r) => s + r.expenses + r.payroll, 0)),
        profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
      },
    };
  }

  private async studentsReport(kind: 'paid' | 'pending' | 'overdue') {
    const statusFilter =
      kind === 'paid'
        ? { status: 'PAID' as never }
        : kind === 'overdue'
          ? { status: 'OVERDUE' as never }
          : { status: { in: ['SENT', 'PENDING', 'PARTIALLY_PAID'] as never } };
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId: { not: null }, ...statusFilter },
      include: {
        student: {
          select: {
            studentCode: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
    const rows = invoices.map((i) => ({
      student: i.student?.user
        ? `${i.student.user.firstName} ${i.student.user.lastName}`
        : '',
      code: i.student?.studentCode ?? '',
      invoice: i.number,
      amount: Number(i.amount),
      paid: Number(i.paidAmount),
      balance: round2(Number(i.amount) - Number(i.paidAmount)),
      status: i.status,
      dueAt: i.dueAt,
    }));
    return {
      type: `${kind}-students`,
      columns: ['student', 'code', 'invoice', 'amount', 'paid', 'balance', 'status', 'dueAt'],
      rows,
      summary: { count: rows.length },
    };
  }

  private async topCoursesReport() {
    const courseWise = await this.courseWiseRevenue();
    return {
      type: 'top-courses',
      columns: ['label', 'amount'],
      rows: courseWise,
      summary: { count: courseWise.length },
    };
  }

  private async countryReport() {
    const countryWise = await this.countryWiseRevenue();
    return {
      type: 'country-revenue',
      columns: ['label', 'amount'],
      rows: countryWise,
      summary: { count: countryWise.length },
    };
  }
}
