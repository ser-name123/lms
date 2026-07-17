import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { Role } from '../generated/prisma/enums';
import {
  CreateAssessmentDto, CreateQuestionDto, EvaluateAttemptDto, ListAssessmentsQuery,
  ListQuestionsQuery, OBJECTIVE_TYPES, SaveAnswerDto, SubmitAttemptDto, UpdateAssessmentDto,
  UpdateQuestionDto,
} from './dto';

type Actor = { id: string; role: Role };

const OBJECTIVE = new Set<string>(OBJECTIVE_TYPES);
const COMPLETED_ATTEMPT = ['SUBMITTED', 'UNDER_EVALUATION', 'EVALUATED', 'PUBLISHED'];

@Injectable()
export class AssessmentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
  ) {}

  // ── Background sweep: auto-publish scheduled + auto-close ended + reminders ──
  onModuleInit() {
    const run = () => this.sweep().catch(() => undefined);
    setTimeout(run, 20_000);
    setInterval(run, 5 * 60_000);
  }

  private async sweep() {
    const now = new Date();
    // Auto-publish scheduled assessments whose publishAt has passed.
    const due = await this.prisma.assessment.findMany({
      where: { status: 'SCHEDULED', publishAt: { lte: now } }, select: { id: true },
    });
    for (const a of due) await this.publish(a.id).catch(() => undefined);

    // Auto-close published assessments whose window has ended.
    await this.prisma.assessment.updateMany({
      where: { status: { in: ['PUBLISHED', 'LIVE'] }, endAt: { lt: now } }, data: { status: 'CLOSED' },
    }).catch(() => undefined);

    // Reminders (24h + 1h before startAt) to targeted students.
    const soon = await this.prisma.assessment.findMany({
      where: { status: { in: ['PUBLISHED', 'LIVE'] }, startAt: { gte: now, lte: new Date(now.getTime() + 25 * 3600_000) } },
      select: { id: true, title: true, startAt: true },
    });
    for (const a of soon) {
      const hrs = (a.startAt!.getTime() - now.getTime()) / 3600_000;
      const window = hrs <= 1 ? '1 hour' : hrs <= 24 ? '24 hours' : null;
      if (!window) continue;
      const students = await this.resolveTargetStudents(a.id);
      for (const st of students) {
        await this.notifications.createFor(st.userId, {
          type: 'ASSESSMENT_REMINDER', title: `Reminder: "${a.title}" starts in ${window}`,
          body: 'Get ready for your upcoming assessment.', link: '/student/assessments',
        }).catch(() => undefined);
      }
    }
  }

  // ── Actor resolution ────────────────────────────────────────────────────────
  private async teacherProfileId(userId: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    return t?.id ?? null;
  }
  private studentProfile(userId: string) {
    return this.prisma.studentProfile.findUnique({ where: { userId }, select: { id: true, userId: true, studentCode: true } });
  }

  private async resolveTargetStudentIds(id: string): Promise<string[]> {
    const a = await this.prisma.assessment.findUnique({
      where: { id }, select: { courseId: true, batchId: true, targetType: true, targetStudentIds: true },
    });
    if (!a) return [];
    if (a.targetType === 'SELECTED') return a.targetStudentIds;
    if (a.batchId) return (await this.prisma.batchStudent.findMany({ where: { batchId: a.batchId }, select: { studentId: true } })).map((b) => b.studentId);
    if (a.courseId) return (await this.prisma.enrollment.findMany({ where: { courseId: a.courseId }, select: { studentId: true } })).map((e) => e.studentId);
    return [];
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

  // ── Meta / options ──────────────────────────────────────────────────────────
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

  // ── Question bank ─────────────────────────────────────────────────────────
  async createQuestion(dto: CreateQuestionDto, actor: Actor) {
    if (OBJECTIVE.has(dto.type)) {
      if (dto.type === 'MCQ') {
        if (!dto.options?.length || dto.options.length < 2) throw new BadRequestException('MCQ needs at least 2 options.');
        if (!dto.options.some((o) => o.correct)) throw new BadRequestException('Mark at least one correct option.');
      }
      if ((dto.type === 'TRUE_FALSE' || dto.type === 'FILL_BLANK') && !dto.correctAnswer) {
        throw new BadRequestException('This question type needs a correct answer.');
      }
    }
    return this.prisma.question.create({
      data: {
        subject: dto.subject, chapter: dto.chapter, topic: dto.topic, category: dto.category,
        difficulty: dto.difficulty ?? 'MEDIUM', type: dto.type, text: dto.text,
        options: (dto.options ?? undefined) as never, correctAnswer: dto.correctAnswer,
        marks: dto.marks ?? 1, negativeMarks: dto.negativeMarks ?? 0, estimatedTime: dto.estimatedTime ?? 60,
        explanation: dto.explanation, media: (dto.media ?? undefined) as never,
        rubric: (dto.rubric ?? undefined) as never, createdById: actor.id,
        language: dto.language, testCases: (dto.testCases ?? undefined) as never,
      },
    });
  }

  async listQuestions(q: ListQuestionsQuery) {
    const page = q.page ?? 1, limit = q.limit ?? 50;
    const where: Record<string, unknown> = { archived: q.archived === 'true' };
    if (q.subject) where.subject = q.subject;
    if (q.type) where.type = q.type;
    if (q.difficulty) where.difficulty = q.difficulty;
    if (q.category) where.category = q.category;
    if (q.search) where.OR = [{ text: { contains: q.search, mode: 'insensitive' } }, { topic: { contains: q.search, mode: 'insensitive' } }, { chapter: { contains: q.search, mode: 'insensitive' } }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.question.count({ where }),
    ]);
    return { items, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getQuestion(id: string) {
    const qn = await this.prisma.question.findUnique({ where: { id } });
    if (!qn) throw new NotFoundException('Question not found.');
    return qn;
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto) {
    await this.getQuestion(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.options !== undefined) data.options = dto.options;
    if (dto.media !== undefined) data.media = dto.media;
    if (dto.rubric !== undefined) data.rubric = dto.rubric;
    if (dto.testCases !== undefined) data.testCases = dto.testCases;
    // Bump version so past attempts referencing the old wording stay auditable.
    data.version = { increment: 1 };
    return this.prisma.question.update({ where: { id }, data });
  }

  async archiveQuestion(id: string, archived: boolean) {
    await this.getQuestion(id);
    return this.prisma.question.update({ where: { id }, data: { archived } });
  }

  async removeQuestion(id: string) {
    const used = await this.prisma.assessmentQuestion.count({ where: { questionId: id } });
    if (used > 0) { await this.archiveQuestion(id, true); return { archived: true, reason: 'in-use' }; }
    await this.prisma.question.delete({ where: { id } });
    return { deleted: true };
  }

  async questionMeta() {
    const rows = await this.prisma.question.findMany({ where: { archived: false }, select: { subject: true, category: true } });
    const subjects = [...new Set(rows.map((r) => r.subject).filter(Boolean))].sort();
    const categories = [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort();
    return { subjects, categories, types: OBJECTIVE_TYPES };
  }

  // ── Assessment CRUD / lifecycle ───────────────────────────────────────────
  async createAssessment(dto: CreateAssessmentDto, actor: Actor) {
    if (dto.courseId) {
      const c = await this.prisma.course.findUnique({ where: { id: dto.courseId }, select: { id: true } });
      if (!c) throw new BadRequestException('Course not found.');
    }
    const teacherId = actor.role === Role.TEACHER ? await this.teacherProfileId(actor.id) : undefined;
    const status = dto.status ?? 'DRAFT';
    if (status === 'SCHEDULED' && !dto.publishAt) throw new BadRequestException('Scheduled assessments need a publishAt time.');

    const a = await this.prisma.assessment.create({
      data: {
        title: dto.title, courseId: dto.courseId ?? null, batchId: dto.batchId ?? null,
        teacherId: teacherId ?? null, createdById: actor.id,
        subject: dto.subject, chapter: dto.chapter, topic: dto.topic, category: dto.category,
        type: dto.type ?? 'QUIZ', instructions: dto.instructions,
        durationMin: dto.durationMin ?? 60, totalMarks: dto.totalMarks ?? 100, passingMarks: dto.passingMarks ?? 40,
        attemptsAllowed: dto.attemptsAllowed ?? 1, questionOrder: dto.questionOrder ?? 'FIXED',
        allowBack: dto.allowBack ?? true, showResultImmediately: dto.showResultImmediately ?? false,
        negativeMarking: dto.negativeMarking ?? false, selectionMode: dto.selectionMode ?? 'MANUAL',
        randomRules: (dto.randomRules ?? undefined) as never,
        startAt: dto.startAt ? new Date(dto.startAt) : null, endAt: dto.endAt ? new Date(dto.endAt) : null,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null, status,
        targetType: dto.targetType ?? 'BATCH', targetStudentIds: dto.targetStudentIds ?? [],
        certificateEnabled: dto.certificateEnabled ?? false, certificateThreshold: dto.certificateThreshold ?? 70,
        proctored: dto.proctored ?? false,
      },
    });

    if (dto.selectionMode === 'RANDOM' && dto.randomRules) await this.autofill(a.id, actor).catch(() => undefined);
    else if (dto.questionIds?.length) await this.setQuestions(a.id, dto.questionIds, actor);
    await this.recalcTotalMarks(a.id);

    if (status === 'PUBLISHED') await this.publish(a.id);
    return this.getOne(a.id, actor);
  }

  private async assertEditable(id: string, actor: Actor) {
    const a = await this.prisma.assessment.findUnique({ where: { id }, select: { id: true, teacherId: true, locked: true, status: true } });
    if (!a) throw new NotFoundException('Assessment not found.');
    if (actor.role === Role.TEACHER) {
      const tid = await this.teacherProfileId(actor.id);
      if (a.teacherId && a.teacherId !== tid) throw new ForbiddenException('Not your assessment.');
    }
    if (a.locked && actor.role === Role.TEACHER) throw new ForbiddenException('Assessment is locked by admin.');
    return a;
  }

  async updateAssessment(id: string, dto: UpdateAssessmentDto, actor: Actor) {
    await this.assertEditable(id, actor);
    const data: Record<string, unknown> = { ...dto };
    delete data.status; delete data.questionIds;
    if (dto.startAt !== undefined) data.startAt = dto.startAt ? new Date(dto.startAt) : null;
    if (dto.endAt !== undefined) data.endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (dto.publishAt !== undefined) data.publishAt = dto.publishAt ? new Date(dto.publishAt) : null;
    if (dto.randomRules !== undefined) data.randomRules = dto.randomRules;
    await this.prisma.assessment.update({ where: { id }, data });
    if (dto.questionIds) await this.setQuestions(id, dto.questionIds, actor);
    await this.recalcTotalMarks(id);
    return this.getOne(id, actor);
  }

  async removeAssessment(id: string, actor: Actor) {
    await this.assertEditable(id, actor);
    await this.prisma.assessment.delete({ where: { id } });
    return { deleted: true };
  }

  async setQuestions(id: string, questionIds: string[], actor: Actor) {
    await this.assertEditable(id, actor);
    await this.prisma.assessmentQuestion.deleteMany({ where: { assessmentId: id } });
    if (questionIds.length) {
      await this.prisma.assessmentQuestion.createMany({
        data: questionIds.map((qid, i) => ({ assessmentId: id, questionId: qid, order: i })),
        skipDuplicates: true,
      });
    }
    await this.recalcTotalMarks(id);
    return this.getOne(id, actor);
  }

  /** Auto-select bank questions per randomRules (easy/medium/hard counts). */
  async autofill(id: string, actor: Actor) {
    const a = await this.prisma.assessment.findUnique({ where: { id }, select: { id: true, subject: true, randomRules: true, teacherId: true } });
    if (!a) throw new NotFoundException('Assessment not found.');
    const rules = (a.randomRules ?? {}) as { subject?: string; easy?: number; medium?: number; hard?: number };
    const subject = rules.subject || a.subject || undefined;
    const pick = async (difficulty: string, n: number) => {
      if (!n) return [];
      const rows = await this.prisma.question.findMany({
        where: { archived: false, difficulty, ...(subject ? { subject } : {}) },
        select: { id: true }, take: n * 4,
      });
      // Shuffle deterministically-enough by id and take n.
      return rows.map((r) => r.id).sort(() => 0.5 - (parseInt(id.slice(-4), 16) % 2 ? 1 : -1)).slice(0, n);
    };
    const ids = [
      ...(await pick('EASY', rules.easy ?? 0)),
      ...(await pick('MEDIUM', rules.medium ?? 0)),
      ...(await pick('HARD', rules.hard ?? 0)),
    ];
    return this.setQuestions(id, ids, actor);
  }

  private async recalcTotalMarks(id: string) {
    const links = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId: id }, select: { marks: true, question: { select: { marks: true } } },
    });
    if (!links.length) return;
    const total = links.reduce((sum, l) => sum + (l.marks ?? l.question.marks), 0);
    await this.prisma.assessment.update({ where: { id }, data: { totalMarks: total } });
  }

  async publish(id: string) {
    const links = await this.prisma.assessmentQuestion.count({ where: { assessmentId: id } });
    if (!links) throw new BadRequestException('Add at least one question before publishing.');
    const a = await this.prisma.assessment.update({ where: { id }, data: { status: 'PUBLISHED', publishAt: new Date() }, select: { id: true, title: true } });
    const students = await this.resolveTargetStudents(id);
    for (const st of students) {
      await this.notifications.createFor(st.userId, { type: 'ASSESSMENT_PUBLISHED', title: `New assessment: ${a.title}`, body: 'A new assessment has been published for you.', link: '/student/assessments' }).catch(() => undefined);
    }
    return { status: 'PUBLISHED', notified: students.length };
  }

  async setLifecycle(id: string, action: 'unpublish' | 'archive' | 'close' | 'lock' | 'unlock' | 'live', actor: Actor) {
    await this.assertEditable(id, actor);
    const map: Record<string, Record<string, unknown>> = {
      unpublish: { status: 'DRAFT' }, archive: { status: 'ARCHIVED' }, close: { status: 'CLOSED' },
      live: { status: 'LIVE' }, lock: { locked: true }, unlock: { locked: false },
    };
    await this.prisma.assessment.update({ where: { id }, data: map[action] });
    return { ok: true, action };
  }

  async clone(id: string, actor: Actor) {
    const a = await this.prisma.assessment.findUnique({ where: { id }, include: { questions: true } });
    if (!a) throw new NotFoundException('Assessment not found.');
    const { id: _i, createdAt: _c, updatedAt: _u, questions, ...rest } = a;
    const copy = await this.prisma.assessment.create({
      data: { ...rest, title: `${a.title} (Copy)`, status: 'DRAFT', createdById: actor.id, publishAt: null, randomRules: a.randomRules as never, attachments: a.attachments as never, targetStudentIds: a.targetStudentIds },
    });
    if (questions.length) {
      await this.prisma.assessmentQuestion.createMany({ data: questions.map((q) => ({ assessmentId: copy.id, questionId: q.questionId, order: q.order, marks: q.marks })) });
    }
    return this.getOne(copy.id, actor);
  }

  // ── Listing / detail ────────────────────────────────────────────────────────
  async list(q: ListAssessmentsQuery, actor: Actor) {
    const page = q.page ?? 1, limit = q.limit ?? 50;
    const where: Record<string, unknown> = {};
    if (actor.role === Role.TEACHER) where.teacherId = await this.teacherProfileId(actor.id);
    if (q.courseId) where.courseId = q.courseId;
    if (q.batchId) where.batchId = q.batchId;
    if (q.teacherId && actor.role !== Role.TEACHER) where.teacherId = q.teacherId;
    if (q.subject) where.subject = { contains: q.subject, mode: 'insensitive' };
    if (q.status && q.status !== 'All') where.status = q.status;
    if (q.search) where.OR = [{ title: { contains: q.search, mode: 'insensitive' } }, { topic: { contains: q.search, mode: 'insensitive' } }];
    if (q.from || q.to) where.startAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.assessment.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: {
          course: { select: { title: true } }, batch: { select: { code: true, name: true } },
          teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
          _count: { select: { questions: true, attempts: true } },
        },
      }),
      this.prisma.assessment.count({ where }),
    ]);

    const rows = await Promise.all(items.map(async (a) => {
      const targetCount = (await this.resolveTargetStudentIds(a.id)).length;
      const grp = await this.prisma.assessmentAttempt.groupBy({ by: ['status'], where: { assessmentId: a.id }, _count: true });
      const cnt = (s: string) => grp.find((x) => x.status === s)?._count ?? 0;
      const submitted = cnt('SUBMITTED') + cnt('UNDER_EVALUATION') + cnt('EVALUATED') + cnt('PUBLISHED');
      return {
        id: a.id, title: a.title, subject: a.subject, type: a.type, course: a.course?.title ?? null, courseId: a.courseId,
        batch: a.batch ? a.batch.code : null, teacher: a.teacher ? `${a.teacher.user.firstName} ${a.teacher.user.lastName}` : null,
        durationMin: a.durationMin, totalMarks: a.totalMarks, startAt: a.startAt, endAt: a.endAt,
        status: a.status, locked: a.locked, questions: a._count.questions, targetCount, submitted,
        pendingEval: cnt('SUBMITTED') + cnt('UNDER_EVALUATION'), published: cnt('PUBLISHED'),
      };
    }));
    return { items: rows, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getOne(id: string, actor: Actor) {
    const a = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        course: { select: { title: true } }, batch: { select: { code: true, name: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        questions: { orderBy: { order: 'asc' }, include: { question: true } },
      },
    });
    if (!a) throw new NotFoundException('Assessment not found.');
    void actor;
    const targetCount = (await this.resolveTargetStudentIds(id)).length;
    return {
      ...a,
      courseTitle: a.course?.title ?? null,
      batchLabel: a.batch ? `${a.batch.code} · ${a.batch.name}` : null,
      teacherName: a.teacher ? `${a.teacher.user.firstName} ${a.teacher.user.lastName}` : null,
      targetCount,
      questionList: a.questions.map((link) => ({ ...link.question, order: link.order, marks: link.marks ?? link.question.marks, linkId: link.id })),
    };
  }

  /** A single student's assessment history — powers the Student Hub tab
   *  (admin/coach view) and, through it, the parent read-only view. */
  async studentAttempts(studentId: string) {
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { studentId }, orderBy: { startedAt: 'desc' },
      include: { assessment: { select: { title: true, subject: true, type: true, totalMarks: true } } },
    });
    return attempts.map((a) => ({
      id: a.id, assessment: a.assessment.title, subject: a.assessment.subject, type: a.assessment.type,
      status: a.status, score: a.score, totalMarks: a.totalMarks, percentage: a.percentage,
      passed: a.passed, rank: a.rank, submittedAt: a.submittedAt, published: a.status === 'PUBLISHED',
    }));
  }

  // ── Attempt monitoring (teacher/admin) ─────────────────────────────────────
  async getAttempts(id: string) {
    const targetIds = await this.resolveTargetStudentIds(id);
    const [students, attempts] = await Promise.all([
      this.prisma.studentProfile.findMany({ where: { id: { in: targetIds } }, select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true } } } }),
      this.prisma.assessmentAttempt.findMany({ where: { assessmentId: id }, orderBy: { attemptNo: 'desc' } }),
    ]);
    // Keep only the latest attempt per student for the roster view.
    const latest = new Map<string, typeof attempts[number]>();
    for (const at of attempts) if (!latest.has(at.studentId)) latest.set(at.studentId, at);
    return students.map((st) => {
      const at = latest.get(st.id);
      return {
        studentId: st.id, studentCode: st.studentCode, name: `${st.user.firstName} ${st.user.lastName}`,
        attemptId: at?.id ?? null, status: at?.status ?? 'NOT_STARTED', submittedAt: at?.submittedAt ?? null,
        score: at?.score ?? null, totalMarks: at?.totalMarks ?? null, percentage: at?.percentage ?? null,
        passed: at?.passed ?? null, autoSubmitted: at?.autoSubmitted ?? false, rank: at?.rank ?? null,
        violations: at?.violations ?? 0,
      };
    });
  }

  async getAttempt(attemptId: string) {
    const at = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: { select: { title: true, totalMarks: true, passingMarks: true, negativeMarking: true, showResultImmediately: true } },
        student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } },
        answers: { include: { question: true } },
      },
    });
    if (!at) throw new NotFoundException('Attempt not found.');
    return {
      ...at,
      studentName: `${at.student.user.firstName} ${at.student.user.lastName}`,
      answerList: at.answers.map((ans) => ({
        answerId: ans.id, questionId: ans.questionId, response: ans.response, markedForReview: ans.markedForReview,
        isCorrect: ans.isCorrect, awardedMarks: ans.awardedMarks, maxMarks: ans.maxMarks, rubricScores: ans.rubricScores,
        feedback: ans.feedback, autoGraded: ans.autoGraded, question: ans.question,
      })),
    };
  }

  // ── Teacher evaluation (subjective) ────────────────────────────────────────
  async evaluate(attemptId: string, dto: EvaluateAttemptDto, actor: Actor) {
    const at = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: { select: { id: true, title: true, teacherId: true, passingMarks: true, showResultImmediately: true } }, answers: { include: { question: { select: { type: true, marks: true } } } } },
    });
    if (!at) throw new NotFoundException('Attempt not found.');
    if (!COMPLETED_ATTEMPT.includes(at.status)) throw new BadRequestException('This attempt has not been submitted yet.');
    if (actor.role === Role.TEACHER) {
      const tid = await this.teacherProfileId(actor.id);
      if (at.assessment.teacherId && at.assessment.teacherId !== tid) throw new ForbiddenException('Not your assessment.');
    }

    // Apply subjective grades.
    for (const g of dto.answers ?? []) {
      const ans = at.answers.find((x) => x.questionId === g.questionId);
      if (!ans) continue;
      if (g.awardedMarks > ans.maxMarks) throw new BadRequestException(`Marks for a question cannot exceed ${ans.maxMarks}.`);
      await this.prisma.assessmentAnswer.update({
        where: { id: ans.id },
        data: { awardedMarks: g.awardedMarks, rubricScores: (g.rubricScores ?? undefined) as never, feedback: g.feedback, isCorrect: g.awardedMarks > 0, autoGraded: false },
      });
    }

    // Recompute totals from all answers.
    const fresh = await this.prisma.assessmentAnswer.findMany({ where: { attemptId }, select: { awardedMarks: true, autoGraded: true } });
    const autoScore = fresh.filter((a) => a.autoGraded).reduce((s, a) => s + (a.awardedMarks ?? 0), 0);
    const manualScore = fresh.filter((a) => !a.autoGraded).reduce((s, a) => s + (a.awardedMarks ?? 0), 0);
    const score = Math.max(0, autoScore + manualScore);
    const percentage = at.totalMarks ? Math.round((score / at.totalMarks) * 1000) / 10 : 0;
    const passed = score >= at.assessment.passingMarks;
    const publishNow = dto.publish === true;

    await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        autoScore, manualScore, score, percentage, passed,
        teacherFeedback: dto.teacherFeedback ?? at.teacherFeedback,
        status: publishNow ? 'PUBLISHED' : 'EVALUATED', evaluatedAt: new Date(),
        publishedAt: publishNow ? new Date() : at.publishedAt,
      },
    });
    if (publishNow) await this.notifyResult(attemptId).catch(() => undefined);
    return { ok: true, score, percentage, passed, status: publishNow ? 'PUBLISHED' : 'EVALUATED' };
  }

  async startReview(attemptId: string) {
    return this.prisma.assessmentAttempt.update({ where: { id: attemptId }, data: { status: 'UNDER_EVALUATION' } });
  }

  /** Publish all EVALUATED attempts of an assessment: rank + notify. */
  async publishResults(id: string, actor: Actor) {
    await this.assertEditable(id, actor);
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { assessmentId: id, status: { in: ['EVALUATED', 'PUBLISHED'] } }, orderBy: { score: 'desc' },
    });
    let rank = 0, published = 0;
    for (const at of attempts) {
      rank += 1;
      await this.prisma.assessmentAttempt.update({ where: { id: at.id }, data: { rank, status: 'PUBLISHED', publishedAt: at.publishedAt ?? new Date() } });
      if (at.status !== 'PUBLISHED') { await this.notifyResult(at.id).catch(() => undefined); published += 1; }
    }
    return { published, ranked: attempts.length };
  }

  private async notifyResult(attemptId: string) {
    const at = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: { select: { title: true, certificateEnabled: true, certificateThreshold: true } }, student: { select: { userId: true, parentEmail: true, guardianName: true, user: { select: { firstName: true } } } } },
    });
    if (!at) return;
    // Issue a certificate number once, when the result is published and eligible.
    if (!at.certificateNo && at.assessment.certificateEnabled && at.passed && at.percentage >= at.assessment.certificateThreshold) {
      const certificateNo = `CERT-${new Date().getFullYear()}-${attemptId.slice(0, 8).toUpperCase()}`;
      await this.prisma.assessmentAttempt.update({ where: { id: attemptId }, data: { certificateNo } });
    }
    await this.notifications.createFor(at.student.userId, {
      type: 'ASSESSMENT_RESULT', title: `Result: ${at.assessment.title}`,
      body: `You scored ${Math.round(at.score)}/${at.totalMarks} (${at.percentage}%) — ${at.passed ? 'Passed' : 'Not passed'}.`,
      link: '/student/assessments',
    }).catch(() => undefined);
    if (at.student.parentEmail) {
      this.emails.sendMail(at.student.parentEmail, `${at.student.user.firstName}'s assessment result`,
        `${at.student.user.firstName} scored ${Math.round(at.score)}/${at.totalMarks} (${at.percentage}%) in "${at.assessment.title}".`, undefined,
        `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${at.student.guardianName || 'Parent'},</p><p><b>${at.student.user.firstName}</b> scored <b>${Math.round(at.score)}/${at.totalMarks}</b> (<b>${at.percentage}%</b>) in "<b>${at.assessment.title}</b>" — ${at.passed ? 'Passed ✅' : 'Not passed'}.</p></div>`).catch(() => undefined);
    }
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

    const assessments = await this.prisma.assessment.findMany({
      where: {
        status: { in: ['PUBLISHED', 'LIVE', 'CLOSED'] },
        OR: [
          { targetType: 'SELECTED', targetStudentIds: { has: sp.id } },
          { targetType: 'BATCH', batchId: { in: batchIds.length ? batchIds : ['__none__'] } },
          { targetType: 'BATCH', batchId: null, courseId: { in: courseIds.length ? courseIds : ['__none__'] } },
        ],
      },
      orderBy: { startAt: 'asc' },
      include: { course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } }, _count: { select: { questions: true } } },
    });
    const attempts = await this.prisma.assessmentAttempt.findMany({ where: { studentId: sp.id, assessmentId: { in: assessments.map((a) => a.id) } }, orderBy: { attemptNo: 'desc' } });
    const byA = new Map<string, typeof attempts>();
    for (const at of attempts) { const arr = byA.get(at.assessmentId) ?? []; arr.push(at); byA.set(at.assessmentId, arr); }
    const now = new Date();
    return assessments.map((a) => {
      const mine = byA.get(a.id) ?? [];
      const latest = mine[0];
      const completed = mine.filter((m) => COMPLETED_ATTEMPT.includes(m.status)).length;
      const windowOpen = (!a.startAt || a.startAt <= now) && (!a.endAt || now <= a.endAt) && a.status !== 'CLOSED';
      const canAttempt = windowOpen && (a.attemptsAllowed === 0 || completed < a.attemptsAllowed) && (!latest || COMPLETED_ATTEMPT.includes(latest.status));
      const inProgress = latest && latest.status === 'IN_PROGRESS' ? latest : null;
      return {
        id: a.id, title: a.title, subject: a.subject, type: a.type, course: a.course?.title ?? null,
        teacher: a.teacher ? `${a.teacher.user.firstName} ${a.teacher.user.lastName}` : null,
        durationMin: a.durationMin, totalMarks: a.totalMarks, passingMarks: a.passingMarks, questions: a._count.questions,
        startAt: a.startAt, endAt: a.endAt, status: a.status, attemptsAllowed: a.attemptsAllowed,
        showResultImmediately: a.showResultImmediately, windowOpen, canAttempt,
        attemptsUsed: completed, inProgressAttemptId: inProgress?.id ?? null,
        lastAttempt: latest ? { id: latest.id, status: latest.status, score: latest.score, totalMarks: latest.totalMarks, percentage: latest.percentage, passed: latest.passed, published: latest.status === 'PUBLISHED' } : null,
      };
    });
  }

  /** Start a new attempt or resume an in-progress one. Returns questions WITHOUT answers. */
  async take(id: string, userId: string) {
    const sp = await this.studentProfile(userId);
    if (!sp) throw new ForbiddenException('Not a student.');
    const a = await this.prisma.assessment.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' }, include: { question: true } } },
    });
    if (!a) throw new NotFoundException('Assessment not found.');
    if (!['PUBLISHED', 'LIVE'].includes(a.status)) throw new BadRequestException('This assessment is not open.');
    const now = new Date();
    if (a.startAt && now < a.startAt) throw new BadRequestException('This assessment has not started yet.');
    if (a.endAt && now > a.endAt) throw new BadRequestException('The assessment window has closed.');
    if (!a.questions.length) throw new BadRequestException('This assessment has no questions.');

    // Resume in-progress, else enforce attempt limit + create.
    let attempt = await this.prisma.assessmentAttempt.findFirst({ where: { assessmentId: id, studentId: sp.id, status: 'IN_PROGRESS' }, orderBy: { attemptNo: 'desc' } });
    if (!attempt) {
      const completed = await this.prisma.assessmentAttempt.count({ where: { assessmentId: id, studentId: sp.id, status: { in: COMPLETED_ATTEMPT } } });
      if (a.attemptsAllowed !== 0 && completed >= a.attemptsAllowed) throw new BadRequestException('You have used all your attempts.');
      attempt = await this.prisma.assessmentAttempt.create({ data: { assessmentId: id, studentId: sp.id, attemptNo: completed + 1, totalMarks: a.totalMarks } });
    }
    const saved = await this.prisma.assessmentAnswer.findMany({ where: { attemptId: attempt.id }, select: { questionId: true, response: true, markedForReview: true } });
    const savedMap = new Map(saved.map((s) => [s.questionId, s]));

    let questions = a.questions.map((link) => {
      const q = link.question;
      const opts = (q.options as { id: string; text: string }[] | null) ?? null;
      return {
        questionId: q.id, type: q.type, text: q.text, subject: q.subject, topic: q.topic, difficulty: q.difficulty,
        marks: link.marks ?? q.marks, media: q.media, estimatedTime: q.estimatedTime,
        language: q.language, testCases: q.type === 'CODING' ? q.testCases : null,
        // Options WITHOUT the `correct` flag; match options without right side.
        options: opts ? opts.map((o) => ({ id: o.id, text: o.text })) : null,
        matchPairs: q.type === 'MATCH' && Array.isArray(q.options) ? (q.options as { left: string; right: string }[]).map((p) => p.left) : null,
        matchOptions: q.type === 'MATCH' && Array.isArray(q.options) ? shuffleStable((q.options as { right: string }[]).map((p) => p.right), attempt!.id) : null,
        savedResponse: savedMap.get(q.id)?.response ?? null,
        markedForReview: savedMap.get(q.id)?.markedForReview ?? false,
      };
    });
    if (a.questionOrder === 'RANDOM') questions = shuffleStable(questions, attempt.id);

    const elapsedSec = Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000);
    const remainingSec = Math.max(0, a.durationMin * 60 - elapsedSec);
    return {
      attemptId: attempt.id, assessmentId: a.id, title: a.title, instructions: a.instructions,
      durationMin: a.durationMin, allowBack: a.allowBack, totalMarks: a.totalMarks, questionOrder: a.questionOrder,
      proctored: a.proctored, startedAt: attempt.startedAt, remainingSec, questions,
    };
  }

  async saveAnswer(attemptId: string, userId: string, dto: SaveAnswerDto) {
    const at = await this.assertOwnActiveAttempt(attemptId, userId);
    const maxMarks = await this.questionMaxMarks(at.assessmentId, dto.questionId);
    await this.prisma.assessmentAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: dto.questionId } },
      create: { attemptId, questionId: dto.questionId, response: (dto.response ?? undefined) as never, markedForReview: dto.markedForReview ?? false, maxMarks, timeSpentSec: dto.timeSpentSec },
      update: { response: (dto.response ?? undefined) as never, markedForReview: dto.markedForReview ?? false, timeSpentSec: dto.timeSpentSec },
    });
    return { saved: true };
  }

  private async assertOwnActiveAttempt(attemptId: string, userId: string) {
    const sp = await this.studentProfile(userId);
    if (!sp) throw new ForbiddenException('Not a student.');
    const at = await this.prisma.assessmentAttempt.findUnique({ where: { id: attemptId }, select: { id: true, studentId: true, status: true, assessmentId: true } });
    if (!at) throw new NotFoundException('Attempt not found.');
    if (at.studentId !== sp.id) throw new ForbiddenException('Not your attempt.');
    if (at.status !== 'IN_PROGRESS') throw new BadRequestException('This attempt is already submitted.');
    return at;
  }

  private async questionMaxMarks(assessmentId: string, questionId: string) {
    const link = await this.prisma.assessmentQuestion.findUnique({ where: { assessmentId_questionId: { assessmentId, questionId } }, select: { marks: true, question: { select: { marks: true } } } });
    return link ? (link.marks ?? link.question.marks) : 1;
  }

  async submitAttempt(attemptId: string, userId: string, dto: SubmitAttemptDto) {
    const at = await this.assertOwnActiveAttempt(attemptId, userId);
    // Persist any final snapshot answers.
    for (const ans of dto.answers ?? []) await this.saveAnswer(attemptId, userId, ans).catch(() => undefined);
    return this.gradeObjective(at.assessmentId, attemptId, { autoSubmitted: dto.autoSubmitted, timeSpentSec: dto.timeSpentSec, violations: dto.violations, proctorLog: dto.proctorLog });
  }

  /** Auto-grade the objective questions and finalise (or route to teacher review). */
  private async gradeObjective(assessmentId: string, attemptId: string, opts: { autoSubmitted?: boolean; timeSpentSec?: number; violations?: number; proctorLog?: { type: string; at: string }[] }) {
    const a = await this.prisma.assessment.findUnique({ where: { id: assessmentId }, select: { negativeMarking: true, passingMarks: true, totalMarks: true, showResultImmediately: true, title: true, teacherId: true } });
    if (!a) throw new NotFoundException('Assessment not found.');
    const links = await this.prisma.assessmentQuestion.findMany({ where: { assessmentId }, include: { question: true } });
    const answers = await this.prisma.assessmentAnswer.findMany({ where: { attemptId } });
    const ansMap = new Map(answers.map((x) => [x.questionId, x]));

    let autoScore = 0, correct = 0, wrong = 0, skipped = 0, hasSubjective = false;
    for (const link of links) {
      const q = link.question;
      const maxMarks = link.marks ?? q.marks;
      const ans = ansMap.get(q.id);
      if (OBJECTIVE.has(q.type)) {
        const responded = ans && ans.response != null && !isEmptyResponse(ans.response);
        if (!responded) {
          skipped += 1;
          if (ans) await this.prisma.assessmentAnswer.update({ where: { id: ans.id }, data: { isCorrect: false, awardedMarks: 0, autoGraded: true, maxMarks } });
          continue;
        }
        const isCorrect = gradeObjectiveAnswer(q.type, q, ans!.response);
        const awarded = isCorrect ? maxMarks : (a.negativeMarking ? -Number(q.negativeMarks || 0) : 0);
        autoScore += awarded;
        if (isCorrect) correct += 1; else wrong += 1;
        await this.prisma.assessmentAnswer.update({ where: { id: ans!.id }, data: { isCorrect, awardedMarks: awarded, autoGraded: true, maxMarks } });
      } else {
        hasSubjective = true;
        // Ensure a row exists so the teacher can grade it (even if skipped).
        if (ans) await this.prisma.assessmentAnswer.update({ where: { id: ans.id }, data: { autoGraded: false, maxMarks } });
        else await this.prisma.assessmentAnswer.create({ data: { attemptId, questionId: q.id, autoGraded: false, maxMarks } });
      }
    }
    autoScore = Math.max(0, autoScore);
    const totalMarks = a.totalMarks;
    const score = autoScore; // manual added later during evaluation
    const percentage = totalMarks ? Math.round((score / totalMarks) * 1000) / 10 : 0;
    const passed = score >= a.passingMarks;

    // No subjective → finalised now. showResultImmediately publishes to student.
    const status = hasSubjective ? 'SUBMITTED' : (a.showResultImmediately ? 'PUBLISHED' : 'EVALUATED');
    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        status, submittedAt: new Date(), autoSubmitted: opts.autoSubmitted ?? false, timeSpentSec: opts.timeSpentSec,
        autoScore, manualScore: 0, score, percentage: hasSubjective ? 0 : percentage, passed: hasSubjective ? false : passed,
        totalMarks, correctCount: correct, wrongCount: wrong, skippedCount: skipped,
        violations: opts.violations ?? 0, proctorLog: (opts.proctorLog ?? undefined) as never,
        evaluatedAt: hasSubjective ? null : new Date(), publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
    });

    // Notify teacher of a new submission needing review.
    if (a.teacherId) {
      const t = await this.prisma.teacherProfile.findUnique({ where: { id: a.teacherId }, select: { userId: true } });
      if (t) await this.notifications.createFor(t.userId, { type: 'ASSESSMENT_SUBMITTED', title: `New submission: ${a.title}`, body: hasSubjective ? 'Needs your evaluation.' : 'Auto-graded.', link: '/teacher/assessments' }).catch(() => undefined);
    }
    if (status === 'PUBLISHED') await this.notifyResult(attemptId).catch(() => undefined);
    return { attemptId: updated.id, status, hasSubjective, autoScore, correct, wrong, skipped };
  }

  /** Student result view — reveals correctness only when the result is available. */
  async attemptResult(attemptId: string, userId: string) {
    const sp = await this.studentProfile(userId);
    if (!sp) throw new ForbiddenException('Not a student.');
    const at = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: { select: { title: true, totalMarks: true, passingMarks: true, showResultImmediately: true, certificateEnabled: true, certificateThreshold: true, subject: true, type: true } },
        answers: { include: { question: true } },
      },
    });
    if (!at) throw new NotFoundException('Attempt not found.');
    if (at.studentId !== sp.id) throw new ForbiddenException('Not your attempt.');
    const available = at.status === 'PUBLISHED' || (at.status === 'EVALUATED' && at.assessment.showResultImmediately);
    if (!available) {
      return { available: false, status: at.status, title: at.assessment.title };
    }
    // Rank among published attempts of this assessment.
    let rank = at.rank;
    let totalStudents: number | null = null;
    const published = await this.prisma.assessmentAttempt.findMany({ where: { assessmentId: at.assessmentId, status: 'PUBLISHED' }, select: { id: true, score: true }, orderBy: { score: 'desc' } });
    if (published.length) { totalStudents = published.length; if (rank == null) rank = published.findIndex((p) => p.id === at.id) + 1 || null; }

    const certEligible = at.assessment.certificateEnabled && at.percentage >= at.assessment.certificateThreshold && at.passed;
    return {
      available: true, status: at.status, attemptId: at.id, title: at.assessment.title, subject: at.assessment.subject, type: at.assessment.type,
      score: at.score, totalMarks: at.totalMarks, percentage: at.percentage, passed: at.passed, rank, totalStudents,
      correctCount: at.correctCount, wrongCount: at.wrongCount, skippedCount: at.skippedCount,
      timeSpentSec: at.timeSpentSec, teacherFeedback: at.teacherFeedback, certEligible, certificateNo: at.certificateNo, violations: at.violations,
      questions: at.answers.map((ans) => ({
        questionId: ans.questionId, text: ans.question.text, type: ans.question.type, marks: ans.maxMarks,
        response: ans.response, correctAnswer: ans.question.correctAnswer, options: ans.question.options,
        isCorrect: ans.isCorrect, awardedMarks: ans.awardedMarks, feedback: ans.feedback, explanation: ans.question.explanation,
        rubricScores: ans.rubricScores,
      })),
    };
  }

  /** Certificate payload (student prints it client-side). */
  async certificate(attemptId: string, userId: string) {
    const sp = await this.studentProfile(userId);
    if (!sp) throw new ForbiddenException('Not a student.');
    const at = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: { select: { title: true, certificateEnabled: true, certificateThreshold: true, subject: true } }, student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } } },
    });
    if (!at) throw new NotFoundException('Attempt not found.');
    if (at.studentId !== sp.id) throw new ForbiddenException('Not your attempt.');
    if (at.status !== 'PUBLISHED') throw new BadRequestException('Result not published yet.');
    if (!at.assessment.certificateEnabled || at.percentage < at.assessment.certificateThreshold || !at.passed) {
      throw new BadRequestException('Not eligible for a certificate.');
    }
    const certificateNo = at.certificateNo ?? `CERT-${new Date().getFullYear()}-${at.id.slice(0, 8).toUpperCase()}`;
    if (!at.certificateNo) await this.prisma.assessmentAttempt.update({ where: { id: at.id }, data: { certificateNo } });
    return {
      studentName: `${at.student.user.firstName} ${at.student.user.lastName}`, studentCode: at.student.studentCode,
      assessment: at.assessment.title, subject: at.assessment.subject, percentage: at.percentage,
      score: at.score, totalMarks: at.totalMarks, certificateNo, issuedAt: new Date(),
    };
  }

  // ── Dashboards ──────────────────────────────────────────────────────────────
  async adminDashboard() {
    const now = new Date();
    const [total, byStatus, attemptCounts, live, pendingEval, published] = await Promise.all([
      this.prisma.assessment.count(),
      this.prisma.assessment.groupBy({ by: ['status'], _count: true }),
      this.prisma.assessmentAttempt.groupBy({ by: ['status'], _count: true }),
      this.prisma.assessment.count({ where: { status: { in: ['PUBLISHED', 'LIVE'] }, startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gte: now } }] } }),
      this.prisma.assessmentAttempt.count({ where: { status: { in: ['SUBMITTED', 'UNDER_EVALUATION'] } } }),
      this.prisma.assessmentAttempt.count({ where: { status: 'PUBLISHED' } }),
    ]);
    const ac = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
    const atc = (s: string) => attemptCounts.find((x) => x.status === s)?._count ?? 0;
    return {
      cards: {
        total, scheduled: ac('SCHEDULED'), live, completed: ac('CLOSED') + ac('ARCHIVED'),
        published: ac('PUBLISHED'), draft: ac('DRAFT'),
        attempts: atc('SUBMITTED') + atc('UNDER_EVALUATION') + atc('EVALUATED') + atc('PUBLISHED'),
        pendingEvaluation: pendingEval, publishedResults: published,
      },
    };
  }

  async teacherDashboard(userId: string) {
    const tid = await this.teacherProfileId(userId);
    if (!tid) return { cards: { todays: 0, pendingEvaluation: 0, upcoming: 0, avgClassScore: 0 } };
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0); const now = new Date();
    const [todays, pending, upcoming, graded] = await Promise.all([
      this.prisma.assessment.count({ where: { teacherId: tid, startAt: { gte: startDay, lt: new Date(startDay.getTime() + 86400_000) } } }),
      this.prisma.assessmentAttempt.count({ where: { assessment: { teacherId: tid }, status: { in: ['SUBMITTED', 'UNDER_EVALUATION'] } } }),
      this.prisma.assessment.count({ where: { teacherId: tid, status: { in: ['SCHEDULED', 'PUBLISHED'] }, startAt: { gt: now } } }),
      this.prisma.assessmentAttempt.findMany({ where: { assessment: { teacherId: tid }, status: 'PUBLISHED' }, select: { percentage: true } }),
    ]);
    const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.percentage, 0) / graded.length) : 0;
    return { cards: { todays, pendingEvaluation: pending, upcoming, avgClassScore: avg } };
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  async analytics() {
    const [assessments, attempts] = await Promise.all([
      this.prisma.assessment.findMany({ select: { id: true, teacherId: true, courseId: true, batchId: true, subject: true, type: true, course: { select: { title: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } }, batch: { select: { code: true } } } }),
      this.prisma.assessmentAttempt.findMany({ where: { status: 'PUBLISHED' }, select: { score: true, totalMarks: true, percentage: true, passed: true, submittedAt: true, studentId: true, assessment: { select: { courseId: true, teacherId: true, batchId: true, subject: true } } } }),
    ]);
    const scores = attempts.map((a) => a.percentage);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const highest = scores.length ? Math.max(...scores) : 0;
    const lowest = scores.length ? Math.min(...scores) : 0;
    const passCount = attempts.filter((a) => a.passed).length;
    const passPct = attempts.length ? Math.round((passCount / attempts.length) * 100) : 0;

    // Score distribution buckets.
    const buckets = [[0, 40], [40, 60], [60, 75], [75, 90], [90, 101]];
    const distribution = buckets.map(([lo, hi]) => ({ range: hi >= 101 ? `${lo}-100` : `${lo}-${hi}`, value: scores.filter((s) => s >= lo && s < hi).length }));

    const groupAvg = <T>(rows: T[], key: (r: T) => string | null | undefined, val: (r: T) => number) => {
      const m = new Map<string, { sum: number; n: number }>();
      for (const r of rows) { const k = key(r); if (!k) continue; const c = m.get(k) ?? { sum: 0, n: 0 }; c.sum += val(r); c.n++; m.set(k, c); }
      return [...m.entries()].map(([name, v]) => ({ name, value: Math.round(v.sum / v.n) })).sort((a, b) => b.value - a.value);
    };
    // Monthly trend.
    const trend = new Map<string, { sum: number; n: number }>();
    for (const a of attempts) { if (!a.submittedAt) continue; const d = a.submittedAt; const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; const c = trend.get(k) ?? { sum: 0, n: 0 }; c.sum += a.percentage; c.n++; trend.set(k, c); }

    return {
      cards: { avgScore, highest, lowest, completionPct: attempts.length ? 100 : 0, passPct, failPct: attempts.length ? 100 - passPct : 0, pendingEvaluation: await this.prisma.assessmentAttempt.count({ where: { status: { in: ['SUBMITTED', 'UNDER_EVALUATION'] } } }) },
      scoreDistribution: distribution,
      subjectWise: groupAvg(attempts, (a) => a.assessment.subject, (a) => a.percentage).slice(0, 10),
      teacherWise: groupAvg(attempts, (a) => { const at = assessments.find((x) => x.teacherId === a.assessment.teacherId); return at?.teacher ? `${at.teacher.user.firstName} ${at.teacher.user.lastName}` : null; }, (a) => a.percentage).slice(0, 10),
      batchWise: groupAvg(attempts, (a) => { const at = assessments.find((x) => x.batchId === a.assessment.batchId && x.batchId); return at?.batch?.code ?? null; }, (a) => a.percentage).slice(0, 10),
      monthlyTrend: [...trend.entries()].sort().slice(-12).map(([month, v]) => ({ month, score: Math.round(v.sum / v.n) })),
      assessmentsCount: assessments.length, attemptsCount: attempts.length,
    };
  }

  /** Per-question analytics: attempts, correct%, wrong%, skipped%, avg time, difficulty index. */
  async questionAnalytics(assessmentId?: string) {
    const answers = await this.prisma.assessmentAnswer.findMany({
      where: assessmentId ? { attempt: { assessmentId } } : {},
      select: { questionId: true, isCorrect: true, response: true, timeSpentSec: true, autoGraded: true, question: { select: { text: true, type: true, subject: true, difficulty: true } } },
    });
    const byQ = new Map<string, { text: string; type: string; subject: string; difficulty: string; total: number; correct: number; wrong: number; skipped: number; time: number; timeN: number }>();
    for (const a of answers) {
      const cur = byQ.get(a.questionId) ?? { text: a.question.text, type: a.question.type, subject: a.question.subject, difficulty: a.question.difficulty, total: 0, correct: 0, wrong: 0, skipped: 0, time: 0, timeN: 0 };
      cur.total += 1;
      const skipped = a.response == null || isEmptyResponse(a.response);
      if (skipped) cur.skipped += 1;
      else if (a.isCorrect) cur.correct += 1;
      else cur.wrong += 1;
      if (a.timeSpentSec != null) { cur.time += a.timeSpentSec; cur.timeN += 1; }
      byQ.set(a.questionId, cur);
    }
    return [...byQ.entries()].map(([questionId, v]) => {
      const correctPct = v.total ? Math.round((v.correct / v.total) * 100) : 0;
      return {
        questionId, text: v.text, type: v.type, subject: v.subject, difficulty: v.difficulty, attempts: v.total,
        correctPct, wrongPct: v.total ? Math.round((v.wrong / v.total) * 100) : 0, skippedPct: v.total ? Math.round((v.skipped / v.total) * 100) : 0,
        avgTimeSec: v.timeN ? Math.round(v.time / v.timeN) : null,
        difficultyIndex: correctPct, // higher = easier
        flag: correctPct >= 90 ? 'TOO_EASY' : correctPct <= 30 ? 'TOO_HARD' : v.skipped / (v.total || 1) > 0.5 ? 'CONFUSING' : 'OK',
      };
    }).sort((a, b) => b.attempts - a.attempts);
  }

  // ── Reports ─────────────────────────────────────────────────────────────────
  async report(type: string) {
    switch (type) {
      case 'top-performers': {
        const rows = await this.prisma.assessmentAttempt.findMany({ where: { status: 'PUBLISHED' }, orderBy: { percentage: 'desc' }, take: 20, include: { student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } }, assessment: { select: { title: true } } } });
        return rows.map((r) => ({ student: `${r.student.user.firstName} ${r.student.user.lastName}`, studentCode: r.student.studentCode, assessment: r.assessment.title, percentage: r.percentage, score: r.score, totalMarks: r.totalMarks }));
      }
      case 'weak-students': {
        const rows = await this.prisma.assessmentAttempt.findMany({ where: { status: 'PUBLISHED', passed: false }, orderBy: { percentage: 'asc' }, take: 20, include: { student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } }, assessment: { select: { title: true } } } });
        return rows.map((r) => ({ student: `${r.student.user.firstName} ${r.student.user.lastName}`, studentCode: r.student.studentCode, assessment: r.assessment.title, percentage: r.percentage, score: r.score, totalMarks: r.totalMarks }));
      }
      case 'pass-fail': {
        const grp = await this.prisma.assessmentAttempt.groupBy({ by: ['passed'], where: { status: 'PUBLISHED' }, _count: true });
        return { passed: grp.find((g) => g.passed)?._count ?? 0, failed: grp.find((g) => !g.passed)?._count ?? 0 };
      }
      case 'assessment': {
        const rows = await this.prisma.assessment.findMany({ where: { status: { in: ['PUBLISHED', 'CLOSED'] } }, select: { id: true, title: true, totalMarks: true, course: { select: { title: true } }, _count: { select: { attempts: true } } } });
        return Promise.all(rows.map(async (a) => {
          const target = (await this.resolveTargetStudentIds(a.id)).length;
          const done = await this.prisma.assessmentAttempt.count({ where: { assessmentId: a.id, status: { in: COMPLETED_ATTEMPT } } });
          const graded = await this.prisma.assessmentAttempt.findMany({ where: { assessmentId: a.id, status: 'PUBLISHED' }, select: { percentage: true } });
          const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.percentage, 0) / graded.length) : 0;
          return { assessment: a.title, course: a.course?.title ?? '—', target, attempted: done, avgScore: avg, completionPct: target ? Math.round((done / target) * 100) : 0 };
        }));
      }
      case 'teacher': {
        const rows = await this.prisma.assessment.groupBy({ by: ['teacherId'], where: { teacherId: { not: null } }, _count: true });
        const teachers = await this.prisma.teacherProfile.findMany({ where: { id: { in: rows.map((r) => r.teacherId!).filter(Boolean) } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } });
        return Promise.all(rows.map(async (r) => {
          const graded = await this.prisma.assessmentAttempt.findMany({ where: { assessment: { teacherId: r.teacherId }, status: 'PUBLISHED' }, select: { percentage: true } });
          const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.percentage, 0) / graded.length) : 0;
          const t = teachers.find((x) => x.id === r.teacherId);
          return { teacher: t ? `${t.user.firstName} ${t.user.lastName}` : r.teacherId, assessments: r._count, avgScore: avg };
        }));
      }
      case 'question-analysis':
        return this.questionAnalytics();
      case 'difficulty': {
        const grp = await this.prisma.question.groupBy({ by: ['difficulty'], where: { archived: false }, _count: true });
        return grp.map((g) => ({ difficulty: g.difficulty, count: g._count }));
      }
      default:
        throw new BadRequestException(`Unknown report type: ${type}`);
    }
  }

  // ── Calendar ─────────────────────────────────────────────────────────────────
  async calendar(month: string | undefined, actor: Actor) {
    const base = month ? new Date(`${month}-01T00:00:00`) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const where: Record<string, unknown> = { startAt: { gte: start, lt: end } };
    if (actor.role === Role.TEACHER) where.teacherId = await this.teacherProfileId(actor.id);
    const items = await this.prisma.assessment.findMany({ where, select: { id: true, title: true, startAt: true, endAt: true, status: true, type: true, course: { select: { title: true } } }, orderBy: { startAt: 'asc' } });
    return items.map((a) => ({ id: a.id, title: a.title, startAt: a.startAt, endAt: a.endAt, status: a.status, type: a.type, course: a.course?.title ?? null, day: a.startAt ? a.startAt.getDate() : null }));
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isEmptyResponse(r: unknown): boolean {
  if (r == null) return true;
  if (typeof r === 'string') return r.trim() === '';
  if (Array.isArray(r)) return r.length === 0;
  if (typeof r === 'object') return Object.keys(r as object).length === 0;
  return false;
}

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Deterministic shuffle keyed by a seed string (so a resumed attempt stays stable). */
function shuffleStable<T>(arr: T[], seed: string): T[] {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) & 0x7fffffff; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function gradeObjectiveAnswer(
  type: string,
  q: { options: unknown; correctAnswer: string | null },
  response: unknown,
): boolean {
  if (type === 'MCQ') {
    const opts = (q.options as { id: string; correct?: boolean }[] | null) ?? [];
    const correctIds = new Set(opts.filter((o) => o.correct).map((o) => o.id));
    const picked = new Set(Array.isArray(response) ? (response as string[]) : typeof response === 'string' ? [response] : []);
    if (picked.size !== correctIds.size) return false;
    for (const id of picked) if (!correctIds.has(id)) return false;
    return correctIds.size > 0;
  }
  if (type === 'TRUE_FALSE') {
    return typeof response === 'string' && normalise(response) === normalise(q.correctAnswer ?? '');
  }
  if (type === 'FILL_BLANK') {
    const accepted = (q.correctAnswer ?? '').split('|').map(normalise).filter(Boolean);
    return typeof response === 'string' && accepted.includes(normalise(response));
  }
  if (type === 'MATCH') {
    const pairs = (q.options as { left: string; right: string }[] | null) ?? [];
    if (!pairs.length) return false;
    const resp = (response as Record<string, string> | null) ?? {};
    return pairs.every((p) => normalise(resp[p.left] ?? '') === normalise(p.right));
  }
  return false;
}
