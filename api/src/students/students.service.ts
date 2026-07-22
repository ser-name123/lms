import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { courseForCode } from '../common/catalogue-course';
import { currencyForCountry } from '../common/currency';
import {
  Role,
  EnrollmentStatus,
} from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type {
  CreateStudentDto,
  ListStudentsDto,
  UpdateStudentDto,
} from './dto';

const PROFILE_SELECT = {
  id: true,
  studentCode: true,
  phone: true,
  gender: true,
  guardianName: true,
  parentName: true,
  coachId: true,
  profession: true,
  fees: true,
  joiningDate: true,
  lastPaymentDate: true,
  nextPaymentDate: true,
  batches: { select: { batch: { select: { code: true, name: true } } }, take: 1 },
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
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      package: {
        select: { id: true, name: true, priceUSD: true, priceAED: true, priceGBP: true, classesPerMonth: true },
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
      batchId,
      coachId,
      trialConverted,
      country,
      joiningDateStart,
      joiningDateEnd,
      nextPaymentDateStart,
      nextPaymentDateEnd,
    } = dto;

    // "Trial converted" = the student profile is referenced by a converted lead.
    let convertedIds: string[] | undefined;
    if (trialConverted === 'true' || trialConverted === '1') {
      const leads = await this.prisma.lead.findMany({
        where: { convertedStudentId: { not: null } },
        select: { convertedStudentId: true },
      });
      convertedIds = leads.map((l) => l.convertedStudentId!).filter(Boolean);
    }

    const where: Prisma.StudentProfileWhereInput = {
      ...(status ? { user: { status } } : {}),
      ...(country
        ? { user: { country: { contains: country, mode: 'insensitive' } } }
        : {}),
      ...(courseId ? { enrollments: { some: { courseId } } } : {}),
      ...(teacherId ? { enrollments: { some: { teacherId } } } : {}),
      ...(batchId ? { batches: { some: { batchId } } } : {}),
      ...(coachId ? { coachId } : {}),
      ...(convertedIds ? { id: { in: convertedIds } } : {}),
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
              ...(nextPaymentDateStart
                ? { gte: new Date(nextPaymentDateStart) }
                : {}),
              ...(nextPaymentDateEnd
                ? { lte: new Date(nextPaymentDateEnd) }
                : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { studentCode: { contains: search, mode: 'insensitive' } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              {
                user: { firstName: { contains: search, mode: 'insensitive' } },
              },
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

    // Enrich the page with attendance% + coach name (two batched queries, no N+1).
    const ids = items.map((s) => s.id);
    const coachIds = [...new Set(items.map((s) => s.coachId).filter(Boolean) as string[])];
    const [attRows, coaches] = await Promise.all([
      ids.length
        ? this.prisma.classAttendee.groupBy({ by: ['studentId', 'status'], where: { studentId: { in: ids } }, _count: true })
        : Promise.resolve([] as { studentId: string; status: string | null; _count: number }[]),
      coachIds.length
        ? this.prisma.user.findMany({ where: { id: { in: coachIds } }, select: { id: true, firstName: true, lastName: true } })
        : Promise.resolve([] as { id: string; firstName: string; lastName: string }[]),
    ]);
    const coachName = new Map(coaches.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
    const attAcc = new Map<string, { present: number; denom: number }>();
    for (const r of attRows) {
      const s = r.status;
      if (s === 'EXCUSED' || s === 'LEAVE_APPROVED') continue;
      const cur = attAcc.get(r.studentId) ?? { present: 0, denom: 0 };
      cur.denom += r._count;
      if (s === 'PRESENT' || s === 'LATE') cur.present += r._count;
      attAcc.set(r.studentId, cur);
    }

    const enriched = items.map((s) => {
      const a = attAcc.get(s.id);
      return {
        ...s,
        coachName: s.coachId ? coachName.get(s.coachId) ?? null : null,
        batchCode: s.batches[0]?.batch.code ?? null,
        attendanceRate: a && a.denom ? Math.round((a.present / a.denom) * 100) : null,
      };
    });

    return {
      items: enriched,
      meta: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getCoursesList() {
    return this.prisma.course.findMany({
      select: { id: true, title: true },
    });
  }

  async getTeachersList() {
    return this.prisma.teacherProfile.findMany({
      select: {
        id: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
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
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new ConflictException('That email is already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Optional enrolment: validate the referenced teacher up front (clear error
    // instead of a foreign-key failure mid-transaction).
    if (dto.teacherId) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { id: dto.teacherId },
      });
      if (!teacher) {
        throw new NotFoundException(
          `Teacher profile with ID ${dto.teacherId} not found`,
        );
      }
    }

    const studentCode = await this.nextStudentCode();

    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.studentProfile.create({
        data: {
          studentCode,
          // From the country on the account: UAE bills in dirhams, the UK in
          // pounds, everyone else in dollars.
          billingCurrency: currencyForCountry(dto.country),
          phone: dto.phone,
          gender: dto.gender,
          guardianName: dto.guardianName,
          profession: dto.profession,
          fees: dto.fees,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null,
          lastPaymentDate: dto.lastPaymentDate
            ? new Date(dto.lastPaymentDate)
            : null,
          nextPaymentDate: dto.nextPaymentDate
            ? new Date(dto.nextPaymentDate)
            : null,
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
        select: { id: true },
      });

      // If a course was chosen, enrol the student. The catalogue lives in
      // LmsCourse; enrolments need the relational Course of the same id.
      if (dto.courseCode) {
        const course = await courseForCode(tx, dto.courseCode);
        if (!course) {
          throw new NotFoundException(
            `Course with code ${dto.courseCode} not found`,
          );
        }

        await tx.enrollment.create({
          data: {
            studentId: profile.id,
            courseId: course.id,
            teacherId: dto.teacherId ?? null,
            packageId: dto.packageId ?? null,
            status: EnrollmentStatus.ACTIVE,
            startedAt: new Date(),
          },
        });
      }

      return profile;
    });

    return this.findOne(created.id);
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);

    if (dto.teacherId) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { id: dto.teacherId },
      });
      if (!teacher) {
        throw new NotFoundException(
          `Teacher profile with ID ${dto.teacherId} not found`,
        );
      }
    }

    const userUpdate: any = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      country: dto.country,
      status: dto.status,
    };

    if (dto.password) {
      userUpdate.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.studentProfile.update({
        where: { id },
        data: {
          phone: dto.phone,
          gender: dto.gender,
          guardianName: dto.guardianName,
          profession: dto.profession,
          fees: dto.fees,
          joiningDate:
            dto.joiningDate !== undefined
              ? dto.joiningDate
                ? new Date(dto.joiningDate)
                : null
              : undefined,
          lastPaymentDate:
            dto.lastPaymentDate !== undefined
              ? dto.lastPaymentDate
                ? new Date(dto.lastPaymentDate)
                : null
              : undefined,
          nextPaymentDate:
            dto.nextPaymentDate !== undefined
              ? dto.nextPaymentDate
                ? new Date(dto.nextPaymentDate)
                : null
              : undefined,
          user: {
            update: userUpdate,
          },
        },
      });

      // Optional enrolment change: assign/update the course + teacher. Existing
      // enrolment for the same course → update its teacher; otherwise create a
      // new one. Other enrolments are left untouched.
      if (dto.courseCode) {
        const course = await courseForCode(tx, dto.courseCode);
        if (!course) {
          throw new NotFoundException(
            `Course with code ${dto.courseCode} not found`,
          );
        }

        const existing = await tx.enrollment.findUnique({
          where: {
            studentId_courseId: { studentId: id, courseId: course.id },
          },
        });
        if (existing) {
          await tx.enrollment.update({
            where: { id: existing.id },
            data: {
              teacherId: dto.teacherId ?? null,
              // Left alone when the form did not send one, so editing a
              // student's teacher does not silently drop their package.
              packageId: dto.packageId ?? undefined,
            },
          });
        } else {
          await tx.enrollment.create({
            data: {
              studentId: id,
              courseId: course.id,
              teacherId: dto.teacherId ?? null,
              packageId: dto.packageId ?? null,
              status: EnrollmentStatus.ACTIVE,
              startedAt: new Date(),
            },
          });
        }
      }
    });

    return this.findOne(id);
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
    const [total, active, inactive, pending, trial, paused, male, female] =
      await Promise.all([
        this.prisma.studentProfile.count(),
        this.prisma.studentProfile.count({
          where: { user: { status: 'ACTIVE' } },
        }),
        this.prisma.studentProfile.count({
          where: { user: { status: 'INACTIVE' } },
        }),
        this.prisma.studentProfile.count({
          where: { user: { status: 'PENDING' } },
        }),
        this.prisma.studentProfile.count({
          where: { user: { status: 'TRIAL' } },
        }),
        this.prisma.studentProfile.count({
          where: { user: { status: 'PAUSED' } },
        }),
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
