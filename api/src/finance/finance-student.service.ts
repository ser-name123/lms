import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { round2 } from './finance.config';

const OPEN_STATUSES = ['SENT', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE'];

@Injectable()
export class FinanceStudentService {
  constructor(private readonly prisma: PrismaService) {}

  private async studentId(userId: string): Promise<string> {
    const sp = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!sp) throw new NotFoundException('Student profile not found');
    return sp.id;
  }

  /** The signed-in student's full fee profile. */
  async dashboard(userId: string) {
    const studentId = await this.studentId(userId);
    const [invoices, receipts, scholarships, profile] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { studentId },
        orderBy: { issuedAt: 'desc' },
        include: { items: true, payments: { orderBy: { createdAt: 'desc' } } },
      }),
      this.prisma.receipt.findMany({
        where: { studentId },
        orderBy: { issuedAt: 'desc' },
        include: { invoice: { select: { number: true, periodLabel: true } } },
      }),
      this.prisma.scholarship.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentProfile.findUnique({
        where: { id: studentId },
        select: {
          fees: true,
          nextPaymentDate: true,
          lastPaymentDate: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const open = invoices.filter((i) => OPEN_STATUSES.includes(i.status));
    const outstanding = round2(
      open.reduce((s, i) => s + (Number(i.amount) - Number(i.paidAmount)), 0),
    );
    const totalPaid = round2(
      invoices.reduce((s, i) => s + Number(i.paidAmount), 0),
    );
    const nextDue = open
      .filter((i) => i.dueAt)
      .sort((a, b) => (a.dueAt!.getTime() - b.dueAt!.getTime()))[0];

    return {
      profile: {
        name: profile?.user
          ? `${profile.user.firstName} ${profile.user.lastName}`
          : '',
        lastPaymentDate: profile?.lastPaymentDate ?? null,
      },
      cards: {
        outstanding,
        totalPaid,
        nextDueDate: nextDue?.dueAt ?? profile?.nextPaymentDate ?? null,
        nextDueAmount: nextDue
          ? round2(Number(nextDue.amount) - Number(nextDue.paidAmount))
          : 0,
        openInvoices: open.length,
      },
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        periodLabel: i.periodLabel,
        currency: i.currency,
        amount: Number(i.amount),
        paidAmount: Number(i.paidAmount),
        balance: round2(Number(i.amount) - Number(i.paidAmount)),
        status: i.status,
        issuedAt: i.issuedAt,
        dueAt: i.dueAt,
        items: i.items.map((it) => ({
          type: it.type,
          label: it.label,
          amount: Number(it.amount),
        })),
      })),
      paymentHistory: invoices
        .flatMap((i) =>
          i.payments.map((p) => ({
            invoice: i.number,
            amount: Number(p.amount),
            method: p.method,
            status: p.status,
            paidAt: p.paidAt,
          })),
        )
        .sort(
          (a, b) =>
            (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0),
        ),
      receipts: receipts.map((r) => ({
        id: r.id,
        number: r.number,
        invoice: r.invoice?.number ?? '',
        amount: Number(r.amount),
        currency: r.currency,
        method: r.method,
        issuedAt: r.issuedAt,
      })),
      scholarships: scholarships.map((s) => ({
        name: s.name,
        type: s.type,
        value: Number(s.value),
        status: s.status,
      })),
    };
  }
}
