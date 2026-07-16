import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentMessages(userId: string, role?: string) {
    if (role === 'TEACHER') {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { userId },
      });
      if (!teacher) throw new NotFoundException('Teacher profile not found');
      return this.prisma.chatMessage.findMany({
        where: { teacherId: teacher.id },
        orderBy: { createdAt: 'asc' },
      });
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    return this.prisma.chatMessage.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendStudentMessage(userId: string, content: string, role?: string) {
    if (role === 'TEACHER') {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (!teacher) throw new NotFoundException('Teacher profile not found');
      return this.prisma.chatMessage.create({
        data: {
          teacherId: teacher.id,
          senderRole: 'TEACHER',
          senderName: `${teacher.user.firstName} ${teacher.user.lastName}`,
          content,
        },
      });
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    return this.prisma.chatMessage.create({
      data: {
        studentId: student.id,
        senderRole: 'STUDENT',
        senderName: `${student.user.firstName} ${student.user.lastName}`,
        content,
      },
    });
  }

  async getAdminThreads() {
    const students = await this.prisma.studentProfile.findMany({
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const teachers = await this.prisma.teacherProfile.findMany({
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const studentThreads = students
      .map((s) => ({
        id: s.id,
        role: 'STUDENT',
        studentCode: s.studentCode,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        email: s.user.email,
        avatarUrl: s.user.avatarUrl,
        lastMessage: s.chatMessages[0] || null,
      }))
      .filter((t) => t.lastMessage !== null);

    const teacherThreads = teachers
      .map((t) => ({
        id: t.id,
        role: 'TEACHER',
        studentCode: t.teacherCode,
        firstName: t.user.firstName,
        lastName: t.user.lastName,
        email: t.user.email,
        avatarUrl: t.user.avatarUrl,
        lastMessage: t.chatMessages[0] || null,
      }))
      .filter((t) => t.lastMessage !== null);

    return [...studentThreads, ...teacherThreads].sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt).getTime() -
        new Date(a.lastMessage.createdAt).getTime(),
    );
  }

  async getAdminThreadMessages(threadId: string) {
    const isStudent = await this.prisma.studentProfile.findUnique({
      where: { id: threadId },
    });

    return this.prisma.chatMessage.findMany({
      where: isStudent ? { studentId: threadId } : { teacherId: threadId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendAdminMessage(adminUserId: string, threadId: string, content: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
    });
    if (!admin) throw new NotFoundException('Admin user not found');

    const isStudent = await this.prisma.studentProfile.findUnique({
      where: { id: threadId },
    });

    return this.prisma.chatMessage.create({
      data: {
        studentId: isStudent ? threadId : null,
        teacherId: isStudent ? null : threadId,
        senderRole: 'ADMIN',
        senderName: `${admin.firstName} ${admin.lastName}`,
        content,
      },
    });
  }
}
