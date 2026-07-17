import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { CreateDiscountDto, UpdateDiscountDto } from './dto';

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string, active?: string) {
    const where: Prisma.DiscountWhereInput = {
      ...(active === 'true' ? { active: true } : {}),
      ...(active === 'false' ? { active: false } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.discount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  async getOne(id: string) {
    const d = await this.prisma.discount.findUnique({ where: { id } });
    if (!d) throw new NotFoundException(`Discount ${id} not found`);
    return d;
  }

  async create(dto: CreateDiscountDto) {
    return this.prisma.discount.create({
      data: {
        code: dto.code?.trim() || null,
        name: dto.name,
        type: dto.type,
        value: dto.value,
        reason: dto.reason,
        description: dto.description ?? null,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateDiscountDto) {
    await this.getOne(id);
    return this.prisma.discount.update({
      where: { id },
      data: {
        code: dto.code === undefined ? undefined : dto.code?.trim() || null,
        name: dto.name,
        type: dto.type,
        value: dto.value,
        reason: dto.reason,
        description: dto.description,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    await this.getOne(id);
    // Soft-delete: keep historical references on invoices intact.
    return this.prisma.discount.update({
      where: { id },
      data: { active: false },
    });
  }
}
