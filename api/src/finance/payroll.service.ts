import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currencyForCountry } from '../common/currency';
import { EmailsService } from '../emails/emails.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  Role,
  PayoutStatus,
  PayoutMethod,
  PayrollModel,
} from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { GeneratePayrollDto, UpsertPayrollConfigDto } from './dto';
import { formatDocNumber, round2 } from './finance.config';

const STAFF_ROLES = [Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER];

const PAYOUT_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

interface PayComputation {
  amount: number;
  model: PayrollModel;
  classesCount: number;
  hoursCount: number;
  studentsCount: number;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Config ──────────────────────────────────────────────────────────────────
  async listConfigs() {
    const [configs, staff] = await Promise.all([
      this.prisma.payrollConfig.findMany(),
      this.prisma.user.findMany({
        where: { role: { in: STAFF_ROLES }, status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          salary: true,
          teacherProfile: { select: { hourlyRate: true } },
        },
        orderBy: { firstName: 'asc' },
      }),
    ]);
    const byUser = new Map(configs.map((c) => [c.userId, c]));
    const items = staff.map((u) => ({
      user: {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
      },
      baseSalary: u.salary ? Number(u.salary) : null,
      hourlyRate: u.teacherProfile?.hourlyRate
        ? Number(u.teacherProfile.hourlyRate)
        : null,
      config: byUser.get(u.id) ?? null,
    }));
    return { items };
  }

  async upsertConfig(dto: UpsertPayrollConfigDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const data = {
      model: dto.model,
      baseSalary: dto.baseSalary ?? null,
      perClassRate: dto.perClassRate ?? null,
      perHourRate: dto.perHourRate ?? null,
      perStudentRate: dto.perStudentRate ?? null,
      standardBonus: dto.standardBonus ?? 0,
      active: dto.active ?? true,
    };
    return this.prisma.payrollConfig.upsert({
      where: { userId: dto.userId },
      update: data,
      create: { userId: dto.userId, ...data },
    });
  }

  async deleteConfig(userId: string) {
    await this.prisma.payrollConfig
      .delete({ where: { userId } })
      .catch(() => undefined);
    return { success: true };
  }

