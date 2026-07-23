import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto, ListTeachersDto, UpdateTeacherDto } from './dto';
import { Role, UserStatus } from '../generated/prisma/enums';
import { retryOnUniqueClash } from '../common/retry-unique';

const TEACHER_SELECT = {
  id: true,
  teacherCode: true,
  specialisation: true,
  subjects: true,
  archived: true,
  hourlyRate: true,
  bio: true,
  courseId: true,
  course: {
    select: {
      id: true,
      title: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      country: true,
      timezone: true,
      status: true,
      avatarUrl: true,
      createdAt: true,
      lastLoginAt: true,
    },
  },
  _count: {
    select: {
      enrollments: true,
      classes: true,
    },
  },
};

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTeachersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 8;
    const { search, status, specialisation, sortBy } = query;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      user: {
        role: Role.TEACHER,
      },
    };

    if (search) {
      whereClause.OR = [
        {
          user: {
            firstName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          user: {
            lastName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          user: {
            email: { contains: search, mode: 'insensitive' },
          },
        },
        {
          teacherCode: { contains: search, mode: 'insensitive' },
        },
      ];
    }

    if (status) {
      whereClause.user.status = status;
    }

    if (specialisation) {
      whereClause.specialisation = {
        contains: specialisation,
        mode: 'insensitive',
      };
    }

    let orderByClause: any = { teacherCode: 'asc' };
    if (sortBy) {
      if (sortBy === 'name_asc') {
        orderByClause = { user: { firstName: 'asc' } };
      } else if (sortBy === 'name_desc') {
        orderByClause = { user: { firstName: 'desc' } };
      } else if (sortBy === 'rate_asc') {
        orderByClause = { hourlyRate: 'asc' };
      } else if (sortBy === 'rate_desc') {
        orderByClause = { hourlyRate: 'desc' };
      } else if (sortBy === 'date_asc') {
        orderByClause = { user: { createdAt: 'asc' } };
      } else if (sortBy === 'date_desc') {
        orderByClause = { user: { createdAt: 'desc' } };
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.teacherProfile.findMany({
        where: whereClause,
        select: TEACHER_SELECT,
        skip,
        take: limit,
        orderBy: orderByClause,
      }),
      this.prisma.teacherProfile.count({
        where: whereClause,
      }),
    ]);

    // Map Decimal to Number for UI response cleanliness
    const formattedItems = items.map((item) => ({
      ...item,
      hourlyRate: item.hourlyRate ? Number(item.hourlyRate) : null,
    }));

    return {
      items: formattedItems,
      meta: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      select: TEACHER_SELECT,
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with profile ID ${id} not found`);
    }

    return {
      ...teacher,
      hourlyRate: teacher.hourlyRate ? Number(teacher.hourlyRate) : null,
    };
  }

  async create(dto: CreateTeacherDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        'A user with that email is already registered',
      );
    }

    const rawPassword = dto.password || 'teacher123';
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    // nextTeacherCode() reads the highest code and adds one, so two creates
    // landing together compute the same code and one dies on the unique index.
    // The same index is also written by teacher-registration activation, so the
    // two paths can collide with each other, not just with themselves.
    const newProfile = await retryOnUniqueClash('teacherCode', async () => {
      // Recomputed per attempt: the retry only helps if it re-reads the code
      // the winning transaction just committed.
      const teacherCode = await this.nextTeacherCode();

      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: Role.TEACHER,
            country: dto.country || null,
            timezone: dto.timezone || null,
            status: UserStatus.ACTIVE,
          },
        });

        return tx.teacherProfile.create({
          data: {
            teacherCode,
            specialisation: dto.specialisation || null,
            hourlyRate: dto.hourlyRate || null,
            bio: dto.bio || null,
            courseId: dto.courseId || null,
            subjects: dto.subjects || [],
            userId: user.id,
          },
          select: TEACHER_SELECT,
        });
      });
    });

    return {
      ...newProfile,
      hourlyRate: newProfile.hourlyRate ? Number(newProfile.hourlyRate) : null,
    };
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!teacher) {
      throw new NotFoundException(`Teacher with profile ID ${id} not found`);
    }

    const updatedProfile = await this.prisma.$transaction(async (tx) => {
      const userData: any = {
        firstName: dto.firstName,
        lastName: dto.lastName,
        country: dto.country,
        timezone: dto.timezone,
        status: dto.status,
      };

      if (dto.password) {
        userData.passwordHash = await bcrypt.hash(dto.password, 12);
      }

      await tx.user.update({
        where: { id: teacher.userId },
        data: userData,
      });

      return tx.teacherProfile.update({
        where: { id },
        data: {
          specialisation: dto.specialisation,
          hourlyRate: dto.hourlyRate,
          bio: dto.bio,
          courseId: dto.courseId === undefined ? undefined : (dto.courseId || null),
          subjects: dto.subjects,
        },
        select: TEACHER_SELECT,
      });
    });

    return {
      ...updatedProfile,
      hourlyRate: updatedProfile.hourlyRate
        ? Number(updatedProfile.hourlyRate)
        : null,
    };
  }

  async remove(id: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!teacher) {
      throw new NotFoundException(`Teacher with profile ID ${id} not found`);
    }

    await this.prisma.user.delete({
      where: { id: teacher.userId },
    });

    return { success: true };
  }

  async getStats() {
    const [total, active, inactive, pending, other] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.TEACHER } }),
      this.prisma.user.count({
        where: { role: Role.TEACHER, status: UserStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { role: Role.TEACHER, status: UserStatus.INACTIVE },
      }),
      this.prisma.user.count({
        where: { role: Role.TEACHER, status: UserStatus.PENDING },
      }),
      this.prisma.user.count({
        where: {
          role: Role.TEACHER,
          status: {
            notIn: [UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.PENDING],
          },
        },
      }),
    ]);

    // Group countries
    const users = await this.prisma.user.findMany({
      where: { role: Role.TEACHER, country: { not: null } },
      select: { country: true },
    });

    const countryMap = new Map<string, number>();
    users.forEach((u) => {
      const c = u.country || 'Unknown';
      countryMap.set(c, (countryMap.get(c) || 0) + 1);
    });

    const countries = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    // Group specialisations
    const profiles = await this.prisma.teacherProfile.findMany({
      select: { specialisation: true },
    });

    const specMap = new Map<string, number>();
    profiles.forEach((p) => {
      const spec = p.specialisation || 'Quran';
      specMap.set(spec, (specMap.get(spec) || 0) + 1);
    });

    const specialisations = Array.from(specMap.entries()).map(
      ([spec, count]) => ({
        specialisation: spec,
        count,
      }),
    );

    return {
      total,
      active,
      inactive: inactive + pending + other, // map anything non-active to inactive for chart visual match
      onLeave: pending + other, // mock on-leave status for display
      countries,
      specialisations,
    };
  }

  async getSessions(id: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!teacher) throw new NotFoundException(`Teacher not found`);

    return this.prisma.refreshToken.findMany({
      where: { userId: teacher.userId, revokedAt: null },
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
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!teacher) throw new NotFoundException(`Teacher not found`);

    await this.prisma.refreshToken.update({
      where: { id: sessionId, userId: teacher.userId },
      data: { revokedAt: new Date() },
    });
  }

  private async nextTeacherCode(): Promise<string> {
    const last = await this.prisma.teacherProfile.findFirst({
      orderBy: { teacherCode: 'desc' },
      select: { teacherCode: true },
    });

    if (!last || !last.teacherCode) {
      return 'TR-00001';
    }

    const num = parseInt(last.teacherCode.replace('TR-', ''), 10);
    return `TR-${String(num + 1).padStart(5, '0')}`;
  }
}
