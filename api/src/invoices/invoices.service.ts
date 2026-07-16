import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto, ListInvoicesDto, UpdateInvoiceDto } from './dto';
import type { Prisma } from '../generated/prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListInvoicesDto) {
    const { page, limit, search, status, sortBy } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      ...(status ? { status } : {}),
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
    if (sortBy === 'amount-desc') {
      orderBy = { amount: 'desc' };
    } else if (sortBy === 'amount-asc') {
      orderBy = { amount: 'asc' };
    } else if (sortBy === 'date-asc') {
      orderBy = { issuedAt: 'asc' };
    } else if (sortBy === 'id-asc') {
      orderBy = { number: 'asc' };
    }

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          student: {
            select: {
              id: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async create(dto: CreateInvoiceDto) {
    // Verify student exists
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentId },
    });
    if (!student) {
      throw new NotFoundException(`Student profile with ID ${dto.studentId} not found.`);
    }

    return this.prisma.invoice.create({
      data: {
        number: dto.number,
        studentId: dto.studentId,
        amount: dto.amount,
        status: dto.status || 'DRAFT',
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
      include: {
        student: {
          select: {
            id: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found.`);
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        amount: dto.amount,
        status: dto.status,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: {
        student: {
          select: {
            id: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async delete(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found.`);
    }

    return this.prisma.invoice.delete({
      where: { id },
    });
  }
}
