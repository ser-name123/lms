import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  ClassStatus,
  InvoiceStatus,
  PaymentStatus,
  StudentAttendanceStatus,
} from '../generated/prisma/enums';
import { ResolvedRange, bucketEdges, endOfDay, pct, startOfDay, toNumber } from './dashboard.range';

/*
 * Parent dashboard — read-only monitoring of the parent's own child/children.
 *
 * A parent reaches a child only through ParentLink. Every method here resolves
 * the child id through `assertChild` first, so a parent cannot pass an
 * arbitrary studentId and read someone else's record.
 */

const PRESENT_STATES: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.PRESENT,
  StudentAttendanceStatus.LATE,
];

const UNPAID_INVOICE: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PENDING,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

@Injectable()
export class ParentDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every child this parent is linked to — drives the child switcher. */
  async children(parentUserId: string) {
    const links = await this.prisma.parentLink.findMany({
      where: { parentUserId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        relationship: true,
        isPrimary: true,
        student: {
          select: {
            id: true,
            studentCode: true,
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
      },
    });

    return links.map((l) => ({
      studentId: l.student.id,
      studentCode: l.student.studentCode,
      name: `${l.student.user.firstName} ${l.student.user.lastName}`.trim(),
      avatarUrl: l.student.user.avatarUrl,
      relationship: l.relationship,
      isPrimary: l.isPrimary,
    }));
  }

  /**
   * Resolve which child to render. Without an explicit id, the primary child
   * (falling back to the first link) is used.
   */
  private async assertChild(parentUserId: string, childId?: string): Promise<string> {
    if (childId) {
      const link = await this.prisma.parentLink.findUnique({
        where: { parentUserId_studentId: { parentUserId, studentId: childId } },
        select: { studentId: true },
      });
      if (!link) throw new ForbiddenException('This student is not linked to your account');
      return link.studentId;
    }

    const first = await this.prisma.parentLink.findFirst({
      where: { parentUserId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { studentId: true },
    });
    if (!first) throw new NotFoundException('No child is linked to your account yet');
    return first.studentId;
  }

  async dashboard(parentUserId: string, range: ResolvedRange, childId?: string) {
    const studentId = await this.assertChild(parentUserId, childId);

    const [child, cards, timeline, charts, fees, children] = await Promise.all([
      this.childHeader(studentId),
      this.cards(studentId),
      this.timeline(studentId),
      this.charts(studentId, range),
      this.feeSummary(studentId),
      this.children(parentUserId),
    ]);

    return {
      range: range.key,
      child,
      children,
      cards,
      timeline,
      charts,
      fees,
      generatedAt: new Date().toISOString(),
    };
  }

  private async childHeader(studentId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        studentCode: true,
        learningLevel: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true, status: true } },
        enrollments: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            course: { select: { title: true } },
            teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const enrollment = student.enrollments[0];
    return {
      studentId: student.id,
      studentCode: student.studentCode,
      name: `${student.user.firstName} ${student.user.lastName}`.trim(),
      avatarUrl: student.user.avatarUrl,
      status: student.user.status,
      level: student.learningLevel,
      course: enrollment?.course.title ?? null,
      teacher: enrollment?.teacher
        ? `${enrollment.teacher.user.firstName} ${enrollment.teacher.user.lastName}`.trim()
        : null,
    };
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  private async cards(studentId: string) {
    const [
      attendanceTotal,
      attendancePresent,
      assignmentsTotal,
      assignmentsSubmitted,
      assignmentsPending,
      lastAttempt,
      unpaid,
      lastFeedback,
      snapshot,
    ] = await Promise.all([
      this.prisma.classAttendee.count({ where: { studentId, status: { not: null } } }),
      this.prisma.classAttendee.count({ where: { studentId, status: { in: PRESENT_STATES } } }),
      this.prisma.submission.count({ where: { studentId } }),
      this.prisma.submission.count({ where: { studentId, submittedAt: { not: null } } }),
      this.prisma.submission.count({ where: { studentId, status: { in: ['ASSIGNED', 'DRAFT'] } } }),
      this.prisma.assessmentAttempt.findFirst({
        where: { studentId, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: {
          percentage: true,
          score: true,
          totalMarks: true,
          passed: true,
          publishedAt: true,
          assessment: { select: { title: true } },
        },
      }),
      this.prisma.invoice.aggregate({
        _sum: { amount: true, paidAmount: true },
        _count: { _all: true },
        where: { studentId, status: { in: UNPAID_INVOICE } },
      }),
      this.prisma.teacherFeedback.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        select: { remarks: true, suggestions: true, createdAt: true },
      }),
      this.prisma.progressSnapshot.findFirst({
        where: { studentId },
        orderBy: { periodStart: 'desc' },
        select: { overallScore: true, statusLabel: true },
      }),
    ]);

    const due = toNumber(unpaid._sum.amount) - toNumber(unpaid._sum.paidAmount);

    return {
      attendancePct: pct(attendancePresent, attendanceTotal),
      assignments: {
        total: assignmentsTotal,
        submitted: assignmentsSubmitted,
        pending: assignmentsPending,
      },
      lastResult: lastAttempt
        ? {
            title: lastAttempt.assessment.title,
            percentage: lastAttempt.percentage,
            score: lastAttempt.score,
            totalMarks: lastAttempt.totalMarks,
            passed: lastAttempt.passed,
            at: lastAttempt.publishedAt?.toISOString() ?? null,
          }
        : null,
      feeDue: { amount: Math.max(0, due), invoices: unpaid._count._all },
      lastFeedback: lastFeedback
        ? {
            remarks: lastFeedback.remarks,
            suggestions: lastFeedback.suggestions,
            at: lastFeedback.createdAt.toISOString(),
          }
        : null,
      overallProgress: Math.round((snapshot?.overallScore ?? 0) * 10) / 10,
      progressStatus: snapshot?.statusLabel ?? null,
    };
  }

  // ── Child timeline ─────────────────────────────────────────────────────────

  private async timeline(studentId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

    const [todayClasses, recentAttendance, homework, upcomingTest, remarks] = await Promise.all([
      this.prisma.classAttendee.findMany({
        where: { studentId, class: { startsAt: { gte: todayStart, lt: todayEnd } } },
        select: {
          status: true,
          class: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              status: true,
              course: { select: { title: true } },
              teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.classAttendee.findMany({
        where: { studentId, status: { not: null } },
        orderBy: { class: { startsAt: 'desc' } },
        take: 5,
        select: {
          status: true,
          lateMinutes: true,
          class: { select: { id: true, title: true, startsAt: true } },
        },
      }),
      this.prisma.submission.findMany({
        where: { studentId, status: { in: ['ASSIGNED', 'DRAFT'] } },
        orderBy: { assignment: { dueAt: 'asc' } },
        take: 5,
        select: {
          id: true,
          status: true,
          assignment: { select: { id: true, title: true, dueAt: true } },
        },
      }),
      this.prisma.assessment.findMany({
        where: {
          status: { in: ['PUBLISHED', 'SCHEDULED', 'LIVE'] },
          startAt: { gte: now, lte: weekAhead },
          OR: [
            { targetType: 'BATCH', batch: { students: { some: { studentId } } } },
            { targetType: 'SELECTED', targetStudentIds: { has: studentId } },
          ],
        },
        orderBy: { startAt: 'asc' },
        take: 3,
        select: { id: true, title: true, startAt: true, totalMarks: true },
      }),
      this.prisma.teacherFeedback.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          remarks: true,
          suggestions: true,
          kind: true,
          createdAt: true,
          participation: true,
          understanding: true,
          behavior: true,
        },
      }),
    ]);

    return {
      todayClasses: todayClasses
        .map((a) => ({
          id: a.class.id,
          title: a.class.title,
          subject: a.class.course.title,
          teacher: `${a.class.teacher.user.firstName} ${a.class.teacher.user.lastName}`.trim(),
          time: a.class.startsAt.toISOString(),
          classStatus: a.class.status,
          attendance: a.status,
        }))
        .sort((x, y) => x.time.localeCompare(y.time)),
      recentAttendance: recentAttendance.map((a) => ({
        id: a.class.id,
        title: a.class.title,
        at: a.class.startsAt.toISOString(),
        status: a.status,
        lateMinutes: a.lateMinutes,
      })),
      homework: homework.map((h) => ({
        id: h.assignment.id,
        title: h.assignment.title,
        dueAt: h.assignment.dueAt?.toISOString() ?? null,
        status: h.status,
      })),
      upcomingTests: upcomingTest.map((t) => ({
        id: t.id,
        title: t.title,
        at: t.startAt?.toISOString() ?? null,
        totalMarks: t.totalMarks,
      })),
      teacherRemarks: remarks.map((r) => ({
        id: r.id,
        kind: r.kind,
        remarks: r.remarks,
        suggestions: r.suggestions,
        ratings: {
          participation: r.participation,
          understanding: r.understanding,
          behavior: r.behavior,
        },
        at: r.createdAt.toISOString(),
      })),
    };
  }

  // ── Charts ─────────────────────────────────────────────────────────────────

  private async charts(studentId: string, range: ResolvedRange) {
    const edges = bucketEdges(range);

    const [attendance, marks, progress] = await Promise.all([
      Promise.all(
        edges.map(async (e) => {
          const [total, present] = await Promise.all([
            this.prisma.classAttendee.count({
              where: {
                studentId,
                class: { startsAt: { gte: e.start, lt: e.end } },
                status: { not: null },
              },
            }),
            this.prisma.classAttendee.count({
              where: {
                studentId,
                class: { startsAt: { gte: e.start, lt: e.end } },
                status: { in: PRESENT_STATES },
              },
            }),
          ]);
          return pct(present, total);
        }),
      ),
      Promise.all(
        edges.map((e) =>
          this.prisma.assessmentAttempt.aggregate({
            _avg: { percentage: true },
            where: { studentId, submittedAt: { gte: e.start, lt: e.end } },
          }),
        ),
      ),
      Promise.all(
        edges.map((e) =>
          this.prisma.progressSnapshot.aggregate({
            _avg: { overallScore: true },
            where: { studentId, periodStart: { gte: e.start, lt: e.end } },
          }),
        ),
      ),
    ]);

    return {
      attendance: edges.map((e, i) => ({ label: e.label, rate: attendance[i] })),
      marks: edges.map((e, i) => ({
        label: e.label,
        score: Math.round((marks[i]._avg.percentage ?? 0) * 10) / 10,
      })),
      progress: edges.map((e, i) => ({
        label: e.label,
        score: Math.round((progress[i]._avg.overallScore ?? 0) * 10) / 10,
      })),
    };
  }

  // ── Fee summary ────────────────────────────────────────────────────────────

  private async feeSummary(studentId: string) {
    const [unpaid, lastPayment, nextDue, receipts, profile] = await Promise.all([
      this.prisma.invoice.aggregate({
        _sum: { amount: true, paidAmount: true },
        _count: { _all: true },
        where: { studentId, status: { in: UNPAID_INVOICE } },
      }),
      this.prisma.payment.findFirst({
        where: { invoice: { studentId }, status: PaymentStatus.SUCCEEDED },
        orderBy: { paidAt: 'desc' },
        select: { amount: true, paidAt: true, method: true, invoice: { select: { number: true } } },
      }),
      this.prisma.invoice.findFirst({
        where: { studentId, status: { in: UNPAID_INVOICE }, dueAt: { not: null } },
        orderBy: { dueAt: 'asc' },
        select: { id: true, number: true, amount: true, paidAmount: true, dueAt: true },
      }),
      this.prisma.receipt.findMany({
        where: { studentId },
        orderBy: { issuedAt: 'desc' },
        take: 10,
        select: { id: true, number: true, amount: true, currency: true, method: true, issuedAt: true },
      }),
      this.prisma.studentProfile.findUnique({
        where: { id: studentId },
        select: { nextPaymentDate: true, lastPaymentDate: true },
      }),
    ]);

    const outstanding = toNumber(unpaid._sum.amount) - toNumber(unpaid._sum.paidAmount);

    return {
      outstanding: Math.max(0, outstanding),
      unpaidInvoices: unpaid._count._all,
      lastPayment: lastPayment
        ? {
            amount: toNumber(lastPayment.amount),
            at: lastPayment.paidAt?.toISOString() ?? null,
            method: lastPayment.method,
            invoiceNumber: lastPayment.invoice.number,
          }
        : null,
      nextDue: nextDue
        ? {
            invoiceId: nextDue.id,
            number: nextDue.number,
            amount: toNumber(nextDue.amount) - toNumber(nextDue.paidAmount),
            dueAt: nextDue.dueAt?.toISOString() ?? null,
          }
        : profile?.nextPaymentDate
          ? { invoiceId: null, number: null, amount: 0, dueAt: profile.nextPaymentDate.toISOString() }
          : null,
      receipts: receipts.map((r) => ({
        id: r.id,
        number: r.number,
        amount: toNumber(r.amount),
        currency: r.currency,
        method: r.method,
        issuedAt: r.issuedAt.toISOString(),
      })),
    };
  }

  // ── Quick actions ──────────────────────────────────────────────────────────

  /*
   * "Contact teacher / contact coach". There is no parent messaging module, so
   * rather than fake one this returns the real people attached to the child and
   * lets the client open a mail client. Emails come from the User rows, so they
   * are never stale.
   */
  async contacts(parentUserId: string, childId?: string) {
    const studentId = await this.assertChild(parentUserId, childId);

    const [enrollments, student] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { studentId, status: { in: ['ACTIVE', 'TRIAL'] }, teacherId: { not: null } },
        select: {
          course: { select: { title: true } },
          teacher: {
            select: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
        },
      }),
      this.prisma.studentProfile.findUnique({
        where: { id: studentId },
        select: { coachId: true },
      }),
    ]);

    // coachId is a plain id with no relation declared, so resolve it here.
    const coach = student?.coachId
      ? await this.prisma.user.findUnique({
          where: { id: student.coachId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null;

    // One teacher may take several of the child's courses; list them once.
    const byEmail = new Map<string, { name: string; email: string; courses: string[] }>();
    for (const e of enrollments) {
      if (!e.teacher) continue;
      const { firstName, lastName, email } = e.teacher.user;
      const row = byEmail.get(email) ?? {
        name: `${firstName} ${lastName}`.trim(),
        email,
        courses: [],
      };
      row.courses.push(e.course.title);
      byEmail.set(email, row);
    }

    return {
      teachers: [...byEmail.values()],
      coach: coach
        ? { name: `${coach.firstName} ${coach.lastName}`.trim(), email: coach.email }
        : null,
    };
  }

  /** A single receipt, but only if it belongs to a child of this parent. */
  async receipt(parentUserId: string, receiptId: string, childId?: string) {
    const studentId = await this.assertChild(parentUserId, childId);

    const receipt = await this.prisma.receipt.findFirst({
      // studentId in the where clause is the whole authorisation check.
      where: { id: receiptId, studentId },
      select: {
        id: true,
        number: true,
        amount: true,
        currency: true,
        method: true,
        notes: true,
        issuedAt: true,
        invoice: { select: { number: true, amount: true, dueAt: true } },
        payment: { select: { paidAt: true, reference: true } },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found for this child');

    const [child, billing] = await Promise.all([
      this.childHeader(studentId),
      this.academyBilling(),
    ]);

    return {
      id: receipt.id,
      number: receipt.number,
      amount: toNumber(receipt.amount),
      currency: receipt.currency,
      method: receipt.method,
      notes: receipt.notes,
      issuedAt: receipt.issuedAt.toISOString(),
      paidAt: receipt.payment?.paidAt?.toISOString() ?? null,
      reference: receipt.payment?.reference ?? null,
      invoice: {
        number: receipt.invoice.number,
        amount: toNumber(receipt.invoice.amount),
        dueAt: receipt.invoice.dueAt?.toISOString() ?? null,
      },
      student: { name: child.name, code: child.studentCode },
      academy: billing,
    };
  }

  /** Everything the fees page needs: invoices, receipts and how to pay. */
  async fees(parentUserId: string, childId?: string) {
    const studentId = await this.assertChild(parentUserId, childId);

    const [summary, invoices, child, billing] = await Promise.all([
      this.feeSummary(studentId),
      this.prisma.invoice.findMany({
        where: { studentId },
        orderBy: { issuedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          number: true,
          status: true,
          amount: true,
          paidAmount: true,
          issuedAt: true,
          dueAt: true,
        },
      }),
      this.childHeader(studentId),
      this.academyBilling(),
    ]);

    return {
      child,
      summary,
      academy: billing,
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        amount: toNumber(i.amount),
        paidAmount: toNumber(i.paidAmount),
        balance: Math.max(0, toNumber(i.amount) - toNumber(i.paidAmount)),
        issuedAt: i.issuedAt?.toISOString() ?? null,
        dueAt: i.dueAt?.toISOString() ?? null,
      })),
    };
  }

  /*
   * Report card. Every figure is one the child's own dashboard already shows —
   * this only assembles them into something printable, it computes no new
   * grades and invents nothing.
   */
  async reportCard(parentUserId: string, range: ResolvedRange, childId?: string) {
    const studentId = await this.assertChild(parentUserId, childId);

    const [child, cards, charts, skills, reviews, billing] = await Promise.all([
      this.childHeader(studentId),
      this.cards(studentId),
      this.charts(studentId, range),
      this.prisma.studentSkillProgress.findMany({
        where: { studentId },
        select: { skillId: true, percentage: true },
      }),
      this.prisma.monthlyReview.findMany({
        where: { studentId },
        orderBy: { periodStart: 'desc' },
        take: 3,
        select: {
          monthLabel: true,
          academic: true,
          attendance: true,
          behavior: true,
          participation: true,
          remarks: true,
        },
      }),
      this.academyBilling(),
    ]);

    // StudentSkillProgress stores only skillId, so resolve the names separately.
    const skillRows = await this.prisma.progressSkill.findMany({
      where: { id: { in: skills.map((s) => s.skillId) } },
      select: { id: true, name: true },
    });
    const skillNames = new Map(skillRows.map((s) => [s.id, s.name]));

    return {
      generatedAt: new Date().toISOString(),
      range: range.key,
      academy: billing,
      child,
      summary: cards,
      trends: charts,
      skills: skills.map((s) => ({
        name: skillNames.get(s.skillId) ?? 'Skill',
        percentage: s.percentage,
      })),
      reviews,
    };
  }

  /** Academy identity, shared by receipts and report cards. */
  private async academyBilling() {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'ACADEMY_BILLING_NAME',
            'ACADEMY_BILLING_ADDRESS',
            'ACADEMY_BILLING_PHONE',
            'ACADEMY_BILLING_EMAIL',
          ],
        },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      name: map.get('ACADEMY_BILLING_NAME') ?? '',
      address: map.get('ACADEMY_BILLING_ADDRESS') ?? '',
      phone: map.get('ACADEMY_BILLING_PHONE') ?? '',
      email: map.get('ACADEMY_BILLING_EMAIL') ?? '',
    };
  }
}
