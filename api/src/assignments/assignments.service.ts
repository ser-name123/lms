import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { Role, SubmissionStatus } from '../generated/prisma/enums';
import {
  CreateAssignmentDto, GradeSubmissionDto, ListAssignmentsQuery,
  SubmitAssignmentDto, UpdateAssignmentDto,
} from './dto';

type Actor = { id: string; role: Role };

const SUBMITTED_STATES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED, SubmissionStatus.LATE_SUBMITTED, SubmissionStatus.UNDER_REVIEW, SubmissionStatus.EVALUATED,
];
const PENDING_STATES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED, SubmissionStatus.LATE_SUBMITTED, SubmissionStatus.UNDER_REVIEW,
];

@Injectable()
export class AssignmentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
  ) {}

  // ── Background sweep: auto-publish scheduled + due reminders ─────────────────
  onModuleInit() {
    const run = () => this.sweep().catch(() => undefined);
    setTimeout(run, 15_000);
    setInterval(run, 5 * 60_000);
  }

  private async sweep() {
    const now = new Date();
    // Auto-publish scheduled assignments whose publishAt has passed.
    const due = await this.prisma.assignment.findMany({
      where: { status: 'SCHEDULED', publishAt: { lte: now } }, select: { id: true },
    });
    for (const a of due) await this.publish(a.id).catch(() => undefined);

    // Due-date reminders (1 day + 2 hours before) — notify students without a submission.
    const soon = await this.prisma.assignment.findMany({
      where: { status: 'PUBLISHED', dueAt: { gte: now, lte: new Date(now.getTime() + 25 * 3600_000) } },
      select: { id: true, title: true, dueAt: true },
    });
    for (const a of soon) {
      const hrs = (a.dueAt!.getTime() - now.getTime()) / 3600_000;
      const window = hrs <= 2 ? '2 hours' : hrs <= 24 ? '1 day' : null;
      if (!window) continue;
      const students = await this.resolveTargetStudents(a.id);
      const submitted = new Set((await this.prisma.submission.findMany({
        where: { assignmentId: a.id, status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.LATE_SUBMITTED, SubmissionStatus.EVALUATED, SubmissionStatus.UNDER_REVIEW] } },
        select: { studentId: true },
      })).map((s) => s.studentId));
      for (const st of students) {
        if (submitted.has(st.studentId)) continue;
        await this.notifications.createFor(st.userId, {
          type: 'ASSIGNMENT_REMINDER', title: `Reminder: "${a.title}" due in ${window}`,
          body: 'Submit your assignment before the deadline.', link: '/student/assignments',
        }).catch(() => undefined);
      }
    }
  }

  // ── Actor resolution ────────────────────────────────────────────────────────
  private async teacherProfileId(userId: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    return t?.id ?? null;
  }
  private async studentProfile(userId: string) {
    return this.prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  }

  /** Student-profile ids this assignment targets. */
  private async resolveTargetStudentIds(id: string): Promise<string[]> {
    const a = await this.prisma.assignment.findUnique({
      where: { id }, select: { courseId: true, batchId: true, targetType: true, targetStudentIds: true },
    });
    if (!a) return [];
    if (a.targetType === 'SELECTED') return a.targetStudentIds;
    if (a.batchId) return (await this.prisma.batchStudent.findMany({ where: { batchId: a.batchId }, select: { studentId: true } })).map((b) => b.studentId);
    return (await this.prisma.enrollment.findMany({ where: { courseId: a.courseId }, select: { studentId: true } })).map((e) => e.studentId);
  }

  private async resolveTargetStudents(id: string) {
    const ids = await this.resolveTargetStudentIds(id);
    if (!ids.length) return [];
    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true, parentEmail: true, guardianName: true, user: { select: { email: true, firstName: true } } },
    });
    return students.map((s) => ({ studentId: s.id, userId: s.userId, parentEmail: s.parentEmail, guardianName: s.guardianName, email: s.user.email, firstName: s.user.firstName }));
  }

  // ── Options (courses + batches the actor can target) ────────────────────────
  async meta(actor: Actor) {
    if (actor.role === Role.TEACHER) {
      const tid = await this.teacherProfileId(actor.id);
      const [batches, enrollCourses] = await Promise.all([
        this.prisma.batch.findMany({ where: { teacherId: tid ?? '__none__' }, select: { id: true, code: true, name: true, courseId: true } }),
        this.prisma.enrollment.findMany({ where: { teacherId: tid ?? '__none__' }, select: { course: { select: { id: true, title: true } } }, distinct: ['courseId'] }),
      ]);
      const courseMap = new Map<string, string>();
      for (const e of enrollCourses) courseMap.set(e.course.id, e.course.title);
      const bCourses = await this.prisma.course.findMany({ where: { id: { in: batches.map((b) => b.courseId) } }, select: { id: true, title: true } });
      for (const c of bCourses) courseMap.set(c.id, c.title);
      return {
        courses: [...courseMap.entries()].map(([id, title]) => ({ id, title })),
        batches: batches.map((b) => ({ id: b.id, code: b.code, name: b.name })),
      };
    }
    const [courses, batches, teachers] = await Promise.all([
      this.prisma.course.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
      this.prisma.batch.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      this.prisma.teacherProfile.findMany({ select: { id: true, user: { select: { firstName: true, lastName: true } } } }),
    ]);
    return { courses, batches, teachers: teachers.map((t) => ({ id: t.id, name: `${t.user.firstName} ${t.user.lastName}` })) };
  }

  /** Candidate students for SELECTED targeting, scoped to a course/batch. */
  async targetStudents(courseId?: string, batchId?: string) {
    let ids: string[] | undefined;
    if (batchId) ids = (await this.prisma.batchStudent.findMany({ where: { batchId }, select: { studentId: true } })).map((b) => b.studentId);
    else if (courseId) ids = (await this.prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true } })).map((e) => e.studentId);
    const students = await this.prisma.studentProfile.findMany({
      where: ids ? { id: { in: ids } } : {},
      select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { studentCode: 'asc' }, take: 500,
    });
    return students.map((s) => ({ id: s.id, studentCode: s.studentCode, name: `${s.user.firstName} ${s.user.lastName}` }));
  }

  /** Plagiarism: max word-overlap (Jaccard %) of this submission's text vs its peers. */
  async similarity(submissionId: string) {
    const s = await this.prisma.submission.findUnique({ where: { id: submissionId }, select: { id: true, content: true, assignmentId: true, similarityPct: true } });
    if (!s) throw new NotFoundException('Submission not found.');
    const tokens = (t: string | null) => new Set((t ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    const mine = tokens(s.content);
    if (mine.size === 0) return { similarityPct: 0, matchedWith: null };
    const peers = await this.prisma.submission.findMany({ where: { assignmentId: s.assignmentId, id: { not: s.id }, content: { not: null } }, select: { id: true, content: true, student: { select: { studentCode: true } } } });
    let best = 0; let matchedWith: string | null = null;
    for (const p of peers) {
      const o = tokens(p.content);
      if (o.size === 0) continue;
      let inter = 0; for (const w of mine) if (o.has(w)) inter++;
      const jac = Math.round((inter / new Set([...mine, ...o]).size) * 100);
      if (jac > best) { best = jac; matchedWith = p.student.studentCode; }
    }
    await this.prisma.submission.update({ where: { id: s.id }, data: { similarityPct: best } });
    return { similarityPct: best, matchedWith };
  }

  // ── Create / update / lifecycle ─────────────────────────────────────────────
  async create(dto: CreateAssignmentDto, actor: Actor) {
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId }, select: { id: true } });
    if (!course) throw new BadRequestException('Course not found.');
    if (dto.batchId) {
      const b = await this.prisma.batch.findUnique({ where: { id: dto.batchId }, select: { id: true } });
      if (!b) throw new BadRequestException('Batch not found.');
    }
    const teacherId = actor.role === Role.TEACHER ? await this.teacherProfileId(actor.id) : undefined;
    const status = dto.status ?? 'DRAFT';
    if (status === 'SCHEDULED' && !dto.publishAt) throw new BadRequestException('Scheduled assignments need a publishAt time.');

    const a = await this.prisma.assignment.create({
      data: {
        title: dto.title, courseId: dto.courseId, batchId: dto.batchId ?? null,
        teacherId: teacherId ?? null, createdById: actor.id,
        description: dto.description, instructions: dto.instructions,
        subject: dto.subject, chapter: dto.chapter, topic: dto.topic,
        skillId: dto.skillId ?? null,
        difficulty: dto.difficulty, type: dto.type,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        maxMarks: dto.maxMarks ?? 100, passingMarks: dto.passingMarks ?? 40,
        lateAllowed: dto.lateAllowed ?? true, latePenaltyPct: dto.latePenaltyPct ?? 0,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
        status,
        targetType: dto.targetType ?? 'BATCH',
        targetStudentIds: dto.targetStudentIds ?? [],
        allowedFileTypes: dto.allowedFileTypes ?? [],
        maxFileSizeMb: dto.maxFileSizeMb ?? null,
        attachments: (dto.attachments ?? undefined) as never,
        rubric: (dto.rubric ?? undefined) as never,
      },
    });
    if (status === 'PUBLISHED') await this.publish(a.id);
    return a;
  }

  private async assertEditable(id: string, actor: Actor) {
    const a = await this.prisma.assignment.findUnique({ where: { id }, select: { id: true, teacherId: true, locked: true, status: true } });
    if (!a) throw new NotFoundException('Assignment not found.');
    if (actor.role === Role.TEACHER) {
      const tid = await this.teacherProfileId(actor.id);
      if (a.teacherId && a.teacherId !== tid) throw new ForbiddenException('Not your assignment.');
    }
    if (a.locked && actor.role === Role.TEACHER) throw new ForbiddenException('Assignment is locked by admin.');
    return a;
  }

  async update(id: string, dto: UpdateAssignmentDto, actor: Actor) {
    await this.assertEditable(id, actor);
    const data: Record<string, unknown> = { ...dto };
    delete data.status; // status changes go through lifecycle endpoints
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.publishAt !== undefined) data.publishAt = dto.publishAt ? new Date(dto.publishAt) : null;
    if (dto.attachments !== undefined) data.attachments = dto.attachments;
    if (dto.rubric !== undefined) data.rubric = dto.rubric;
    return this.prisma.assignment.update({ where: { id }, data });
  }

  async remove(id: string, actor: Actor) {
    await this.assertEditable(id, actor);
    await this.prisma.assignment.delete({ where: { id } });
    return { deleted: true };
  }

  async publish(id: string) {
    const a = await this.prisma.assignment.update({ where: { id }, data: { status: 'PUBLISHED', publishAt: new Date() }, select: { id: true, title: true } });
    const students = await this.resolveTargetStudents(id);
    for (const st of students) {
      await this.notifications.createFor(st.userId, { type: 'ASSIGNMENT_PUBLISHED', title: `New assignment: ${a.title}`, body: 'A new assignment has been published for you.', link: '/student/assignments' }).catch(() => undefined);
    }
    return { status: 'PUBLISHED', notified: students.length };
  }

  async setLifecycle(id: string, action: 'unpublish' | 'archive' | 'close' | 'lock' | 'unlock', actor: Actor) {
    await this.assertEditable(id, actor);
    const map: Record<string, Record<string, unknown>> = {
      unpublish: { status: 'DRAFT' }, archive: { status: 'ARCHIVED' }, close: { status: 'CLOSED' },
      lock: { locked: true }, unlock: { locked: false },
    };
    await this.prisma.assignment.update({ where: { id }, data: map[action] });
    return { ok: true, action };
  }

  async duplicate(id: string, actor: Actor) {
    const a = await this.prisma.assignment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Assignment not found.');
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = a;
    const copy = await this.prisma.assignment.create({
      data: { ...rest, title: `${a.title} (Copy)`, status: 'DRAFT', createdById: actor.id, attachments: a.attachments as never, rubric: a.rubric as never, targetStudentIds: a.targetStudentIds },
    });
    return copy;
  }

  // ── Listing / detail ────────────────────────────────────────────────────────
  async list(q: ListAssignmentsQuery, actor: Actor) {
    const page = q.page ?? 1, limit = q.limit ?? 50;
    const where: Record<string, unknown> = {};
    if (actor.role === Role.TEACHER) where.teacherId = await this.teacherProfileId(actor.id);
    if (q.courseId) where.courseId = q.courseId;
    if (q.batchId) where.batchId = q.batchId;
    if (q.teacherId && actor.role !== Role.TEACHER) where.teacherId = q.teacherId;
    if (q.subject) where.subject = { contains: q.subject, mode: 'insensitive' };
    if (q.status && q.status !== 'All') where.status = q.status;
    if (q.search) where.OR = [{ title: { contains: q.search, mode: 'insensitive' } }, { topic: { contains: q.search, mode: 'insensitive' } }];
    if (q.from || q.to) where.dueAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: {
          course: { select: { title: true } },
          batch: { select: { code: true, name: true } },
          teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
          _count: { select: { submissions: true } },
        },
      }),
      this.prisma.assignment.count({ where }),
    ]);

    // Attach expected-count + submitted/checked breakdown per row.
    const rows = await Promise.all(items.map(async (a) => {
      const targetCount = (await this.resolveTargetStudentIds(a.id)).length;
      const subs = await this.prisma.submission.groupBy({ by: ['status'], where: { assignmentId: a.id }, _count: true });
      const byStatus = (s: SubmissionStatus) => subs.find((x) => x.status === s)?._count ?? 0;
      const submitted = byStatus(SubmissionStatus.SUBMITTED) + byStatus(SubmissionStatus.LATE_SUBMITTED) + byStatus(SubmissionStatus.UNDER_REVIEW) + byStatus(SubmissionStatus.EVALUATED);
      return {
        id: a.id, title: a.title, course: a.course.title, courseId: a.courseId,
        batch: a.batch ? `${a.batch.code}` : null, teacher: a.teacher ? `${a.teacher.user.firstName} ${a.teacher.user.lastName}` : null,
        subject: a.subject, type: a.type, difficulty: a.difficulty, dueAt: a.dueAt, status: a.status, locked: a.locked,
        maxMarks: a.maxMarks, targetCount, submitted, checked: byStatus(SubmissionStatus.EVALUATED),
      };
    }));

    return { items: rows, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getOne(id: string, actor: Actor) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        course: { select: { title: true } },
        batch: { select: { code: true, name: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!a) throw new NotFoundException('Assignment not found.');
    void actor;
    const targetCount = (await this.resolveTargetStudentIds(id)).length;
    return { ...a, courseTitle: a.course.title, batchLabel: a.batch ? `${a.batch.code} · ${a.batch.name}` : null, teacherName: a.teacher ? `${a.teacher.user.firstName} ${a.teacher.user.lastName}` : null, targetCount };
  }

  /** Teacher/admin review view: every targeted student with their submission (or none). */
  async getSubmissions(id: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id }, select: { id: true, maxMarks: true } });
    if (!a) throw new NotFoundException('Assignment not found.');
    const targetIds = await this.resolveTargetStudentIds(id);
    const [students, subs] = await Promise.all([
      this.prisma.studentProfile.findMany({ where: { id: { in: targetIds } }, select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } }),
      this.prisma.submission.findMany({ where: { assignmentId: id } }),
    ]);
    const byStudent = new Map(subs.map((s) => [s.studentId, s]));
    return students.map((st) => {
      const s = byStudent.get(st.id);
      return {
        studentId: st.id, studentCode: st.studentCode, name: `${st.user.firstName} ${st.user.lastName}`,
        submissionId: s?.id ?? null, status: s?.status ?? 'ASSIGNED', submittedAt: s?.submittedAt ?? null,
        isLate: s?.isLate ?? false, grade: s?.grade ?? null, content: s?.content ?? null,
        fileUrl: s?.fileUrl ?? null, attachments: s?.attachments ?? [], rubricScores: s?.rubricScores ?? null,
        feedback: s?.feedback ?? null, penaltyApplied: s?.penaltyApplied ?? null, similarityPct: s?.similarityPct ?? null,
      };
    });
  }

  // ── Student flow ────────────────────────────────────────────────────────────
  async listMine(userId: string) {
    const sp = await this.studentProfile(userId);
    if (!sp) return [];
    const [batchRows, enrollRows] = await Promise.all([
      this.prisma.batchStudent.findMany({ where: { studentId: sp.id }, select: { batchId: true } }),
      this.prisma.enrollment.findMany({ where: { studentId: sp.id }, select: { courseId: true } }),
    ]);
    const batchIds = batchRows.map((b) => b.batchId);
    const courseIds = enrollRows.map((e) => e.courseId);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        status: { in: ['PUBLISHED', 'CLOSED'] },
        OR: [
          { targetType: 'SELECTED', targetStudentIds: { has: sp.id } },
          { targetType: 'BATCH', batchId: { in: batchIds.length ? batchIds : ['__none__'] } },
          { targetType: 'BATCH', batchId: null, courseId: { in: courseIds.length ? courseIds : ['__none__'] } },
        ],
      },
      orderBy: { dueAt: 'asc' },
      include: { course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } } },
    });
    const subs = await this.prisma.submission.findMany({ where: { studentId: sp.id, assignmentId: { in: assignments.map((a) => a.id) } } });
    const byA = new Map(subs.map((s) => [s.assignmentId, s]));
    return assignments.map((a) => this.studentShape(a, byA.get(a.id)));
  }

  async studentOpen(id: string, userId: string) {
    const sp = await this.studentProfile(userId);
    if (!sp) throw new ForbiddenException('Not a student.');
    const a = await this.prisma.assignment.findUnique({ where: { id }, include: { course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } } } });
    if (!a) throw new NotFoundException('Assignment not found.');
    const sub = await this.prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: sp.id } } });
    return this.studentShape(a, sub ?? undefined);
  }

  private studentShape(a: { id: string; title: string; description: string | null; instructions: string | null; dueAt: Date | null; maxMarks: number; passingMarks: number; type: string | null; difficulty: string | null; subject: string | null; lateAllowed: boolean; latePenaltyPct: number; status: string; allowedFileTypes: string[]; maxFileSizeMb: number | null; attachments: unknown; rubric: unknown; course: { title: string }; teacher: { user: { firstName: string; lastName: string } } | null }, s?: { id: string; status: SubmissionStatus; content: string | null; fileUrl: string | null; attachments: unknown; grade: number | null; feedback: string | null; feedbackFileUrl: string | null; rubricScores: unknown; isLate: boolean; penaltyApplied: number | null; submittedAt: Date | null; evaluatedAt: Date | null; returnedReason: string | null; draftSavedAt: Date | null }) {
    return {
      id: a.id, title: a.title, description: a.description, instructions: a.instructions, dueAt: a.dueAt,
      maxMarks: a.maxMarks, passingMarks: a.passingMarks, type: a.type, difficulty: a.difficulty, subject: a.subject,
      lateAllowed: a.lateAllowed, latePenaltyPct: a.latePenaltyPct, course: a.course.title,
      allowedFileTypes: a.allowedFileTypes ?? [], maxFileSizeMb: a.maxFileSizeMb,
      teacher: a.teacher ? `${a.teacher.user.firstName} ${a.teacher.user.lastName}` : null,
      attachments: a.attachments ?? [], rubric: a.rubric ?? [],
      submission: s ? {
        id: s.id, status: s.status, content: s.content, fileUrl: s.fileUrl, attachments: s.attachments ?? [],
        grade: s.grade, feedback: s.feedback, feedbackFileUrl: s.feedbackFileUrl, rubricScores: s.rubricScores ?? null,
        isLate: s.isLate, penaltyApplied: s.penaltyApplied, submittedAt: s.submittedAt, evaluatedAt: s.evaluatedAt,
        returnedReason: s.returnedReason, draftSavedAt: s.draftSavedAt,
      } : null,
    };
  }

  async saveDraft(id: string, userId: string, dto: SubmitAssignmentDto) {
    const sp = await this.studentProfile(userId);
    if (!sp) throw new ForbiddenException('Not a student.');
    await this.assertPublished(id);
    return this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId: sp.id } },
      create: { assignmentId: id, studentId: sp.id, status: SubmissionStatus.DRAFT, content: dto.content, fileUrl: dto.fileUrl, attachments: (dto.attachments ?? undefined) as never, draftSavedAt: new Date() },
      update: { content: dto.content, fileUrl: dto.fileUrl, attachments: (dto.attachments ?? undefined) as never, draftSavedAt: new Date(), status: SubmissionStatus.DRAFT },
    });
  }

  async submit(id: string, userId: string, dto: SubmitAssignmentDto) {
    const sp = await this.studentProfile(userId);
    if (!sp) throw new ForbiddenException('Not a student.');
    const a = await this.assertPublished(id);
    const existing = await this.prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: sp.id } } });
    if (existing && SUBMITTED_STATES.includes(existing.status)) {
      throw new BadRequestException('You have already submitted this assignment.');
    }
    const now = new Date();
    const isLate = !!(a.dueAt && now > a.dueAt);
    if (isLate && !a.lateAllowed) throw new BadRequestException('The deadline has passed and late submission is not allowed.');
    const penaltyApplied = isLate ? a.latePenaltyPct : null;

    // Enforce allowed file types (by extension) if configured.
    if (a.allowedFileTypes.length && dto.attachments?.length) {
      const allowed = a.allowedFileTypes.map((t) => t.toLowerCase().replace(/^\./, ''));
      const bad = dto.attachments.find((f) => { const ext = (f.name.split('.').pop() || '').toLowerCase(); return !allowed.includes(ext); });
      if (bad) throw new BadRequestException(`Only these file types are allowed: ${allowed.join(', ')}.`);
    }

    const sub = await this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId: sp.id } },
      create: { assignmentId: id, studentId: sp.id, status: isLate ? SubmissionStatus.LATE_SUBMITTED : SubmissionStatus.SUBMITTED, content: dto.content, fileUrl: dto.fileUrl, attachments: (dto.attachments ?? undefined) as never, isLate, penaltyApplied, submittedAt: now },
      update: { status: isLate ? SubmissionStatus.LATE_SUBMITTED : SubmissionStatus.SUBMITTED, content: dto.content, fileUrl: dto.fileUrl, attachments: (dto.attachments ?? undefined) as never, isLate, penaltyApplied, submittedAt: now },
    });

    // Plagiarism check (fire-and-forget) for text answers.
    if (dto.content) this.similarity(sub.id).catch(() => undefined);

    // Notify the assignment's teacher.
    if (a.teacherId) {
      const t = await this.prisma.teacherProfile.findUnique({ where: { id: a.teacherId }, select: { userId: true } });
      if (t) await this.notifications.createFor(t.userId, { type: 'ASSIGNMENT_SUBMITTED', title: `New submission: ${a.title}`, body: `${sp.id} submitted${isLate ? ' (late)' : ''}.`, link: '/teacher/assignments' }).catch(() => undefined);
    }
    return sub;
  }

  private async assertPublished(id: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id }, select: { id: true, title: true, dueAt: true, lateAllowed: true, latePenaltyPct: true, status: true, teacherId: true, allowedFileTypes: true } });
    if (!a) throw new NotFoundException('Assignment not found.');
    if (a.status !== 'PUBLISHED') throw new BadRequestException('This assignment is not open for submission.');
    return a;
  }

  // ── Teacher review / grade ──────────────────────────────────────────────────
  async grade(submissionId: string, dto: GradeSubmissionDto, actor: Actor) {
    const s = await this.prisma.submission.findUnique({ where: { id: submissionId }, include: { assignment: { select: { title: true, maxMarks: true, teacherId: true } }, student: { select: { userId: true, parentEmail: true, guardianName: true, user: { select: { firstName: true, email: true } } } } } });
    if (!s) throw new NotFoundException('Submission not found.');
    if (actor.role === Role.TEACHER) {
      const tid = await this.teacherProfileId(actor.id);
      if (s.assignment.teacherId && s.assignment.teacherId !== tid) throw new ForbiddenException('Not your assignment.');
    }
    if (dto.grade > s.assignment.maxMarks) throw new BadRequestException(`Grade cannot exceed ${s.assignment.maxMarks}.`);

    const penalty = s.penaltyApplied ?? 0;
    const effective = penalty ? Math.round(dto.grade * (1 - penalty / 100)) : dto.grade;
    const returned = dto.returned === true;

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        grade: effective, feedback: dto.feedback, feedbackFileUrl: dto.feedbackFileUrl,
        rubricScores: (dto.rubricScores ?? undefined) as never,
        status: returned ? SubmissionStatus.RETURNED : SubmissionStatus.EVALUATED,
        returnedReason: returned ? dto.returnedReason : null,
        evaluatedAt: new Date(),
      },
    });

    // Notify student + parent.
    await this.notifications.createFor(s.student.userId, { type: 'ASSIGNMENT_CHECKED', title: returned ? `Returned: ${s.assignment.title}` : `Checked: ${s.assignment.title}`, body: returned ? `Please review and resubmit. ${dto.returnedReason ?? ''}` : `You scored ${effective}/${s.assignment.maxMarks}.`, link: '/student/assignments' }).catch(() => undefined);
    if (s.student.parentEmail) {
      this.emails.sendMail(s.student.parentEmail, `${s.student.user.firstName}'s assignment was checked`, `${s.student.user.firstName} scored ${effective}/${s.assignment.maxMarks} in "${s.assignment.title}".`, undefined,
        `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${s.student.guardianName || 'Parent'},</p><p><b>${s.student.user.firstName}</b> scored <b>${effective}/${s.assignment.maxMarks}</b> in "<b>${s.assignment.title}</b>".</p>${dto.feedback ? `<p style="color:#6b7280">Feedback: ${dto.feedback}</p>` : ''}</div>`).catch(() => undefined);
    }
    return updated;
  }

  async startReview(submissionId: string) {
    return this.prisma.submission.update({ where: { id: submissionId }, data: { status: SubmissionStatus.UNDER_REVIEW } });
  }

  // ── Dashboards ──────────────────────────────────────────────────────────────
  async adminDashboard() {
    const [total, byStatus, subCounts, overdue] = await Promise.all([
      this.prisma.assignment.count(),
      this.prisma.assignment.groupBy({ by: ['status'], _count: true }),
      this.prisma.submission.groupBy({ by: ['status'], _count: true }),
      this.prisma.assignment.count({ where: { status: 'PUBLISHED', dueAt: { lt: new Date() } } }),
    ]);
    const sc = (s: SubmissionStatus) => subCounts.find((x) => x.status === s)?._count ?? 0;
    const ac = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
    return {
      cards: {
        total,
        published: ac('PUBLISHED'), draft: ac('DRAFT'), scheduled: ac('SCHEDULED'), archived: ac('ARCHIVED'),
        submitted: sc(SubmissionStatus.SUBMITTED) + sc(SubmissionStatus.LATE_SUBMITTED) + sc(SubmissionStatus.UNDER_REVIEW) + sc(SubmissionStatus.EVALUATED),
        pendingReview: sc(SubmissionStatus.SUBMITTED) + sc(SubmissionStatus.LATE_SUBMITTED) + sc(SubmissionStatus.UNDER_REVIEW),
        checked: sc(SubmissionStatus.EVALUATED),
        lateSubmissions: sc(SubmissionStatus.LATE_SUBMITTED),
        overdue,
      },
    };
  }

  async teacherDashboard(userId: string) {
    const tid = await this.teacherProfileId(userId);
    if (!tid) return { cards: { todays: 0, pendingReview: 0, submittedToday: 0, lateSubmissions: 0, needRecheck: 0 } };
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
    const [todays, pending, submittedToday, late, recheck] = await Promise.all([
      this.prisma.assignment.count({ where: { teacherId: tid, dueAt: { gte: startDay, lt: new Date(startDay.getTime() + 86400_000) } } }),
      this.prisma.submission.count({ where: { assignment: { teacherId: tid }, status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.LATE_SUBMITTED, SubmissionStatus.UNDER_REVIEW] } } }),
      this.prisma.submission.count({ where: { assignment: { teacherId: tid }, submittedAt: { gte: startDay } } }),
      this.prisma.submission.count({ where: { assignment: { teacherId: tid }, status: SubmissionStatus.LATE_SUBMITTED } }),
      this.prisma.submission.count({ where: { assignment: { teacherId: tid }, status: SubmissionStatus.RETURNED } }),
    ]);
    return { cards: { todays, pendingReview: pending, submittedToday, lateSubmissions: late, needRecheck: recheck } };
  }

  // ── Analytics ───────────────────────────────────────────────────────────────
  async analytics() {
    const [assignments, submissions] = await Promise.all([
      this.prisma.assignment.findMany({ select: { id: true, createdAt: true, difficulty: true, teacherId: true, courseId: true, batchId: true, course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } }, batch: { select: { code: true } } } }),
      this.prisma.submission.findMany({ select: { status: true, grade: true, submittedAt: true, isLate: true, studentId: true, assignment: { select: { courseId: true, teacherId: true } } } }),
    ]);
    const graded = submissions.filter((s) => s.grade != null);
    const avgMarks = graded.length ? Math.round(graded.reduce((a, s) => a + (s.grade ?? 0), 0) / graded.length) : 0;

    const group = <T>(rows: T[], key: (r: T) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    // Submission trend (monthly)
    const trend = new Map<string, number>();
    for (const s of submissions) { if (!s.submittedAt) continue; const d = s.submittedAt; const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; trend.set(k, (trend.get(k) ?? 0) + 1); }
    // Marks trend
    const marks = new Map<string, { sum: number; n: number }>();
    for (const s of graded) { if (!s.submittedAt) continue; const d = s.submittedAt; const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; const c = marks.get(k) ?? { sum: 0, n: 0 }; c.sum += s.grade ?? 0; c.n++; marks.set(k, c); }

    // Top / weak students by avg grade
    const perStudent = new Map<string, { sum: number; n: number }>();
    for (const s of graded) { const c = perStudent.get(s.studentId) ?? { sum: 0, n: 0 }; c.sum += s.grade ?? 0; c.n++; perStudent.set(s.studentId, c); }
    const studentAvgs = [...perStudent.entries()].map(([id, v]) => ({ id, avg: Math.round(v.sum / v.n) }));
    const topIds = studentAvgs.sort((a, b) => b.avg - a.avg).slice(0, 5);
    const weakIds = [...studentAvgs].sort((a, b) => a.avg - b.avg).slice(0, 5);
    const nameMap = new Map((await this.prisma.studentProfile.findMany({ where: { id: { in: [...topIds, ...weakIds].map((x) => x.id) } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } })).map((s) => [s.id, `${s.user.firstName} ${s.user.lastName}`]));

    return {
      cards: {
        assignments: assignments.length,
        completed: submissions.filter((s) => s.status === SubmissionStatus.EVALUATED).length,
        pending: submissions.filter((s) => PENDING_STATES.includes(s.status)).length,
        late: submissions.filter((s) => s.isLate).length,
        avgMarks,
      },
      submissionTrend: [...trend.entries()].sort().slice(-12).map(([month, count]) => ({ month, count })),
      marksTrend: [...marks.entries()].sort().slice(-12).map(([month, v]) => ({ month, score: Math.round(v.sum / v.n) })),
      teacherWise: group(assignments, (a) => a.teacher ? `${a.teacher.user.firstName} ${a.teacher.user.lastName}` : null).slice(0, 10),
      courseWise: group(assignments, (a) => a.course.title).slice(0, 10),
      batchWise: group(assignments, (a) => a.batch?.code).slice(0, 10),
      difficultyWise: group(assignments, (a) => a.difficulty).slice(0, 5),
      topStudents: topIds.map((x) => ({ name: nameMap.get(x.id) ?? x.id, avg: x.avg })),
      weakStudents: weakIds.map((x) => ({ name: nameMap.get(x.id) ?? x.id, avg: x.avg })),
    };
  }

  // ── Reports ─────────────────────────────────────────────────────────────────
  async report(type: string) {
    switch (type) {
      case 'completion': {
        const assignments = await this.prisma.assignment.findMany({ where: { status: { in: ['PUBLISHED', 'CLOSED'] } }, select: { id: true, title: true, course: { select: { title: true } } } });
        return Promise.all(assignments.map(async (a) => {
          const target = (await this.resolveTargetStudentIds(a.id)).length;
          const submitted = await this.prisma.submission.count({ where: { assignmentId: a.id, status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.LATE_SUBMITTED, SubmissionStatus.EVALUATED, SubmissionStatus.UNDER_REVIEW] } } });
          const checked = await this.prisma.submission.count({ where: { assignmentId: a.id, status: SubmissionStatus.EVALUATED } });
          return { assignment: a.title, course: a.course.title, target, submitted, checked, completionPct: target ? Math.round((submitted / target) * 100) : 0 };
        }));
      }
      case 'teacher': {
        const rows = await this.prisma.assignment.groupBy({ by: ['teacherId'], where: { teacherId: { not: null } }, _count: true });
        const teachers = await this.prisma.teacherProfile.findMany({ where: { id: { in: rows.map((r) => r.teacherId!).filter(Boolean) } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } });
        return Promise.all(rows.map(async (r) => {
          const subs = await this.prisma.submission.findMany({ where: { assignment: { teacherId: r.teacherId }, grade: { not: null } }, select: { grade: true } });
          const avg = subs.length ? Math.round(subs.reduce((a, s) => a + (s.grade ?? 0), 0) / subs.length) : 0;
          const t = teachers.find((x) => x.id === r.teacherId);
          return { teacher: t ? `${t.user.firstName} ${t.user.lastName}` : r.teacherId, assignments: r._count, avgMarks: avg };
        }));
      }
      case 'late': {
        const subs = await this.prisma.submission.findMany({ where: { isLate: true }, select: { submittedAt: true, grade: true, assignment: { select: { title: true } }, student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: { submittedAt: 'desc' }, take: 500 });
        return subs.map((s) => ({ student: `${s.student.user.firstName} ${s.student.user.lastName}`, studentCode: s.student.studentCode, assignment: s.assignment.title, submittedAt: s.submittedAt, grade: s.grade }));
      }
      case 'course': {
        const rows = await this.prisma.assignment.groupBy({ by: ['courseId'], _count: true });
        const courses = await this.prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId) } }, select: { id: true, title: true } });
        return rows.map((r) => ({ course: courses.find((c) => c.id === r.courseId)?.title ?? r.courseId, assignments: r._count })).sort((a, b) => b.assignments - a.assignments);
      }
      default:
        throw new BadRequestException(`Unknown report type: ${type}`);
    }
  }

  // ── Calendar ────────────────────────────────────────────────────────────────
  async calendar(month: string | undefined, actor: Actor) {
    const base = month ? new Date(`${month}-01T00:00:00`) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const where: Record<string, unknown> = { dueAt: { gte: start, lt: end } };
    if (actor.role === Role.TEACHER) where.teacherId = await this.teacherProfileId(actor.id);
    const items = await this.prisma.assignment.findMany({ where, select: { id: true, title: true, dueAt: true, status: true, type: true, course: { select: { title: true } } }, orderBy: { dueAt: 'asc' } });
    return items.map((a) => ({ id: a.id, title: a.title, dueAt: a.dueAt, status: a.status, type: a.type, course: a.course.title, day: a.dueAt ? a.dueAt.getDate() : null }));
  }
}
