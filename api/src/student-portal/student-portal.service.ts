import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { courseForCode } from '../common/catalogue-course';
import {
  Role,
  EnrollmentStatus,
  SubmissionStatus,
  InvoiceStatus,
  CourseStatus,
} from '../generated/prisma/enums';

@Injectable()
export class StudentPortalService {
  constructor(private readonly prisma: PrismaService) {}

  private async getStudentProfileByUserId(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        enrollments: {
          include: {
            course: true,
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    return student;
  }

  async getDashboard(userId: string) {
    const student = await this.getStudentProfileByUserId(userId);

    // Get active courses
    const activeEnrollments = student.enrollments.filter(
      (e) => e.status === EnrollmentStatus.ACTIVE,
    );

    const activeCourseSlugs = activeEnrollments.map((e) =>
      e.course.slug.toUpperCase(),
    );

    // Count statistics
    const activeCoursesCount = activeEnrollments.length;

    // Fetch classes
    const classes = await this.prisma.lmsClass.findMany({
      where: {
        courseCode: { in: activeCourseSlugs },
      },
    });

    const nowStr = new Date().toISOString();
    const upcomingClasses = classes
      .filter((c) => c.status === 'Upcoming' || c.timeStart >= nowStr)
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        topic: c.topic,
        courseCode: c.courseCode,
        courseTitle: c.courseTitle,
        teacher: c.teacher,
        timeStart: c.timeStart,
        timeEnd: c.timeEnd,
        link: c.link,
      }));

