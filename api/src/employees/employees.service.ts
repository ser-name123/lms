import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { Role, UserStatus } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type { CreateEmployeeDto, ListEmployeesDto, UpdateEmployeeDto } from './dto';

const EMPLOYEE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  country: true,
  timezone: true,
  avatarUrl: true,
  phone: true,
  gender: true,
  joiningDate: true,
  salary: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListEmployeesDto) {
    const { page, limit, search, role, status, sortBy } = dto;

    const employeeRoles = [Role.SUPERVISOR, Role.ACADEMIC_COACH];
    const where: Prisma.UserWhereInput = {
      role: role && (employeeRoles as any[]).includes(role) ? role : { in: employeeRoles },
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy) {
      if (sortBy === 'name_asc') orderBy = { firstName: 'asc' };
      else if (sortBy === 'name_desc') orderBy = { firstName: 'desc' };
      else if (sortBy === 'salary_asc') orderBy = { salary: 'asc' };
      else if (sortBy === 'salary_desc') orderBy = { salary: 'desc' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: string) {
    const employeeRoles = [Role.SUPERVISOR, Role.ACADEMIC_COACH];
    const employee = await this.prisma.user.findFirst({
      where: {
        id,
        role: { in: employeeRoles },
      },
      select: EMPLOYEE_SELECT,
    });

    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('That email is already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        status: dto.status ?? UserStatus.ACTIVE,
        country: dto.country,
        timezone: dto.timezone,
        phone: dto.phone,
        gender: dto.gender,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null,
        salary: dto.salary,
      },
      select: EMPLOYEE_SELECT,
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);

    const data: Prisma.UserUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      role: dto.role,
      status: dto.status,
      country: dto.country,
      timezone: dto.timezone,
      phone: dto.phone,
      gender: dto.gender,
      joiningDate: dto.joiningDate !== undefined ? (dto.joiningDate ? new Date(dto.joiningDate) : null) : undefined,
      salary: dto.salary,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: EMPLOYEE_SELECT,
    });
  }

  async remove(id: string) {
    const employee = await this.findOne(id);
    await this.prisma.user.delete({ where: { id: employee.id } });
  }

  async getSessions(id: string) {
    await this.findOne(id);
    return this.prisma.refreshToken.findMany({
      where: {
        userId: id,
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
    await this.findOne(id);
    await this.prisma.refreshToken.deleteMany({
      where: { id: sessionId, userId: id },
    });
  }

  async getStats() {
    const employeeRoles = [Role.SUPERVISOR, Role.ACADEMIC_COACH];
    
    const [total, active, inactive, pending, totalSalary, adminsCount, supervisorsCount, coachesCount] = await Promise.all([
      this.prisma.user.count({ where: { role: { in: employeeRoles } } }),
      this.prisma.user.count({ where: { role: { in: employeeRoles }, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: { in: employeeRoles }, status: 'INACTIVE' } }),
      this.prisma.user.count({ where: { role: { in: employeeRoles }, status: 'PENDING' } }),
      this.prisma.user.aggregate({
        where: { role: { in: employeeRoles } },
        _sum: { salary: true },
      }),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
      this.prisma.user.count({ where: { role: Role.SUPERVISOR } }),
      this.prisma.user.count({ where: { role: Role.ACADEMIC_COACH } }),
    ]);

    const countryGroups = await this.prisma.user.groupBy({
      by: ['country'],
      where: { role: { in: employeeRoles }, country: { not: null } },
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
      totalSalary: Number(totalSalary._sum.salary || 0),
      adminsCount,
      supervisorsCount,
      coachesCount,
      countries,
    };
  }
}
