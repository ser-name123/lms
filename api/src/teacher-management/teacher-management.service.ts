import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClassStatus, Role, UserStatus } from '../generated/prisma/enums';
import {
  SendTeacherMessageDto, SetAvailabilityDto, SetTeacherStatusDto,
  TransferStudentsDto, UpdateTeachingDto, UpdateTeacherProfileDto,
} from './dto';

type Actor = { id?: string; name?: string } | undefined;

// A teacher at ~30 active students / ~25 weekly hours is treated as 100% loaded.
const FULL_LOAD_STUDENTS = 30;
const FULL_LOAD_HOURS = 25;

@Injectable()
export class TeacherManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Full profile hub payload ────────────────────────────────────────────────
  async getManagement(id: string) {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: { user: true, course: { select: { title: true } } },
    });
    if (!t) throw new NotFoundException('Teacher not found.');

    const reg = await this.linkedRegistration(t);
    const workload = await this.computeWorkload(id);

    return {
      id: t.id,
      teacherCode: t.teacherCode,
      status: t.user.status,
      name: `${t.user.firstName} ${t.user.lastName}`,
      firstName: t.user.firstName,
      lastName: t.user.lastName,
      email: t.user.email,
      mobile: t.user.phone || reg?.mobile || null,
      whatsapp: t.whatsapp || reg?.whatsappNumber || null,
      country: t.user.country || reg?.country || null,
      avatarUrl: t.user.avatarUrl || this.docUrl(t, reg, 'photo'),
      gender: t.gender || reg?.gender || t.user.gender || null,
      dateOfBirth: t.dateOfBirth || reg?.dateOfBirth || null,
      nationality: t.nationality || reg?.nationality || null,
      timeZone: t.timeZone || t.user.timezone || null,
      address: t.address || reg?.address || null,
      qualification: t.qualification || reg?.highestQualification || null,
      experienceYears: t.experienceYears || reg?.experienceYears || null,
      languages: t.languages?.length ? t.languages : this.split(reg?.languages),
      bio: t.bio,
      specialisation: t.specialisation,
      hourlyRate: t.hourlyRate,
      joiningDate: t.joiningDate || t.user.joiningDate || null,
      subjects: t.subjects?.length ? t.subjects : this.split(reg?.subjects),
      levels: t.levels || [],
      teachingModes: t.teachingModes?.length ? t.teachingModes : (reg?.teachingMode ? [reg.teachingMode] : []),
      course: t.course?.title || null,
      availability: t.availability || null,
      availabilityApproved: t.availabilityApproved,
      availabilitySubmittedAt: t.availabilitySubmittedAt,
      workload,
      rating: t.rating ?? null,
      ratingCount: t.ratingCount ?? 0,
      archived: t.archived,
      hasRegistration: !!reg,
    };
  }

  // ── Teaching assignment (subjects / levels / modes) ─────────────────────────
  async updateTeaching(id: string, dto: UpdateTeachingDto, actor: Actor) {
    await this.assertExists(id);
    const updated = await this.prisma.teacherProfile.update({
      where: { id },
      data: {
        ...(dto.subjects ? { subjects: dto.subjects } : {}),
        ...(dto.levels ? { levels: dto.levels } : {}),
        ...(dto.teachingModes ? { teachingModes: dto.teachingModes } : {}),
      },
      select: { subjects: true, levels: true, teachingModes: true },
    });
    void actor;
    return updated;
  }

  async updateProfile(id: string, dto: UpdateTeacherProfileDto) {
    await this.assertExists(id);
    return this.prisma.teacherProfile.update({
      where: { id },
      data: {
        ...(dto.gender !== undefined ? { gender: dto.gender || null } : {}),
        ...(dto.dateOfBirth !== undefined ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null } : {}),
        ...(dto.nationality !== undefined ? { nationality: dto.nationality || null } : {}),
        ...(dto.timeZone !== undefined ? { timeZone: dto.timeZone || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp || null } : {}),
        ...(dto.qualification !== undefined ? { qualification: dto.qualification || null } : {}),
        ...(dto.experienceYears !== undefined ? { experienceYears: dto.experienceYears || null } : {}),
        ...(dto.languages ? { languages: dto.languages } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio || null } : {}),
        ...(dto.specialisation !== undefined ? { specialisation: dto.specialisation || null } : {}),
        ...(dto.joiningDate !== undefined ? { joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null } : {}),
      },
      select: { id: true },
    });
  }

  // ── Availability (admin sets → approved; teacher sets → needs approval) ─────
  async setAvailability(id: string, dto: SetAvailabilityDto, opts: { byTeacher: boolean }) {
    await this.assertExists(id);
    return this.prisma.teacherProfile.update({
      where: { id },
      data: {
        availability: dto.availability as any,
        availabilitySubmittedAt: new Date(),
        availabilityApproved: !opts.byTeacher, // admin edits are auto-approved
      },
      select: { availability: true, availabilityApproved: true, availabilitySubmittedAt: true },
    });
  }

  async approveAvailability(id: string, approve: boolean) {
    await this.assertExists(id);
    return this.prisma.teacherProfile.update({
      where: { id },
      data: { availabilityApproved: approve },
      select: { availabilityApproved: true },
    });
  }

  // Teacher self-service: read + submit own availability.
  async myAvailability(userId: string) {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true, availability: true, availabilityApproved: true, availabilitySubmittedAt: true },
    });
    if (!t) throw new NotFoundException('Teacher profile not found.');
    return t;
  }

  async submitMyAvailability(userId: string, dto: SetAvailabilityDto) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!t) throw new NotFoundException('Teacher profile not found.');
    const res = await this.setAvailability(t.id, dto, { byTeacher: true });
    this.notifications.createForRoles([Role.ADMIN, Role.ACADEMIC_COACH], {
      type: 'AVAILABILITY_SUBMITTED', title: 'Availability Update',
      body: 'A teacher submitted an availability change for approval.',
      link: `/teachers/${t.id}`,
    }).catch(() => undefined);
    return res;
  }

  // ── Workload ────────────────────────────────────────────────────────────────
  private async computeWorkload(id: string) {
    const { start, end } = this.weekRange();
    const [activeStudents, weekClasses] = await Promise.all([
      this.prisma.enrollment.count({ where: { teacherId: id, status: 'ACTIVE' as any } }),
      this.prisma.classSession.findMany({
        where: { teacherId: id, startsAt: { gte: start, lte: end } },
        select: { startsAt: true, endsAt: true },
      }),
    ]);
    const classesThisWeek = weekClasses.length;
    const hoursThisWeek = Math.round(
      weekClasses.reduce((a, c) => a + (c.endsAt.getTime() - c.startsAt.getTime()) / 3600000, 0),
    );
    const loadStudents = activeStudents / FULL_LOAD_STUDENTS;
    const loadHours = hoursThisWeek / FULL_LOAD_HOURS;
    const workloadPct = Math.min(100, Math.round(((loadStudents + loadHours) / 2) * 100));
    return { activeStudents, classesThisWeek, hoursThisWeek, workloadPct };
  }

  // ── Assigned students + transfer ────────────────────────────────────────────
  async getStudents(id: string) {
    await this.assertExists(id);
    const rows = await this.prisma.enrollment.findMany({
      where: { teacherId: id },
      include: {
        student: { select: { id: true, studentCode: true, user: { select: { firstName: true, lastName: true, email: true } } } },
        course: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Batch names for these students (best-effort).
    return rows.map((e) => ({
      enrollmentId: e.id,
      studentId: e.studentId,
      studentCode: e.student.studentCode,
      name: `${e.student.user.firstName} ${e.student.user.lastName}`,
      email: e.student.user.email,
      course: e.course.title,
      status: e.status,
    }));
  }

  async transferStudents(id: string, dto: TransferStudentsDto, actor: Actor) {
    await this.assertExists(id);
    if (dto.toTeacherId === id) throw new BadRequestException('Choose a different destination teacher.');
    const dest = await this.prisma.teacherProfile.findUnique({
      where: { id: dto.toTeacherId },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!dest) throw new BadRequestException('Destination teacher not found.');

    const enrollments = await this.prisma.enrollment.findMany({
      where: { id: { in: dto.enrollmentIds }, teacherId: id },
      include: { student: { select: { userId: true, guardianName: true, user: { select: { email: true, firstName: true } } } }, course: { select: { title: true } } },
    });
    if (!enrollments.length) throw new BadRequestException('No matching enrollments to transfer.');

    await this.prisma.enrollment.updateMany({
      where: { id: { in: enrollments.map((e) => e.id) } },
      data: { teacherId: dto.toTeacherId },
    });

    const destName = `${dest.user.firstName} ${dest.user.lastName}`;
    for (const e of enrollments) {
      // Notify the student + email the parent.
      this.notifications.createFor(e.student.userId, {
        type: 'TEACHER_TRANSFER', title: 'Your teacher has changed',
        body: `Your ${e.course.title} class is now with ${destName}.`,
        link: `/student/classes`,
      }).catch(() => undefined);
      this.emails.sendMail(
        e.student.user.email,
        'Update: your class teacher has changed',
        `${e.student.user.firstName}'s ${e.course.title} class has been reassigned to ${destName}.${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
        undefined,
        `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${e.student.guardianName || 'Parent'},</p><p><b>${e.student.user.firstName}</b>'s <b>${e.course.title}</b> class has been reassigned to <b>${destName}</b>.</p>${dto.reason ? `<p style="color:#6b7280">Reason: ${dto.reason}</p>` : ''}<p style="color:#6b7280">The schedule stays the same unless we contact you.</p></div>`,
      ).catch(() => undefined);
    }
    void actor;
    return { transferred: enrollments.length, toTeacher: destName };
  }

  // ── Weekly schedule ─────────────────────────────────────────────────────────
  async getSchedule(id: string) {
    await this.assertExists(id);
    const { start, end } = this.weekRange();
    const classes = await this.prisma.classSession.findMany({
      where: { teacherId: id, startsAt: { gte: start, lte: end } },
      orderBy: { startsAt: 'asc' },
      include: { course: { select: { title: true } }, batch: { select: { name: true } }, _count: { select: { attendees: true } } },
    });
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byDay: Record<string, any[]> = {};
    for (const c of classes) {
      const d = days[c.startsAt.getDay()];
      (byDay[d] ||= []).push({
        id: c.id, title: c.title, course: c.course?.title, batch: c.batch?.name,
        startsAt: c.startsAt, endsAt: c.endsAt, status: c.status, students: c._count.attendees,
      });
    }
    return { weekStart: start, byDay };
  }

  // ── Performance + system rating ─────────────────────────────────────────────
  async getPerformance(id: string) {
    await this.assertExists(id);
    const [totalClasses, completed, cancelled, live] = await Promise.all([
      this.prisma.classSession.count({ where: { teacherId: id } }),
      this.prisma.classSession.count({ where: { teacherId: id, status: ClassStatus.COMPLETED } }),
      this.prisma.classSession.count({ where: { teacherId: id, status: ClassStatus.CANCELLED } }),
      this.prisma.classSession.count({ where: { teacherId: id, status: ClassStatus.LIVE } }),
    ]);

    // Student attendance % across this teacher's classes.
    const attAgg = await this.prisma.classAttendee.groupBy({
      by: ['status'], where: { class: { teacherId: id }, status: { not: null } }, _count: { _all: true },
    });
    const present = sum(attAgg, ['PRESENT', 'LATE']);
    const attTotal = sum(attAgg, ['PRESENT', 'LATE', 'ABSENT', 'NO_SHOW']);
    const attendanceRate = attTotal ? Math.round((present / attTotal) * 100) : 0;

    // On-time class start %: classes where the teacher wasn't late.
    const teacherStatusAgg = await this.prisma.classSession.groupBy({
      by: ['teacherStatus'], where: { teacherId: id, teacherStatus: { not: null } }, _count: { _all: true },
    });
    const onTime = teacherStatusAgg.filter((r) => r.teacherStatus === 'PRESENT').reduce((a, r) => a + r._count._all, 0);
    const startedTotal = teacherStatusAgg.reduce((a, r) => a + r._count._all, 0);
    const onTimeStartPct = startedTotal ? Math.round((onTime / startedTotal) * 100) : 0;

    // Trials (as the assigned teacher).
    const [trialsTotal, trialsConverted, tRatingAgg, pRatingAgg] = await Promise.all([
      this.prisma.leadTrial.count({ where: { teacherId: id } }),
      this.prisma.leadTrial.count({ where: { teacherId: id, lead: { status: 'CONVERTED' as any } } }),
      this.prisma.leadTrial.aggregate({ where: { teacherId: id, teacherRating: { not: null } }, _avg: { teacherRating: true } }),
      this.prisma.leadTrial.aggregate({ where: { teacherId: id, parentRating: { not: null } }, _avg: { parentRating: true } }),
    ]);
    const trialConversion = trialsTotal ? Math.round((trialsConverted / trialsTotal) * 100) : 0;
    const parentRating = pRatingAgg._avg.parentRating ? Math.round(pRatingAgg._avg.parentRating * 10) / 10 : 0;
    const teacherFeedbackRating = tRatingAgg._avg.teacherRating ? Math.round(tRatingAgg._avg.teacherRating * 10) / 10 : 0;

    const completionRate = totalClasses ? Math.round((completed / totalClasses) * 100) : 0;

    // System rating (0..5): weighted blend of the signals that exist.
    const rating = this.systemRating({ attendanceRate, completionRate, onTimeStartPct, trialConversion, parentRating });
    // Cache it on the profile.
    await this.prisma.teacherProfile.update({ where: { id }, data: { rating: rating.value, ratingCount: rating.count } }).catch(() => undefined);

    return {
      totalClasses, completedClasses: completed, cancelledClasses: cancelled, liveClasses: live,
      completionRate, attendanceRate, onTimeStartPct,
      trialsTotal, trialsConverted, trialConversion,
      parentRating, teacherFeedbackRating,
      rating: rating.value, ratingBreakdown: rating.breakdown,
    };
  }

  private systemRating(m: { attendanceRate: number; completionRate: number; onTimeStartPct: number; trialConversion: number; parentRating: number }) {
    // Each component contributes a 0..5 score; parent rating already 0..5.
    const parts: { label: string; score: number; weight: number }[] = [
      { label: 'Student Attendance', score: (m.attendanceRate / 100) * 5, weight: 0.25 },
      { label: 'Class Completion', score: (m.completionRate / 100) * 5, weight: 0.2 },
      { label: 'On-time Start', score: (m.onTimeStartPct / 100) * 5, weight: 0.15 },
      { label: 'Trial Success', score: (m.trialConversion / 100) * 5, weight: 0.15 },
      { label: 'Parent Feedback', score: m.parentRating, weight: 0.25 },
    ];
    const active = parts.filter((p) => p.score > 0);
    const wsum = active.reduce((a, p) => a + p.weight, 0) || 1;
    const value = active.length
      ? Math.round((active.reduce((a, p) => a + p.score * p.weight, 0) / wsum) * 10) / 10
      : 0;
    return { value, count: active.length, breakdown: parts.map((p) => ({ label: p.label, score: Math.round(p.score * 10) / 10 })) };
  }

  // ── Per-teacher analytics (charts) ──────────────────────────────────────────
  async getAnalytics(id: string) {
    await this.assertExists(id);
    // Monthly teaching hours (last 6 months).
    const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1); since.setHours(0, 0, 0, 0);
    const classes = await this.prisma.classSession.findMany({
      where: { teacherId: id, startsAt: { gte: since } },
      select: { startsAt: true, endsAt: true, courseId: true, status: true },
    });
    const monthly: Record<string, number> = {};
    for (const c of classes) {
      const k = c.startsAt.toISOString().slice(0, 7);
      monthly[k] = (monthly[k] || 0) + (c.endsAt.getTime() - c.startsAt.getTime()) / 3600000;
    }
    const monthlyHours = Object.entries(monthly).map(([month, h]) => ({ month, hours: Math.round(h) })).sort((a, b) => a.month.localeCompare(b.month));

    // Subject distribution (from this teacher's active enrollments' courses).
    const enr = await this.prisma.enrollment.findMany({
      where: { teacherId: id }, select: { course: { select: { title: true } } },
    });
    const subj: Record<string, number> = {};
    for (const e of enr) subj[e.course.title] = (subj[e.course.title] || 0) + 1;
    const subjectDistribution = Object.entries(subj).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    return { monthlyHours, subjectDistribution };
  }

  // ── Documents ───────────────────────────────────────────────────────────────
  async getDocuments(id: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id }, include: { user: true } });
    if (!t) throw new NotFoundException('Teacher not found.');
    const reg = await this.linkedRegistration(t);
    const stored = (t.documents as any) || {};
    const doc = (key: string, regUrl?: string | null) => stored[key] || regUrl || null;
    return {
      resume: doc('resume', reg?.resumeUrl),
      degree: doc('degree', reg?.degreeUrl),
      certificates: doc('certificates', reg?.certificatesUrl),
      govId: doc('govId', reg?.govIdUrl),
      photo: doc('photo', reg?.photoUrl),
      experienceLetter: doc('experienceLetter', reg?.experienceLetterUrl),
      policeVerification: doc('policeVerification', reg?.policeVerificationUrl),
    };
  }

  // ── Communication history + send message ────────────────────────────────────
  async getCommunication(id: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!t) throw new NotFoundException('Teacher not found.');
    return this.prisma.notification.findMany({
      where: { userId: t.userId }, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  async sendMessage(id: string, dto: SendTeacherMessageDto) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id }, include: { user: { select: { email: true, firstName: true } } } });
    if (!t) throw new NotFoundException('Teacher not found.');
    const channel = dto.channel || 'BOTH';
    if (channel === 'IN_APP' || channel === 'BOTH') {
      await this.notifications.createFor(t.userId, { type: 'ADMIN_MESSAGE', title: dto.title, body: dto.body, link: `/teacher/dashboard` });
    }
    if (channel === 'EMAIL' || channel === 'BOTH') {
      await this.emails.sendMail(t.user.email, dto.title, dto.body, undefined,
        `<div style="font-family:'Segoe UI',sans-serif;padding:24px;color:#1f2937"><p>Dear ${t.user.firstName},</p><p>${dto.body.replace(/\n/g, '<br/>')}</p><p style="color:#6b7280">— Academy Administration</p></div>`,
      ).catch(() => undefined);
    }
    return { sent: true };
  }

  // ── Status (activate / suspend / pause) ─────────────────────────────────────
  async setStatus(id: string, dto: SetTeacherStatusDto) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!t) throw new NotFoundException('Teacher not found.');
    await this.prisma.user.update({ where: { id: t.userId }, data: { status: dto.status as UserStatus } });
    return { status: dto.status };
  }

  // ── Assign / remove students ────────────────────────────────────────────────
  async getAssignable(search?: string) {
    // Enrollments not yet assigned to any teacher (the natural "assign" pool).
    const rows = await this.prisma.enrollment.findMany({
      where: {
        teacherId: null,
        ...(search ? { student: { user: { OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ] } } } : {}),
      },
      include: { student: { select: { studentCode: true, user: { select: { firstName: true, lastName: true } } } }, course: { select: { title: true } } },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((e) => ({ enrollmentId: e.id, name: `${e.student.user.firstName} ${e.student.user.lastName}`, studentCode: e.student.studentCode, course: e.course.title }));
  }

  async assignStudents(id: string, enrollmentIds: string[]) {
    await this.assertExists(id);
    const res = await this.prisma.enrollment.updateMany({ where: { id: { in: enrollmentIds } }, data: { teacherId: id } });
    return { assigned: res.count };
  }

  async removeStudent(id: string, enrollmentId: string) {
    await this.assertExists(id);
    await this.prisma.enrollment.updateMany({ where: { id: enrollmentId, teacherId: id }, data: { teacherId: null } });
    return { removed: true };
  }

  // ── Batch assignment ────────────────────────────────────────────────────────
  async getBatches(id: string) {
    await this.assertExists(id);
    const [assigned, available] = await Promise.all([
      this.prisma.batch.findMany({ where: { teacherId: id }, include: { course: { select: { title: true } }, _count: { select: { students: true, classes: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.batch.findMany({ where: { OR: [{ teacherId: null }, { teacherId: { not: id } }] }, select: { id: true, code: true, name: true, course: { select: { title: true } } }, take: 100 }),
    ]);
    return {
      assigned: assigned.map((b) => ({ id: b.id, code: b.code, name: b.name, course: b.course?.title, students: b._count.students, classes: b._count.classes, status: b.status })),
      available: available.map((b) => ({ id: b.id, code: b.code, name: b.name, course: b.course?.title })),
    };
  }

  async assignBatches(id: string, batchIds: string[]) {
    await this.assertExists(id);
    const res = await this.prisma.batch.updateMany({ where: { id: { in: batchIds } }, data: { teacherId: id } });
    return { assigned: res.count };
  }

  async unassignBatch(id: string, batchId: string) {
    await this.assertExists(id);
    await this.prisma.batch.updateMany({ where: { id: batchId, teacherId: id }, data: { teacherId: null } });
    return { removed: true };
  }

  // ── Archive ─────────────────────────────────────────────────────────────────
  async archive(id: string, archived: boolean) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!t) throw new NotFoundException('Teacher not found.');
    await this.prisma.teacherProfile.update({ where: { id }, data: { archived } });
    // Archiving also deactivates the login; unarchiving reactivates.
    await this.prisma.user.update({ where: { id: t.userId }, data: { status: archived ? UserStatus.INACTIVE : UserStatus.ACTIVE } });
    return { archived };
  }

  // ── Leave automation: called when a teacher's leave is approved ─────────────
  async cancelClassesForLeave(userId: string, from: Date, to: Date, reason?: string) {
    const tp = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true, user: { select: { firstName: true, lastName: true } } } });
    if (!tp) return { cancelled: 0 };
    const end = new Date(to); end.setHours(23, 59, 59, 999);
    const classes = await this.prisma.classSession.findMany({
      where: { teacherId: tp.id, attendanceLocked: false, status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] }, startsAt: { gte: from, lte: end } },
      include: { attendees: { select: { studentId: true } } },
    });
    for (const cls of classes) {
      await this.prisma.classSession.update({ where: { id: cls.id }, data: { status: ClassStatus.CANCELLED, teacherStatus: 'CLASS_CANCELLED' as any, attendanceLocked: true, lockedAt: new Date() } });
      await this.prisma.classAttendee.updateMany({ where: { classId: cls.id, OR: [{ status: null }, { status: { notIn: ['EXCUSED', 'LEAVE_APPROVED'] as any } }] }, data: { status: 'EXCUSED' as any } });
      const contacts = await this.studentContacts(cls.attendees.map((a) => a.studentId));
      for (const c of contacts) {
        this.notifications.createFor(c.userId, {
          type: 'CLASS_CANCELLED', title: 'Class Cancelled — teacher on leave',
          body: `${cls.title} on ${cls.startsAt.toLocaleString()} is cancelled (teacher on approved leave).`,
          link: `/student/classes`,
        }).catch(() => undefined);
      }
    }
    void reason;
    return { cancelled: classes.length };
  }

  // ── Fleet analytics (across ALL teachers) ───────────────────────────────────
  async fleetAnalytics() {
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { user: { role: Role.TEACHER } },
      select: { id: true, subjects: true, rating: true, user: { select: { firstName: true, lastName: true, country: true } } },
    });

    // Workload per teacher (top by active students).
    const workloads = await Promise.all(teachers.map(async (t) => ({ name: `${t.user.firstName} ${t.user.lastName}`, ...(await this.computeWorkload(t.id)) })));
    const teacherWorkload = workloads.map((w) => ({ name: w.name, workloadPct: w.workloadPct, students: w.activeStudents })).sort((a, b) => b.workloadPct - a.workloadPct).slice(0, 12);

    // Subject distribution (count teachers per subject).
    const subj: Record<string, number> = {};
    for (const t of teachers) for (const s of t.subjects || []) subj[s] = (subj[s] || 0) + 1;
    const subjectDistribution = Object.entries(subj).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12);

    // Country distribution.
    const country: Record<string, number> = {};
    for (const t of teachers) { const c = t.user.country || 'Unknown'; country[c] = (country[c] || 0) + 1; }
    const countryDistribution = Object.entries(country).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    // Average rating buckets.
    const rated = teachers.filter((t) => t.rating != null);
    const avgRating = rated.length ? Math.round((rated.reduce((a, t) => a + (t.rating || 0), 0) / rated.length) * 10) / 10 : 0;
    const ratingBuckets = [1, 2, 3, 4, 5].map((star) => ({ name: `${star}★`, count: rated.filter((t) => Math.round(t.rating || 0) === star).length }));

    // Monthly teaching hours + trial conversion across all teachers (last 6 months).
    const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1); since.setHours(0, 0, 0, 0);
    const classes = await this.prisma.classSession.findMany({ where: { startsAt: { gte: since } }, select: { startsAt: true, endsAt: true } });
    const monthly: Record<string, number> = {};
    for (const c of classes) { const k = c.startsAt.toISOString().slice(0, 7); monthly[k] = (monthly[k] || 0) + (c.endsAt.getTime() - c.startsAt.getTime()) / 3600000; }
    const monthlyHours = Object.entries(monthly).map(([month, h]) => ({ month, hours: Math.round(h) })).sort((a, b) => a.month.localeCompare(b.month));

    const [trialsTotal, trialsConverted] = await Promise.all([
      this.prisma.leadTrial.count(),
      this.prisma.leadTrial.count({ where: { lead: { status: 'CONVERTED' as any } } }),
    ]);

    return {
      totalTeachers: teachers.length,
      avgRating,
      trialConversion: trialsTotal ? Math.round((trialsConverted / trialsTotal) * 100) : 0,
      teacherWorkload,
      subjectDistribution,
      countryDistribution,
      ratingBuckets,
      monthlyHours,
    };
  }

  // ── Teacher performance report (one row per teacher) ────────────────────────
  async performanceReport() {
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { user: { role: Role.TEACHER } },
      select: { id: true, userId: true, teacherCode: true, rating: true, user: { select: { firstName: true, lastName: true } } },
    });

    const rows = await Promise.all(teachers.map(async (t) => {
      const [students, classAgg, hoursAgg, leaves, attAgg, trialsTotal, trialsConv, pRating] = await Promise.all([
        this.prisma.enrollment.count({ where: { teacherId: t.id, status: 'ACTIVE' as any } }),
        this.prisma.classSession.count({ where: { teacherId: t.id } }),
        this.prisma.classSession.findMany({ where: { teacherId: t.id, status: ClassStatus.COMPLETED }, select: { startsAt: true, endsAt: true } }),
        this.prisma.leaveRequest.count({ where: { userId: t.userId, status: 'APPROVED' as any } }),
        this.prisma.classAttendee.groupBy({ by: ['status'], where: { class: { teacherId: t.id }, status: { not: null } }, _count: { _all: true } }),
        this.prisma.leadTrial.count({ where: { teacherId: t.id } }),
        this.prisma.leadTrial.count({ where: { teacherId: t.id, lead: { status: 'CONVERTED' as any } } }),
        this.prisma.leadTrial.aggregate({ where: { teacherId: t.id, parentRating: { not: null } }, _avg: { parentRating: true } }),
      ]);
      const present = sum(attAgg, ['PRESENT', 'LATE']);
      const attTotal = sum(attAgg, ['PRESENT', 'LATE', 'ABSENT', 'NO_SHOW']);
      const hours = Math.round(hoursAgg.reduce((a, c) => a + (c.endsAt.getTime() - c.startsAt.getTime()) / 3600000, 0));
      return {
        teacher: `${t.user.firstName} ${t.user.lastName}`,
        teacherCode: t.teacherCode,
        students,
        classHours: hours,
        totalClasses: classAgg,
        attendance: attTotal ? Math.round((present / attTotal) * 100) : 0,
        leaves,
        trialSuccess: trialsTotal ? Math.round((trialsConv / trialsTotal) * 100) : 0,
        parentRating: pRating._avg.parentRating ? Math.round(pRating._avg.parentRating * 10) / 10 : 0,
        rating: t.rating ?? 0,
      };
    }));
    return rows.sort((a, b) => b.rating - a.rating);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private async assertExists(id: string) {
    const t = await this.prisma.teacherProfile.findUnique({ where: { id }, select: { id: true } });
    if (!t) throw new NotFoundException('Teacher not found.');
  }

  private async studentContacts(studentIds: string[]) {
    if (!studentIds.length) return [];
    const rows = await this.prisma.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: { userId: true, user: { select: { email: true, firstName: true } }, guardianName: true },
    });
    return rows.map((r) => ({ userId: r.userId, email: r.user.email, firstName: r.user.firstName, guardian: r.guardianName }));
  }

  private async linkedRegistration(t: { id: string; user: { email: string } }) {
    return this.prisma.teacherRegistration.findFirst({
      where: { OR: [{ teacherProfileId: t.id }, { email: t.user.email }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  private split(csv?: string | null) {
    return csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }

  private docUrl(t: any, reg: any, key: string) {
    const stored = (t.documents as any) || {};
    if (stored[key]) return stored[key];
    if (reg && key === 'photo') return reg.photoUrl || null;
    return null;
  }

  private weekRange() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(start.getDate() + 7); end.setHours(0, 0, 0, 0);
    return { start, end };
  }
}

function sum(agg: { status: string | null; _count: { _all: number } }[], statuses: string[]) {
  return agg.filter((r) => r.status && statuses.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
}
