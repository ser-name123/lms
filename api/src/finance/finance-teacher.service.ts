import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CURRENCY } from '../common/currency';
import { round2 } from './finance.config';

@Injectable()
export class FinanceTeacherService {
  constructor(private readonly prisma: PrismaService) {}

  /** Payroll-only view for the signed-in teacher (no fee/collection data). */
  async dashboard(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [payouts, config, currentMonth] = await Promise.all([
      this.prisma.payout.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 24,
      }),
      this.prisma.payrollConfig.findUnique({ where: { userId } }),
      this.prisma.payout.findFirst({
        where: { userId, billingPeriodStart: { gte: monthStart } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const latest = currentMonth ?? payouts[0] ?? null;
    const paidTotal = round2(
      payouts
        .filter((p) => p.status === 'PAID')
        .reduce((s, p) => s + Number(p.netAmount), 0),
    );

    return {
      cards: {
        currentMonthSalary: latest ? Number(latest.netAmount) : 0,
        classesConducted: latest?.classesCount ?? 0,
        hoursTaught: latest?.hoursCount ?? 0,
        bonus: latest ? Number(latest.bonus) : 0,
        deductions: latest ? Number(latest.deductions) : 0,
        netPay: latest ? Number(latest.netAmount) : 0,
        currency: latest?.currency ?? DEFAULT_CURRENCY,
        status: latest?.status ?? 'NONE',
        lifetimePaid: paidTotal,
      },
      payrollModel: config?.model ?? null,
      payslips: payouts.map((p) => ({
        id: p.id,
        payslipNo: p.payslipNo,
        period: {
          start: p.billingPeriodStart,
          end: p.billingPeriodEnd,
        },
        model: p.payrollModel ?? 'FIXED',
        classes: p.classesCount ?? 0,
        hours: p.hoursCount ?? 0,
        students: p.studentsCount ?? 0,
        gross: Number(p.amount),
        bonus: Number(p.bonus),
        deductions: Number(p.deductions),
        netAmount: Number(p.netAmount),
        // Every other money row in the system names its currency; a payslip did
        // not, so it was read as dollars whichever country the teacher is in.
        currency: p.currency,
        status: p.status,
        paymentDate: p.paymentDate,
        referenceNumber: p.referenceNumber,
      })),
    };
  }
}
