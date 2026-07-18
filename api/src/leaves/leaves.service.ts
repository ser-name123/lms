import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveRequestStatus, LeaveType, Role } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type { CreateLeaveDto, ListLeavesDto, UpdateLeaveDto } from './dto';
import { TeacherManagementService } from '../teacher-management/teacher-management.service';
import { NotificationsService } from '../notifications/notifications.service';

/** "12 Mar" — leave windows read better than raw ISO in a notification body. */
const shortDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const LEAVE_SELECT = {
  id: true,
  userId: true,
  leaveType: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  adminNotes: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.LeaveRequestSelect;

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherMgmt: TeacherManagementService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(dto: ListLeavesDto) {
    const { page, limit, search, status, sortBy } = dto;

    const where: Prisma.LeaveRequestWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            user: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    let orderBy: Prisma.LeaveRequestOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy) {
      if (sortBy === 'date_asc') orderBy = { startDate: 'asc' };
      else if (sortBy === 'date_desc') orderBy = { startDate: 'desc' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        select: LEAVE_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: string) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      select: LEAVE_SELECT,
    });
    if (!leave) throw new NotFoundException(`Leave request ${id} not found`);
    return leave;
  }

  async create(dto: CreateLeaveDto) {
    const created = await this.prisma.leaveRequest.create({
      data: {
        userId: dto.userId,
        leaveType: dto.leaveType,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
      },
      select: LEAVE_SELECT,
    });

    // A leave request sat in the queue with nobody told about it. Fire-and-
    // forget, so a notification failure never loses the request itself.
    const who = `${created.user.firstName} ${created.user.lastName}`.trim();
    this.notifications
      .createForRoles([Role.ADMIN, Role.SUPERVISOR], {
        type: 'LEAVE_REQUESTED',
        title: 'Leave request pending',
        body: `${who} requested ${created.leaveType.toLowerCase()} leave, ${shortDate(created.startDate)} – ${shortDate(created.endDate)}.`,
        link: '/leaves',
      })
      .catch(() => undefined);

    return created;
  }

  async update(id: string, dto: UpdateLeaveDto) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes } : {}),
      },
      select: LEAVE_SELECT,
    });

    // When a TEACHER's leave is newly approved, cancel their classes in the
    // leave window and notify the affected students/parents.
    if (
      dto.status === LeaveRequestStatus.APPROVED &&
      existing.status !== LeaveRequestStatus.APPROVED &&
      updated.user.role === Role.TEACHER
    ) {
      this.teacherMgmt
        .cancelClassesForLeave(updated.userId, updated.startDate, updated.endDate, updated.reason)
        .catch(() => undefined);
    }

    // Tell the requester the outcome — previously a decision was silent.
    if (dto.status && dto.status !== existing.status) {
      const window = `${shortDate(updated.startDate)} – ${shortDate(updated.endDate)}`;
      this.notifications
        .createFor(updated.userId, {
          type: 'LEAVE_DECISION',
          title:
            dto.status === LeaveRequestStatus.APPROVED
              ? 'Leave approved'
              : dto.status === LeaveRequestStatus.DECLINED
                ? 'Leave declined'
                : 'Leave request updated',
          body: updated.adminNotes
            ? `${window} — ${updated.adminNotes}`
            : `Your ${updated.leaveType.toLowerCase()} leave for ${window}.`,
          link: updated.user.role === Role.TEACHER ? '/teacher/availability' : '/leaves',
        })
        .catch(() => undefined);
    }

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.leaveRequest.delete({ where: { id } });
  }

  async getStats() {
    const [total, approved, declined, pending] = await Promise.all([
      this.prisma.leaveRequest.count(),
      this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.APPROVED } }),
      this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.DECLINED } }),
      this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.PENDING } }),
    ]);

    return {
      total,
      approved,
      declined,
      pending,
    };
  }

  async seed() {
    console.log('Seeding exactly 10 leave requests...');

    // Clear existing leaves first
    await this.prisma.leaveRequest.deleteMany({});

    // Fetch teachers & other employees to link to leaves
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.TEACHER, Role.SUPERVISOR, Role.ACADEMIC_COACH] },
      },
      take: 8,
    });

    if (users.length === 0) {
      throw new Error('No teachers or employees found in database to associate leave requests. Please seed users first!');
    }

    const leaveReasons = [
      { type: LeaveType.SICK, reason: 'Recovering from severe flu and fever.', status: LeaveRequestStatus.APPROVED, daysOffset: -5, duration: 2 },
      { type: LeaveType.CASUAL, reason: 'Family wedding event in my hometown.', status: LeaveRequestStatus.APPROVED, daysOffset: -2, duration: 3 },
      { type: LeaveType.ANNUAL, reason: 'Scheduled annual vacation plan.', status: LeaveRequestStatus.PENDING, daysOffset: 15, duration: 10 },
      { type: LeaveType.UNPAID, reason: 'Personal emergencies at home.', status: LeaveRequestStatus.DECLINED, daysOffset: -12, duration: 4, adminNotes: 'Insufficient cover available for this period.' },
      { type: LeaveType.SICK, reason: 'Dental surgery appointment.', status: LeaveRequestStatus.APPROVED, daysOffset: -1, duration: 1 },
      { type: LeaveType.CASUAL, reason: 'Car service and relocation appointments.', status: LeaveRequestStatus.PENDING, daysOffset: 2, duration: 1 },
      { type: LeaveType.ANNUAL, reason: 'Travelling out of station.', status: LeaveRequestStatus.APPROVED, daysOffset: -20, duration: 5 },
      { type: LeaveType.SICK, reason: 'Chronic back pain checkup and rest.', status: LeaveRequestStatus.PENDING, daysOffset: 5, duration: 2 },
      { type: LeaveType.CASUAL, reason: 'Urgent banking work in city branch.', status: LeaveRequestStatus.DECLINED, daysOffset: -8, duration: 1, adminNotes: 'Declined due to clash with scheduled exam monitoring.' },
      { type: LeaveType.SICK, reason: 'Severe sore throat and speech exhaustion.', status: LeaveRequestStatus.APPROVED, daysOffset: -10, duration: 2 },
    ];

    const seeded: any[] = [];
    for (let i = 0; i < 10; i++) {
      const user = users[i % users.length];
      const details = leaveReasons[i];
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + details.daysOffset);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + details.duration);

      const request = await this.prisma.leaveRequest.create({
        data: {
          userId: user.id,
          leaveType: details.type,
          startDate,
          endDate,
          reason: details.reason,
          status: details.status,
          adminNotes: details.adminNotes || null,
        },
      });
      seeded.push(request);
    }

    return { seededCount: seeded.length };
  }
}
