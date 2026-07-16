import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionStatus, EnrollmentStatus } from '../generated/prisma/enums';

@Injectable()
export class TeacherPortalService {
  constructor(private readonly prisma: PrismaService) {}

  private async getTeacherProfileByUserId(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        course: true,
      },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher profile not found');
    }
    return teacher;
  }

  async getDashboard(userId: string) {
    const teacher = await this.getTeacherProfileByUserId(userId);
    const fullName = `${teacher.user.firstName} ${teacher.user.lastName}`;

    // 1. Total assigned classes count
    const totalClasses = await this.prisma.lmsClass.count({
      where: {
        OR: [
          { courseCode: teacher.course?.slug?.toUpperCase() },
          { teacher: fullName },
        ],
      },
    });

    // 2. Total active students taught
    const totalStudents = teacher.courseId
      ? await this.prisma.enrollment.count({
          where: {
            courseId: teacher.courseId,
            status: EnrollmentStatus.ACTIVE,
          },
        })
      : 0;

    // 3. Pending assignments to grade
    const pendingGrades = teacher.courseId
      ? await this.prisma.submission.count({
          where: {
            assignment: { courseId: teacher.courseId },
            status: SubmissionStatus.SUBMITTED,
          },
        })
      : 0;

    // 4. Last payout details
    const lastPayout = await this.prisma.payout.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // 5. Upcoming scheduled classes (next 5)
    const upcomingClasses = await this.prisma.lmsClass.findMany({
      where: {
        OR: [
          { courseCode: teacher.course?.slug?.toUpperCase() },
          { teacher: fullName },
        ],
        status: 'Upcoming',
      },
      orderBy: { timeStart: 'asc' },
      take: 5,
    });

    return {
      metrics: {
        totalClasses,
        totalStudents,
        pendingGrades,
        lastPayoutAmount: lastPayout ? Number(lastPayout.netAmount) : 0,
        courseName: teacher.course?.title || 'No Subject Assigned',
        courseCode: teacher.course?.slug?.toUpperCase() || '—',
      },
      upcomingClasses,
    };
  }

  async getClasses(userId: string) {
    const teacher = await this.getTeacherProfileByUserId(userId);
    const fullName = `${teacher.user.firstName} ${teacher.user.lastName}`;

    return this.prisma.lmsClass.findMany({
      where: {
        OR: [
          { courseCode: teacher.course?.slug?.toUpperCase() },
          { teacher: fullName },
        ],
      },
      orderBy: { timeStart: 'desc' },
    });
  }

  async getEnrolledStudents(userId: string) {
    const teacher = await this.getTeacherProfileByUserId(userId);
    if (!teacher.courseId) return [];

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId: teacher.courseId,
        status: EnrollmentStatus.ACTIVE,
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
                country: true,
                timezone: true,
              },
            },
          },
        },
      },
    });

    return enrollments.map((e) => ({
      id: e.student.id,
      studentCode: e.student.studentCode,
      firstName: e.student.user.firstName,
      lastName: e.student.user.lastName,
      email: e.student.user.email,
      avatarUrl: e.student.user.avatarUrl,
      phone: e.student.phone,
      gender: e.student.gender,
      country: e.student.user.country,
      timezone: e.student.user.timezone,
      joinedAt: e.createdAt,
    }));
  }

  async getHomeworkSubmissions(userId: string) {
    const teacher = await this.getTeacherProfileByUserId(userId);
    if (!teacher.courseId) return [];

    return this.prisma.submission.findMany({
      where: {
        assignment: {
          courseId: teacher.courseId,
        },
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        assignment: {
          select: {
            title: true,
            dueAt: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async gradeHomework(
    userId: string,
    submissionId: string,
    grade: number,
    feedback: string,
  ) {
    const teacher = await this.getTeacherProfileByUserId(userId);

    // Validate submission belongs to teacher's course
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: true },
    });
    if (!sub) throw new NotFoundException('Submission not found');
    if (sub.assignment.courseId !== teacher.courseId) {
      throw new NotFoundException('Submission course mismatch');
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.EVALUATED,
        grade,
        feedback,
        evaluatedAt: new Date(),
      },
    });
  }

  async getPayouts(userId: string) {
    return this.prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProfile(userId: string) {
    return this.getTeacherProfileByUserId(userId);
  }

  async updateProfile(userId: string, dto: any) {
    const teacher = await this.getTeacherProfileByUserId(userId);

    const userUpdate: any = {};
    if (dto.firstName) userUpdate.firstName = dto.firstName;
    if (dto.lastName) userUpdate.lastName = dto.lastName;
    if (dto.country) userUpdate.country = dto.country;
    if (dto.timezone) userUpdate.timezone = dto.timezone;
    if (dto.avatarUrl) userUpdate.avatarUrl = dto.avatarUrl;
    if (dto.password) {
      userUpdate.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const teacherUpdate: any = {};
    if (dto.bio !== undefined) teacherUpdate.bio = dto.bio;
    if (dto.specialisation !== undefined) {
      teacherUpdate.specialisation = dto.specialisation;
    }

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdate,
        });
      }
      if (Object.keys(teacherUpdate).length > 0) {
        await tx.teacherProfile.update({
          where: { id: teacher.id },
          data: teacherUpdate,
        });
      }
      return tx.teacherProfile.findUnique({
        where: { id: teacher.id },
        include: { user: true, course: true },
      });
    });
  }

  async getMeetings(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!teacher) throw new NotFoundException('Teacher profile not found');
    const email = teacher.user.email;

    const meetings = await this.prisma.lmsMeeting.findMany({
      orderBy: { timeStart: 'desc' },
    });

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
}
