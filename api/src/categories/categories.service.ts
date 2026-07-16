import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(type?: string) {
    return this.prisma.category.findMany({
      where: type ? { type } : {},
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: { name: string; type: string }) {
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          type: dto.type,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Category with this name and type already exists');
      }
      throw error;
    }
  }

  async delete(id: string) {
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
