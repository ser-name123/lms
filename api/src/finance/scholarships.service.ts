import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { ScholarshipStatus } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import {
  CreateScholarshipDto,
  ListScholarshipsDto,
  ReviewScholarshipDto,
} from './dto';

export interface FinanceActor {
  id?: string;
  name?: string;
}

@Injectable()
export class ScholarshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
  ) {}

  private studentInclude = {
    student: {
      select: {
        id: true,
        studentCode: true,
        parentEmail: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    },
  } satisfies Prisma.ScholarshipInclude;

  async list(dto: ListScholarshipsDto) {
    const { page = 1, limit = 20, status, search } = dto;
    const where: Prisma.ScholarshipWhereInput = {
      ...(status ? { status: status as ScholarshipStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
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
    const [items, total] = await Promise.all([
      this.prisma.scholarship.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.studentInclude,
      }),
      this.prisma.scholarship.count({ where }),
    ]);
    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getOne(id: string) {
    const s = await this.prisma.scholarship.findUnique({
      where: { id },
      include: this.studentInclude,
    });
    if (!s) throw new NotFoundException(`Scholarship ${id} not found`);
    return s;
  }

  async create(dto: CreateScholarshipDto, actor: FinanceActor) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const created = await this.prisma.scholarship.create({
      data: {
        studentId: dto.studentId,
        name: dto.name,
        type: dto.type,
        value: dto.value,
        reason: dto.reason ?? null,
        status: ScholarshipStatus.REQUESTED,
        requestedById: actor.id ?? null,
        requestedByName: actor.name ?? null,
      },
      include: this.studentInclude,
    });
    return created;
  }

  async review(id: string, dto: ReviewScholarshipDto, actor: FinanceActor) {
    const scholarship = await this.getOne(id);
    const next =
      dto.status === 'APPROVED'
        ? ScholarshipStatus.APPROVED
        : ScholarshipStatus.REJECTED;

    const updated = await this.prisma.scholarship.update({
      where: { id },
      data: {
        status: next,
        reviewedById: actor.id ?? null,
        reviewedByName: actor.name ?? null,
        reviewNotes: dto.reviewNotes ?? null,
      },
      include: this.studentInclude,
    });

    // Notify the student (+ parent email) of the decision.
    const studentUserId = scholarship.student?.user?.id;
    const label =
      next === ScholarshipStatus.APPROVED ? 'approved' : 'declined';
    if (studentUserId) {
      await this.notifications.createFor(studentUserId, {
        type: 'SCHOLARSHIP_REVIEWED',
        title: `Scholarship ${label}`,
        body: `Your "${scholarship.name}" scholarship request was ${label}.`,
        link: '/student/invoices',
      });
    }
    const parentEmail = scholarship.student?.parentEmail;
    if (parentEmail) {
      const studentName = scholarship.student?.user
        ? `${scholarship.student.user.firstName} ${scholarship.student.user.lastName}`
        : 'your child';
      await this.emails
        .sendMail(
          parentEmail,
          `Scholarship ${label}`,
          `The scholarship "${scholarship.name}" for ${studentName} has been ${label}.` +
            (dto.reviewNotes ? `\n\nNote: ${dto.reviewNotes}` : ''),
        )
        .catch(() => undefined);
    }
    return updated;
  }
}
