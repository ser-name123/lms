import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  ClassStatus,
  CorrectionStatus,
  InvoiceStatus,
  LeadTrialStatus,
  LeaveRequestStatus,
  PaymentStatus,
  RegistrationStatus,
  Role,
  StudentAttendanceStatus,
  SubmissionStatus,
  TeacherRegistrationStatus,
} from '../generated/prisma/enums';
import {
  ResolvedRange,
  bucketEdges,
  endOfDay,
  pct,
  startOfDay,
  toNumber,
} from './dashboard.range';

/*
 * Admin (SUPERVISOR) dashboard — day-to-day operations rather than
 * whole-academy monitoring. Where the Super Admin view answers "how is the
 * academy doing", this answers "what needs doing today".
 */

const UNPAID_INVOICE: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PENDING,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

const PENDING_SUBMISSION: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.LATE_SUBMITTED,
  SubmissionStatus.UNDER_REVIEW,
];

const PRESENT_STATES: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.PRESENT,
  StudentAttendanceStatus.LATE,
];

// Teacher applications still inside the hiring pipeline (not yet activated).
const OPEN_TEACHER_APPLICATIONS = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'DEMO_CLASS',
  'APPROVAL',
] as TeacherRegistrationStatus[];

@Injectable()
export class AdminOpsDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(range: ResolvedRange) {
    const [cards, upcomingClasses, pendingTasks, charts] = await Promise.all([
      this.cards(),
      this.upcomingClasses(),
      this.pendingTasks(),
      this.charts(range),
    ]);
    return {
      range: range.key,
      cards,
      upcomingClasses,
      pendingTasks,
      charts,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  private async cards() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [
      todayAdmissions,
      todayTrials,
      todayClasses,
      attendanceTotal,
      attendancePresent,
      pendingAssignments,
      pendingAssessments,
      unpaid,
      pendingRegistrations,
      pendingTeacherApps,
      pendingTransfers,
      pendingLeaves,
      pendingCorrections,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { role: Role.STUDENT, createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.leadTrial.count({
        where: {
          scheduledAt: { gte: todayStart, lt: todayEnd },
          status: { in: [LeadTrialStatus.SCHEDULED, LeadTrialStatus.RESCHEDULED] },
        },
      }),
      this.prisma.classSession.count({ where: { startsAt: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.classAttendee.count({
        where: { class: { startsAt: { gte: todayStart, lt: todayEnd } }, status: { not: null } },
      }),
      this.prisma.classAttendee.count({
        where: {
          class: { startsAt: { gte: todayStart, lt: todayEnd } },
          status: { in: PRESENT_STATES },
        },
      }),
      this.prisma.submission.count({ where: { status: { in: PENDING_SUBMISSION } } }),
      this.prisma.assessmentAttempt.count({
        where: { status: { in: ['SUBMITTED', 'UNDER_EVALUATION'] } },
      }),
      this.prisma.invoice.aggregate({
        _sum: { amount: true, paidAmount: true },
        _count: { _all: true },
        where: { status: { in: UNPAID_INVOICE } },
      }),
      this.prisma.studentRegistration.count({ where: { status: RegistrationStatus.PENDING } }),
      this.prisma.teacherRegistration.count({
        where: { status: { in: OPEN_TEACHER_APPLICATIONS } },
      }),
      this.prisma.studentTransfer.count({ where: { status: 'PENDING' } }),
      this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.PENDING } }),
      this.prisma.attendanceCorrection.count({ where: { status: CorrectionStatus.PENDING } }),
    ]);

    const outstanding = toNumber(unpaid._sum.amount) - toNumber(unpaid._sum.paidAmount);

    return {
      todayAdmissions,
      todayTrials,
      todayClasses,
      todayAttendancePct: pct(attendancePresent, attendanceTotal),
      pendingAssignments,
      pendingAssessments,
      pendingFees: { count: unpaid._count._all, amount: Math.max(0, outstanding) },
      pendingApprovals:
        pendingRegistrations +
        pendingTeacherApps +
        pendingTransfers +
        pendingLeaves +
        pendingCorrections,
    };
  }

  // ── Upcoming classes table ────────────────────────────────────────────────