  // ── Metrics + computation ───────────────────────────────────────────────────
  private async teacherMetrics(teacherProfileId: string, start: Date, end: Date) {
    const sessions = await this.prisma.classSession.findMany({
      where: {
        teacherId: teacherProfileId,
        status: 'COMPLETED',
        startsAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        attendees: { select: { studentId: true } },
      },
    });
    let hours = 0;
    const students = new Set<string>();
    for (const s of sessions) {
      hours += Math.max(
        0,
        (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000,
      );
      s.attendees.forEach((a) => students.add(a.studentId));
    }
    return {
      classesCount: sessions.length,
      hoursCount: round2(hours),
      studentsCount: students.size,
    };
  }

  private async computePay(
    user: {
      id: string;
      role: Role;
      salary: Prisma.Decimal | null;
      teacherProfile: { id: string; hourlyRate: Prisma.Decimal | null } | null;
    },
    config: {
      model: PayrollModel;
      baseSalary: Prisma.Decimal | null;
      perClassRate: Prisma.Decimal | null;
      perHourRate: Prisma.Decimal | null;
      perStudentRate: Prisma.Decimal | null;
    } | null,
    start: Date,
    end: Date,
  ): Promise<PayComputation> {
    const metrics = user.teacherProfile
      ? await this.teacherMetrics(user.teacherProfile.id, start, end)
      : { classesCount: 0, hoursCount: 0, studentsCount: 0 };

    const model = config?.model ?? PayrollModel.FIXED;
    const base = Number(config?.baseSalary ?? user.salary ?? 0);
    const perClass = Number(config?.perClassRate ?? 0);
    const perHour = Number(
      config?.perHourRate ?? user.teacherProfile?.hourlyRate ?? 0,
    );
    const perStudent = Number(config?.perStudentRate ?? 0);

    let amount = 0;
    switch (model) {
      case PayrollModel.FIXED:
        amount = base;
        break;
      case PayrollModel.PER_CLASS:
        amount = perClass * metrics.classesCount;
        break;
      case PayrollModel.PER_HOUR:
        amount = perHour * metrics.hoursCount;
        break;
      case PayrollModel.PER_STUDENT:
        amount = perStudent * metrics.studentsCount;
        break;
      case PayrollModel.HYBRID:
        amount =
          base +
          perClass * metrics.classesCount +
          perHour * metrics.hoursCount +
          perStudent * metrics.studentsCount;
        break;
    }

    // Legacy fallback for un-configured teachers: hourlyRate × completed classes.
    if (amount === 0 && !config && user.teacherProfile) {
      amount = perHour * metrics.classesCount;
    }
    if (amount === 0) amount = base; // last resort

    return { amount: round2(amount), model, ...metrics };
  }

  // ── Generation ──────────────────────────────────────────────────────────────
  async generate(dto: GeneratePayrollDto) {
    const start = new Date(dto.billingPeriodStart);
    const end = new Date(dto.billingPeriodEnd);

    const [employees, configs] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { in: STAFF_ROLES }, status: 'ACTIVE' },
        select: {
          id: true,
          role: true,
          salary: true,
          // Their country decides the currency on the payslip: every other money
          // row names its currency, a payout named none and was read as dollars.
          country: true,
          teacherProfile: { select: { id: true, hourlyRate: true } },
        },
      }),
      this.prisma.payrollConfig.findMany({ where: { active: true } }),
    ]);
    const cfgByUser = new Map(configs.map((c) => [c.userId, c]));

    let generatedCount = 0;
    for (const emp of employees) {
      const existing = await this.prisma.payout.findFirst({
        where: {
          userId: emp.id,
          billingPeriodStart: start,
          billingPeriodEnd: end,
        },
      });
      if (existing) continue;

      const cfg = cfgByUser.get(emp.id) ?? null;
      const pay = await this.computePay(emp, cfg, start, end);
      const bonus = Number(cfg?.standardBonus ?? 0);
      const amount = pay.amount || 10; // safety floor mirrors legacy behaviour

      await this.prisma.payout.create({
        data: {
          userId: emp.id,
          amount,
          deductions: 0,
          bonus,
          netAmount: round2(amount + bonus),
          currency: currencyForCountry(emp.country),
          paymentMethod: PayoutMethod.BANK_TRANSFER,
          status: PayoutStatus.PENDING,
          billingPeriodStart: start,
          billingPeriodEnd: end,
          payrollModel: pay.model,
          classesCount: pay.classesCount,
          hoursCount: pay.hoursCount,
          studentsCount: pay.studentsCount,
          notes: `Payroll (${pay.model}) for ${start.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}.`,
        },
      });
      generatedCount++;
    }
    return { generatedCount };
  }

  // ── Payslip ─────────────────────────────────────────────────────────────────
  private async nextPayslipNo(): Promise<string> {
    const year = new Date().getFullYear();
    const stem = `PSL-${year}-`;
    const latest = await this.prisma.payout.findFirst({
      where: { payslipNo: { startsWith: stem } },
      orderBy: { payslipNo: 'desc' },
      select: { payslipNo: true },
    });
    const seq = latest?.payslipNo
      ? Number(latest.payslipNo.slice(stem.length)) + 1
      : 1;
    return formatDocNumber('PSL', year, seq);
  }

  async issuePayslip(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { user: { select: PAYOUT_USER_SELECT } },
    });
    if (!payout) throw new NotFoundException('Payout not found');

    const payslipNo = payout.payslipNo ?? (await this.nextPayslipNo());
    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { payslipNo },
      include: { user: { select: PAYOUT_USER_SELECT } },
    });

    const name = `${payout.user.firstName} ${payout.user.lastName}`;
    const period = `${payout.billingPeriodStart.toLocaleDateString('en-US')} – ${payout.billingPeriodEnd.toLocaleDateString('en-US')}`;
    const body =
      `Payslip ${payslipNo}\n\n` +
      `Employee: ${name}\nPeriod: ${period}\n` +
      `Model: ${payout.payrollModel ?? 'FIXED'}\n` +
      `Classes: ${payout.classesCount ?? 0} · Hours: ${payout.hoursCount ?? 0} · Students: ${payout.studentsCount ?? 0}\n` +
      `Gross: ${Number(payout.amount)}\nBonus: ${Number(payout.bonus)}\nDeductions: ${Number(payout.deductions)}\n` +
      `Net Pay: ${Number(payout.netAmount)}\nStatus: ${payout.status}`;

    await this.notifications.createFor(payout.userId, {
      type: 'PAYSLIP_ISSUED',
      title: `Payslip ${payslipNo}`,
      body: `Your payslip for ${period} is ready. Net pay: ${Number(payout.netAmount)}.`,
      link: '/teacher/payouts',
    });
    await this.emails
      .sendMail(payout.user.email, `Payslip ${payslipNo}`, body)
      .catch(() => undefined);

    return updated;
  }
}
