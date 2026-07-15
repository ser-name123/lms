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
  gender: true,
  guardianName: true,
  profession: true,
  fees: true,
  joiningDate: true,
  lastPaymentDate: true,
  nextPaymentDate: true,
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
      package: {
        select: { id: true, name: true, price: true, classesPerMonth: true },
      },
    },
  },
} satisfies Prisma.StudentProfileSelect;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListStudentsDto) {
    const { 
      page, 
      limit, 
      search, 
      status, 
      courseId, 
      teacherId, 
      country, 
      joiningDateStart, 
      joiningDateEnd, 
      nextPaymentDateStart, 
      nextPaymentDateEnd 
    } = dto;

    const where: Prisma.StudentProfileWhereInput = {
      ...(status ? { user: { status } } : {}),
      ...(country ? { user: { country: { contains: country, mode: 'insensitive' } } } : {}),
      ...(courseId ? { enrollments: { some: { courseId } } } : {}),
      ...(teacherId ? { enrollments: { some: { teacherId } } } : {}),
      ...(joiningDateStart || joiningDateEnd
        ? {
            joiningDate: {
              ...(joiningDateStart ? { gte: new Date(joiningDateStart) } : {}),
              ...(joiningDateEnd ? { lte: new Date(joiningDateEnd) } : {}),
            },
          }
        : {}),
      ...(nextPaymentDateStart || nextPaymentDateEnd
        ? {
            nextPaymentDate: {
              ...(nextPaymentDateStart ? { gte: new Date(nextPaymentDateStart) } : {}),
              ...(nextPaymentDateEnd ? { lte: new Date(nextPaymentDateEnd) } : {}),
            },
          }
        : {}),
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

  async getCoursesList() {
    return this.prisma.course.findMany({
      select: { id: true, title: true }
    });
  }

  async getTeachersList() {
    return this.prisma.teacherProfile.findMany({
      select: {
        id: true,
        user: { select: { firstName: true, lastName: true } }
      }
    });
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
        gender: dto.gender,
        guardianName: dto.guardianName,
        profession: dto.profession,
        fees: dto.fees,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null,
        lastPaymentDate: dto.lastPaymentDate ? new Date(dto.lastPaymentDate) : null,
        nextPaymentDate: dto.nextPaymentDate ? new Date(dto.nextPaymentDate) : null,
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

    const userUpdate: any = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      country: dto.country,
      status: dto.status,
    };

    if (dto.password) {
      userUpdate.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    return this.prisma.studentProfile.update({
      where: { id },
      data: {
        phone: dto.phone,
        gender: dto.gender,
        guardianName: dto.guardianName,
        profession: dto.profession,
        fees: dto.fees,
        joiningDate: dto.joiningDate !== undefined ? (dto.joiningDate ? new Date(dto.joiningDate) : null) : undefined,
        lastPaymentDate: dto.lastPaymentDate !== undefined ? (dto.lastPaymentDate ? new Date(dto.lastPaymentDate) : null) : undefined,
        nextPaymentDate: dto.nextPaymentDate !== undefined ? (dto.nextPaymentDate ? new Date(dto.nextPaymentDate) : null) : undefined,
        user: {
          update: userUpdate,
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

  async getSessions(id: string) {
    const student = await this.findOne(id);
    return this.prisma.refreshToken.findMany({
      where: {
        userId: student.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(id: string, sessionId: string) {
    const student = await this.findOne(id);
    await this.prisma.refreshToken.deleteMany({
      where: { id: sessionId, userId: student.user.id },
    });
  }

  async getStats() {
    const [total, active, inactive, pending, trial, paused, male, female] = await Promise.all([
      this.prisma.studentProfile.count(),
      this.prisma.studentProfile.count({ where: { user: { status: 'ACTIVE' } } }),
      this.prisma.studentProfile.count({ where: { user: { status: 'INACTIVE' } } }),
      this.prisma.studentProfile.count({ where: { user: { status: 'PENDING' } } }),
      this.prisma.studentProfile.count({ where: { user: { status: 'TRIAL' } } }),
      this.prisma.studentProfile.count({ where: { user: { status: 'PAUSED' } } }),
      this.prisma.studentProfile.count({ where: { gender: 'Male' } }),
      this.prisma.studentProfile.count({ where: { gender: 'Female' } }),
    ]);

    const countryGroups = await this.prisma.user.groupBy({
      by: ['country'],
      where: { role: 'STUDENT', country: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const countries = countryGroups.map((g) => ({
      country: g.country ?? 'Unknown',
      count: g._count.id,
    }));

    return {
      total,
      active,
      inactive,
      pending,
      trial,
      paused,
      male,
      female,
      countries,
    };
  }

  private async nextStudentCode() {
    const count = await this.prisma.studentProfile.count();
    return `ST-${String(count + 1).padStart(5, '0')}`;
  }
}