  private async upcomingClasses() {
    const sessions = await this.prisma.classSession.findMany({
      where: {
        startsAt: { gte: new Date() },
        status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] },
      },
      orderBy: { startsAt: 'asc' },
      take: 10,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        meetingUrl: true,
        course: { select: { title: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        batch: { select: { name: true } },
        _count: { select: { attendees: true } },
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      time: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      course: s.course.title,
      batch: s.batch?.name ?? null,
      teacher: `${s.teacher.user.firstName} ${s.teacher.user.lastName}`.trim(),
      students: s._count.attendees,
      status: s.status,
      meetingUrl: s.meetingUrl,
    }));
  }

  // ── Pending tasks table ────────────────────────────────────────────────────

  private async pendingTasks() {
    const [
      registrations,
      teacherApps,
      transfers,
      leaves,
      corrections,
      overdueInvoices,
      attempts,
      parentMeetings,
    ] = await Promise.all([
        this.prisma.studentRegistration.count({ where: { status: RegistrationStatus.PENDING } }),
        this.prisma.teacherRegistration.count({
          where: { status: { in: OPEN_TEACHER_APPLICATIONS } },
        }),
        this.prisma.studentTransfer.count({ where: { status: 'PENDING' } }),
        this.prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.PENDING } }),
        this.prisma.attendanceCorrection.count({ where: { status: CorrectionStatus.PENDING } }),
        this.prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
        this.prisma.assessmentAttempt.count({
          where: { status: { in: ['SUBMITTED', 'UNDER_EVALUATION'] } },
        }),
        /*
         * The spec calls this row "Parent Request". There is no parent-raised
         * request model, so the closest real queue is parent meetings that are
         * booked but still ahead of us and therefore need arranging/confirming.
         */
        this.prisma.parentMeeting.count({
          where: { status: 'SCHEDULED', scheduledAt: { gte: new Date() } },
        }),
      ]);

    // Each row deep-links into the screen that clears the queue.
    return [
      { key: 'teacher-approval', label: 'Teacher Approval', count: teacherApps, link: '/teacher-registrations' },
      { key: 'student-registration', label: 'Student Registration', count: registrations, link: '/registrations' },
      { key: 'batch-assignment', label: 'Transfer / Batch Assignment', count: transfers, link: '/students' },
      { key: 'leave-request', label: 'Leave Requests', count: leaves, link: '/leaves' },
      { key: 'attendance-correction', label: 'Attendance Corrections', count: corrections, link: '/attendance' },
      { key: 'parent-request', label: 'Parent Meetings', count: parentMeetings, link: '/students/progress' },
      { key: 'fee-pending', label: 'Overdue Invoices', count: overdueInvoices, link: '/invoices' },
      { key: 'assessment-review', label: 'Assessment Review', count: attempts, link: '/assessments' },
    ].filter((t) => t.count > 0);
  }

  // ── Charts ─────────────────────────────────────────────────────────────────

  private async charts(range: ResolvedRange) {
    const edges = bucketEdges(range);

    const [admissions, attendance, assignmentStatus, fees] = await Promise.all([
      Promise.all(
        edges.map((e) =>
          this.prisma.user.count({
            where: { role: Role.STUDENT, createdAt: { gte: e.start, lt: e.end } },
          }),
        ),
      ),
      Promise.all(
        edges.map(async (e) => {
          const [total, present] = await Promise.all([
            this.prisma.classAttendee.count({
              where: { class: { startsAt: { gte: e.start, lt: e.end } }, status: { not: null } },
            }),
            this.prisma.classAttendee.count({
              where: {
                class: { startsAt: { gte: e.start, lt: e.end } },
                status: { in: PRESENT_STATES },
              },
            }),
          ]);
          return pct(present, total);
        }),
      ),
      this.prisma.submission.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { assignment: { createdAt: { gte: range.from, lte: range.to } } },
      }),
      Promise.all(
        edges.map(async (e) => {
          const [collected, invoiced] = await Promise.all([
            this.prisma.payment.aggregate({
              _sum: { amount: true },
              where: { status: PaymentStatus.SUCCEEDED, paidAt: { gte: e.start, lt: e.end } },
            }),
            this.prisma.invoice.aggregate({
              _sum: { amount: true },
              where: { issuedAt: { gte: e.start, lt: e.end } },
            }),
          ]);
          return {
            collected: toNumber(collected._sum.amount),
            invoiced: toNumber(invoiced._sum.amount),
          };
        }),
      ),
    ]);

    return {
      admissions: edges.map((e, i) => ({ label: e.label, admissions: admissions[i] })),
      attendance: edges.map((e, i) => ({ label: e.label, rate: attendance[i] })),
      assignmentStatus: assignmentStatus.map((r) => ({ name: r.status, value: r._count._all })),
      fees: edges.map((e, i) => ({
        label: e.label,
        collected: fees[i].collected,
        outstanding: Math.max(0, fees[i].invoiced - fees[i].collected),
      })),
    };
  }
}
