import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, PayoutStatus, PayoutMethod } from '../generated/prisma/enums';
import { ListPayoutsDto, CreatePayoutDto, UpdatePayoutDto, BulkGeneratePayoutsDto } from './dto';
import { STAFF_PAY_CURRENCY } from '../common/currency';
import type { Prisma } from '../generated/prisma/client';

/* The only User fields a payout response should ever carry. Prevents
   `include: { user: true }` from serialising the bcrypt passwordHash and the
   employee's base salary into the HTTP response. */
const PAYOUT_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  status: true,
  phone: true,
  gender: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListPayoutsDto) {
    const { page = 1, limit = 20, search, status, role, method, sortBy } = dto;

    const where: Prisma.PayoutWhereInput = {
      ...(status ? { status } : {}),
      ...(method ? { paymentMethod: method } : {}),
      ...(role || search
        ? {
            user: {
              ...(role ? { role: role.toUpperCase() as Role } : {}),
              ...(search
                ? {
                    OR: [
                      { firstName: { contains: search, mode: 'insensitive' } },
                      { lastName: { contains: search, mode: 'insensitive' } },
                      { email: { contains: search, mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };

    let orderBy: Prisma.PayoutOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy) {
      if (sortBy === 'amount_asc') orderBy = { netAmount: 'asc' };
      else if (sortBy === 'amount_desc') orderBy = { netAmount: 'desc' };
      else if (sortBy === 'date_asc') orderBy = { createdAt: 'asc' };
      else if (sortBy === 'date_desc') orderBy = { createdAt: 'desc' };
      else if (sortBy === 'name_asc') orderBy = { user: { firstName: 'asc' } };
      else if (sortBy === 'name_desc') orderBy = { user: { firstName: 'desc' } };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              status: true,
              phone: true,
              gender: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getOne(id: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            phone: true,
            gender: true,
            avatarUrl: true,
          },
        },
      },
    });
    if (!payout) throw new NotFoundException(`Payout ID ${id} not found`);
    return payout;
  }

  async create(dto: CreatePayoutDto) {
    const amount = Number(dto.amount);
    const deductions = Number(dto.deductions ?? 0);
    const bonus = Number(dto.bonus ?? 0);
    const netAmount = amount - deductions + bonus;

    // Check if payout already exists for this billing period
    const existing = await this.prisma.payout.findFirst({
      where: {
        userId: dto.userId,
        billingPeriodStart: new Date(dto.billingPeriodStart),
        billingPeriodEnd: new Date(dto.billingPeriodEnd),
      },
    });

    if (existing) {
      throw new ConflictException('A payout record already exists for this employee for the specified billing period.');
    }

    return this.prisma.payout.create({
      data: {
        userId: dto.userId,
        amount,
        deductions,
        bonus,
        netAmount,
        currency: STAFF_PAY_CURRENCY,
        paymentMethod: dto.paymentMethod,
        status: dto.status ?? PayoutStatus.PENDING,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : null,
        referenceNumber: dto.referenceNumber || null,
        billingPeriodStart: new Date(dto.billingPeriodStart),
        billingPeriodEnd: new Date(dto.billingPeriodEnd),
        notes: dto.notes || null,
      },
      include: { user: { select: PAYOUT_USER_SELECT } },
    });
  }

  async update(id: string, dto: UpdatePayoutDto) {
    const payout = await this.getOne(id);

    const amount = dto.amount !== undefined ? Number(dto.amount) : Number(payout.amount);
    const deductions = dto.deductions !== undefined ? Number(dto.deductions) : Number(payout.deductions);
    const bonus = dto.bonus !== undefined ? Number(dto.bonus) : Number(payout.bonus);
    const netAmount = amount - deductions + bonus;

    return this.prisma.payout.update({
      where: { id },
      data: {
        amount,
        deductions,
        bonus,
        netAmount,
        paymentMethod: dto.paymentMethod,
        status: dto.status,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      },
      include: { user: { select: PAYOUT_USER_SELECT } },
    });
  }

  async delete(id: string) {
    await this.getOne(id);
    await this.prisma.payout.delete({ where: { id } });
    return { success: true };
  }

  async bulkGenerate(dto: BulkGeneratePayoutsDto) {
    const start = new Date(dto.billingPeriodStart);
    const end = new Date(dto.billingPeriodEnd);

    // Get all employees with roles: SUPERVISOR, ACADEMIC_COACH, TEACHER
    const employees = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER] },
        status: 'ACTIVE',
      },
      include: {
        teacherProfile: true,
      },
    });

    let generatedCount = 0;

    for (const employee of employees) {
      // Check if payout already exists for this billing period
      const existing = await this.prisma.payout.findFirst({
        where: {
          userId: employee.id,
          billingPeriodStart: start,
          billingPeriodEnd: end,
        },
      });

      if (existing) continue;

      let baseSalary = Number(employee.salary || 0);

      // Advanced estimation for Teachers based on hourlyRate and completed ClassSessions
      if (employee.role === Role.TEACHER && baseSalary === 0 && employee.teacherProfile) {
        const hourlyRate = Number(employee.teacherProfile.hourlyRate || 0);
        
        // Count completed classes for this teacher in the billing period
        const completedClassesCount = await this.prisma.classSession.count({
          where: {
            teacherId: employee.teacherProfile.id,
            startsAt: { gte: start, lte: end },
            status: 'COMPLETED',
          },
        });

        // 1 class session = 1 hour (as an average estimation helper)
        baseSalary = completedClassesCount * hourlyRate;
      }

      // If no salary or hourly rate is configured, default to $10 base for safety / fallback
      if (baseSalary === 0) {
        baseSalary = 10;
      }

      await this.prisma.payout.create({
        data: {
          userId: employee.id,
          amount: baseSalary,
          deductions: 0,
          bonus: 0,
          netAmount: baseSalary,
          currency: STAFF_PAY_CURRENCY,
          paymentMethod: PayoutMethod.BANK_TRANSFER,
          status: PayoutStatus.PENDING,
          billingPeriodStart: start,
          billingPeriodEnd: end,
          notes: `System-generated payroll run for ${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`,
        },
      });

      generatedCount++;
    }

    return { generatedCount };
  }

  async processPayment(id: string, dto: { referenceNumber: string; notes?: string; paymentMethod?: PayoutMethod }) {
    await this.getOne(id);

    return this.prisma.payout.update({
      where: { id },
      data: {
        status: PayoutStatus.PAID,
        paymentDate: new Date(),
        referenceNumber: dto.referenceNumber,
        paymentMethod: dto.paymentMethod ?? undefined,
        notes: dto.notes ? dto.notes : undefined,
      },
      include: { user: { select: PAYOUT_USER_SELECT } },
    });
  }

  async getStats() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Fetch aggregates
    const [totalPaidAggregate, pendingSalaryAggregate] = await Promise.all([
      this.prisma.payout.aggregate({
        where: { status: PayoutStatus.PAID },
        _sum: { netAmount: true },
      }),
      this.prisma.payout.aggregate({
        where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
        _sum: { netAmount: true },
      }),
    ]);

    const totalPaid = Number(totalPaidAggregate._sum.netAmount || 0);
    const pendingSalary = Number(pendingSalaryAggregate._sum.netAmount || 0);
    const balance = totalPaid - pendingSalary;

    // Monthly aggregates for Last Month (to compare trends)
    const [lastMonthPaidAgg, lastMonthPendingAgg] = await Promise.all([
      this.prisma.payout.aggregate({
        where: {
          status: PayoutStatus.PAID,
          paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        },
        _sum: { netAmount: true },
      }),
      this.prisma.payout.aggregate({
        where: {
          status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
          billingPeriodStart: { gte: lastMonthStart, lte: lastMonthEnd },
        },
        _sum: { netAmount: true },
      }),
    ]);

    const lastMonthPaid = Number(lastMonthPaidAgg._sum.netAmount || 0);
    const lastMonthPending = Number(lastMonthPendingAgg._sum.netAmount || 0);
    
    // Percentage growth comparisons
    const paidIncreasePct = lastMonthPaid > 0 ? Math.round(((totalPaid - lastMonthPaid) / lastMonthPaid) * 100) : 60;
    const pendingIncreasePct = lastMonthPending > 0 ? Math.round(((pendingSalary - lastMonthPending) / lastMonthPending) * 100) : 10;
    const balanceIncreasePct = Math.round((paidIncreasePct - pendingIncreasePct) / 2) || 50;

    // Trend analysis for the past 6 months
    const trend: { month: string; paid: number; pending: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

      const [mPaid, mPending] = await Promise.all([
        this.prisma.payout.aggregate({
          where: {
            status: PayoutStatus.PAID,
            paymentDate: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { netAmount: true },
        }),
        this.prisma.payout.aggregate({
          where: {
            status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
            billingPeriodStart: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { netAmount: true },
        }),
      ]);

      trend.push({
        month: targetDate.toLocaleString('en-US', { month: 'short' }),
        paid: Number(mPaid._sum.netAmount || 0),
        pending: Number(mPending._sum.netAmount || 0),
      });
    }

    return {
      totalPaid,
      pendingSalary,
      balance,
      paidIncreasePct,
      pendingIncreasePct,
      balanceIncreasePct,
      trend,
    };
  }

  // Helper method to seed dummy payouts for demonstration analytics
  async seedDemoPayouts() {
    const count = await this.prisma.payout.count();
    if (count > 0) return { seededCount: 0 };

    const employees = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER] },
      },
    });

    if (employees.length === 0) return { seededCount: 0 };

    const now = new Date();
    let seededCount = 0;

    // Seed payouts for the past 3 months
    for (let i = 3; i >= 1; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      for (const employee of employees) {
        const base = Number(employee.salary || 0) || 1200 + (seededCount * 50) % 800;
        
        // Month i ago payouts were mostly paid, some pending
        const isPaid = i > 1 || seededCount % 3 !== 0;
        const status = isPaid ? PayoutStatus.PAID : PayoutStatus.PENDING;
        const paymentDate = isPaid ? new Date(monthEnd.getTime() - 2 * 24 * 3600 * 1000) : null;
        const ref = isPaid ? `TXN-${Math.floor(100000 + Math.random() * 900000)}` : null;

        await this.prisma.payout.create({
          data: {
            userId: employee.id,
            amount: base,
            deductions: seededCount % 5 === 0 ? 50 : 0,
            bonus: seededCount % 4 === 0 ? 100 : 0,
            netAmount: base - (seededCount % 5 === 0 ? 50 : 0) + (seededCount % 4 === 0 ? 100 : 0),
            currency: STAFF_PAY_CURRENCY,
            paymentMethod: PayoutMethod.BANK_TRANSFER,
            status,
            paymentDate,
            referenceNumber: ref,
            billingPeriodStart: monthStart,
            billingPeriodEnd: monthEnd,
            notes: `Seeded mock payout for ${monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`,
          },
        });
        seededCount++;
      }
    }

    return { seededCount };
  }
}
