import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import {
  AssignFeePlanDto,
  CreateFeePlanDto,
  ListFeePlansDto,
  UpdateAssignmentDto,
  UpdateFeePlanDto,
} from './dto';
import { addMonths, cycleMonths } from './finance.config';
import { BillingService } from './billing.service';

@Injectable()
export class FeePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // ── Plans ─────────────────────────────────────────────────────────────────
  async list(dto: ListFeePlansDto) {
    const { page = 1, limit = 20, search, active } = dto;
    const where: Prisma.FeePlanWhereInput = {
      ...(active === 'true' ? { active: true } : {}),
      ...(active === 'false' ? { active: false } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.feePlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          components: true,
          _count: { select: { assignments: true } },
        },
      }),
      this.prisma.feePlan.count({ where }),
    ]);
    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getOne(id: string) {
    const plan = await this.prisma.feePlan.findUnique({
      where: { id },
      include: { components: true },
    });
    if (!plan) throw new NotFoundException(`Fee plan ${id} not found`);
    return plan;
  }

  async create(dto: CreateFeePlanDto) {
    if (!dto.components?.length) {
      throw new BadRequestException('A fee plan needs at least one component.');
    }
    return this.prisma.feePlan.create({
      data: {
        name: dto.name,
        cycle: dto.cycle,
        courseId: dto.courseId ?? null,
        description: dto.description ?? null,
        active: dto.active ?? true,
        components: {
          create: dto.components.map((c) => ({
            type: c.type,
            label: c.label,
            amountUSD: c.amountUSD,
            amountAED: c.amountAED ?? null,
            amountGBP: c.amountGBP ?? null,
          })),
        },
      },
      include: { components: true },
    });
  }

  async update(id: string, dto: UpdateFeePlanDto) {
    await this.getOne(id);
    // Components are replaced wholesale when supplied.
    return this.prisma.$transaction(async (tx) => {
      if (dto.components) {
        await tx.feePlanComponent.deleteMany({ where: { planId: id } });
      }
      return tx.feePlan.update({
        where: { id },
        data: {
          name: dto.name,
          cycle: dto.cycle,
          courseId: dto.courseId,
          description: dto.description,
          active: dto.active,
          ...(dto.components
            ? {
                components: {
                  create: dto.components.map((c) => ({
                    type: c.type,
                    label: c.label,
                    amountUSD: c.amountUSD,
            amountAED: c.amountAED ?? null,
            amountGBP: c.amountGBP ?? null,
                  })),
                },
              }
            : {}),
        },
        include: { components: true },
      });
    });
  }

  async remove(id: string) {
    await this.getOne(id);
    return this.prisma.feePlan.update({
      where: { id },
      data: { active: false },
    });
  }

  // ── Student assignments ─────────────────────────────────────────────────────
  async assignments(studentId?: string) {
    const where: Prisma.StudentFeeAssignmentWhereInput = {
      ...(studentId ? { studentId } : {}),
    };
    const rows = await this.prisma.studentFeeAssignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { include: { components: true } },
        student: {
          select: {
            id: true,
            studentCode: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    return { items: rows };
  }

  async assign(dto: AssignFeePlanDto) {
    const [student, plan] = await Promise.all([
      this.prisma.studentProfile.findUnique({
        where: { id: dto.studentId },
        select: { id: true },
      }),
      this.prisma.feePlan.findUnique({
        where: { id: dto.planId },
        select: { id: true, cycle: true },
      }),
    ]);
    if (!student) throw new NotFoundException('Student not found');
    if (!plan) throw new NotFoundException('Fee plan not found');

    const start = dto.startDate ? new Date(dto.startDate) : new Date();
    const months = cycleMonths(plan.cycle);
    // Recurring plans schedule the next run; one-time plans do not.
    const nextRunAt = months > 0 ? addMonths(start, months) : null;

    const assignment = await this.prisma.studentFeeAssignment.create({
      data: {
        studentId: dto.studentId,
        planId: dto.planId,
        startDate: start,
        nextRunAt,
        autoGenerate: dto.autoGenerate ?? true,
        discountId: dto.discountId ?? null,
        notes: dto.notes ?? null,
      },
    });

    let invoice: { id: string; number: string } | null = null;
    if (dto.generateNow) {
      const inv = await this.billing.generateForAssignment(assignment.id, start);
      invoice = inv ? { id: inv.id, number: inv.number } : null;
    }
    return { assignment, invoice };
  }

  async updateAssignment(id: string, dto: UpdateAssignmentDto) {
    const existing = await this.prisma.studentFeeAssignment.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    return this.prisma.studentFeeAssignment.update({
      where: { id },
      data: {
        active: dto.active,
        autoGenerate: dto.autoGenerate,
        discountId: dto.discountId,
        nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
        notes: dto.notes,
      },
    });
  }

  async removeAssignment(id: string) {
    const existing = await this.prisma.studentFeeAssignment.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.prisma.studentFeeAssignment.delete({ where: { id } });
    return { success: true };
  }
}
