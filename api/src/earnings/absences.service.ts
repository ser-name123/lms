import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../generated/prisma/enums';

export interface Actor {
  id: string;
  name?: string;
  role: Role | string;
}

/*
 * Teacher-Absent reschedule tasks (spec 6A scenario 3). When a teacher misses a
 * class the earnings engine books a 0 earning and raises a TeacherAbsenceTask.
 * The Academic Coach works this list to reschedule the missed class into a new
 * session — coach-scoped, mirroring the rest of the coach tooling.
 */
@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Coach sees only their own students' tasks; admin/supervisor see all. */
  private async scopeFor(actor: Actor) {
    if (actor?.role !== Role.ACADEMIC_COACH) return {};
    const mine = await this.prisma.studentProfile.findMany({
      where: { coachId: actor.id },
      select: { id: true },
    });
    return { studentId: { in: mine.map((s) => s.id) } };
  }

  async list(actor: Actor, status?: string) {
    const where: any = { ...(await this.scopeFor(actor)), ...(status ? { status } : {}) };
    const rows = await this.prisma.teacherAbsenceTask.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean) as string[])];
    const courseIds = [...new Set(rows.map((r) => r.courseId).filter(Boolean) as string[])];
    const [teachers, students, courses] = await Promise.all([
      teacherIds.length
        ? this.prisma.teacherProfile.findMany({ where: { id: { in: teacherIds } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } })
        : [],
      studentIds.length
        ? this.prisma.studentProfile.findMany({ where: { id: { in: studentIds } }, select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } })
        : [],
      courseIds.length
        ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
        : [],
    ]);
    const tById = new Map(teachers.map((t) => [t.id, t]));
    const sById = new Map(students.map((s) => [s.id, s]));
    const cById = new Map(courses.map((c) => [c.id, c.title]));
    return rows.map((r) => {
      const t = tById.get(r.teacherId);
      const s = r.studentId ? sById.get(r.studentId) : null;
      return {
        id: r.id,
        status: r.status,
        classSessionId: r.classSessionId,
        originalStartsAt: r.originalStartsAt,
        rescheduledSessionId: r.rescheduledSessionId,
        resolvedByName: r.resolvedByName,
        resolvedAt: r.resolvedAt,
        createdAt: r.createdAt,
        teacher: t ? { id: t.id, name: `${t.user.firstName} ${t.user.lastName}`.trim() } : null,
        student: s ? { id: s.id, code: s.studentCode, name: `${s.user.firstName} ${s.user.lastName}`.trim() } : null,
        course: r.courseId ? cById.get(r.courseId) ?? null : null,
      };
    });
  }

  private async assertScope(actor: Actor, studentId: string | null) {
    if (actor?.role !== Role.ACADEMIC_COACH || !studentId) return;
    const s = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, select: { coachId: true } });
    if (s?.coachId !== actor.id) throw new NotFoundException('Task not found.');
  }

  async reschedule(id: string, dto: { newStartsAt: string }, actor: Actor) {
    const task = await this.prisma.teacherAbsenceTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found.');
    await this.assertScope(actor, task.studentId);
    if (task.status !== 'PENDING') throw new BadRequestException('This task has already been handled.');

    const newStart = new Date(dto.newStartsAt);
    if (isNaN(newStart.getTime())) throw new BadRequestException('Invalid new time.');
    if (newStart.getTime() <= Date.now()) throw new BadRequestException('Pick a future time to reschedule into.');

    // Duration carried from the missed class (fallback 60 minutes).
    const original = await this.prisma.classSession.findUnique({
      where: { id: task.classSessionId },
      select: { startsAt: true, endsAt: true, title: true, courseId: true },
    });
    const durationMs = original
      ? new Date(original.endsAt).getTime() - new Date(original.startsAt).getTime()
      : 60 * 60 * 1000;
    const newEnd = new Date(newStart.getTime() + durationMs);

    // ClassSession.courseId is required — take it from the missed class.
    const courseId = original?.courseId ?? task.courseId;
    if (!courseId) throw new BadRequestException('Cannot reschedule: the original class has no course on record.');

    // The teacher must be free at the new time.
    const clash = await this.prisma.classSession.count({
      where: { teacherId: task.teacherId, status: 'SCHEDULED', startsAt: { lt: newEnd }, endsAt: { gt: newStart } },
    });
    if (clash) throw new BadRequestException('The teacher already has a class at that time.');

    const session = await this.prisma.classSession.create({
      data: {
        courseId,
        teacherId: task.teacherId,
        title: original?.title ? `${original.title} (rescheduled)` : 'Rescheduled class',
        startsAt: newStart,
        endsAt: newEnd,
        status: 'SCHEDULED',
      },
    });
    if (task.studentId) {
      await this.prisma.classAttendee.create({ data: { classId: session.id, studentId: task.studentId } });
    }

    const updated = await this.prisma.teacherAbsenceTask.update({
      where: { id },
      data: {
        status: 'RESCHEDULED',
        rescheduledSessionId: session.id,
        resolvedById: actor?.id ?? null,
        resolvedByName: actor?.name ?? null,
        resolvedAt: new Date(),
      },
    });

    await this.notifyRescheduled(task.teacherId, task.studentId, newStart).catch(() => undefined);
    return updated;
  }

  async dismiss(id: string, actor: Actor) {
    const task = await this.prisma.teacherAbsenceTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found.');
    await this.assertScope(actor, task.studentId);
    if (task.status !== 'PENDING') throw new BadRequestException('This task has already been handled.');
    return this.prisma.teacherAbsenceTask.update({
      where: { id },
      data: { status: 'DISMISSED', resolvedById: actor?.id ?? null, resolvedByName: actor?.name ?? null, resolvedAt: new Date() },
    });
  }

  private async notifyRescheduled(teacherId: string, studentId: string | null, when: Date): Promise<void> {
    const whenStr = when.toISOString().slice(0, 16).replace('T', ' ');
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { userId: true } });
    const jobs: Promise<unknown>[] = [];
    if (teacher?.userId) {
      jobs.push(this.notifications.createFor(teacher.userId, { type: 'CLASS_RESCHEDULED', title: 'Missed class rescheduled', body: `A class you missed has been rescheduled to ${whenStr}.`, link: '/teacher/classes' }));
    }
    let coachId: string | null = null;
    if (studentId) {
      const student = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true, coachId: true } });
      coachId = student?.coachId ?? null;
      if (student?.userId) {
        jobs.push(this.notifications.createFor(student.userId, { type: 'CLASS_RESCHEDULED', title: 'Your class was rescheduled', body: `Your missed class has been rescheduled to ${whenStr}.`, link: '/student/classes' }));
      }
    }
    if (coachId) {
      jobs.push(this.notifications.createFor(coachId, { type: 'CLASS_RESCHEDULED', title: 'Teacher-absent class rescheduled', body: `The missed class has been rescheduled to ${whenStr}.`, link: '/teacher-absences' }));
    }
    jobs.push(this.notifications.createForRoles([Role.ADMIN, Role.SUPERVISOR], { type: 'CLASS_RESCHEDULED', title: 'Teacher-absent class rescheduled', body: `A teacher-absent class was rescheduled to ${whenStr}.`, link: '/teacher-absences' }));
    await Promise.all(jobs.map((p) => (p as Promise<unknown>).catch(() => undefined)));
  }
}
