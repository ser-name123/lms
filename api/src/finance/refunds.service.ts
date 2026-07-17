import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role, RefundStatus } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { CreateRefundDto, ListRefundsDto, ReviewRefundDto } from './dto';
import { round2 } from './finance.config';
import type { FinanceActor } from './scholarships.service';

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(dto: ListRefundsDto) {
    const { page = 1, limit = 20, status, search } = dto;
    const where: Prisma.RefundWhereInput = {
      ...(status ? { status: status as RefundStatus } : {}),
      ...(search
        ? { reason: { contains: search, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.refund.count({ where }),
    ]);

    // Resolve student names (plain-id studentId).
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean))] as string[];
    const students = studentIds.length
      ? await this.prisma.studentProfile.findMany({
          where: { id: { in: studentIds } },
          select: {
            id: true,
            studentCode: true,
            user: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const nameById = new Map(
      students.map((s) => [
        s.id,
        { name: `${s.user.firstName} ${s.user.lastName}`, code: s.studentCode },
      ]),
    );

    const items = rows.map((r) => ({
      ...r,
      student: r.studentId ? nameById.get(r.studentId) ?? null : null,
    }));
    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getOne(id: string) {
    const r = await this.prisma.refund.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`Refund ${id} not found`);
    return r;
  }

  async create(dto: CreateRefundDto, actor: FinanceActor) {
    // Resolve studentId from the invoice when not supplied.
    let studentId = dto.studentId ?? null;
    let currency = 'USD';
    if (dto.invoiceId) {
      const inv = await this.prisma.invoice.findUnique({
        where: { id: dto.invoiceId },
        select: { studentId: true, currency: true, paidAmount: true },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      studentId = studentId ?? inv.studentId;
      currency = inv.currency;
      if (dto.amount > Number(inv.paidAmount)) {
        throw new BadRequestException(
          'Refund cannot exceed the amount already paid on the invoice.',
        );
      }
    }

    const refund = await this.prisma.refund.create({
      data: {
        invoiceId: dto.invoiceId ?? null,
        paymentId: dto.paymentId ?? null,
        studentId,
        amount: dto.amount,
        currency,
        reason: dto.reason,
        method: dto.method ?? null,
        status: RefundStatus.REQUESTED,
        requestedById: actor.id ?? null,
        requestedByName: actor.name ?? null,
      },
    });

    await this.notifications.createForRoles([Role.ADMIN], {
      type: 'REFUND_REQUESTED',
      title: 'Refund requested',
      body: `A refund of ${currency} ${dto.amount} was requested.`,
      link: '/finance/refunds',
    });
    return refund;
  }

  async review(id: string, dto: ReviewRefundDto, actor: FinanceActor) {
    const refund = await this.getOne(id);
    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BadRequestException('Only a requested refund can be reviewed.');
    }
    const next =
      dto.status === 'APPROVED' ? RefundStatus.APPROVED : RefundStatus.REJECTED;
    return this.prisma.refund.update({
      where: { id },
      data: {
        status: next,
        approvedById: actor.id ?? null,
        approvedByName: actor.name ?? null,
        reviewNotes: dto.reviewNotes ?? null,
      },
    });
  }

  /** Mark an approved refund as processed and reflect it on the invoice/payment. */
  async process(id: string, actor: FinanceActor) {
    const refund = await this.getOne(id);
    if (refund.status !== RefundStatus.APPROVED) {
      throw new BadRequestException('Only an approved refund can be processed.');
    }

    return this.prisma.$transaction(async (tx) => {
      const processed = await tx.refund.update({
        where: { id },
        data: {
          status: RefundStatus.PROCESSED,
          processedAt: new Date(),
          approvedById: refund.approvedById ?? actor.id ?? null,
          approvedByName: refund.approvedByName ?? actor.name ?? null,
        },
      });

      if (refund.paymentId) {
        await tx.payment
          .update({
            where: { id: refund.paymentId },
            data: { status: 'REFUNDED' },
          })
          .catch(() => undefined);
      }

      if (refund.invoiceId) {
        const inv = await tx.invoice.findUnique({
          where: { id: refund.invoiceId },
          select: { paidAmount: true, amount: true },
        });
        if (inv) {
          const newPaid = round2(
            Math.max(0, Number(inv.paidAmount) - Number(refund.amount)),
          );
          await tx.invoice.update({
            where: { id: refund.invoiceId },
            data: {
              paidAmount: newPaid,
              status:
                newPaid <= 0
                  ? 'CANCELLED'
                  : newPaid < Number(inv.amount)
                    ? 'PARTIALLY_PAID'
                    : 'PAID',
            },
          });
        }
      }
      return processed;
    });
  }
}
