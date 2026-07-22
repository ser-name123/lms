import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, Role } from '../generated/prisma/enums';
import { AuthUser } from '../auth/decorators';

/*
 * Cross-role dashboard features: global search, calendar and the activity feed.
 *
 * Each one is role-scoped at the query level rather than filtered after the
 * fact — a teacher's search never loads other teachers' students, and a
 * student's calendar never loads the academy-wide schedule.
 */

export interface SearchHit {
  type: 'STUDENT' | 'TEACHER' | 'BATCH' | 'COURSE' | 'INVOICE' | 'ASSIGNMENT' | 'ASSESSMENT';
  id: string;
  title: string;
  subtitle: string | null;
  link: string;
}

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH];

/** LmsMeeting.attendees is free-form JSON that may hold a string. */
function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** LmsMeeting stores times as strings, so they may not parse at all. */
function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

@Injectable()
export class DashboardCommonService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Global search ──────────────────────────────────────────────────────────

  async search(user: AuthUser, q: string, limit = 5): Promise<SearchHit[]> {
    const term = q.trim();
    if (term.length < 2) return [];

    if (STAFF_ROLES.includes(user.role)) return this.staffSearch(term, limit);
    if (user.role === Role.TEACHER) return this.teacherSearch(user.id, term, limit);
    return this.selfSearch(user, term, limit);
  }

  private async staffSearch(term: string, limit: number): Promise<SearchHit[]> {
    const like = { contains: term, mode: 'insensitive' as const };

    const [students, teachers, batches, courses, invoices, assignments, assessments] =
      await Promise.all([
        this.prisma.studentProfile.findMany({
          where: {
            OR: [
              { studentCode: like },
              { user: { firstName: like } },
              { user: { lastName: like } },
              { user: { email: like } },
            ],
          },
          take: limit,
          select: {
            id: true,
            studentCode: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        }),
        this.prisma.teacherProfile.findMany({
          where: {
            OR: [
              { teacherCode: like },
              { user: { firstName: like } },
              { user: { lastName: like } },
              { user: { email: like } },
            ],
          },
          take: limit,
          select: {
            id: true,
            teacherCode: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        }),
        this.prisma.batch.findMany({
          where: { OR: [{ name: like }, { code: like }] },
          take: limit,
          select: { id: true, name: true, code: true, course: { select: { title: true } } },
        }),
        this.prisma.course.findMany({
          where: { OR: [{ title: like }, { slug: like }] },
          take: limit,
          select: { id: true, title: true, status: true },
        }),
        this.prisma.invoice.findMany({
          where: { number: like },
          take: limit,
          select: {
            id: true,
            number: true,
            status: true,
            student: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
        }),
        this.prisma.assignment.findMany({
          where: { OR: [{ title: like }, { subject: like }] },
          take: limit,
          select: { id: true, title: true, subject: true, status: true },
        }),
        this.prisma.assessment.findMany({
          where: { OR: [{ title: like }, { subject: like }] },
          take: limit,
          select: { id: true, title: true, subject: true, status: true },
        }),
      ]);

    return [
      ...students.map((s): SearchHit => ({
        type: 'STUDENT',
        id: s.id,
        title: `${s.user.firstName} ${s.user.lastName}`.trim(),
        subtitle: `${s.studentCode} · ${s.user.email}`,
        link: `/students/${s.id}`,
      })),
      ...teachers.map((t): SearchHit => ({
        type: 'TEACHER',
        id: t.id,
        title: `${t.user.firstName} ${t.user.lastName}`.trim(),
        subtitle: `${t.teacherCode} · ${t.user.email}`,
        link: `/teachers/${t.id}`,
      })),
      ...batches.map((b): SearchHit => ({
        type: 'BATCH',
        id: b.id,
        title: b.name,
        subtitle: `${b.code} · ${b.course.title}`,
        link: `/attendance`,
      })),
      ...courses.map((c): SearchHit => ({
        type: 'COURSE',
        id: c.id,
        title: c.title,
        subtitle: c.status,
        link: `/courses`,
      })),
      ...invoices.map((i): SearchHit => ({
        type: 'INVOICE',
        id: i.id,
        title: i.number,
        subtitle: i.student
          ? `${i.student.user.firstName} ${i.student.user.lastName}`.trim()
          : i.status,
        link: `/invoices`,
      })),
      ...assignments.map((a): SearchHit => ({
        type: 'ASSIGNMENT',
        id: a.id,
        title: a.title,
        subtitle: a.subject ?? a.status,
        link: `/assignments`,
      })),
      ...assessments.map((a): SearchHit => ({
        type: 'ASSESSMENT',
        id: a.id,
        title: a.title,
        subtitle: a.subject ?? a.status,
        link: `/assessments`,
      })),
    ];
  }

  /** A teacher searches only their own students, batches and materials. */
  private async teacherSearch(userId: string, term: string, limit: number): Promise<SearchHit[]> {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!teacher) return [];
    const like = { contains: term, mode: 'insensitive' as const };

    const [students, batches, assignments, assessments] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where: {
          enrollments: { some: { teacherId: teacher.id } },
          OR: [{ studentCode: like }, { user: { firstName: like } }, { user: { lastName: like } }],
        },
        take: limit,
        select: {
          id: true,
          studentCode: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.batch.findMany({
        where: { teacherId: teacher.id, OR: [{ name: like }, { code: like }] },
        take: limit,
        select: { id: true, name: true, code: true },
      }),
      this.prisma.assignment.findMany({
        where: { teacherId: teacher.id, title: like },
        take: limit,
        select: { id: true, title: true, status: true },
      }),
      this.prisma.assessment.findMany({
        where: { teacherId: teacher.id, title: like },
        take: limit,
        select: { id: true, title: true, status: true },
      }),
    ]);

    return [
      ...students.map((s): SearchHit => ({
        type: 'STUDENT',
        id: s.id,
        title: `${s.user.firstName} ${s.user.lastName}`.trim(),
        subtitle: s.studentCode,
        link: `/teacher/students`,
      })),
      ...batches.map((b): SearchHit => ({
        type: 'BATCH',
        id: b.id,
        title: b.name,
        subtitle: b.code,
        link: `/teacher/attendance`,
      })),
      ...assignments.map((a): SearchHit => ({
        type: 'ASSIGNMENT',
        id: a.id,
        title: a.title,
        subtitle: a.status,
        link: `/teacher/assignments`,
      })),
      ...assessments.map((a): SearchHit => ({
        type: 'ASSESSMENT',
        id: a.id,
        title: a.title,
        subtitle: a.status,
        link: `/teacher/assessments`,
      })),
    ];
  }

  /** Students and parents search only their own courses and work. */
  private async selfSearch(user: AuthUser, term: string, limit: number): Promise<SearchHit[]> {
    const like = { contains: term, mode: 'insensitive' as const };

    const studentIds = await this.resolveOwnStudentIds(user);
    if (!studentIds.length) return [];

    /*
     * The parent portal was removed, so `/parent/...` resolves to nothing.
     * Anyone reaching this who is not a student gets the student's own pages,
     * which is where the work they are looking at actually lives.
     */
    const prefix = '/student';

    const [assignments, assessments, courses] = await Promise.all([
      this.prisma.assignment.findMany({
        where: { title: like, submissions: { some: { studentId: { in: studentIds } } } },
        take: limit,
        select: { id: true, title: true, status: true },
      }),
      this.prisma.assessment.findMany({
        where: { title: like, attempts: { some: { studentId: { in: studentIds } } } },
        take: limit,
        select: { id: true, title: true, status: true },
      }),
      this.prisma.course.findMany({
        where: { title: like, enrollments: { some: { studentId: { in: studentIds } } } },
        take: limit,
        select: { id: true, title: true, status: true },
      }),
    ]);

    return [
      ...assignments.map((a): SearchHit => ({
        type: 'ASSIGNMENT',
        id: a.id,
        title: a.title,
        subtitle: a.status,
        link: `${prefix}/assignments`,
      })),
      ...assessments.map((a): SearchHit => ({
        type: 'ASSESSMENT',
        id: a.id,
        title: a.title,
        subtitle: a.status,
        link: `${prefix}/assessments`,
      })),
      ...courses.map((c): SearchHit => ({
        type: 'COURSE',
        id: c.id,
        title: c.title,
        subtitle: c.status,
        link: `${prefix}/dashboard`,
      })),
    ];
  }

  /** Student ids this user may read: their own, or their linked children. */
  private async resolveOwnStudentIds(user: AuthUser): Promise<string[]> {
    if (user.role === Role.STUDENT) {
      const s = await this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      return s ? [s.id] : [];
    }
    return [];
  }

  // ── Calendar ───────────────────────────────────────────────────────────────

  async calendar(user: AuthUser, from?: string, to?: string) {
    const now = new Date();
    const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const events: {
      kind: 'CLASS' | 'ASSIGNMENT' | 'ASSESSMENT' | 'MEETING' | 'HOLIDAY';
      id: string;
      title: string;
      at: string;
      endsAt: string | null;
      link: string;
      meta?: Record<string, unknown>;
    }[] = [];

    /*
     * Holidays are academy-wide and visible to every role. A holiday belongs on
     * the calendar only if its own span overlaps the requested window — without
     * the `publishedAt <= end` bound a never-expiring notice was re-emitted in
     * every month the user paged to, always stamped with its publish date.
     */
    const holidays = await this.prisma.announcement.findMany({
      where: {
        type: 'HOLIDAY',
        active: true,
        publishedAt: { not: null, lte: end },
        OR: [
          // Spans into the window.
          { expiresAt: { gte: start } },
          // No expiry: it is a single-day event on its publish date.
          { expiresAt: null, publishedAt: { gte: start } },
        ],
      },
      select: { id: true, title: true, publishedAt: true, expiresAt: true },
    });
    for (const h of holidays) {
      events.push({
        kind: 'HOLIDAY',
        id: h.id,
        title: h.title,
        at: (h.publishedAt ?? now).toISOString(),
        endsAt: h.expiresAt?.toISOString() ?? null,
        link: '/dashboard',
      });
    }

    const window = { gte: start, lte: end };

    if (STAFF_ROLES.includes(user.role)) {
      const [classes, assignments, assessments, meetings] = await Promise.all([
        this.prisma.classSession.findMany({
          where: { startsAt: window },
          take: 200,
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            course: { select: { title: true } },
          },
        }),
        this.prisma.assignment.findMany({
          where: { dueAt: window },
          take: 200,
          select: { id: true, title: true, dueAt: true },
        }),
        this.prisma.assessment.findMany({
          where: { startAt: window },
          take: 200,
          select: { id: true, title: true, startAt: true, endAt: true },
        }),
        this.prisma.parentMeeting.findMany({
          where: { scheduledAt: window },
          take: 200,
          select: { id: true, scheduledAt: true, agenda: true, studentId: true },
        }),
      ]);

      events.push(
        ...classes.map((c) => ({
          kind: 'CLASS' as const,
          id: c.id,
          title: `${c.title} · ${c.course.title}`,
          at: c.startsAt.toISOString(),
          endsAt: c.endsAt.toISOString(),
          link: '/classes',
        })),
        ...assignments.map((a) => ({
          kind: 'ASSIGNMENT' as const,
          id: a.id,
          title: a.title,
          at: a.dueAt!.toISOString(),
          endsAt: null,
          link: '/assignments',
        })),
        ...assessments.map((a) => ({
          kind: 'ASSESSMENT' as const,
          id: a.id,
          title: a.title,
          at: a.startAt!.toISOString(),
          endsAt: a.endAt?.toISOString() ?? null,
          link: '/assessments',
        })),
        ...meetings.map((m) => ({
          kind: 'MEETING' as const,
          id: m.id,
          title: m.agenda ?? 'Parent meeting',
          at: m.scheduledAt.toISOString(),
          endsAt: null,
          link: `/students/${m.studentId}`,
        })),
      );
      return events.sort((a, b) => a.at.localeCompare(b.at));
    }

    if (user.role === Role.TEACHER) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { userId: user.id },
        select: { id: true, user: { select: { email: true } } },
      });
      if (!teacher) return events;

      const [classes, assignments, assessments, allMeetings] = await Promise.all([
        this.prisma.classSession.findMany({
          where: { teacherId: teacher.id, startsAt: window },
          take: 200,
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            course: { select: { title: true } },
          },
        }),
        this.prisma.assignment.findMany({
          where: { teacherId: teacher.id, dueAt: window },
          take: 200,
          select: { id: true, title: true, dueAt: true },
        }),
        this.prisma.assessment.findMany({
          where: { teacherId: teacher.id, startAt: window },
          take: 200,
          select: { id: true, title: true, startAt: true, endAt: true },
        }),
        /*
         * LmsMeeting stores its start as a string and its attendees as JSON,
         * so neither the window nor the attendee match can be pushed into SQL —
         * both are applied in memory below, the same way the teacher portal does.
         */
        this.prisma.lmsMeeting.findMany({
          orderBy: { timeStart: 'desc' },
          take: 500,
          select: { id: true, topic: true, timeStart: true, timeEnd: true, attendees: true },
        }),
      ]);

      const email = teacher.user.email.toLowerCase();
      const meetings = allMeetings.filter((m) => {
        const at = new Date(m.timeStart);
        if (Number.isNaN(at.getTime()) || at < start || at > end) return false;
        const atts = typeof m.attendees === 'string' ? safeJson(m.attendees) : m.attendees;
        // An empty attendee list means the meeting is for everyone.
        if (!Array.isArray(atts) || !atts.length) return true;
        return atts.some(
          (a) =>
            typeof (a as { email?: unknown })?.email === 'string' &&
            (a as { email: string }).email.toLowerCase() === email,
        );
      });

      events.push(
        ...meetings.map((m) => ({
          kind: 'MEETING' as const,
          id: m.id,
          title: m.topic,
          at: new Date(m.timeStart).toISOString(),
          endsAt: isoOrNull(m.timeEnd),
          link: '/teacher/meetings',
        })),
      );

      events.push(
        ...classes.map((c) => ({
          kind: 'CLASS' as const,
          id: c.id,
          title: `${c.title} · ${c.course.title}`,
          at: c.startsAt.toISOString(),
          endsAt: c.endsAt.toISOString(),
          link: '/teacher/classes',
        })),
        ...assignments.map((a) => ({
          kind: 'ASSIGNMENT' as const,
          id: a.id,
          title: a.title,
          at: a.dueAt!.toISOString(),
          endsAt: null,
          link: '/teacher/assignments',
        })),
        ...assessments.map((a) => ({
          kind: 'ASSESSMENT' as const,
          id: a.id,
          title: a.title,
          at: a.startAt!.toISOString(),
          endsAt: a.endAt?.toISOString() ?? null,
          link: '/teacher/assessments',
        })),
      );
      return events.sort((a, b) => a.at.localeCompare(b.at));
    }

    // Student / parent: the child's own schedule.
    const studentIds = await this.resolveOwnStudentIds(user);
    if (!studentIds.length) return events;
    /*
     * The parent portal was removed, so `/parent/...` resolves to nothing.
     * Anyone reaching this who is not a student gets the student's own pages,
     * which is where the work they are looking at actually lives.
     */
    const prefix = '/student';

    const [classes, assignments, assessments, meetings] = await Promise.all([
      this.prisma.classAttendee.findMany({
        where: { studentId: { in: studentIds }, class: { startsAt: window } },
        take: 200,
        select: {
          class: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              course: { select: { title: true } },
            },
          },
        },
      }),
      this.prisma.assignment.findMany({
        where: { dueAt: window, submissions: { some: { studentId: { in: studentIds } } } },
        take: 200,
        select: { id: true, title: true, dueAt: true },
      }),
      this.prisma.assessment.findMany({
        where: {
          startAt: window,
          OR: [
            { targetType: 'BATCH', batch: { students: { some: { studentId: { in: studentIds } } } } },
            { targetType: 'SELECTED', targetStudentIds: { hasSome: studentIds } },
          ],
        },
        take: 200,
        select: { id: true, title: true, startAt: true, endAt: true },
      }),
      this.prisma.parentMeeting.findMany({
        where: { studentId: { in: studentIds }, scheduledAt: window },
        take: 50,
        select: { id: true, scheduledAt: true, agenda: true },
      }),
    ]);

    events.push(
      ...classes.map((a) => ({
        kind: 'CLASS' as const,
        id: a.class.id,
        title: `${a.class.title} · ${a.class.course.title}`,
        at: a.class.startsAt.toISOString(),
        endsAt: a.class.endsAt.toISOString(),
        link: `${prefix}/dashboard`,
      })),
      ...assignments.map((a) => ({
        kind: 'ASSIGNMENT' as const,
        id: a.id,
        title: a.title,
        at: a.dueAt!.toISOString(),
        endsAt: null,
        link: `${prefix}/assignments`,
      })),
      ...assessments.map((a) => ({
        kind: 'ASSESSMENT' as const,
        id: a.id,
        title: a.title,
        at: a.startAt!.toISOString(),
        endsAt: a.endAt?.toISOString() ?? null,
        link: `${prefix}/assessments`,
      })),
      ...meetings.map((m) => ({
        kind: 'MEETING' as const,
        id: m.id,
        title: m.agenda ?? 'Parent meeting',
        at: m.scheduledAt.toISOString(),
        endsAt: null,
        link: `${prefix}/dashboard`,
      })),
    );

    return events.sort((a, b) => a.at.localeCompare(b.at));
  }

  // ── Recent activity ────────────────────────────────────────────────────────

  /** Academy-wide feed for staff dashboards. */
  /**
   * The academy's recent activity, linked to pages the CALLER can open.
   *
   * This widget ships on the teacher dashboard as well as the admin one, and
   * every row linked to an admin route — /students, /invoices, /assignments —
   * which a teacher's layout answers with a 404. The feed looked fine and
   * every row in it was a dead end.
   */
  async recentActivity(role: Role = Role.ADMIN, limit = 12) {
    // A teacher has their own copies of these pages; the staff roles share the
    // admin ones. Anyone else gets no link rather than a broken one.
    const isTeacher = role === Role.TEACHER;
    const to = (staffPath: string, teacherPath: string | null) =>
      isTeacher ? teacherPath : staffPath;

    const [students, payments, enrollments, submissions, registrations, attempts] =
      await Promise.all([
      this.prisma.studentActivity.findMany({
        where: { kind: 'TIMELINE' },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          actorName: true,
          createdAt: true,
          studentId: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.SUCCEEDED },
        orderBy: { paidAt: 'desc' },
        take: limit,
        select: {
          id: true,
          amount: true,
          paidAt: true,
          invoice: {
            select: {
              number: true,
              student: { select: { user: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          createdAt: true,
          course: { select: { title: true } },
          student: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.submission.findMany({
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          submittedAt: true,
          assignment: { select: { title: true } },
          student: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      /*
       * "Student registered". StudentProfile carries no createdAt of its own,
       * so the account's creation date is the registration moment.
       */
      this.prisma.studentProfile.findMany({
        orderBy: { user: { createdAt: 'desc' } },
        take: limit,
        select: {
          id: true,
          studentCode: true,
          user: { select: { firstName: true, lastName: true, createdAt: true } },
        },
      }),
      // "Assessment completed" — the student handed the paper in.
      this.prisma.assessmentAttempt.findMany({
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          submittedAt: true,
          assessment: { select: { title: true } },
          student: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);

    const feed = [
      ...students.map((s) => ({
        id: s.id,
        kind: 'student' as const,
        who: s.actorName ?? 'System',
        action: s.title,
        target: s.description ?? '',
        at: s.createdAt.toISOString(),
        link: to(`/students/${s.studentId}`, '/teacher/students'),
      })),
      ...payments.map((p) => ({
        id: p.id,
        kind: 'payment' as const,
        who: p.invoice.student
          ? `${p.invoice.student.user.firstName} ${p.invoice.student.user.lastName}`.trim()
          : 'Customer',
        action: 'paid',
        target: p.invoice.number,
        at: (p.paidAt ?? new Date()).toISOString(),
        // A teacher has no invoices page at all — no link beats a 404.
        link: to('/invoices', null),
      })),
      ...enrollments.map((e) => ({
        id: e.id,
        kind: 'enroll' as const,
        who: `${e.student.user.firstName} ${e.student.user.lastName}`.trim(),
        action: 'enrolled in',
        target: e.course.title,
        at: e.createdAt.toISOString(),
        link: to('/students', '/teacher/students'),
      })),
      ...submissions.map((s) => ({
        id: s.id,
        kind: 'assignment' as const,
        who: `${s.student.user.firstName} ${s.student.user.lastName}`.trim(),
        action: 'submitted',
        target: s.assignment.title,
        at: s.submittedAt!.toISOString(),
        link: to('/assignments', '/teacher/assignments'),
      })),
      ...registrations.map((s) => ({
        id: s.id,
        kind: 'registration' as const,
        who: `${s.user.firstName} ${s.user.lastName}`.trim(),
        action: 'registered as',
        target: s.studentCode,
        at: s.user.createdAt.toISOString(),
        link: to(`/students/${s.id}`, '/teacher/students'),
      })),
      ...attempts.map((a) => ({
        id: a.id,
        kind: 'assessment' as const,
        who: `${a.student.user.firstName} ${a.student.user.lastName}`.trim(),
        action: 'completed',
        target: a.assessment.title,
        at: a.submittedAt!.toISOString(),
        link: to('/assessments', '/teacher/assessments'),
      })),
    ];

    return feed.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
}