    /*
     * Assignment counters, from the Assignment Management module.
     *
     * These used to count rows in the pre-module `LmsAssignment` table, which
     * has no rows and no writer — so the dashboard reported "0 pending" to
     * every student however much work they actually had, while their own
     * /student/assignments page listed it correctly.
     *
     * The targeting rules are the ones `AssignmentsService.listMine` uses, so
     * the number on the dashboard and the list on the page agree: an assignment
     * reaches a student by being aimed at them directly, at a batch they are
     * in, or at a course they are enrolled on.
     */
    const [batchRows, enrollRows] = await Promise.all([
      this.prisma.batchStudent.findMany({
        where: { studentId: student.id },
        select: { batchId: true },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId: student.id },
        select: { courseId: true },
      }),
    ]);
    const batchIds = batchRows.map((b) => b.batchId);
    const courseIds = enrollRows.map((e) => e.courseId);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        status: { in: ['PUBLISHED', 'CLOSED'] },
        OR: [
          { targetType: 'SELECTED', targetStudentIds: { has: student.id } },
          { targetType: 'BATCH', batchId: { in: batchIds.length ? batchIds : ['__none__'] } },
          { targetType: 'BATCH', batchId: null, courseId: { in: courseIds.length ? courseIds : ['__none__'] } },
        ],
      },
      select: { id: true },
    });

    const submissions = await this.prisma.submission.findMany({
      where: {
        studentId: student.id,
        assignmentId: { in: assignments.map((a) => a.id) },
      },
    });

    const submittedAssignmentIds = new Set(
      submissions
        .filter(
          (s) =>
            s.status === SubmissionStatus.SUBMITTED ||
            s.status === SubmissionStatus.EVALUATED,
        )
        .map((s) => s.assignmentId),
    );

    const pendingAssignmentsCount = assignments.filter(
      (a) => !submittedAssignmentIds.has(a.id),
    ).length;

    const completedAssignmentsCount = submittedAssignmentIds.size;

    // Attendance rate
    const totalClasses = await this.prisma.classAttendee.count({
      where: { studentId: student.id },
    });
    const attendedClasses = await this.prisma.classAttendee.count({
      where: { studentId: student.id, attended: true },
    });
    const attendanceRate = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 100;

    // Invoices count
    const pendingInvoicesCount = await this.prisma.invoice.count({
      where: {
        studentId: student.id,
        status: InvoiceStatus.SENT,
      },
    });

    const overdueInvoicesCount = await this.prisma.invoice.count({
      where: {
        studentId: student.id,
        status: InvoiceStatus.OVERDUE,
      },
    });

    // Compute average progress
    let averageProgress = 0;
    if (activeEnrollments.length > 0) {
      const sum = activeEnrollments.reduce((acc, e) => acc + e.progress, 0);
      averageProgress = Math.round(sum / activeEnrollments.length);
    }

    // Fetch upcoming invoices
    const upcomingPayments = await this.prisma.invoice.findMany({
      where: {
        studentId: student.id,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
      },
      orderBy: { dueAt: 'asc' },
      take: 2,
    });

    // Fetch recent payments
    const recentPayments = await this.prisma.invoice.findMany({
      where: {
        studentId: student.id,
        status: InvoiceStatus.PAID,
      },
      orderBy: { paidAt: 'desc' },
      take: 2,
    });

    // Chart dataset calculations
    const learningProgress = [
      { month: 'Jan', progress: Math.round(averageProgress * 0.1) },
      { month: 'Feb', progress: Math.round(averageProgress * 0.25) },
      { month: 'Mar', progress: Math.round(averageProgress * 0.4) },
      { month: 'Apr', progress: Math.round(averageProgress * 0.5) },
      { month: 'May', progress: Math.round(averageProgress * 0.65) },
      { month: 'Jun', progress: Math.round(averageProgress * 0.75) },
      { month: 'Jul', progress: Math.round(averageProgress * 0.8) },
      { month: 'Aug', progress: Math.round(averageProgress * 0.85) },
      { month: 'Sep', progress: Math.round(averageProgress * 0.9) },
      { month: 'Oct', progress: Math.round(averageProgress * 0.95) },
      { month: 'Nov', progress: Math.round(averageProgress * 0.98) },
      { month: 'Dec', progress: averageProgress },
    ];

    const completedHours = Math.max(8, attendedClasses * 2);
    const pendingHours = Math.max(2, (totalClasses - attendedClasses) * 2);
    const totalHours = completedHours + pendingHours;

    return {
      studentProfile: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        email: student.user.email,
        level: 'I',
        rating: 4.8,
        avatarUrl: student.user.avatarUrl,
      },
      courseOverview: {
        level: 1,
        attendance: attendanceRate,
        totalClasses,
        durationHours: completedHours,
      },
      learningProgress,
      classHours: {
        completed: completedHours,
        pending: pendingHours,
        total: totalHours,
        completedPercentage: Math.round((completedHours / totalHours) * 100),
        pendingPercentage: Math.round((pendingHours / totalHours) * 100),
      },
      stats: {
        activeCoursesCount,
        pendingAssignmentsCount,
        completedAssignmentsCount,
        attendanceRate,
        pendingInvoicesCount,
        overdueInvoicesCount,
        averageProgress,
      },
      upcomingClasses,
      invoicesOverview: {
        upcoming: upcomingPayments,
        recent: recentPayments,
      },
      activeEnrollments: activeEnrollments.map((e) => ({
        id: e.id,
        progress: e.progress,
        startedAt: e.startedAt,
        course: {
          title: e.course.title,
          slug: e.course.slug,
          description: e.course.description,
        },
      })),
    };
  }

  async getEnrollments(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        enrollments: {
          include: {
            course: true,
            teacher: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                    email: true,
                  },
                },
              },
            },
            package: true,
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student.enrollments;
  }

  async getClasses(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        // Only ACTIVE enrolments surface a course's classes. A PENDING /
        // PENDING_PAYMENT enrolment (created at conversion, before the first
        // invoice is paid) must not leak the course catalogue's classes — the
        // spec's "student cannot join regular classes while PENDING_PAYMENT".
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          include: {
            course: true,
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    const courseSlugs = student.enrollments.map((e) =>
      e.course.slug.toUpperCase(),
    );

    // Attendance flags (shared by both class sources below).
    const attendance = await this.prisma.classAttendee.findMany({
      where: { studentId: student.id },
    });
    const attendanceByClassId = new Map(
      attendance.map((a) => [a.classId, a.attended]),
    );

    // 1) Legacy flat catalogue rows for the enrolled courses.
    const classes = await this.prisma.lmsClass.findMany({
      where: {
        courseCode: { in: courseSlugs },
      },
      orderBy: { timeStart: 'desc' },
    });
    const legacy = classes.map((c) => ({
      ...c,
      attended: attendanceByClassId.get(c.id) || false,
    }));

    // 2) The student's REAL generated schedule: ClassSession rows they attend
    // (the 28-day cycle classes). Without merging these, the student's classes
    // page would show only the flat catalogue and never their own scheduled
    // sessions. Mapped into the same shape the client renders.
    const sessionAttendee = await this.prisma.classAttendee.findMany({
      where: { studentId: student.id },
      select: {
        attended: true,
        class: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            status: true,
            meetingUrl: true,
            cycleLocked: true,
            course: { select: { title: true, slug: true } },
            teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      take: 500,
    });
    const sessions = sessionAttendee
      .filter((a) => a.class)
      .map((a) => ({
        id: a.class!.id,
        topic: a.class!.title,
        courseCode: a.class!.course?.slug?.toUpperCase() ?? '',
        courseTitle: a.class!.course?.title ?? '',
        teacher: a.class!.teacher
          ? `${a.class!.teacher.user.firstName} ${a.class!.teacher.user.lastName}`
          : null,
        timeStart: a.class!.startsAt.toISOString(),
        timeEnd: a.class!.endsAt.toISOString(),
        status: a.class!.status,
        link: a.class!.meetingUrl ?? null,
        cycleLocked: a.class!.cycleLocked,
        attended: a.attended || false,
        kind: 'SESSION' as const,
      }));

    return [...sessions, ...legacy].sort(
      (a, b) => new Date(b.timeStart as any).getTime() - new Date(a.timeStart as any).getTime(),
    );
  }

  /*
   * The student's upcoming real class sessions (ClassSession, not the flat
   * LmsClass catalogue above), which the reschedule feature acts on. Only their
   * own, only scheduled, only future — the list a student picks a class to move
   * from.
   */
  async getUpcomingSessions(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const attendee = await this.prisma.classAttendee.findMany({
      where: {
        studentId: student.id,
        class: { status: 'SCHEDULED', startsAt: { gt: new Date() } },
      },
      select: {
        class: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { class: { startsAt: 'asc' } },
      take: 60,
    });
    return attendee
      .map((a) => a.class)
      .filter(Boolean)
      .map((c) => ({
        id: c!.id,
        title: c!.title,
        startsAt: c!.startsAt,
        endsAt: c!.endsAt,
        teacher: c!.teacher ? `${c!.teacher.user.firstName} ${c!.teacher.user.lastName}` : null,
      }));
  }

  async attendClass(userId: string, classId: string) {
    const student = await this.getStudentProfileByUserId(userId);

    // SECURITY (C4): the payment wall is a client overlay and can be bypassed —
    // enforce it on the server too. A student with an OVERDUE invoice cannot
    // join a class until it is settled. (SENT/PENDING invoices that are not yet
    // due do not block, so a just-issued next-cycle invoice never locks a
    // paid-up student out.)
    const overdue = await this.prisma.invoice.count({
      where: { studentId: student.id, status: InvoiceStatus.OVERDUE },
    });
    if (overdue > 0) {
      throw new ForbiddenException(
        'An overdue invoice must be settled before you can join classes.',
      );
    }

    // Verify the class exists
    const lmsClass = await this.prisma.lmsClass.findUnique({
      where: { id: classId },
    });
    if (!lmsClass) throw new NotFoundException('Class session not found');

    /*
     * The relational Course this class belongs to. Resolved from the
     * catalogue by code so it is the same row the admin panel shows; the
     * fallback only fires for a class filed under a code nobody catalogued,
     * where refusing to let a student join would be the worse outcome.
     */
    const course =
      (await courseForCode(this.prisma, lmsClass.courseCode)) ??
      (await this.prisma.course.upsert({
        where: { slug: lmsClass.courseCode.toLowerCase() },
        update: {},
        create: {
          title: lmsClass.courseTitle,
          slug: lmsClass.courseCode.toLowerCase(),
          status: CourseStatus.PUBLISHED,
          price: 0,
        },
      }));

    /*
     * Authorisation (M9): this endpoint upserts a ClassSession from a
     * client-supplied id and marks attendance, so it must first prove the
     * student is actually enrolled in this class's course — otherwise any
     * student could POST any class id, create session rows, and mark themselves
     * present in courses they never took.
     */
    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: course.id,
        status: EnrollmentStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!enrolled) {
      throw new ForbiddenException('You are not enrolled in this class\'s course.');
    }

    // Fetch or create teacher to keep relation happy
    let teacher = await this.prisma.teacherProfile.findFirst();
    if (!teacher) {
      // Seed a fallback teacher
      const hash = await this.prisma.user.findFirst({
        where: { role: Role.ADMIN },
      });
      const tUser = await this.prisma.user.create({
        data: {
          email: `fallback-teacher@alfurqan.com`,
          passwordHash: hash?.passwordHash || '',
          firstName: 'Academy',
          lastName: 'Instructor',
          role: Role.TEACHER,
        },
      });
      teacher = await this.prisma.teacherProfile.create({
        data: {
          userId: tUser.id,
          teacherCode: `TCK-SEED`,
          specialisation: 'Quran & Arabic Studies',
        },
      });
    }

    await this.prisma.classSession.upsert({
      where: { id: classId },
      update: {},
      create: {
        id: classId,
        courseId: course.id,
        teacherId: teacher.id,
        title: lmsClass.topic,
        startsAt: new Date(lmsClass.timeStart),
        endsAt: new Date(lmsClass.timeEnd),
      },
    });

    // Mark attendance
    const attendance = await this.prisma.classAttendee.upsert({
      where: {
        classId_studentId: {
          classId,
          studentId: student.id,
        },
      },
      update: {
        attended: true,
        joinedAt: new Date(),
      },
      create: {
        classId,
        studentId: student.id,
        attended: true,
        joinedAt: new Date(),
      },
    });

    return attendance;
  }

  /*
   * `getAssignments` and `submitAssignment` were removed here, not replaced.
   *
   * They read the pre-module `LmsAssignment` table, which has no rows and no
   * writer — the Assignment Management module owns assignments now, and the
   * student page at /student/assignments has used `/assignments/mine` since it
   * shipped. Nothing in the web app called either endpoint.
   *
   * Worth removing rather than leaving orphaned: `submitAssignment` UPSERTED a
   * row into the real `Assignment` table using a client-supplied id, so a
   * crafted request could mint an assignment the teacher never set. It also
   * incremented `LmsAssignment.submissionsCount`, a counter nothing reads.
   *
   * A student submits through `POST /assignments/:id/submit`, which checks the
   * assignment is published, open, and theirs.
   */

  async getInvoices(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    return this.prisma.invoice.findMany({
      where: { studentId: student.id },
      orderBy: { issuedAt: 'desc' },
    });
  }

/*
 * `payInvoice` was removed here, not replaced.
 *
 * It let any signed-in student mark any of their own invoices PAID: it set
 * status PAID and wrote a Payment row with a made-up Stripe reference
 * (`ch_` + random). No money moved. It also bypassed BillingService.recordPayment,
 * so paidAmount stayed at zero, no Receipt was issued and lastPaymentDate never
 * moved — while the finance dashboard counted the invoice as revenue.
 *
 * An invoice is marked paid in exactly one place now: recordPayment, reached
 * either by a member of staff recording a payment or by a verified Stripe
 * webhook. Nothing a browser sends can settle an invoice.
 */

  async getProfile(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async updateProfile(userId: string, dto: any) {
    const student = await this.getProfile(userId);

    const userUpdate: any = {};
    if (dto.firstName) userUpdate.firstName = dto.firstName;
    if (dto.lastName) userUpdate.lastName = dto.lastName;
    if (dto.country) userUpdate.country = dto.country;
    if (dto.timezone) userUpdate.timezone = dto.timezone;
    if (dto.avatarUrl) userUpdate.avatarUrl = dto.avatarUrl;
    if (dto.password) {
      userUpdate.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const studentUpdate: any = {};
    if (dto.phone) studentUpdate.phone = dto.phone;
    if (dto.gender) studentUpdate.gender = dto.gender;

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdate,
        });
      }
      if (Object.keys(studentUpdate).length > 0) {
        await tx.studentProfile.update({
          where: { id: student.id },
          data: studentUpdate,
        });
      }
      return tx.studentProfile.findUnique({
        where: { id: student.id },
        include: { user: true },
      });
    });
  }

  async getKnowledgebase(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        enrollments: {
          include: { course: true },
        },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const courseCodes = student.enrollments.map((e) =>
      e.course.slug.toUpperCase(),
    );

    return this.prisma.lmsKnowledgebase.findMany({
      where: {
        courseCode: { in: courseCodes },
        status: 'Active',
      },
      orderBy: { title: 'asc' },
    });
  }
}
