import { Injectable, NotFoundException } from '@nestjs/common';
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

    // Fetch assignments
    const assignments = await this.prisma.lmsAssignment.findMany({
      where: {
        courseCode: { in: activeCourseSlugs },
      },
    });

    const submissions = await this.prisma.submission.findMany({
      where: {
        studentId: student.id,
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
        enrollments: {
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

    const classes = await this.prisma.lmsClass.findMany({
      where: {
        courseCode: { in: courseSlugs },
      },
      orderBy: { timeStart: 'desc' },
    });

    // Check attendance status
    const attendance = await this.prisma.classAttendee.findMany({
      where: { studentId: student.id },
    });

    const attendanceByClassId = new Map(
      attendance.map((a) => [a.classId, a.attended]),
    );

    return classes.map((c) => ({
      ...c,
      attended: attendanceByClassId.get(c.id) || false,
    }));
  }

  async attendClass(userId: string, classId: string) {
    const student = await this.getStudentProfileByUserId(userId);

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

  async getAssignments(userId: string) {
    const student = await this.getStudentProfileByUserId(userId);
    const courseSlugs = student.enrollments.map((e) =>
      e.course.slug.toUpperCase(),
    );

    const assignments = await this.prisma.lmsAssignment.findMany({
      where: {
        courseCode: { in: courseSlugs },
      },
      orderBy: { dueDate: 'asc' },
    });

    const submissions = await this.prisma.submission.findMany({
      where: { studentId: student.id },
    });

    const submissionByAssignmentId = new Map(
      submissions.map((s) => [s.assignmentId, s]),
    );

    return assignments.map((a) => {
      const sub = submissionByAssignmentId.get(a.id);
      return {
        id: a.id,
        title: a.title,
        courseCode: a.courseCode,
        courseTitle: a.courseTitle,
        dueDate: a.dueDate,
        description: a.description,
        status: sub ? sub.status : 'PENDING',
        submission: sub
          ? {
              id: sub.id,
              content: sub.content,
              fileUrl: sub.fileUrl,
              grade: sub.grade,
              feedback: sub.feedback,
              submittedAt: sub.submittedAt,
              evaluatedAt: sub.evaluatedAt,
            }
          : null,
      };
    });
  }

  async submitAssignment(
    userId: string,
    assignmentId: string,
    content: string,
    fileUrl?: string,
  ) {
    const student = await this.getStudentProfileByUserId(userId);

    const lmsAssignment = await this.prisma.lmsAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!lmsAssignment) throw new NotFoundException('Assignment not found');

    // Same resolution as joining a class: the catalogue's Course if the code
    // is one, and only otherwise a stand-in so the foreign key holds.
    const course =
      (await courseForCode(this.prisma, lmsAssignment.courseCode)) ??
      (await this.prisma.course.upsert({
        where: { slug: lmsAssignment.courseCode.toLowerCase() },
        update: {},
        create: {
          title: lmsAssignment.courseTitle,
          slug: lmsAssignment.courseCode.toLowerCase(),
          status: CourseStatus.PUBLISHED,
          price: 0,
        },
      }));

    await this.prisma.assignment.upsert({
      where: { id: assignmentId },
      update: {},
      create: {
        id: assignmentId,
        courseId: course.id,
        title: lmsAssignment.title,
        description: lmsAssignment.description,
        dueAt: new Date(lmsAssignment.dueDate),
      },
    });

    // Create or update submission record
    const sub = await this.prisma.submission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: student.id,
        },
      },
      update: {
        status: SubmissionStatus.SUBMITTED,
        content,
        fileUrl: fileUrl || null,
        submittedAt: new Date(),
      },
      create: {
        assignmentId,
        studentId: student.id,
        status: SubmissionStatus.SUBMITTED,
        content,
        fileUrl: fileUrl || null,
        submittedAt: new Date(),
      },
    });

    // Increment submissions count on mock/LMS dashboard model
    await this.prisma.lmsAssignment.update({
      where: { id: assignmentId },
      data: {
        submissionsCount: { increment: 1 },
      },
    });

    return sub;
  }

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

  async getMeetings(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    const email = student.user.email;

    const meetings = await this.prisma.lmsMeeting.findMany({
      orderBy: { timeStart: 'desc' },
    });

    // Return meetings where student is listed or meeting has no explicit restrict list
    return meetings.filter((m) => {
      try {
        const atts =
          typeof m.attendees === 'string'
            ? JSON.parse(m.attendees)
            : m.attendees;
        if (!Array.isArray(atts) || atts.length === 0) return true;
        return atts.some(
          (a: any) => a.email.toLowerCase() === email.toLowerCase(),
        );
      } catch (e) {
        return true;
      }
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
