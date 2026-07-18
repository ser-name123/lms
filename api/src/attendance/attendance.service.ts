import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role, ClassStatus, StudentAttendanceStatus } from '../generated/prisma/enums';
import {
  AssignStudentsDto,
  AttendanceConfigDto,
  CreateBatchDto,
  EndClassDto,
  GenerateClassesDto,
  MarkAttendanceDto,
  RequestCorrectionDto,
  ReviewCorrectionDto,
  ScheduleClassDto,
  UpdateBatchDto,
} from './dto';

type Actor = { id?: string; name?: string } | undefined;

const CONFIG_KEY = 'ATTENDANCE_CONFIG';
const DEFAULT_CONFIG = {
  presentThreshold: 75, // ≥75% of duration ⇒ PRESENT
  lateThreshold: 30, // 30–74% ⇒ LATE, <30% ⇒ ABSENT
  autoLockMinutes: 30, // lock N minutes after class ends
  lateGraceMinutes: 5, // join within grace ⇒ not late
  allowManualCorrection: true,
  lowAttendanceThreshold: 75, // alert below this % over the window
  lowAttendanceWindowDays: 30, // window the rate is measured over
  lowAttendanceMinSessions: 4, // don't judge a student on one or two classes
};
type AttendanceConfig = typeof DEFAULT_CONFIG;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Injectable()
export class AttendanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
  ) {}

  // Sweeps: reminders (24h/1h/15m) + auto-lock. Lightweight in-process interval,
  // no cron dependency (mirrors the leads reminder sweep).
  onModuleInit() {
    setInterval(() => this.reminderSweep().catch(() => undefined), 5 * 60 * 1000);
    setInterval(() => this.autoLockSweep().catch(() => undefined), 5 * 60 * 1000);
    // Hourly: an attendance rate does not move fast enough to warrant more.
    setInterval(() => this.lowAttendanceSweep().catch(() => undefined), 60 * 60 * 1000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Config
  // ══════════════════════════════════════════════════════════════════════════
  async getConfig(): Promise<AttendanceConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } });
    if (!row) return { ...DEFAULT_CONFIG };
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  async updateConfig(dto: AttendanceConfigDto): Promise<AttendanceConfig> {
    const current = await this.getConfig();
    const merged = { ...current, ...clean(dto) } as AttendanceConfig;
    if (merged.lateThreshold >= merged.presentThreshold) {
      throw new BadRequestException('Late threshold must be below the present threshold.');
    }
    await this.prisma.systemSetting.upsert({
      where: { key: CONFIG_KEY },
      update: { value: JSON.stringify(merged) },
      create: { key: CONFIG_KEY, value: JSON.stringify(merged) },
    });
    return merged;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Batches
  // ══════════════════════════════════════════════════════════════════════════
  async createBatch(dto: CreateBatchDto) {
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
    if (!course) throw new BadRequestException('Course not found.');
    if (dto.teacherId) await this.assertTeacher(dto.teacherId);

    const code = await this.nextCode('Batch', 'BATCH');
    const batch = await this.prisma.batch.create({
      data: {
        code,
        name: dto.name,
        courseId: dto.courseId,
        teacherId: dto.teacherId || null,
        level: dto.level || null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        daysOfWeek: dto.daysOfWeek || [],
        startTime: dto.startTime || null,
        endTime: dto.endTime || null,
        timeZone: dto.timeZone || null,
        capacity: dto.capacity ?? null,
      },
    });

    if (dto.studentIds?.length) await this.assignStudents(batch.id, { studentIds: dto.studentIds });
    return this.getBatch(batch.id);
  }

  async updateBatch(id: string, dto: UpdateBatchDto) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Batch not found.');
    if (dto.teacherId) await this.assertTeacher(dto.teacherId);

    await this.prisma.batch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId || null } : {}),
        ...(dto.level !== undefined ? { level: dto.level || null } : {}),
        ...(dto.status ? { status: dto.status as any } : {}),
        ...(dto.startDate !== undefined ? { startDate: dto.startDate ? new Date(dto.startDate) : null } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : null } : {}),
        ...(dto.daysOfWeek !== undefined ? { daysOfWeek: dto.daysOfWeek } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime || null } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime || null } : {}),
        ...(dto.timeZone !== undefined ? { timeZone: dto.timeZone || null } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity ?? null } : {}),
      },
    });
    return this.getBatch(id);
  }

  async listBatches(filters: { courseId?: string; teacherId?: string; status?: string; search?: string }) {
    const where: any = {
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? { OR: [{ name: { contains: filters.search, mode: 'insensitive' } }, { code: { contains: filters.search, mode: 'insensitive' } }] }
        : {}),
    };
    const batches = await this.prisma.batch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        course: { select: { title: true } },
        teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
        _count: { select: { students: true, classes: true } },
      },
    });
    return batches.map((b) => ({
      ...b,
      courseName: b.course?.title || null,
      teacherName: b.teacher ? `${b.teacher.user.firstName} ${b.teacher.user.lastName}` : null,
      studentCount: b._count.students,
      classCount: b._count.classes,
    }));
  }

  async getBatch(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        teacher: { select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } } } },
        students: {
          include: { student: { select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true, email: true } } } } },
        },
        _count: { select: { classes: true } },
      },
    });
    if (!batch) throw new NotFoundException('Batch not found.');
    return {
      ...batch,
      courseName: batch.course?.title || null,
      teacherName: batch.teacher ? `${batch.teacher.user.firstName} ${batch.teacher.user.lastName}` : null,
      classCount: batch._count.classes,
      students: batch.students.map((s) => ({
        id: s.student.id,
        studentCode: s.student.studentCode,
        name: `${s.student.user.firstName} ${s.student.user.lastName}`,
        email: s.student.user.email,
        addedAt: s.addedAt,
      })),
    };
  }

  async assignStudents(batchId: string, dto: AssignStudentsDto) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found.');
    await this.prisma.$transaction(
      dto.studentIds.map((studentId) =>
        this.prisma.batchStudent.upsert({
          where: { batchId_studentId: { batchId, studentId } },
          update: {},
          create: { batchId, studentId },
        }),
      ),
    );
    return this.getBatch(batchId);
  }

  async removeStudent(batchId: string, studentId: string) {
    await this.prisma.batchStudent.deleteMany({ where: { batchId, studentId } });
    return this.getBatch(batchId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Class scheduling
  // ══════════════════════════════════════════════════════════════════════════
  async scheduleClass(dto: ScheduleClassDto) {
    const batch = await this.batchForScheduling(dto.batchId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('Invalid class start/end time.');
    }
    const session = await this.createSessionWithAttendees(batch, startsAt, endsAt, dto.title, dto.meetingUrl);
    return this.decorateClass(await this.reloadClass(session.id));
  }

  // Bulk-generate sessions from the batch weekly schedule between two dates.
  async generateClasses(dto: GenerateClassesDto) {
    const batch = await this.batchForScheduling(dto.batchId);
    if (!batch.daysOfWeek?.length || !batch.startTime || !batch.endTime) {
      throw new BadRequestException('Set the batch weekly days + start/end time before generating classes.');
    }
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) throw new BadRequestException('Invalid date range.');

    const [sh, sm] = batch.startTime.split(':').map(Number);
    const [eh, em] = batch.endTime.split(':').map(Number);
    const created: string[] = [];
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (!batch.daysOfWeek.includes(DAYS[d.getDay()])) continue;
      const startsAt = new Date(d); startsAt.setHours(sh, sm, 0, 0);
      const endsAt = new Date(d); endsAt.setHours(eh, em, 0, 0);
      const session = await this.createSessionWithAttendees(batch, startsAt, endsAt, undefined, dto.meetingUrl);
      created.push(session.id);
    }
    return { generated: created.length };
  }

  private async createSessionWithAttendees(batch: any, startsAt: Date, endsAt: Date, title?: string, meetingUrl?: string) {
    if (!batch.teacherId) throw new BadRequestException('Assign a teacher to the batch before scheduling classes.');
    const session = await this.prisma.classSession.create({
      data: {
        courseId: batch.courseId,
        teacherId: batch.teacherId,
        batchId: batch.id,
        title: title || `${batch.name} — ${batch.course?.title || 'Class'}`,
        startsAt,
        endsAt,
        meetingUrl: meetingUrl || null,
        status: ClassStatus.SCHEDULED,
      },
    });
    // One attendee row per batch student (session-based).
    if (batch.students?.length) {
      await this.prisma.classAttendee.createMany({
        data: batch.students.map((s: any) => ({ classId: session.id, studentId: s.studentId })),
        skipDuplicates: true,
      });
    }
    return session;
  }

  async listClasses(filters: { batchId?: string; teacherId?: string; status?: string; date?: string; from?: string; to?: string }) {
    const where: any = {
      ...(filters.batchId ? { batchId: filters.batchId } : {}),
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    if (filters.date) {
      const { start, end } = dayRange(new Date(filters.date));
      where.startsAt = { gte: start, lte: end };
    } else if (filters.from || filters.to) {
      where.startsAt = { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) };
    }
    const classes = await this.prisma.classSession.findMany({
      where,
      orderBy: { startsAt: 'desc' },
      include: {
        course: { select: { title: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        batch: { select: { name: true, code: true } },
        _count: { select: { attendees: true } },
      },
      take: 300,
    });
    return classes.map((c) => this.decorateClass(c));
  }

  async getClassAttendance(classId: string) {
    const cls = await this.prisma.classSession.findUnique({
      where: { id: classId },
      include: {
        course: { select: { title: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        batch: { select: { name: true, code: true } },
        attendees: {
          include: { student: { select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } } },
          orderBy: { student: { user: { firstName: 'asc' } } },
        },
      },
    });
    if (!cls) throw new NotFoundException('Class not found.');
    return {
      ...this.decorateClass(cls),
      attendees: cls.attendees.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        studentCode: a.student.studentCode,
        name: `${a.student.user.firstName} ${a.student.user.lastName}`,
        joinedAt: a.joinedAt,
        leftAt: a.leftAt,
        durationMins: a.durationMins,
        status: a.status,
        lateMinutes: a.lateMinutes,
        device: a.device,
        browser: a.browser,
        ipAddress: a.ipAddress,
        remarks: a.remarks,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Lifecycle — teacher start/end, student join/leave
  // ══════════════════════════════════════════════════════════════════════════
  async startClass(classId: string, userId: string, isAdmin: boolean) {
    const cls = await this.prisma.classSession.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found.');
    if (!isAdmin) await this.assertOwningTeacher(cls.teacherId, userId);
    if (cls.status === ClassStatus.COMPLETED || cls.attendanceLocked) {
      throw new BadRequestException('This class is already completed/locked.');
    }
    const config = await this.getConfig();
    const now = new Date();
    const lateMin = Math.max(0, Math.round((now.getTime() - cls.startsAt.getTime()) / 60000));
    const teacherStatus = lateMin > config.lateGraceMinutes ? 'LATE' : 'PRESENT';

    const updated = await this.prisma.classSession.update({
      where: { id: classId },
      data: {
        status: ClassStatus.LIVE,
        actualStartAt: cls.actualStartAt || now,
        teacherJoinedAt: cls.teacherJoinedAt || now,
        teacherStatus: teacherStatus as any,
        teacherLateMinutes: lateMin,
        meetingId: cls.meetingId || `MTG-${classId.slice(0, 8)}`,
        sessionId: cls.sessionId || `SES-${now.getTime().toString(36)}`,
      },
    });
    return this.decorateClass(await this.reloadClass(updated.id));
  }

  async endClass(classId: string, userId: string, isAdmin: boolean, dto: EndClassDto) {
    const cls = await this.prisma.classSession.findUnique({ where: { id: classId }, include: { attendees: true } });
    if (!cls) throw new NotFoundException('Class not found.');
    if (!isAdmin) await this.assertOwningTeacher(cls.teacherId, userId);
    if (cls.attendanceLocked) throw new BadRequestException('Attendance is locked for this class.');

    const config = await this.getConfig();
    const now = new Date();

    // Finalise each attendee: anyone still "in" leaves now; compute status.
    for (const a of cls.attendees) {
      // Preserve admin/teacher-set excused/leave statuses.
      if (a.status === 'EXCUSED' || a.status === 'LEAVE_APPROVED') continue;
      const leftAt = a.leftAt || (a.joinedAt ? now : null);
      const { status, durationMins, lateMinutes } = this.computeStudentStatus(a.joinedAt, leftAt, cls, config);
      await this.prisma.classAttendee.update({
        where: { id: a.id },
        data: { leftAt, durationMins, status: status as any, lateMinutes, attended: status === 'PRESENT' || status === 'LATE' },
      });
    }

    const updated = await this.prisma.classSession.update({
      where: { id: classId },
      data: {
        status: ClassStatus.COMPLETED,
        actualEndAt: now,
        ...(dto.teacherStatus ? { teacherStatus: dto.teacherStatus as any } : cls.teacherStatus ? {} : { teacherStatus: 'PRESENT' as any }),
      },
    });

    // Parent/student notifications for the finalised statuses.
    this.notifyAttendanceOutcome(classId).catch(() => undefined);
    return this.getClassAttendance(updated.id);
  }

  async studentJoin(classId: string, userId: string, meta: { ip?: string; device?: string; browser?: string }) {
    const { attendee, cls } = await this.attendeeForUser(classId, userId);
    if (cls.attendanceLocked) throw new BadRequestException('Attendance is locked for this class.');
    const now = new Date();
    const updated = await this.prisma.classAttendee.update({
      where: { id: attendee.id },
      data: {
        joinedAt: attendee.joinedAt || now,
        device: meta.device || attendee.device || null,
        browser: meta.browser || attendee.browser || null,
        ipAddress: meta.ip || attendee.ipAddress || null,
      },
    });
    return { joinedAt: updated.joinedAt, meetingUrl: cls.meetingUrl, classId };
  }

  async studentLeave(classId: string, userId: string) {
    const { attendee, cls } = await this.attendeeForUser(classId, userId);
    if (cls.attendanceLocked) throw new BadRequestException('Attendance is locked for this class.');
    if (!attendee.joinedAt) throw new BadRequestException('You have not joined this class.');
    const config = await this.getConfig();
    const now = new Date();
    const { status, durationMins, lateMinutes } = this.computeStudentStatus(attendee.joinedAt, now, cls, config);
    const updated = await this.prisma.classAttendee.update({
      where: { id: attendee.id },
      data: { leftAt: now, durationMins, status: status as any, lateMinutes, attended: status === 'PRESENT' || status === 'LATE' },
    });
    return { leftAt: updated.leftAt, durationMins: updated.durationMins, status: updated.status };
  }

  // Manual verify / override by the teacher (or admin), before lock.
  async markAttendance(classId: string, dto: MarkAttendanceDto, userId: string, isAdmin: boolean, actor: Actor) {
    const cls = await this.prisma.classSession.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found.');
    if (!isAdmin) await this.assertOwningTeacher(cls.teacherId, userId);
    if (cls.attendanceLocked) throw new BadRequestException('Attendance is locked. Raise a correction request instead.');

    const attendee = await this.prisma.classAttendee.findUnique({ where: { classId_studentId: { classId, studentId: dto.studentId } } });
    if (!attendee) throw new NotFoundException('Student is not in this class.');
    await this.prisma.classAttendee.update({
      where: { id: attendee.id },
      data: { status: dto.status as any, remarks: dto.remarks ?? attendee.remarks, attended: dto.status === 'PRESENT' || dto.status === 'LATE' },
    });
    return this.getClassAttendance(classId);
  }

  // Cancel a class — no attendance is counted; students are notified.
  async cancelClass(classId: string, userId: string, isAdmin: boolean, actor: Actor) {
    const cls = await this.prisma.classSession.findUnique({ where: { id: classId }, include: { attendees: { select: { studentId: true } } } });
    if (!cls) throw new NotFoundException('Class not found.');
    if (!isAdmin) await this.assertOwningTeacher(cls.teacherId, userId);
    if (cls.attendanceLocked) throw new BadRequestException('Attendance is already locked for this class.');

    const updated = await this.prisma.classSession.update({
      where: { id: classId },
      data: { status: ClassStatus.CANCELLED, teacherStatus: 'CLASS_CANCELLED' as any, attendanceLocked: true, lockedAt: new Date() },
    });
    // Every attendee is marked EXCUSED (class cancelled, not their fault) —
    // including still-null statuses, which SQL NOT IN would otherwise skip.
    await this.prisma.classAttendee.updateMany({
      where: { classId, OR: [{ status: null }, { status: { notIn: ['EXCUSED', 'LEAVE_APPROVED'] as any } }] },
      data: { status: 'EXCUSED' as any },
    });

    const contacts = await this.studentContacts(cls.attendees.map((a) => a.studentId));
    for (const c of contacts) {
      this.notifications.createFor(c.userId, {
        type: 'CLASS_CANCELLED', title: 'Class Cancelled',
        body: `${cls.title} on ${cls.startsAt.toLocaleString()} has been cancelled.`,
        link: `/student/attendance`,
      }).catch(() => undefined);
    }
    void actor;
    return this.decorateClass(await this.reloadClass(updated.id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Manual correction workflow (teacher → admin review → audit)
  // ══════════════════════════════════════════════════════════════════════════
  async requestCorrection(dto: RequestCorrectionDto, actor: Actor) {
    const cls = await this.prisma.classSession.findUnique({ where: { id: dto.classId } });
    if (!cls) throw new NotFoundException('Class not found.');

    let fromStatus: string | null = null;
    let attendeeId: string | null = null;
    if (dto.targetType === 'STUDENT') {
      if (!dto.studentId) throw new BadRequestException('studentId is required for a student correction.');
      const a = await this.prisma.classAttendee.findUnique({ where: { classId_studentId: { classId: dto.classId, studentId: dto.studentId } } });
      if (!a) throw new NotFoundException('Student is not in this class.');
      fromStatus = a.status;
      attendeeId = a.id;
    } else {
      fromStatus = cls.teacherStatus;
    }

    const correction = await this.prisma.attendanceCorrection.create({
      data: {
        classId: dto.classId,
        targetType: dto.targetType,
        studentId: dto.studentId || null,
        attendeeId,
        fromStatus,
        toStatus: dto.toStatus,
        reason: dto.reason,
        requestedById: actor?.id || 'unknown',
        requestedByName: actor?.name || null,
      },
    });

    this.notifications
      .createForRoles([Role.ADMIN], {
        type: 'ATTENDANCE_CORRECTION',
        title: 'Attendance Correction Request',
        body: `${actor?.name || 'A teacher'} requested a correction on ${cls.title}.`,
        link: `/attendance/corrections`,
      })
      .catch(() => undefined);
    return correction;
  }

  async listCorrections(status?: string) {
    const corrections = await this.prisma.attendanceCorrection.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      include: { class: { select: { title: true, startsAt: true, batchId: true } } },
    });
    return corrections;
  }

  async reviewCorrection(id: string, dto: ReviewCorrectionDto, actor: Actor) {
    const c = await this.prisma.attendanceCorrection.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Correction not found.');
    if (c.status !== 'PENDING') throw new BadRequestException('This correction has already been reviewed.');

    if (dto.decision === 'APPROVED') {
      if (c.targetType === 'STUDENT' && c.studentId) {
        await this.prisma.classAttendee.updateMany({
          where: { classId: c.classId, studentId: c.studentId },
          data: { status: c.toStatus as any, remarks: `Corrected: ${c.reason}` },
        });
      } else if (c.targetType === 'TEACHER') {
        await this.prisma.classSession.update({ where: { id: c.classId }, data: { teacherStatus: c.toStatus as any } });
      }
    }

    return this.prisma.attendanceCorrection.update({
      where: { id },
      data: {
        status: dto.decision as any,
        reviewedById: actor?.id || null,
        reviewedByName: actor?.name || null,
        reviewNotes: dto.notes || null,
        reviewedAt: new Date(),
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Dashboards + reports
  // ══════════════════════════════════════════════════════════════════════════
  async adminDashboard() {
    const { start, end } = dayRange(new Date());
    const [todayClasses, running, completedToday, corrections] = await Promise.all([
      this.prisma.classSession.count({ where: { startsAt: { gte: start, lte: end } } }),
      this.prisma.classSession.count({ where: { status: ClassStatus.LIVE } }),
      this.prisma.classSession.count({ where: { status: ClassStatus.COMPLETED, startsAt: { gte: start, lte: end } } }),
      this.prisma.attendanceCorrection.count({ where: { status: 'PENDING' } }),
    ]);

    // Today's student attendance split.
    const todayAttendees = await this.prisma.classAttendee.groupBy({
      by: ['status'],
      where: { class: { startsAt: { gte: start, lte: end } } },
      _count: { _all: true },
    });
    const present = sumStatuses(todayAttendees, ['PRESENT', 'LATE']);
    const absent = sumStatuses(todayAttendees, ['ABSENT', 'NO_SHOW']);

    const teacherToday = await this.prisma.classSession.groupBy({
      by: ['teacherStatus'],
      where: { startsAt: { gte: start, lte: end }, teacherStatus: { not: null } },
      _count: { _all: true },
    });
    const teachersPresent = teacherToday.filter((t) => t.teacherStatus === 'PRESENT' || t.teacherStatus === 'LATE').reduce((a, t) => a + t._count._all, 0);

    // 7-day daily attendance trend.
    const daily = await this.dailyTrend(7);

    return {
      todayClasses,
      runningClasses: running,
      completedClasses: completedToday,
      studentsPresent: present,
      studentsAbsent: absent,
      teachersPresent,
      pendingCorrections: corrections,
      attendanceRate: present + absent ? Math.round((present / (present + absent)) * 100) : 0,
      dailyTrend: daily,
    };
  }

  async teacherDashboard(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) return { todayClasses: [], pendingAttendance: 0, completedClasses: 0, studentAttendanceRate: 0 };
    const { start, end } = dayRange(new Date());
    const [today, pending, completed] = await Promise.all([
      this.listClasses({ teacherId: teacher.id, date: new Date().toISOString() }),
      this.prisma.classSession.count({ where: { teacherId: teacher.id, status: ClassStatus.COMPLETED, attendanceLocked: false } }),
      this.prisma.classSession.count({ where: { teacherId: teacher.id, status: ClassStatus.COMPLETED } }),
    ]);
    void start; void end;
    const agg = await this.prisma.classAttendee.groupBy({
      by: ['status'],
      where: { class: { teacherId: teacher.id } },
      _count: { _all: true },
    });
    const present = sumStatuses(agg, ['PRESENT', 'LATE']);
    const absent = sumStatuses(agg, ['ABSENT', 'NO_SHOW']);
    return {
      todayClasses: today,
      pendingAttendance: pending,
      completedClasses: completed,
      studentAttendanceRate: present + absent ? Math.round((present / (present + absent)) * 100) : 0,
    };
  }

  async studentDashboard(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!student) return { attendanceRate: 0, todayClasses: [], upcoming: [], missedCount: 0, lateCount: 0, calendar: [] };

    const agg = await this.prisma.classAttendee.groupBy({
      by: ['status'],
      where: { studentId: student.id, status: { not: null } },
      _count: { _all: true },
    });
    const present = sumStatuses(agg, ['PRESENT', 'LATE']);
    const missed = sumStatuses(agg, ['ABSENT', 'NO_SHOW']);
    const late = sumStatuses(agg, ['LATE']);
    // Rate excludes excused/leave from the denominator.
    const counted = present + missed;
    const total = agg.reduce((a, r) => a + r._count._all, 0);

    const { start, end } = dayRange(new Date());
    const [todayRows, upcomingRows, calendarRows] = await Promise.all([
      this.prisma.classAttendee.findMany({
        where: { studentId: student.id, class: { startsAt: { gte: start, lte: end } } },
        include: { class: { include: { course: { select: { title: true } }, batch: { select: { name: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } } } } },
        orderBy: { class: { startsAt: 'asc' } },
      }),
      this.prisma.classSession.findMany({
        where: { attendees: { some: { studentId: student.id } }, startsAt: { gt: new Date() }, status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] } },
        orderBy: { startsAt: 'asc' },
        take: 10,
        include: { course: { select: { title: true } }, batch: { select: { name: true } } },
      }),
      this.prisma.classAttendee.findMany({
        where: { studentId: student.id, status: { not: null }, class: { startsAt: { gte: daysAgo(60) } } },
        include: { class: { select: { startsAt: true, title: true } } },
        orderBy: { class: { startsAt: 'desc' } },
      }),
    ]);

    return {
      attendanceRate: counted ? Math.round((present / counted) * 100) : 0,
      totalSessions: total,
      missedCount: missed,
      lateCount: late,
      todayClasses: todayRows.map((r) => ({
        classId: r.classId,
        title: r.class.title,
        course: r.class.course?.title,
        batch: r.class.batch?.name,
        teacher: `${r.class.teacher.user.firstName} ${r.class.teacher.user.lastName}`,
        startsAt: r.class.startsAt,
        endsAt: r.class.endsAt,
        status: r.class.status,
        meetingUrl: r.class.meetingUrl,
        myStatus: r.status,
        joinedAt: r.joinedAt,
      })),
      upcoming: upcomingRows.map((c) => ({ id: c.id, title: c.title, course: c.course?.title, batch: c.batch?.name, startsAt: c.startsAt, endsAt: c.endsAt })),
      calendar: calendarRows.map((r) => ({ date: r.class.startsAt, status: r.status, title: r.class.title })),
    };
  }

  // Reports (typed): student|low|perfect|no-show|late|teacher|course|batch|monthly|yearly
  async report(type: string, filters: { from?: string; to?: string; batchId?: string; teacherId?: string; courseId?: string }) {
    const classWhere: any = {};
    if (filters.from || filters.to) classWhere.startsAt = { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) };
    if (filters.batchId) classWhere.batchId = filters.batchId;
    if (filters.teacherId) classWhere.teacherId = filters.teacherId;
    if (filters.courseId) classWhere.courseId = filters.courseId;
    const where = { class: Object.keys(classWhere).length ? classWhere : undefined };

    // Line-item reports: one row per flagged attendee.
    if (type === 'no-show' || type === 'late') {
      const status = type === 'no-show' ? ['NO_SHOW', 'ABSENT'] : ['LATE'];
      const rows = await this.prisma.classAttendee.findMany({
        where: { ...where, status: { in: status as any } },
        include: {
          student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } },
          class: { select: { title: true, startsAt: true, batch: { select: { name: true } } } },
        },
        orderBy: { class: { startsAt: 'desc' } },
        take: 500,
      });
      return rows.map((r) => ({
        student: `${r.student.user.firstName} ${r.student.user.lastName}`,
        studentCode: r.student.studentCode,
        class: r.class.title,
        batch: r.class.batch?.name,
        date: r.class.startsAt,
        status: r.status,
        lateMinutes: r.lateMinutes,
      }));
    }

    // Teacher report: one row per teacher (classes taught + student attendance).
    if (type === 'teacher') {
      const facts = await this.attendeeFacts(where);
      const byTeacher = groupRate(facts, (f) => f.class.teacherId);
      const [teachers, classCounts] = await Promise.all([
        this.prisma.teacherProfile.findMany({ where: { id: { in: [...byTeacher.keys()] } }, select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } } } }),
        this.prisma.classSession.groupBy({ by: ['teacherId'], where: classWhere, _count: { _all: true } }),
      ]);
      const classMap = new Map(classCounts.map((c) => [c.teacherId, c._count._all]));
      return teachers.map((t) => {
        const rec = byTeacher.get(t.id)!;
        return { teacher: `${t.user.firstName} ${t.user.lastName}`, teacherCode: t.teacherCode, classes: classMap.get(t.id) || 0, present: rec.present, total: rec.total, rate: rate(rec.present, rec.total) };
      }).sort((a, b) => b.rate - a.rate);
    }

    // Course / Batch reports: aggregate attendance per course / batch.
    if (type === 'course' || type === 'batch') {
      const facts = await this.attendeeFacts(where);
      const keyFn = type === 'course' ? (f: any) => f.class.courseId : (f: any) => f.class.batchId;
      const grouped = groupRate(facts, keyFn);
      grouped.delete(null as any);
      if (type === 'course') {
        const courses = await this.prisma.course.findMany({ where: { id: { in: [...grouped.keys()] as string[] } }, select: { id: true, title: true } });
        return courses.map((c) => { const r = grouped.get(c.id)!; return { course: c.title, present: r.present, total: r.total, rate: rate(r.present, r.total) }; }).sort((a, b) => b.rate - a.rate);
      }
      const batches = await this.prisma.batch.findMany({ where: { id: { in: [...grouped.keys()] as string[] } }, select: { id: true, code: true, name: true } });
      return batches.map((b) => { const r = grouped.get(b.id)!; return { batch: `${b.name} (${b.code})`, present: r.present, total: r.total, rate: rate(r.present, r.total) }; }).sort((a, b) => b.rate - a.rate);
    }

    // Monthly / Yearly: attendance trend by period.
    if (type === 'monthly' || type === 'yearly') {
      const facts = await this.attendeeFacts(where);
      const keyFn = type === 'monthly'
        ? (f: any) => new Date(f.class.startsAt).toISOString().slice(0, 7)
        : (f: any) => String(new Date(f.class.startsAt).getFullYear());
      const grouped = groupRate(facts, keyFn);
      return [...grouped.entries()].map(([period, r]) => ({ period, present: r.present, absent: r.total - r.present, total: r.total, rate: rate(r.present, r.total) })).sort((a, b) => a.period.localeCompare(b.period));
    }

    // Default: per-student summary (also powers student / low / perfect).
    const rows = await this.prisma.classAttendee.groupBy({
      by: ['studentId', 'status'],
      where: { ...where, status: { not: null } },
      _count: { _all: true },
    });
    const byStudent = new Map<string, { present: number; total: number }>();
    for (const r of rows) {
      // Excused / leave-approved are neutral — not counted in the rate.
      if (r.status === 'EXCUSED' || r.status === 'LEAVE_APPROVED') continue;
      const rec = byStudent.get(r.studentId) || { present: 0, total: 0 };
      rec.total += r._count._all;
      if (r.status === 'PRESENT' || r.status === 'LATE') rec.present += r._count._all;
      byStudent.set(r.studentId, rec);
    }
    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: [...byStudent.keys()] } },
      select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } },
    });
    let out = students.map((s) => {
      const rec = byStudent.get(s.id)!;
      return { studentId: s.id, studentCode: s.studentCode, name: `${s.user.firstName} ${s.user.lastName}`, present: rec.present, total: rec.total, rate: rate(rec.present, rec.total) };
    });
    if (type === 'low') out = out.filter((r) => r.rate < 75);
    if (type === 'perfect') out = out.filter((r) => r.rate === 100 && r.total > 0);
    return out.sort((a, b) => a.rate - b.rate);
  }

  // Rich analytics for the admin charts (weekly/monthly + per-dimension breakdowns).
  async analytics() {
    const since = daysAgo(120);
    const facts = await this.attendeeFacts({ class: { startsAt: { gte: since } } }, 20000);

    // Weekly (last 8 weeks) + monthly (last 6 months) trends.
    const weekly = bucketRate(facts, (f) => weekKey(new Date(f.class.startsAt))).slice(-8);
    const monthly = bucketRate(facts, (f) => new Date(f.class.startsAt).toISOString().slice(0, 7)).slice(-6);

    // Per-dimension (resolve ids → names, keep top 8 by volume).
    const teacherG = groupRate(facts, (f) => f.class.teacherId);
    const courseG = groupRate(facts, (f) => f.class.courseId); courseG.delete(null as any);
    const batchG = groupRate(facts, (f) => f.class.batchId); batchG.delete(null as any);
    const countryG = groupRate(facts, (f) => f.student?.user?.country || 'Unknown');

    const [teachers, courses, batches] = await Promise.all([
      this.prisma.teacherProfile.findMany({ where: { id: { in: [...teacherG.keys()] as string[] } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } }),
      this.prisma.course.findMany({ where: { id: { in: [...courseG.keys()] as string[] } }, select: { id: true, title: true } }),
      this.prisma.batch.findMany({ where: { id: { in: [...batchG.keys()] as string[] } }, select: { id: true, name: true } }),
    ]);
    const tName = new Map(teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`]));
    const cName = new Map(courses.map((c) => [c.id, c.title]));
    const bName = new Map(batches.map((b) => [b.id, b.name]));

    const top = (g: Map<any, { present: number; total: number }>, name: (k: any) => string) =>
      [...g.entries()].map(([k, r]) => ({ name: name(k), rate: rate(r.present, r.total), total: r.total }))
        .sort((a, b) => b.total - a.total).slice(0, 8);

    return {
      weekly,
      monthly,
      teacherWise: top(teacherG, (k) => tName.get(k) || '—'),
      courseWise: top(courseG, (k) => cName.get(k) || '—'),
      batchWise: top(batchG, (k) => bName.get(k) || '—'),
      countryWise: top(countryG, (k) => String(k)),
    };
  }

  private async attendeeFacts(where: any, take = 5000) {
    return this.prisma.classAttendee.findMany({
      where: { status: { not: null }, ...where },
      select: {
        status: true,
        class: { select: { teacherId: true, courseId: true, batchId: true, startsAt: true } },
        student: { select: { user: { select: { country: true } } } },
      },
      take,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Sweeps
  // ══════════════════════════════════════════════════════════════════════════
  private async reminderSweep() {
    const now = new Date();
    const windows: { field: 'reminder24hSentAt' | 'reminder1hSentAt' | 'reminder15mSentAt'; ms: number; label: string }[] = [
      { field: 'reminder24hSentAt', ms: 24 * 60 * 60 * 1000, label: '24 hours' },
      { field: 'reminder1hSentAt', ms: 60 * 60 * 1000, label: '1 hour' },
      { field: 'reminder15mSentAt', ms: 15 * 60 * 1000, label: '15 minutes' },
    ];
    for (const w of windows) {
      const due = await this.prisma.classSession.findMany({
        where: { status: ClassStatus.SCHEDULED, [w.field]: null, startsAt: { gt: now, lte: new Date(now.getTime() + w.ms) } },
        include: { attendees: { select: { studentId: true } }, batch: { select: { name: true } } },
        take: 100,
      });
      for (const cls of due) {
        const contacts = await this.studentContacts(cls.attendees.map((a) => a.studentId));
        const when = cls.startsAt.toLocaleString();
        for (const c of contacts) {
          this.notifications.createFor(c.userId, {
            type: 'CLASS_REMINDER',
            title: `Class in ${w.label}`,
            body: `${cls.title} starts at ${when}.`,
            link: `/student/attendance`,
          }).catch(() => undefined);
          this.emails.sendMail(
            c.email,
            `Reminder: class in ${w.label}`,
            `${c.firstName}'s class "${cls.title}" starts in ${w.label} (${when}).${cls.meetingUrl ? ` Join: ${cls.meetingUrl}` : ''}`,
            undefined,
            `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${c.guardian || 'Parent'},</p><p><b>${c.firstName}</b>'s class <b>${cls.title}</b> starts in <b>${w.label}</b> (${when}).</p>${cls.meetingUrl ? `<p><a href="${cls.meetingUrl}">Join the class</a></p>` : ''}<p style="color:#6b7280">— Academy Attendance</p></div>`,
          ).catch(() => undefined);
        }
        await this.prisma.classSession.update({ where: { id: cls.id }, data: { [w.field]: new Date() } });
      }
    }
  }

  /**
   * Raises a low-attendance alert for students who have fallen below the
   * configured rate over the configured window.
   *
   * Runs hourly rather than on the 5-minute cadence, and re-alerts for the same
   * student at most once a week — an alert that fires every sweep is an alert
   * everybody learns to ignore. The dedup key is the student link on the
   * notification, since the rows are addressed to staff, not to the student.
   */
  /** Admin-triggered run of the same check, reporting what it did. */
  async runLowAttendanceCheck() {
    const alerted = await this.lowAttendanceSweep();
    return { alerted: alerted.length, students: alerted };
  }

  private async lowAttendanceSweep() {
    const config = await this.getConfig();
    const windowStart = new Date(
      Date.now() - config.lowAttendanceWindowDays * 24 * 60 * 60 * 1000,
    );

    const marked = await this.prisma.classAttendee.groupBy({
      by: ['studentId'],
      where: { status: { not: null }, class: { startsAt: { gte: windowStart } } },
      _count: { _all: true },
    });

    const eligible = marked.filter((m) => m._count._all >= config.lowAttendanceMinSessions);
    if (!eligible.length) return [];

    const present = await this.prisma.classAttendee.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: eligible.map((e) => e.studentId) },
        status: { in: [StudentAttendanceStatus.PRESENT, StudentAttendanceStatus.LATE] },
        class: { startsAt: { gte: windowStart } },
      },
      _count: { _all: true },
    });
    const presentByStudent = new Map(present.map((p) => [p.studentId, p._count._all]));

    const breaching = eligible
      .map((e) => ({
        studentId: e.studentId,
        total: e._count._all,
        rate: Math.round(((presentByStudent.get(e.studentId) ?? 0) / e._count._all) * 1000) / 10,
      }))
      .filter((s) => s.rate < config.lowAttendanceThreshold);
    if (!breaching.length) return [];

    // Drop anyone already alerted about in the last week.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await this.prisma.notification.findMany({
      where: { type: 'LOW_ATTENDANCE', createdAt: { gte: weekAgo } },
      select: { link: true },
    });
    const alreadyAlerted = new Set(recent.map((r) => r.link ?? ''));

    const fresh = breaching.filter((s) => !alreadyAlerted.has(`/students/${s.studentId}`));
    if (!fresh.length) return [];

    const profiles = await this.prisma.studentProfile.findMany({
      where: { id: { in: fresh.map((f) => f.studentId) } },
      select: {
        id: true,
        coachId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const alerted: { studentId: string; name: string; rate: number; sessions: number }[] = [];

    for (const s of fresh) {
      const profile = profiles.find((p) => p.id === s.studentId);
      if (!profile) continue;
      const name = `${profile.user.firstName} ${profile.user.lastName}`.trim();
      const payload = {
        type: 'LOW_ATTENDANCE',
        title: 'Low attendance alert',
        body: `${name} is at ${s.rate}% over the last ${config.lowAttendanceWindowDays} days (${s.total} sessions), below the ${config.lowAttendanceThreshold}% threshold.`,
        link: `/students/${profile.id}`,
      };

      await this.notifications
        .createForRoles([Role.ADMIN, Role.SUPERVISOR], payload)
        .catch(() => undefined);

      // The assigned coach owns the follow-up, so notify them directly.
      if (profile.coachId) {
        await this.notifications.createFor(profile.coachId, payload).catch(() => undefined);
      }

      alerted.push({ studentId: profile.id, name, rate: s.rate, sessions: s.total });
    }

    return alerted;
  }

  private async autoLockSweep() {
    const config = await this.getConfig();
    const cutoff = new Date(Date.now() - config.autoLockMinutes * 60 * 1000);
    // Completed classes past the lock window, still unlocked.
    const due = await this.prisma.classSession.findMany({
      where: { attendanceLocked: false, status: ClassStatus.COMPLETED, actualEndAt: { lte: cutoff } },
      include: { attendees: true },
      take: 100,
    });
    for (const cls of due) {
      for (const a of cls.attendees) {
        if (a.status) continue; // already computed
        if (!a.joinedAt) {
          await this.prisma.classAttendee.update({ where: { id: a.id }, data: { status: 'NO_SHOW' as any, durationMins: 0 } });
        }
      }
      if (!cls.teacherStatus) {
        await this.prisma.classSession.update({ where: { id: cls.id }, data: { teacherStatus: 'ABSENT' as any } });
      }
      await this.prisma.classSession.update({ where: { id: cls.id }, data: { attendanceLocked: true, lockedAt: new Date() } });
    }

    // Also lock classes that were never ended but are long past their end time.
    const staleCutoff = new Date(Date.now() - (config.autoLockMinutes + 120) * 60 * 1000);
    const stale = await this.prisma.classSession.findMany({
      where: { attendanceLocked: false, status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] }, endsAt: { lte: staleCutoff } },
      include: { attendees: true },
      take: 100,
    });
    for (const cls of stale) {
      for (const a of cls.attendees) {
        if (a.status) continue;
        const { status, durationMins, lateMinutes } = this.computeStudentStatus(a.joinedAt, a.leftAt || (a.joinedAt ? cls.endsAt : null), cls, config);
        await this.prisma.classAttendee.update({ where: { id: a.id }, data: { status: status as any, durationMins, lateMinutes } });
      }
      await this.prisma.classSession.update({
        where: { id: cls.id },
        data: {
          status: ClassStatus.COMPLETED,
          actualEndAt: cls.actualEndAt || cls.endsAt,
          teacherStatus: cls.teacherStatus || ('ABSENT' as any),
          attendanceLocked: true,
          lockedAt: new Date(),
        },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════════
  private computeStudentStatus(joinedAt: Date | null, leftAt: Date | null, cls: any, config: AttendanceConfig) {
    const scheduledMins = Math.max(1, Math.round((cls.endsAt.getTime() - cls.startsAt.getTime()) / 60000));
    if (!joinedAt) return { status: 'NO_SHOW', durationMins: 0, lateMinutes: null as number | null };
    const end = leftAt || cls.actualEndAt || cls.endsAt;
    const durationMins = Math.max(0, Math.round((new Date(end).getTime() - joinedAt.getTime()) / 60000));
    const pct = (durationMins / scheduledMins) * 100;
    const lateRaw = Math.round((joinedAt.getTime() - cls.startsAt.getTime()) / 60000);
    const lateMinutes = lateRaw > config.lateGraceMinutes ? lateRaw : 0;
    let status: string;
    if (pct >= config.presentThreshold) status = lateMinutes > 0 ? 'LATE' : 'PRESENT';
    else if (pct >= config.lateThreshold) status = 'LATE';
    else status = 'ABSENT';
    return { status, durationMins, lateMinutes };
  }

  private decorateClass(c: any) {
    return {
      id: c.id,
      title: c.title,
      courseName: c.course?.title || null,
      teacherName: c.teacher ? `${c.teacher.user.firstName} ${c.teacher.user.lastName}` : null,
      batchName: c.batch?.name || null,
      batchCode: c.batch?.code || null,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      status: c.status,
      meetingUrl: c.meetingUrl,
      actualStartAt: c.actualStartAt,
      actualEndAt: c.actualEndAt,
      teacherStatus: c.teacherStatus,
      teacherLateMinutes: c.teacherLateMinutes,
      attendanceLocked: c.attendanceLocked,
      lockedAt: c.lockedAt,
      studentCount: c._count?.attendees,
    };
  }

  private async reloadClass(id: string) {
    return this.prisma.classSession.findUnique({
      where: { id },
      include: {
        course: { select: { title: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        batch: { select: { name: true, code: true } },
        _count: { select: { attendees: true } },
      },
    });
  }

  private async batchForScheduling(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { course: { select: { title: true } }, students: { select: { studentId: true } } },
    });
    if (!batch) throw new NotFoundException('Batch not found.');
    return batch;
  }

  private async attendeeForUser(classId: string, userId: string) {
    const student = await this.prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!student) throw new ForbiddenException('Only students can join a class.');
    const cls = await this.prisma.classSession.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found.');
    const attendee = await this.prisma.classAttendee.findUnique({ where: { classId_studentId: { classId, studentId: student.id } } });
    if (!attendee) throw new ForbiddenException('You are not enrolled in this class.');
    return { attendee, cls, studentId: student.id };
  }

  private async assertTeacher(teacherId: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!t) throw new BadRequestException('Teacher not found.');
  }

  private async assertOwningTeacher(teacherId: string, userId: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!t || t.id !== teacherId) throw new ForbiddenException('This is not your class.');
  }

  private async studentUserIds(studentIds: string[]) {
    if (!studentIds.length) return [];
    const rows = await this.prisma.studentProfile.findMany({ where: { id: { in: studentIds } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  private async studentContacts(studentIds: string[]) {
    if (!studentIds.length) return [];
    const rows = await this.prisma.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: { userId: true, guardianName: true, user: { select: { email: true, firstName: true } } },
    });
    return rows.map((r) => ({ userId: r.userId, email: r.user.email, firstName: r.user.firstName, guardian: r.guardianName }));
  }

  private async nextCode(model: 'Batch', prefix: string) {
    for (let i = 0; i < 5; i++) {
      const count = await (this.prisma as any)[model.charAt(0).toLowerCase() + model.slice(1)].count();
      const candidate = `${prefix}-${String(count + 1 + i).padStart(4, '0')}`;
      const clash = await this.prisma.batch.findUnique({ where: { code: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    return `${prefix}-${Date.now().toString().slice(-5)}`;
  }

  private async dailyTrend(days: number) {
    const out: { date: string; present: number; absent: number; rate: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const { start, end } = dayRange(d);
      const agg = await this.prisma.classAttendee.groupBy({
        by: ['status'],
        where: { status: { not: null }, class: { startsAt: { gte: start, lte: end } } },
        _count: { _all: true },
      });
      const present = sumStatuses(agg, ['PRESENT', 'LATE']);
      const absent = sumStatuses(agg, ['ABSENT', 'NO_SHOW']);
      out.push({ date: start.toISOString().slice(0, 10), present, absent, rate: present + absent ? Math.round((present / (present + absent)) * 100) : 0 });
    }
    return out;
  }

  // Email the student's account (used as the parent contact) + in-app alert.
  private async notifyAttendanceOutcome(classId: string) {
    const cls = await this.prisma.classSession.findUnique({
      where: { id: classId },
      include: {
        course: { select: { title: true } },
        attendees: { include: { student: { select: { userId: true, user: { select: { email: true, firstName: true } }, guardianName: true } } } },
      },
    });
    if (!cls) return;
    for (const a of cls.attendees) {
      if (!a.status || a.status === 'EXCUSED' || a.status === 'LEAVE_APPROVED') continue;
      const first = a.student.user.firstName;
      const subject = a.status === 'PRESENT' || a.status === 'LATE'
        ? `${first} attended today's ${cls.course?.title || 'class'}`
        : `${first} missed today's ${cls.course?.title || 'class'}`;
      const line = a.status === 'PRESENT' ? `${first} attended today's ${cls.course?.title || 'class'} successfully.`
        : a.status === 'LATE' ? `${first} joined today's class ${a.lateMinutes || 'a few'} minutes late.`
        : `${first} did not attend today's ${cls.course?.title || 'class'}.`;
      this.notifications.createFor(a.student.userId, {
        type: 'ATTENDANCE_RESULT', title: subject, body: line, link: `/student/attendance`,
      }).catch(() => undefined);
      this.emails.sendMail(a.student.user.email, subject, line, undefined,
        `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${a.student.guardianName || 'Parent'},</p><p>${line}</p><p style="color:#6b7280">— Academy Attendance</p></div>`,
      ).catch(() => undefined);
    }
  }
}

// ── module-scope helpers ──────────────────────────────────────────────────────
function clean<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
function dayRange(d: Date) {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d;
}
function sumStatuses(agg: { status: string | null; _count: { _all: number } }[], statuses: string[]) {
  return agg.filter((r) => r.status && statuses.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
}
function rate(present: number, total: number) {
  return total ? Math.round((present / total) * 100) : 0;
}
// Group attendee facts by a key → { present (PRESENT|LATE), total }. EXCUSED /
// LEAVE_APPROVED are neutral: excluded from both numerator and denominator.
type Fact = { status: string | null; class: { startsAt: Date } };
function groupRate<T extends Fact>(facts: T[], keyFn: (f: T) => any) {
  const m = new Map<any, { present: number; total: number }>();
  for (const f of facts) {
    if (f.status === 'EXCUSED' || f.status === 'LEAVE_APPROVED') continue;
    const k = keyFn(f);
    const rec = m.get(k) || { present: 0, total: 0 };
    rec.total += 1;
    if (f.status === 'PRESENT' || f.status === 'LATE') rec.present += 1;
    m.set(k, rec);
  }
  return m;
}
// Ordered period buckets (sorted by key) → [{ period, present, absent, rate }].
function bucketRate<T extends Fact>(facts: T[], keyFn: (f: T) => string) {
  const m = groupRate(facts, keyFn);
  return [...m.entries()]
    .map(([period, r]) => ({ period, present: r.present, absent: r.total - r.present, rate: rate(r.present, r.total) }))
    .sort((a, b) => a.period.localeCompare(b.period));
}
// ISO-ish week key "YYYY-Www" for weekly bucketing.
function weekKey(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
