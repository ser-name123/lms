import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { TRAINING_TYPES, round2 } from './meetings.config';

/**
 * The six reports of 8.11.
 *
 * All of them read across meetings, which is why they are not on
 * `MeetingsService` — that service acts on one meeting and checks one set of
 * permissions. These are staff-only aggregates and are guarded at the route.
 *
 * A rule that runs through every figure here: only meetings that actually
 * HAPPENED count. A cancelled meeting nobody attended is not a missed meeting,
 * and counting it would push every teacher's attendance percentage down for a
 * decision the academy made.
 */
@Injectable()
export class MeetingReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private window(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 90 * 86_400_000);
    return { gte: start, lte: end };
  }

  /** Countable = ran or is over, and was not cancelled. */
  private countableWhere(window: { gte: Date; lte: Date }) {
    return {
      startsAt: window,
      status: { in: ['COMPLETED', 'LIVE'] as never[] },
    };
  }

  // ── 1. Meeting attendance report ──────────────────────────────────────────

  async attendanceReport(from?: string, to?: string, type?: string) {
    const window = this.window(from, to);
    const meetings = await this.prisma.staffMeeting.findMany({
      where: { ...this.countableWhere(window), ...(type ? { type: type as never } : {}) },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true, title: true, type: true, startsAt: true, durationMins: true, status: true,
        organizerName: true, minutesStatus: true,
        participants: { select: { status: true, durationMins: true, isOptional: true } },
      },
    });

    return meetings.map((m) => {
      const total = m.participants.length;
      const present = m.participants.filter((p) => p.status === 'PRESENT').length;
      const late = m.participants.filter((p) => p.status === 'LATE').length;
      const absent = m.participants.filter((p) => p.status === 'ABSENT').length;
      const excused = m.participants.filter((p) => p.status === 'EXCUSED').length;
      const optional = m.participants.filter((p) => p.isOptional).length;
      /*
       * The rate is computed over the people who were REQUIRED: it drops both
       * the excused (an approved absence should neither reward the figure nor
       * punish it) and §8.2's optional attendees, who were told they need not
       * come — inviting an optional observer must not look like a failure.
       *
       * Both sides of the fraction are restricted, not just the denominator.
       * Counting an optional attendee who turned up in the numerator while
       * leaving them out of the denominator would print attendance above 100%.
       */
      const required = m.participants.filter((p) => !p.isOptional && p.status !== 'EXCUSED');
      const expected = required.length;
      const attended = required.filter((p) => p.status === 'PRESENT' || p.status === 'LATE').length;
      return {
        id: m.id,
        title: m.title,
        type: m.type,
        startsAt: m.startsAt,
        durationMins: m.durationMins,
        organizerName: m.organizerName,
        minutesStatus: m.minutesStatus,
        invited: total,
        present,
        late,
        absent,
        excused,
        optional,
        expected,
        attendancePct: expected > 0 ? round2((attended / expected) * 100) : 0,
        avgMinutes: total
          ? Math.round(m.participants.reduce((a, p) => a + p.durationMins, 0) / total)
          : 0,
      };
    });
  }

  // ── 2. Staff attendance percentage ────────────────────────────────────────

  async staffAttendance(from?: string, to?: string, role?: string) {
    const window = this.window(from, to);
    const rows = await this.prisma.staffMeetingParticipant.findMany({
      where: {
        meeting: this.countableWhere(window),
        ...(role ? { role: role as never } : {}),
      },
      select: {
        userId: true, role: true, status: true, durationMins: true, lateMinutes: true,
        isOptional: true,
        user: { select: { firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });

    const byUser = new Map<string, {
      userId: string; name: string; email: string; avatarUrl: string | null; role: string;
      invited: number; present: number; late: number; absent: number; excused: number;
      optional: number; expected: number; attended: number;
      totalMinutes: number; totalLateMinutes: number;
    }>();

    for (const r of rows) {
      const key = r.userId;
      if (!byUser.has(key)) {
        byUser.set(key, {
          userId: r.userId,
          name: `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email,
          email: r.user.email,
          avatarUrl: r.user.avatarUrl,
          role: r.role,
          invited: 0, present: 0, late: 0, absent: 0, excused: 0, optional: 0,
          expected: 0, attended: 0, totalMinutes: 0, totalLateMinutes: 0,
        });
      }
      const acc = byUser.get(key)!;
      acc.invited += 1;
      if (r.isOptional) acc.optional += 1;
      if (r.status === 'PRESENT') acc.present += 1;
      else if (r.status === 'LATE') acc.late += 1;
      else if (r.status === 'ABSENT') acc.absent += 1;
      else if (r.status === 'EXCUSED') acc.excused += 1;
      /*
       * "Of the meetings you had to be at, how many did you attend." Optional
       * invitations and excused absences are dropped from BOTH sides — counted
       * on one side only, a diligent optional observer would score over 100%.
       */
      if (!r.isOptional && r.status !== 'EXCUSED') {
        acc.expected += 1;
        if (r.status === 'PRESENT' || r.status === 'LATE') acc.attended += 1;
      }
      acc.totalMinutes += r.durationMins;
      acc.totalLateMinutes += r.lateMinutes;
    }

    return [...byUser.values()]
      .map((u) => {
        return {
          ...u,
          attendancePct: u.expected > 0 ? round2((u.attended / u.expected) * 100) : 0,
          punctualityPct: u.present + u.late > 0 ? round2((u.present / (u.present + u.late)) * 100) : 0,
          avgLateMinutes: u.late > 0 ? Math.round(u.totalLateMinutes / u.late) : 0,
        };
      })
      .sort((a, b) => b.attendancePct - a.attendancePct || a.name.localeCompare(b.name));
  }

  // ── 3. Missed meetings ────────────────────────────────────────────────────

  async missedMeetings(from?: string, to?: string) {
    const window = this.window(from, to);
    const rows = await this.prisma.staffMeetingParticipant.findMany({
      // Optional invitees are left out: they were told they need not attend, so
      // listing them here would put people on a missed-meetings report for
      // declining an invitation that was never binding.
      where: { status: 'ABSENT', isOptional: false, meeting: this.countableWhere(window) },
      orderBy: { meeting: { startsAt: 'desc' } },
      take: 500,
      select: {
        userId: true, role: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        meeting: { select: { id: true, title: true, type: true, startsAt: true } },
      },
    });

    const byUser = new Map<string, { userId: string; name: string; role: string; missed: number; meetings: unknown[] }>();
    for (const r of rows) {
      if (!byUser.has(r.userId)) {
        byUser.set(r.userId, {
          userId: r.userId,
          name: `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email,
          role: r.role,
          missed: 0,
          meetings: [],
        });
      }
      const acc = byUser.get(r.userId)!;
      acc.missed += 1;
      acc.meetings.push(r.meeting);
    }

    return {
      total: rows.length,
      byUser: [...byUser.values()].sort((a, b) => b.missed - a.missed),
      recent: rows.slice(0, 50).map((r) => ({
        userId: r.userId,
        name: `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email,
        role: r.role,
        meeting: r.meeting,
      })),
    };
  }

  // ── 4. Meeting minutes report ─────────────────────────────────────────────

  async minutesReport(from?: string, to?: string) {
    const window = this.window(from, to);
    const meetings = await this.prisma.staffMeeting.findMany({
      where: { startsAt: window, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true, title: true, type: true, startsAt: true, status: true,
        minutesStatus: true, minutesPublishedAt: true, minutesByName: true,
        summary: true, organizerName: true,
        _count: { select: { actionItems: true } },
      },
    });

    const now = new Date();
    const rows = meetings.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      startsAt: m.startsAt,
      status: m.status,
      organizerName: m.organizerName,
      minutesStatus: m.minutesStatus,
      publishedAt: m.minutesPublishedAt,
      byName: m.minutesByName,
      hasSummary: !!m.summary?.trim(),
      actionItems: m._count.actionItems,
      // The figure a supervisor is actually chasing: a meeting that has been
      // and gone with no minutes written.
      outstanding: m.startsAt < now && m.minutesStatus !== 'PUBLISHED',
    }));

    const past = rows.filter((r) => r.startsAt < now);
    return {
      rows,
      total: rows.length,
      published: rows.filter((r) => r.minutesStatus === 'PUBLISHED').length,
      draft: rows.filter((r) => r.minutesStatus === 'DRAFT').length,
      outstanding: rows.filter((r) => r.outstanding).length,
      compliancePct: past.length
        ? round2((past.filter((r) => r.minutesStatus === 'PUBLISHED').length / past.length) * 100)
        : 0,
    };
  }

  // ── 5. Action item status report ──────────────────────────────────────────

  async actionItemReport(from?: string, to?: string, assignedToId?: string) {
    const window = this.window(from, to);
    const items = await this.prisma.meetingActionItem.findMany({
      where: {
        meeting: { startsAt: window },
        ...(assignedToId ? { assignedToId } : {}),
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      include: { meeting: { select: { id: true, title: true, startsAt: true, type: true } } },
    });

    const now = new Date();
    const shaped = items.map((a) => ({
      id: a.id,
      description: a.description,
      assignedToId: a.assignedToId,
      assignedToName: a.assignedToName,
      dueDate: a.dueDate,
      priority: a.priority,
      status: a.status,
      completedAt: a.completedAt,
      overdue: !!a.dueDate && a.dueDate < now && a.status !== 'COMPLETED' && a.status !== 'CANCELLED',
      meeting: a.meeting,
    }));

    const byStatus: Record<string, number> = { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const a of shaped) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;

    const byAssignee = new Map<string, { name: string; total: number; completed: number; overdue: number }>();
    for (const a of shaped) {
      const key = a.assignedToId ?? 'unassigned';
      if (!byAssignee.has(key)) {
        byAssignee.set(key, { name: a.assignedToName ?? 'Unassigned', total: 0, completed: 0, overdue: 0 });
      }
      const acc = byAssignee.get(key)!;
      acc.total += 1;
      if (a.status === 'COMPLETED') acc.completed += 1;
      if (a.overdue) acc.overdue += 1;
    }

    // Cancelled items are excluded from the completion rate: they were called
    // off, not left undone, and counting them as failures is simply wrong.
    const live = shaped.filter((a) => a.status !== 'CANCELLED');
    return {
      items: shaped,
      total: shaped.length,
      byStatus,
      overdue: shaped.filter((a) => a.overdue).length,
      completionPct: live.length
        ? round2((live.filter((a) => a.status === 'COMPLETED').length / live.length) * 100)
        : 0,
      byAssignee: [...byAssignee.entries()]
        .map(([id, v]) => ({
          assignedToId: id === 'unassigned' ? null : id,
          ...v,
          completionPct: v.total ? round2((v.completed / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  // ── 6. Training attendance report ─────────────────────────────────────────

  async trainingReport(from?: string, to?: string) {
    const window = this.window(from, to);
    const sessions = await this.prisma.staffMeeting.findMany({
      where: {
        type: { in: TRAINING_TYPES as never[] },
        ...this.countableWhere(window),
      },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true, title: true, startsAt: true, durationMins: true,
        participants: {
          select: {
            userId: true, role: true, status: true, durationMins: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    const byStaff = new Map<string, { userId: string; name: string; role: string; attended: number; invited: number; minutes: number }>();
    for (const s of sessions) {
      for (const p of s.participants) {
        if (!byStaff.has(p.userId)) {
          byStaff.set(p.userId, {
            userId: p.userId,
            name: `${p.user.firstName ?? ''} ${p.user.lastName ?? ''}`.trim() || p.user.email,
            role: p.role,
            attended: 0, invited: 0, minutes: 0,
          });
        }
        const acc = byStaff.get(p.userId)!;
        acc.invited += 1;
        if (p.status === 'PRESENT' || p.status === 'LATE') {
          acc.attended += 1;
          acc.minutes += p.durationMins;
        }
      }
    }

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        startsAt: s.startsAt,
        durationMins: s.durationMins,
        invited: s.participants.length,
        attended: s.participants.filter((p) => p.status === 'PRESENT' || p.status === 'LATE').length,
      })),
      totalSessions: sessions.length,
      staff: [...byStaff.values()]
        .map((s) => ({
          ...s,
          attendancePct: s.invited ? round2((s.attended / s.invited) * 100) : 0,
          hours: round2(s.minutes / 60),
        }))
        .sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name)),
    };
  }

  // ── Dashboard summary ─────────────────────────────────────────────────────

  async dashboard() {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [upcoming, live, thisMonth, cancelled, minutesDue, openActions, overdueActions] = await Promise.all([
      this.prisma.staffMeeting.count({ where: { status: 'SCHEDULED', startsAt: { gte: now } } }),
      this.prisma.staffMeeting.count({ where: { status: 'LIVE' } }),
      this.prisma.staffMeeting.count({ where: { startsAt: { gte: monthAgo, lte: now }, status: { not: 'CANCELLED' } } }),
      this.prisma.staffMeeting.count({ where: { status: 'CANCELLED', startsAt: { gte: monthAgo } } }),
      this.prisma.staffMeeting.count({
        where: { endsAt: { lt: now }, status: { not: 'CANCELLED' }, minutesStatus: { not: 'PUBLISHED' } },
      }),
      this.prisma.meetingActionItem.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      this.prisma.meetingActionItem.count({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
      }),
    ]);

    const staff = await this.staffAttendance(monthAgo.toISOString(), now.toISOString());
    const avgAttendance = staff.length
      ? round2(staff.reduce((a, s) => a + s.attendancePct, 0) / staff.length)
      : 0;

    return {
      upcoming,
      live,
      thisMonth,
      cancelled,
      minutesDue,
      openActions,
      overdueActions,
      avgAttendancePct: avgAttendance,
      lowestAttenders: staff.slice(-5).reverse().filter((s) => s.expected > 0),
    };
  }

  /** The teacher's / coach's own numbers, for their portal header. */
  async myStats(userId: string) {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 90 * 86_400_000);

    const [upcoming, rows, openActions, overdueActions] = await Promise.all([
      this.prisma.staffMeeting.count({
        where: { participants: { some: { userId } }, status: 'SCHEDULED', startsAt: { gte: now } },
      }),
      this.prisma.staffMeetingParticipant.findMany({
        where: { userId, meeting: this.countableWhere({ gte: monthAgo, lte: now }) },
        select: { status: true, isOptional: true },
      }),
      this.prisma.meetingActionItem.count({
        where: { assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      }),
      this.prisma.meetingActionItem.count({
        where: { assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
      }),
    ]);

    // Same rule the reports use: the percentage is over the meetings this
    // person was REQUIRED at, so optional invitations and excused absences come
    // off both sides. The raw attended/missed counts stay honest to what
    // happened, optional or not.
    const required = rows.filter((r) => !r.isOptional && r.status !== 'EXCUSED');
    const expected = required.length;
    const attendedRequired = required.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const attended = rows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;

    return {
      upcoming,
      attended,
      missed: required.filter((r) => r.status === 'ABSENT').length,
      attendancePct: expected > 0 ? round2((attendedRequired / expected) * 100) : 0,
      openActions,
      overdueActions,
    };
  }
}
