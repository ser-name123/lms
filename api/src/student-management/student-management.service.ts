import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  EnrollmentStatus, Role, StudentAttendanceStatus, UserStatus,
} from '../generated/prisma/enums';
import {
  AddDocumentDto, AddNoteDto, AssignCourseDto, ChangeBatchDto, ChangeTeacherDto,
  FreezeStudentDto, LogCommunicationDto, SendStudentMessageDto, SetStudentStatusDto,
  UpdateEnrollmentDto, UpdateStudentAcademicDto, UpdateStudentBasicDto, UpdateStudentParentDto,
} from './dto';

type Actor = { id?: string; name?: string } | undefined;

type StudentDoc = {
  id: string; type: string; label: string; url: string;
  uploadedAt: string; archived: boolean;
};

// EXCUSED / LEAVE_APPROVED are neutral (excluded from the attendance denominator).
const NEUTRAL: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.EXCUSED, StudentAttendanceStatus.LEAVE_APPROVED,
];

@Injectable()
export class StudentManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Shared helpers ──────────────────────────────────────────────────────────
  private async assertExists(id: string) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw new NotFoundException('Student not found.');
    return s;
  }

  /** Append one immutable row to the student's activity log. Never deleted. */
  private async log(
    studentId: string,
    row: {
      kind: 'TIMELINE' | 'AUDIT' | 'NOTE' | 'COMMUNICATION' | 'STATUS';
      type: string; title: string; description?: string;
      channel?: string; visibility?: string; meta?: unknown;
    },
    actor: Actor,
  ) {
    return this.prisma.studentActivity.create({
      data: {
        studentId,
        kind: row.kind,
        type: row.type,
        title: row.title,
        description: row.description,
        channel: row.channel,
        visibility: row.visibility ?? 'STAFF',
        meta: (row.meta ?? undefined) as never,
        actorId: actor?.id,
        actorName: actor?.name,
      },
    });
  }

  /** A milestone (Timeline) + a detailed audit line, in one call. */
  private async logChange(
    studentId: string,
    type: string, title: string, description: string, meta: unknown, actor: Actor,
  ) {
    await this.log(studentId, { kind: 'TIMELINE', type, title, description }, actor);
    await this.log(studentId, { kind: 'AUDIT', type, title, description, meta }, actor);
  }

  private attRate(rows: { status: StudentAttendanceStatus | null; attended: boolean }[]) {
    let present = 0, absent = 0, late = 0, denom = 0;
    for (const r of rows) {
      if (r.status && NEUTRAL.includes(r.status)) continue;
      denom++;
      const isPresent = r.status === StudentAttendanceStatus.PRESENT
        || r.status === StudentAttendanceStatus.LATE
        || (!r.status && r.attended);
      if (isPresent) present++; else absent++;
      if (r.status === StudentAttendanceStatus.LATE) late++;
    }
    return { present, absent, late, total: denom, rate: denom ? Math.round((present / denom) * 100) : 0 };
  }

  private docsOf(raw: unknown): StudentDoc[] {
    return Array.isArray(raw) ? (raw as StudentDoc[]) : [];
  }

  private async resolveUserName(userId?: string | null) {
    if (!userId) return null;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName} ${u.lastName}` : null;
  }

  // ── Full hub payload ────────────────────────────────────────────────────────
  async getManagement(id: string) {
    const s = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: true,
        enrollments: {
          include: {
            course: { select: { id: true, title: true } },
            teacher: { select: { id: true, teacherCode: true, user: { select: { firstName: true, lastName: true } } } },
            package: { select: { id: true, name: true, classesPerMonth: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        batches: {
          include: {
            batch: {
              select: {
                id: true, code: true, name: true, status: true, level: true,
                daysOfWeek: true, startTime: true, endTime: true, capacity: true,
                teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
                course: { select: { title: true } },
                _count: { select: { students: true } },
              },
            },
          },
        },
      },
    });
    if (!s) throw new NotFoundException('Student not found.');

    const batchIds = s.batches.map((b) => b.batchId);
    const now = new Date();

    const [attendees, submissions, dueInvoices, upcomingClasses] = await Promise.all([
      this.prisma.classAttendee.findMany({ where: { studentId: id }, select: { status: true, attended: true } }),
      this.prisma.submission.findMany({
        where: { studentId: id },
        select: { status: true, grade: true, submittedAt: true, assignment: { select: { dueAt: true } } },
      }),
      this.prisma.invoice.count({ where: { studentId: id, status: { in: ['SENT', 'OVERDUE'] } } }),
      batchIds.length
        ? this.prisma.classSession.count({ where: { batchId: { in: batchIds }, startsAt: { gt: now }, status: 'SCHEDULED' } })
        : Promise.resolve(0),
    ]);

    const att = this.attRate(attendees);
    const pendingAssignments = submissions.filter((x) => x.status === 'ASSIGNED' || x.status === 'SUBMITTED').length;
    const completedAssignments = submissions.filter((x) => x.status === 'EVALUATED').length;

    const active = s.enrollments.find((e) => e.status === EnrollmentStatus.ACTIVE) ?? s.enrollments[0];
    const teacherName = active?.teacher ? `${active.teacher.user.firstName} ${active.teacher.user.lastName}` : null;
    const coach = await this.resolveUserName(s.coachId);

    return {
      id: s.id,
      studentCode: s.studentCode,
      status: s.user.status,
      onHoldReason: s.onHoldReason,
      onHoldAt: s.onHoldAt,
      coachId: s.coachId,
      coach,
      user: {
        id: s.user.id,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        email: s.user.email,
        avatarUrl: s.user.avatarUrl,
        country: s.user.country,
        timezone: s.user.timezone,
        lastLoginAt: s.user.lastLoginAt,
        createdAt: s.user.createdAt,
      },
      profile: {
        phone: s.phone,
        gender: s.gender,
        dateOfBirth: s.dateOfBirth,
        nationality: s.nationality,
        address: s.address,
        timeZone: s.timeZone,
        profession: s.profession,
        joiningDate: s.joiningDate,
        fees: s.fees,
        lastPaymentDate: s.lastPaymentDate,
        nextPaymentDate: s.nextPaymentDate,
      },
      academic: {
        currentGrade: s.currentGrade,
        currentSchool: s.currentSchool,
        board: s.board,
        learningLevel: s.learningLevel,
        preferredLanguage: s.preferredLanguage,
        learningGoal: s.learningGoal,
      },
      parent: {
        parentName: s.parentName,
        guardianName: s.guardianName,
        parentRelationship: s.parentRelationship,
        parentEmail: s.parentEmail,
        parentMobile: s.parentMobile,
        parentWhatsapp: s.parentWhatsapp,
      },
      activeCourse: active
        ? { id: active.id, courseId: active.courseId, title: active.course.title, status: active.status, progress: active.progress, teacher: teacherName }
        : null,
      enrollments: s.enrollments.map((e) => ({
        id: e.id,
        courseId: e.courseId,
        course: e.course.title,
        status: e.status,
        progress: e.progress,
        teacherId: e.teacherId,
        teacher: e.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : null,
        package: e.package?.name ?? null,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
      })),
      batches: s.batches.map((b) => ({
        id: b.batch.id,
        code: b.batch.code,
        name: b.batch.name,
        course: b.batch.course.title,
        status: b.batch.status,
        level: b.batch.level,
        teacher: b.batch.teacher ? `${b.batch.teacher.user.firstName} ${b.batch.teacher.user.lastName}` : null,
        schedule: b.batch.daysOfWeek?.length ? `${b.batch.daysOfWeek.join(', ')} · ${b.batch.startTime ?? ''}-${b.batch.endTime ?? ''}` : null,
        occupancy: b.batch.capacity ? `${b.batch._count.students}/${b.batch.capacity}` : String(b.batch._count.students),
        addedAt: b.addedAt,
      })),
      attendanceSummary: att,
      cards: {
        attendanceRate: att.rate,
        pendingAssignments,
        completedAssignments,
        upcomingClasses,
        dueInvoices,
      },
      documents: this.docsOf(s.documents).filter((d) => !d.archived),
    };
  }

  // ── Profile edits ───────────────────────────────────────────────────────────
  async updateBasic(id: string, dto: UpdateStudentBasicDto, actor: Actor) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!s) throw new NotFoundException('Student not found.');
    await this.prisma.studentProfile.update({
      where: { id },
      data: {
        phone: dto.phone,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        nationality: dto.nationality,
        address: dto.address,
        timeZone: dto.timeZone,
        profession: dto.profession,
        user: {
          update: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            country: dto.country,
            gender: dto.gender,
            timezone: dto.timeZone,
          },
        },
      },
    });
    await this.log(id, { kind: 'AUDIT', type: 'PROFILE_UPDATED', title: 'Basic information updated', meta: dto }, actor);
    return { updated: true };
  }

  async updateAcademic(id: string, dto: UpdateStudentAcademicDto, actor: Actor) {
    await this.assertExists(id);
    await this.prisma.studentProfile.update({ where: { id }, data: { ...dto } });
    await this.log(id, { kind: 'AUDIT', type: 'ACADEMIC_UPDATED', title: 'Academic information updated', meta: dto }, actor);
    return { updated: true };
  }

  async updateParent(id: string, dto: UpdateStudentParentDto, actor: Actor) {
    await this.assertExists(id);
    await this.prisma.studentProfile.update({ where: { id }, data: { ...dto } });
    await this.log(id, { kind: 'AUDIT', type: 'PARENT_UPDATED', title: 'Parent / guardian information updated', meta: dto }, actor);
    return { updated: true };
  }

  // ── Course / Batch / Teacher assignment ─────────────────────────────────────
  async assignCourse(id: string, dto: AssignCourseDto, actor: Actor) {
    await this.assertExists(id);
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId }, select: { id: true, title: true } });
    if (!course) throw new BadRequestException('Course not found.');
    if (dto.teacherId) {
      const t = await this.prisma.teacherProfile.findUnique({ where: { id: dto.teacherId }, select: { id: true } });
      if (!t) throw new BadRequestException('Teacher not found.');
    }
    const status = (dto.status as EnrollmentStatus) ?? EnrollmentStatus.ACTIVE;
    const enrollment = await this.prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId: id, courseId: course.id } },
      create: {
        studentId: id, courseId: course.id, teacherId: dto.teacherId ?? null,
        packageId: dto.packageId ?? null, status,
        startedAt: status === EnrollmentStatus.ACTIVE ? new Date() : null,
      },
      update: {
        teacherId: dto.teacherId ?? undefined,
        packageId: dto.packageId ?? undefined,
        status,
      },
    });
    await this.logChange(id, 'COURSE_ASSIGNED', `Course assigned: ${course.title}`,
      `${course.title}${dto.teacherId ? ' with a teacher' : ''}`, { ...dto, courseId: course.id }, actor);
    await this.notifyParent(id, 'Course updated', `A course (${course.title}) has been assigned/updated.`).catch(() => undefined);
    return { enrollmentId: enrollment.id };
  }

  async updateEnrollment(id: string, enrollmentId: string, dto: UpdateEnrollmentDto, actor: Actor) {
    const e = await this.prisma.enrollment.findFirst({ where: { id: enrollmentId, studentId: id }, include: { course: { select: { title: true } } } });
    if (!e) throw new NotFoundException('Enrollment not found for this student.');
    const status = dto.status as EnrollmentStatus | undefined;
    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status,
        progress: dto.progress,
        completedAt: status === EnrollmentStatus.COMPLETED ? new Date() : undefined,
      },
    });
    await this.logChange(id, 'ENROLLMENT_UPDATED', `Course updated: ${e.course.title}`,
      `Status ${e.status} → ${dto.status ?? e.status}${dto.progress != null ? `, progress ${dto.progress}%` : ''}`,
      { enrollmentId, from: e.status, ...dto }, actor);
    if (status === EnrollmentStatus.COMPLETED) {
      await this.notifyParent(id, 'Course completed 🎉', `${e.course.title} has been marked completed. A certificate will follow.`).catch(() => undefined);
    }
    return { updated: true };
  }

  async changeTeacher(id: string, dto: ChangeTeacherDto, actor: Actor) {
    const e = await this.prisma.enrollment.findFirst({
      where: { id: dto.enrollmentId, studentId: id },
      include: {
        course: { select: { title: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        student: { select: { userId: true, parentEmail: true, guardianName: true, user: { select: { email: true, firstName: true } } } },
      },
    });
    if (!e) throw new NotFoundException('Enrollment not found for this student.');
    if (e.teacherId === dto.toTeacherId) throw new BadRequestException('Student is already with this teacher.');
    const dest = await this.prisma.teacherProfile.findUnique({
      where: { id: dto.toTeacherId }, select: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!dest) throw new BadRequestException('Destination teacher not found.');
    const destName = `${dest.user.firstName} ${dest.user.lastName}`;
    const fromName = e.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : 'Unassigned';

    await this.prisma.enrollment.update({ where: { id: e.id }, data: { teacherId: dto.toTeacherId } });

    await this.logChange(id, 'TEACHER_CHANGED', `Teacher changed for ${e.course.title}`,
      `${fromName} → ${destName}. Reason: ${dto.reason}`,
      { enrollmentId: e.id, from: e.teacherId, to: dto.toTeacherId, reason: dto.reason }, actor);

    // Notify student + parent
    this.notifications.createFor(e.student.userId, {
      type: 'TEACHER_TRANSFER', title: 'Your teacher has changed',
      body: `Your ${e.course.title} class is now with ${destName}.`, link: '/student/classes',
    }).catch(() => undefined);
    await this.emailParent(id, e.student.parentEmail || e.student.user.email, e.student.guardianName || e.student.user.firstName,
      'Update: your class teacher has changed',
      `${e.student.user.firstName}'s ${e.course.title} class has been reassigned to ${destName}. Reason: ${dto.reason}`).catch(() => undefined);
    return { changed: true, toTeacher: destName };
  }

  async changeBatch(id: string, dto: ChangeBatchDto, actor: Actor) {
    await this.assertExists(id);
    const batch = await this.prisma.batch.findUnique({ where: { id: dto.batchId }, select: { id: true, code: true, name: true } });
    if (!batch) throw new BadRequestException('Batch not found.');

    const current = await this.prisma.batchStudent.findMany({
      where: { studentId: id }, include: { batch: { select: { code: true, name: true } } },
    });
    if (current.some((c) => c.batchId === dto.batchId)) throw new BadRequestException('Student is already in this batch.');
    const fromLabel = current.map((c) => c.batch.code).join(', ') || 'None';

    await this.prisma.$transaction([
      this.prisma.batchStudent.deleteMany({ where: { studentId: id } }),
      this.prisma.batchStudent.create({ data: { batchId: dto.batchId, studentId: id } }),
    ]);

    await this.logChange(id, 'BATCH_CHANGED', `Batch changed to ${batch.code}`,
      `${fromLabel} → ${batch.code} (${batch.name}).${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
      { from: current.map((c) => c.batchId), to: dto.batchId, reason: dto.reason }, actor);
    await this.notifyParent(id, 'Batch updated', `Your child has been moved to batch ${batch.code} (${batch.name}).`).catch(() => undefined);
    return { changed: true, batch: batch.code };
  }

  /** Complete batch history for the student, newest first. */
  async getBatchHistory(id: string) {
    await this.assertExists(id);
    const [current, history] = await Promise.all([
      this.prisma.batchStudent.findMany({
        where: { studentId: id },
        include: { batch: { select: { code: true, name: true, status: true, course: { select: { title: true } } } } },
      }),
      this.prisma.studentActivity.findMany({
        where: { studentId: id, type: 'BATCH_CHANGED', kind: 'AUDIT' }, orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      current: current.map((c) => ({ code: c.batch.code, name: c.batch.name, course: c.batch.course.title, status: c.batch.status, since: c.addedAt })),
      history,
    };
  }

  // ── Status / freeze / reactivate ────────────────────────────────────────────
  async setStatus(id: string, dto: SetStudentStatusDto, actor: Actor) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true, user: { select: { status: true } } } });
    if (!s) throw new NotFoundException('Student not found.');
    await this.prisma.user.update({ where: { id: s.userId }, data: { status: dto.status } });
    await this.logChange(id, 'STATUS_CHANGED', `Status changed to ${dto.status}`,
      `${s.user.status} → ${dto.status}`, { from: s.user.status, to: dto.status }, actor);
    await this.notifyParent(id, 'Account status updated', `The student account status is now ${dto.status}.`).catch(() => undefined);
    return { status: dto.status };
  }

  async freeze(id: string, dto: FreezeStudentDto, actor: Actor) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!s) throw new NotFoundException('Student not found.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: s.userId }, data: { status: UserStatus.PAUSED } }),
      this.prisma.studentProfile.update({ where: { id }, data: { onHoldReason: dto.reason, onHoldAt: new Date() } }),
    ]);
    await this.logChange(id, 'FROZEN', 'Student put On Hold', `Reason: ${dto.reason}`, { reason: dto.reason }, actor);
    await this.notifyParent(id, 'Classes temporarily on hold', `The student's classes have been put on hold. Reason: ${dto.reason}`).catch(() => undefined);
    return { status: UserStatus.PAUSED };
  }

  async reactivate(id: string, actor: Actor) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!s) throw new NotFoundException('Student not found.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: s.userId }, data: { status: UserStatus.ACTIVE } }),
      this.prisma.studentProfile.update({ where: { id }, data: { onHoldReason: null, onHoldAt: null } }),
    ]);
    await this.logChange(id, 'REACTIVATED', 'Student reactivated', 'Classes resumed.', {}, actor);
    await this.notifyParent(id, 'Classes resumed', "The student's classes have resumed.").catch(() => undefined);
    return { status: UserStatus.ACTIVE };
  }

  // ── Notes (private — admin + coach only) ────────────────────────────────────
  async getNotes(id: string) {
    await this.assertExists(id);
    return this.prisma.studentActivity.findMany({
      where: { studentId: id, kind: 'NOTE' }, orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(id: string, dto: AddNoteDto, actor: Actor) {
    await this.assertExists(id);
    return this.log(id, { kind: 'NOTE', type: 'NOTE', title: 'Private note', description: dto.text, visibility: 'STAFF' }, actor);
  }

  // ── Documents ───────────────────────────────────────────────────────────────
  async getDocuments(id: string) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { documents: true } });
    if (!s) throw new NotFoundException('Student not found.');
    return this.docsOf(s.documents);
  }

  async addDocument(id: string, dto: AddDocumentDto, actor: Actor) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { documents: true } });
    if (!s) throw new NotFoundException('Student not found.');
    const docs = this.docsOf(s.documents);
    const doc: StudentDoc = { id: randomUUID(), type: dto.type, label: dto.label, url: dto.url, uploadedAt: new Date().toISOString(), archived: false };
    docs.push(doc);
    await this.prisma.studentProfile.update({ where: { id }, data: { documents: docs as never } });
    await this.log(id, { kind: 'AUDIT', type: 'DOCUMENT_ADDED', title: `Document added: ${dto.label}`, meta: { type: dto.type } }, actor);
    return doc;
  }

  async archiveDocument(id: string, docId: string, archived: boolean, actor: Actor) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { documents: true } });
    if (!s) throw new NotFoundException('Student not found.');
    const docs = this.docsOf(s.documents);
    const doc = docs.find((d) => d.id === docId);
    if (!doc) throw new NotFoundException('Document not found.');
    doc.archived = archived;
    await this.prisma.studentProfile.update({ where: { id }, data: { documents: docs as never } });
    await this.log(id, { kind: 'AUDIT', type: 'DOCUMENT_ARCHIVED', title: `Document ${archived ? 'archived' : 'restored'}: ${doc.label}`, meta: { docId } }, actor);
    return { archived };
  }

  // ── Communication ───────────────────────────────────────────────────────────
  async getCommunication(id: string) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!s) throw new NotFoundException('Student not found.');
    const [logged, notifications] = await Promise.all([
      this.prisma.studentActivity.findMany({ where: { studentId: id, kind: 'COMMUNICATION' }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.notification.findMany({ where: { userId: s.userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { logged, notifications };
  }

  async sendMessage(id: string, dto: SendStudentMessageDto, actor: Actor) {
    const s = await this.prisma.studentProfile.findUnique({
      where: { id },
      select: { userId: true, parentEmail: true, guardianName: true, user: { select: { email: true, firstName: true } } },
    });
    if (!s) throw new NotFoundException('Student not found.');
    const channel = dto.channel || 'BOTH';
    const audience = dto.audience || 'STUDENT';

    if ((channel === 'IN_APP' || channel === 'BOTH') && (audience === 'STUDENT' || audience === 'BOTH')) {
      await this.notifications.createFor(s.userId, { type: 'ADMIN_MESSAGE', title: dto.title, body: dto.body, link: '/student/dashboard' });
    }
    if (channel === 'EMAIL' || channel === 'BOTH') {
      const html = (name: string) => `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${name},</p><p>${dto.body.replace(/\n/g, '<br/>')}</p><p style="color:#6b7280">— Academy Administration</p></div>`;
      if (audience === 'STUDENT' || audience === 'BOTH') {
        await this.emails.sendMail(s.user.email, dto.title, dto.body, undefined, html(s.user.firstName)).catch(() => undefined);
      }
      if ((audience === 'PARENT' || audience === 'BOTH') && s.parentEmail) {
        await this.emails.sendMail(s.parentEmail, dto.title, dto.body, undefined, html(s.guardianName || 'Parent')).catch(() => undefined);
      }
    }
    await this.log(id, { kind: 'COMMUNICATION', type: 'MESSAGE', title: dto.title, description: dto.body, channel, meta: { audience } }, actor);
    return { sent: true };
  }

  /** Log a communication that happened outside the system (a phone call, WhatsApp, etc.). */
  async logCommunication(id: string, dto: LogCommunicationDto, actor: Actor) {
    await this.assertExists(id);
    return this.log(id, { kind: 'COMMUNICATION', type: dto.channel, title: `${dto.channel} logged`, description: dto.summary, channel: dto.channel }, actor);
  }

  // ── Timeline / Audit ────────────────────────────────────────────────────────
  async getTimeline(id: string) {
    await this.assertExists(id);
    return this.prisma.studentActivity.findMany({
      where: { studentId: id, kind: { in: ['TIMELINE', 'STATUS'] } }, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async getAudit(id: string) {
    await this.assertExists(id);
    return this.prisma.studentActivity.findMany({
      where: { studentId: id, kind: 'AUDIT' }, orderBy: { createdAt: 'desc' }, take: 300,
    });
  }

  // ── Per-student attendance / assignments / performance ──────────────────────
  async getAttendance(id: string) {
    await this.assertExists(id);
    const rows = await this.prisma.classAttendee.findMany({
      where: { studentId: id },
      include: { class: { select: { title: true, startsAt: true, status: true, course: { select: { title: true } } } } },
      orderBy: { class: { startsAt: 'desc' } },
      take: 300,
    });
    const summary = this.attRate(rows.map((r) => ({ status: r.status, attended: r.attended })));
    // Monthly trend (last 6 months)
    const trend = new Map<string, { present: number; total: number }>();
    for (const r of rows) {
      if (r.status && NEUTRAL.includes(r.status)) continue;
      const d = r.class.startsAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = trend.get(key) ?? { present: 0, total: 0 };
      cur.total++;
      if (r.status === 'PRESENT' || r.status === 'LATE' || (!r.status && r.attended)) cur.present++;
      trend.set(key, cur);
    }
    const trendArr = [...trend.entries()].sort().slice(-6).map(([month, v]) => ({ month, rate: v.total ? Math.round((v.present / v.total) * 100) : 0 }));
    return {
      summary,
      trend: trendArr,
      recent: rows.slice(0, 40).map((r) => ({
        title: r.class.title, course: r.class.course.title, date: r.class.startsAt,
        status: r.status ?? (r.attended ? 'PRESENT' : 'ABSENT'), lateMinutes: r.lateMinutes,
      })),
    };
  }

  async getAssignments(id: string) {
    await this.assertExists(id);
    const subs = await this.prisma.submission.findMany({
      where: { studentId: id },
      include: { assignment: { select: { title: true, dueAt: true, course: { select: { title: true } } } } },
      orderBy: { submittedAt: 'desc' },
      take: 200,
    });
    const graded = subs.filter((s) => s.grade != null);
    const late = subs.filter((s) => s.submittedAt && s.assignment.dueAt && s.submittedAt > s.assignment.dueAt).length;
    return {
      summary: {
        total: subs.length,
        pending: subs.filter((s) => s.status === 'ASSIGNED' || s.status === 'SUBMITTED').length,
        completed: subs.filter((s) => s.status === 'EVALUATED').length,
        lateSubmissions: late,
        avgMark: graded.length ? Math.round(graded.reduce((a, s) => a + (s.grade ?? 0), 0) / graded.length) : null,
      },
      items: subs.map((s) => ({
        title: s.assignment.title, course: s.assignment.course.title,
        status: s.status, grade: s.grade, dueAt: s.assignment.dueAt, submittedAt: s.submittedAt,
        late: !!(s.submittedAt && s.assignment.dueAt && s.submittedAt > s.assignment.dueAt),
      })),
    };
  }

  async getPerformance(id: string) {
    const [attendance, assignments] = await Promise.all([this.getAttendance(id), this.getAssignments(id)]);
    const graded = assignments.items.filter((i) => i.grade != null);
    // Assessment (grade) trend by month
    const gt = new Map<string, { sum: number; n: number }>();
    for (const i of graded) {
      if (!i.submittedAt) continue;
      const d = new Date(i.submittedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = gt.get(key) ?? { sum: 0, n: 0 };
      cur.sum += i.grade ?? 0; cur.n++; gt.set(key, cur);
    }
    const assessmentTrend = [...gt.entries()].sort().slice(-6).map(([month, v]) => ({ month, score: Math.round(v.sum / v.n) }));
    return {
      attendanceTrend: attendance.trend,
      assessmentTrend,
      attendanceRate: attendance.summary.rate,
      avgScore: assignments.summary.avgMark,
      highestScore: graded.length ? Math.max(...graded.map((g) => g.grade ?? 0)) : null,
      totalAssessments: graded.length,
    };
  }

  // ── Fleet analytics (across all students) ───────────────────────────────────
  async fleetAnalytics() {
    const [byStatus, students, enrollments, attendees, gradedSubs, batches] = await Promise.all([
      this.prisma.user.groupBy({ by: ['status'], where: { role: Role.STUDENT }, _count: true }),
      this.prisma.studentProfile.findMany({ select: { id: true, joiningDate: true, coachId: true, user: { select: { country: true, createdAt: true } } } }),
      this.prisma.enrollment.findMany({ select: { courseId: true, teacherId: true, status: true, course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } } } }),
      this.prisma.classAttendee.findMany({ select: { status: true, attended: true } }),
      this.prisma.submission.findMany({ where: { grade: { not: null } }, select: { grade: true } }),
      this.prisma.batch.findMany({ select: { code: true, capacity: true, _count: { select: { students: true } } } }),
    ]);

    const statusCount = (s: UserStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
    const total = students.length;
    const att = this.attRate(attendees);
    const avgScore = gradedSubs.length ? Math.round(gradedSubs.reduce((a, s) => a + (s.grade ?? 0), 0) / gradedSubs.length) : 0;
    const completed = enrollments.filter((e) => e.status === EnrollmentStatus.COMPLETED).length;
    const dropouts = enrollments.filter((e) => e.status === EnrollmentStatus.CANCELLED).length;

    // Monthly admissions + cumulative growth
    const monthly = new Map<string, number>();
    for (const s of students) {
      const d = s.joiningDate ?? s.user.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly.set(key, (monthly.get(key) ?? 0) + 1);
    }
    const monthlyAdmissions = [...monthly.entries()].sort().slice(-12).map(([month, count]) => ({ month, count }));
    let running = 0;
    const studentGrowth = monthlyAdmissions.map((m) => ({ month: m.month, total: (running += m.count) }));

    // Coach-wise distribution (resolve coach names)
    const cIds = [...new Set(students.map((s) => s.coachId).filter(Boolean) as string[])];
    const cUsers = cIds.length ? await this.prisma.user.findMany({ where: { id: { in: cIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const cName = new Map(cUsers.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
    const cCounts = new Map<string, number>();
    for (const s of students) { const n = s.coachId ? (cName.get(s.coachId) ?? 'Unknown') : 'Unassigned'; cCounts.set(n, (cCounts.get(n) ?? 0) + 1); }
    const coachWise = [...cCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const groupCount = <T>(rows: T[], key: (r: T) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };

    return {
      cards: {
        total,
        active: statusCount(UserStatus.ACTIVE),
        trial: statusCount(UserStatus.TRIAL),
        onHold: statusCount(UserStatus.PAUSED),
        inactive: statusCount(UserStatus.INACTIVE),
        completed,
        dropouts,
        avgAttendance: att.rate,
        avgScore,
      },
      courseWise: groupCount(enrollments, (e) => e.course.title).slice(0, 12),
      countryWise: groupCount(students, (s) => s.user.country).slice(0, 12),
      coachWise: coachWise.slice(0, 12),
      teacherWise: groupCount(enrollments.filter((e) => e.teacher), (e) => e.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : null).slice(0, 12),
      batchOccupancy: batches.map((b) => ({ name: b.code, students: b._count.students, capacity: b.capacity ?? 0 })).slice(0, 15),
      monthlyAdmissions,
      studentGrowth,
    };
  }

  // ── Reports ─────────────────────────────────────────────────────────────────
  async report(type: string) {
    switch (type) {
      case 'active':
      case 'inactive':
      case 'student': {
        const statusFilter = type === 'active' ? { status: UserStatus.ACTIVE }
          : type === 'inactive' ? { status: { in: [UserStatus.INACTIVE, UserStatus.PAUSED] } } : {};
        const students = await this.prisma.studentProfile.findMany({
          where: { user: statusFilter },
          select: {
            id: true, studentCode: true, coachId: true,
            user: { select: { firstName: true, lastName: true, email: true, country: true, status: true } },
            enrollments: { select: { course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } } }, take: 1 },
            batches: { select: { batch: { select: { code: true } } }, take: 1 },
            parentName: true,
            attendance: { select: { status: true, attended: true } },
          },
          orderBy: { studentCode: 'asc' },
          take: 1000,
        });
        const coachIds = [...new Set(students.map((s) => s.coachId).filter(Boolean) as string[])];
        const coaches = coachIds.length
          ? await this.prisma.user.findMany({ where: { id: { in: coachIds } }, select: { id: true, firstName: true, lastName: true } })
          : [];
        const coachMap = new Map(coaches.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
        return students.map((s) => {
          const att = this.attRate(s.attendance);
          const e = s.enrollments[0];
          return {
            studentCode: s.studentCode,
            name: `${s.user.firstName} ${s.user.lastName}`,
            email: s.user.email,
            country: s.user.country,
            status: s.user.status,
            course: e?.course.title ?? null,
            teacher: e?.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : null,
            coach: s.coachId ? coachMap.get(s.coachId) ?? null : null,
            batch: s.batches[0]?.batch.code ?? null,
            parent: s.parentName ?? null,
            attendance: att.rate,
          };
        });
      }
      case 'dropout': {
        const rows = await this.prisma.enrollment.findMany({
          where: { status: EnrollmentStatus.CANCELLED },
          select: { updatedAt: true, course: { select: { title: true } }, student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true, country: true } } } } },
          orderBy: { updatedAt: 'desc' }, take: 500,
        });
        return rows.map((r) => ({ studentCode: r.student.studentCode, name: `${r.student.user.firstName} ${r.student.user.lastName}`, country: r.student.user.country, course: r.course.title, droppedAt: r.updatedAt }));
      }
      case 'trial-conversion': {
        const [totalLeads, converted] = await Promise.all([
          this.prisma.lead.count(),
          this.prisma.lead.count({ where: { status: 'CONVERTED' } }),
        ]);
        return { totalLeads, converted, conversionRate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0 };
      }
      case 'course': {
        const rows = await this.prisma.enrollment.groupBy({ by: ['courseId'], _count: true });
        const courses = await this.prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId) } }, select: { id: true, title: true } });
        return rows.map((r) => ({ course: courses.find((c) => c.id === r.courseId)?.title ?? r.courseId, students: r._count })).sort((a, b) => b.students - a.students);
      }
      case 'batch': {
        const batches = await this.prisma.batch.findMany({ select: { code: true, name: true, capacity: true, status: true, course: { select: { title: true } }, _count: { select: { students: true } } } });
        return batches.map((b) => ({ code: b.code, name: b.name, course: b.course.title, status: b.status, students: b._count.students, capacity: b.capacity ?? 0 }));
      }
      case 'teacher': {
        const rows = await this.prisma.enrollment.groupBy({ by: ['teacherId'], where: { teacherId: { not: null } }, _count: true });
        const teachers = await this.prisma.teacherProfile.findMany({ where: { id: { in: rows.map((r) => r.teacherId!).filter(Boolean) } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } });
        return rows.map((r) => ({ teacher: (() => { const t = teachers.find((x) => x.id === r.teacherId); return t ? `${t.user.firstName} ${t.user.lastName}` : r.teacherId; })(), students: r._count })).sort((a, b) => b.students - a.students);
      }
      case 'country': {
        const rows = await this.prisma.user.groupBy({ by: ['country'], where: { role: Role.STUDENT }, _count: true });
        return rows.map((r) => ({ country: r.country ?? 'Unknown', students: r._count })).sort((a, b) => b.students - a.students);
      }
      default:
        throw new BadRequestException(`Unknown report type: ${type}`);
    }
  }

  // ── Academic Coach ──────────────────────────────────────────────────────────
  async listCoaches() {
    const coaches = await this.prisma.user.findMany({
      where: { role: Role.ACADEMIC_COACH }, select: { id: true, firstName: true, lastName: true, email: true }, orderBy: { firstName: 'asc' },
    });
    return coaches.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email }));
  }

  async assignCoach(id: string, coachId: string | null | undefined, actor: Actor) {
    await this.assertExists(id);
    if (coachId) {
      const c = await this.prisma.user.findFirst({ where: { id: coachId, role: Role.ACADEMIC_COACH }, select: { id: true } });
      if (!c) throw new BadRequestException('Coach not found.');
    }
    await this.prisma.studentProfile.update({ where: { id }, data: { coachId: coachId || null } });
    const name = await this.resolveUserName(coachId);
    await this.logChange(id, 'COACH_ASSIGNED', coachId ? `Academic Coach assigned: ${name}` : 'Academic Coach removed', name ?? 'None', { coachId }, actor);
    return { coachId: coachId || null, coach: name };
  }


  // ── Transfer approval workflow ──────────────────────────────────────────────
  async requestTransfer(id: string, kind: string, reason: string, payload: Record<string, unknown>, actor: Actor) {
    await this.assertExists(id);
    let toLabel: string | null = null;
    let fromLabel: string | null = null;
    if (kind === 'TEACHER') {
      const e = await this.prisma.enrollment.findFirst({ where: { id: String(payload.enrollmentId), studentId: id }, include: { teacher: { select: { user: { select: { firstName: true, lastName: true } } } }, course: { select: { title: true } } } });
      if (!e) throw new BadRequestException('Enrollment not found.');
      const dest = await this.prisma.teacherProfile.findUnique({ where: { id: String(payload.toTeacherId) }, select: { user: { select: { firstName: true, lastName: true } } } });
      if (!dest) throw new BadRequestException('Destination teacher not found.');
      fromLabel = e.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : 'Unassigned';
      toLabel = `${dest.user.firstName} ${dest.user.lastName} (${e.course.title})`;
    } else if (kind === 'BATCH') {
      const b = await this.prisma.batch.findUnique({ where: { id: String(payload.batchId) }, select: { code: true, name: true } });
      if (!b) throw new BadRequestException('Batch not found.');
      toLabel = `${b.code} · ${b.name}`;
    } else if (kind === 'COURSE') {
      const c = await this.prisma.course.findUnique({ where: { id: String(payload.courseId) }, select: { title: true } });
      if (!c) throw new BadRequestException('Course not found.');
      toLabel = c.title;
    }
    const tr = await this.prisma.studentTransfer.create({
      data: { studentId: id, kind, reason, payload: payload as never, fromLabel, toLabel, requestedById: actor?.id, requestedByName: actor?.name },
    });
    await this.log(id, { kind: 'AUDIT', type: 'TRANSFER_REQUESTED', title: `${kind} transfer requested`, description: `${fromLabel ?? ''} → ${toLabel ?? ''}. Reason: ${reason}`, meta: { transferId: tr.id } }, actor);
    this.notifications.createForRoles([Role.ADMIN], { type: 'TRANSFER_REQUEST', title: 'Student transfer needs approval', body: `${kind} transfer requested for a student.`, link: `/students/${id}` }).catch(() => undefined);
    return tr;
  }

  listTransfers(id: string) {
    return this.prisma.studentTransfer.findMany({ where: { studentId: id }, orderBy: { createdAt: 'desc' } });
  }

  listPendingTransfers() {
    return this.prisma.studentTransfer.findMany({
      where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' },
      include: { student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } } },
    });
  }

  async decideTransfer(transferId: string, approve: boolean, actor: Actor) {
    const tr = await this.prisma.studentTransfer.findUnique({ where: { id: transferId } });
    if (!tr) throw new NotFoundException('Transfer not found.');
    if (tr.status !== 'PENDING') throw new BadRequestException('This transfer has already been decided.');
    const p = tr.payload as Record<string, unknown>;

    if (approve) {
      if (tr.kind === 'TEACHER') {
        await this.changeTeacher(tr.studentId, { enrollmentId: String(p.enrollmentId), toTeacherId: String(p.toTeacherId), reason: tr.reason }, actor);
      } else if (tr.kind === 'BATCH') {
        await this.changeBatch(tr.studentId, { batchId: String(p.batchId), reason: tr.reason }, actor);
      } else if (tr.kind === 'COURSE') {
        await this.assignCourse(tr.studentId, { courseId: String(p.courseId), teacherId: p.teacherId ? String(p.teacherId) : undefined, status: p.status ? String(p.status) : undefined }, actor);
      }
    }
    await this.prisma.studentTransfer.update({
      where: { id: transferId }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor?.id, decidedByName: actor?.name, decidedAt: new Date() },
    });
    await this.log(tr.studentId, { kind: 'AUDIT', type: approve ? 'TRANSFER_APPROVED' : 'TRANSFER_REJECTED', title: `${tr.kind} transfer ${approve ? 'approved' : 'rejected'}`, description: `${tr.fromLabel ?? ''} → ${tr.toLabel ?? ''}`, meta: { transferId } }, actor);
    return { status: approve ? 'APPROVED' : 'REJECTED' };
  }

  // ── Certificate (issued once a course is COMPLETED) ─────────────────────────
  async issueCertificate(id: string, enrollmentId: string, actor: Actor) {
    const e = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, studentId: id },
      include: { course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } }, student: { select: { studentCode: true, userId: true, user: { select: { firstName: true, lastName: true } } } } },
    });
    if (!e) throw new NotFoundException('Enrollment not found for this student.');
    if (e.status !== EnrollmentStatus.COMPLETED) throw new BadRequestException('Course is not completed yet.');
    const cert = {
      certificateId: `CERT-${e.student.studentCode}-${e.id.slice(0, 6).toUpperCase()}`,
      studentName: `${e.student.user.firstName} ${e.student.user.lastName}`,
      studentCode: e.student.studentCode,
      course: e.course.title,
      teacher: e.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : null,
      issuedAt: (e.completedAt ?? new Date()).toISOString(),
    };
    await this.log(id, { kind: 'TIMELINE', type: 'CERTIFICATE_ISSUED', title: `Certificate issued: ${e.course.title}`, description: cert.certificateId }, actor);
    // The timeline row is an audit trail; the student also needs telling.
    this.notifications
      .createFor(e.student.userId, {
        type: 'CERTIFICATE_AVAILABLE',
        title: 'Certificate available',
        body: `Your certificate for ${e.course.title} is ready to download.`,
        link: '/student/dashboard',
      })
      .catch(() => undefined);
    return cert;
  }

  // ── Notify helpers ──────────────────────────────────────────────────────────
  private async notifyParent(id: string, title: string, body: string) {
    const s = await this.prisma.studentProfile.findUnique({
      where: { id }, select: { userId: true, parentEmail: true, guardianName: true, user: { select: { email: true, firstName: true } } },
    });
    if (!s) return;
    await this.notifications.createFor(s.userId, { type: 'STUDENT_UPDATE', title, body, link: '/student/dashboard' }).catch(() => undefined);
    const to = s.parentEmail || s.user.email;
    await this.emailParent(id, to, s.guardianName || s.user.firstName, title, body).catch(() => undefined);
  }

  private async emailParent(_id: string, to: string, name: string, subject: string, body: string) {
    if (!to) return;
    return this.emails.sendMail(to, subject, body, undefined,
      `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${name},</p><p>${body.replace(/\n/g, '<br/>')}</p><p style="color:#6b7280">— Academy Administration</p></div>`);
  }
}
