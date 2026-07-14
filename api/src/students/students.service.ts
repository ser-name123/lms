import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type { CreateStudentDto, ListStudentsDto, UpdateStudentDto } from './dto';

const PROFILE_SELECT = {
  id: true,
  studentCode: true,
  phone: true,
  guardianName: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      country: true,
      status: true,
      avatarUrl: true,
      createdAt: true,
    },
  },
  enrollments: {
    select: {
      id: true,
      status: true,
      progress: true,
      course: { select: { id: true, title: true } },
      teacher: {
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
      },
    },
  },
} satisfies Prisma.StudentProfileSelect;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list({ page, limit, search, status }: ListStudentsDto) {
    const where: Prisma.StudentProfileWhereInput = {
      ...(status ? { enrollments: { some: { status } } } : {}),
      ...(search
        ? {
            OR: [
              { studentCode: { contains: search, mode: 'insensitive' } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { user: { firstName: { contains: search, mode: 'insensitive' } } },
              { user: { lastName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    // One round trip for the page and its total, so they cannot disagree.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.studentProfile.findMany({
        where,
        select: PROFILE_SELECT,
        orderBy: { user: { createdAt: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });

    if (!student) throw new NotFoundException(`Student ${id} not found`);
    return student;
  }

  async create(dto: CreateStudentDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('That email is already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.studentProfile.create({
      data: {
        studentCode: await this.nextStudentCode(),
        phone: dto.phone,
        guardianName: dto.guardianName,
        user: {
          create: {
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            country: dto.country,
            role: Role.STUDENT,
          },
        },
      },
      select: PROFILE_SELECT,
    });
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);

    return this.prisma.studentProfile.update({
      where: { id },
      data: {
        phone: dto.phone,
        guardianName: dto.guardianName,
        user: {
          update: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            country: dto.country,
          },
        },
      },
      select: PROFILE_SELECT,
    });
  }

  async remove(id: string) {
    const student = await this.findOne(id);
    // The profile cascades from the user, so deleting the user is enough.
    await this.prisma.user.delete({ where: { id: student.user.id } });
  }

  private async nextStudentCode() {
    const count = await this.prisma.studentProfile.count();
    return `ST-${String(count + 1).padStart(5, '0')}`;
  }
}
