import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationCategory as Cat,
  NotificationChannel as Ch,
  NotificationPriority as Pri,
  NotificationStatus as St,
  Role,
} from '../generated/prisma/enums';
import { NotificationChannelsService } from './channels.service';
import { NotificationStreamService } from './stream.service';
import { AnalyticsDto, NotificationCentreDto, ReportKind } from './dto';
import { listTypes } from './registry';

/*
 * The admin notification dashboard: KPI cards, the notification centre table,
 * delivery logs, analytics charts and downloadable reports.
 *
 * Every number is computed in the database. Rates are computed from the same
 * denominators the cards show, so a card and a chart can never disagree.
 */

const DAY = 86_400_000;

function resolveWindow(dto: AnalyticsDto) {
  const to = dto.to ? new Date(dto.to) : new Date();
  if (dto.from) return { from: new Date(dto.from), to };
  const days = dto.range === '7d' ? 7 : dto.range === '90d' ? 90 : dto.range === '12m' ? 365 : 30;
  return { from: new Date(to.getTime() - days * DAY), to };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

@Injectable()
export class NotificationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: NotificationChannelsService,
    private readonly stream: NotificationStreamService,
  ) {}

  // ── Dashboard cards ────────────────────────────────────────────────────────

  async dashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [today, unread, total, read, failed, queued, scheduled, health] = await Promise.all([
      this.prisma.notification.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.notification.count({ where: { read: false, archivedAt: null } }),
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { read: true } }),
      this.prisma.notificationDelivery.count({ where: { status: St.FAILED } }),
      this.prisma.notificationDelivery.count({ where: { status: St.QUEUED } }),
      this.prisma.notificationBroadcast.count({ where: { status: St.SCHEDULED } }),
      this.channels.channelHealth(),
    ]);

    // Delivered = every channel attempt that actually left the building.
    const [deliveryTotal, deliverySent] = await Promise.all([
      this.prisma.notificationDelivery.count(),
      this.prisma.notificationDelivery.count({
        where: { status: { in: [St.SENT, St.DELIVERED, St.READ] } },
      }),
    ]);

    return {
      cards: {
        todayNotifications: today,
        failed,
        unread,
        queued,
        delivered: deliverySent,
        readRate: pct(read, total),
        deliveryRate: pct(deliverySent, deliveryTotal),
        scheduledBroadcasts: scheduled,
      },
      channels: health,
      realtime: this.stream.stats(),
    };
  }

  // ── Notification centre (the admin table) ──────────────────────────────────

  async centre(dto: NotificationCentreDto) {
    const limit = Math.min(dto.limit ?? 50, 200);
    const offset = dto.offset ?? 0;

    const where = {
      ...(dto.category ? { category: dto.category } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.role ? { user: { role: dto.role } } : {}),
      ...(dto.channel ? { deliveries: { some: { channel: dto.channel } } } : {}),
      ...(dto.from || dto.to
        ? {
            createdAt: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
      ...(dto.q
        ? {
            OR: [
              { title: { contains: dto.q, mode: 'insensitive' as const } },
              { body: { contains: dto.q, mode: 'insensitive' as const } },
              { user: { email: { contains: dto.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          category: true,
          priority: true,
          status: true,
          read: true,
          readAt: true,
          createdAt: true,
          actorName: true,
          broadcastId: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          deliveries: {
            select: { channel: true, status: true, attempts: true, lastError: true, skippedReason: true, sentAt: true },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      total,
      limit,
      offset,
      items: rows.map((n) => ({
        id: n.id,
        time: n.createdAt.toISOString(),
        user: {
          id: n.user.id,
          name: `${n.user.firstName} ${n.user.lastName}`.trim(),
          email: n.user.email,
          role: n.user.role,
        },
        title: n.title,
        body: n.body,
        link: n.link,
        type: n.type,
        category: n.category,
        priority: n.priority,
        status: n.status,
        read: n.read,
        readAt: n.readAt?.toISOString() ?? null,
        actorName: n.actorName,
        broadcastId: n.broadcastId,
        channels: n.deliveries.map((d) => ({
          channel: d.channel,
          status: d.status,
          attempts: d.attempts,
          error: d.lastError,
          skipped: d.skippedReason,
          sentAt: d.sentAt?.toISOString() ?? null,
        })),
      })),
    };
  }

  /** The failure queue the admin retries from. */
  async failures(limit = 100) {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { status: St.FAILED },
      orderBy: { queuedAt: 'desc' },
      take: Math.min(limit, 500),
      include: {
        notification: {
          select: {
            id: true,
            title: true,
            type: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true, email: true, role: true } },
          },
        },
      },
    });
    return rows.map((d) => ({
      deliveryId: d.id,
      notificationId: d.notificationId,
      channel: d.channel,
      attempts: d.attempts,
      error: d.lastError,
      target: d.target,
      failedAt: d.failedAt?.toISOString() ?? null,
      title: d.notification.title,
      type: d.notification.type,
      recipient: {
        name: `${d.notification.user.firstName} ${d.notification.user.lastName}`.trim(),
        email: d.notification.user.email,
        role: d.notification.user.role,
      },
    }));
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  async analytics(dto: AnalyticsDto) {
    const { from, to } = resolveWindow(dto);

    const [notifications, deliveries, byCategory, byPriority] = await Promise.all([
      this.prisma.notification.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, read: true, readAt: true, category: true, priority: true, user: { select: { role: true } } },
      }),
      this.prisma.notificationDelivery.findMany({
        where: { queuedAt: { gte: from, lte: to } },
        select: { channel: true, status: true, queuedAt: true },
      }),
      this.prisma.notification.groupBy({
        by: ['category'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.notification.groupBy({
        by: ['priority'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    const total = notifications.length;
    const readRows = notifications.filter((n) => n.read);
    const DELIVERED_STATES: St[] = [St.SENT, St.DELIVERED, St.READ];
    const sent = deliveries.filter((d) => DELIVERED_STATES.includes(d.status)).length;
    const failed = deliveries.filter((d) => d.status === St.FAILED).length;

    /*
     * Average read time uses only rows that actually have a readAt. Counting
     * unread rows as "not yet read" would drag the average toward infinity and
     * make the number meaningless.
     */
    const readDurations = readRows
      .filter((n) => n.readAt)
      .map((n) => n.readAt!.getTime() - n.createdAt.getTime())
      .filter((ms) => ms >= 0);
    const avgReadMs = readDurations.length
      ? Math.round(readDurations.reduce((a, b) => a + b, 0) / readDurations.length)
      : 0;

    // Daily buckets across the window.
    const days: string[] = [];
    for (let t = new Date(from).setHours(0, 0, 0, 0); t <= to.getTime(); t += DAY) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    const dailyCount = new Map(days.map((d) => [d, 0]));
    const dailyRead = new Map(days.map((d) => [d, 0]));
    for (const n of notifications) {
      const k = dayKey(n.createdAt);
      if (dailyCount.has(k)) dailyCount.set(k, dailyCount.get(k)! + 1);
      if (n.read && dailyRead.has(k)) dailyRead.set(k, dailyRead.get(k)! + 1);
    }
    const dailyFailed = new Map(days.map((d) => [d, 0]));
    const dailyDeliveries = new Map(days.map((d) => [d, 0]));
    for (const d of deliveries) {
      const k = dayKey(d.queuedAt);
      if (dailyDeliveries.has(k)) dailyDeliveries.set(k, dailyDeliveries.get(k)! + 1);
      if (d.status === St.FAILED && dailyFailed.has(k)) dailyFailed.set(k, dailyFailed.get(k)! + 1);
    }

    const label = (iso: string) =>
      new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    const roleCounts = new Map<Role, number>();
    for (const n of notifications) {
      roleCounts.set(n.user.role, (roleCounts.get(n.user.role) ?? 0) + 1);
    }

    const channelCounts = new Map<Ch, number>();
    for (const d of deliveries) channelCounts.set(d.channel, (channelCounts.get(d.channel) ?? 0) + 1);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      cards: {
        total,
        deliveryRate: pct(sent, deliveries.length),
        readRate: pct(readRows.length, total),
        failureRate: pct(failed, deliveries.length),
        avgReadMinutes: Math.round(avgReadMs / 60_000),
      },
      charts: {
        daily: days.map((d) => ({ label: label(d), count: dailyCount.get(d) ?? 0 })),
        channelUsage: [...channelCounts.entries()].map(([name, value]) => ({ name, value })),
        byRole: [...roleCounts.entries()].map(([name, value]) => ({ name, value })),
        readTrend: days.map((d) => ({
          label: label(d),
          rate: pct(dailyRead.get(d) ?? 0, dailyCount.get(d) ?? 0),
        })),
        failureTrend: days.map((d) => ({
          label: label(d),
          rate: pct(dailyFailed.get(d) ?? 0, dailyDeliveries.get(d) ?? 0),
        })),
        byCategory: byCategory.map((c) => ({ name: c.category, value: c._count._all })),
        byPriority: byPriority.map((p) => ({ name: p.priority, value: p._count._all })),
      },
    };
  }

  // ── Reports (consumed by the CSV download widget) ──────────────────────────

  async report(kind: ReportKind, dto: AnalyticsDto) {
    const { from, to } = resolveWindow(dto);
    const window = { gte: from, lte: to };

    switch (kind) {
      case 'daily': {
        const a = await this.analytics(dto);
        return {
          columns: ['Date', 'Notifications', 'Read rate %', 'Failure rate %'],
          rows: a.charts.daily.map((d, i) => ({
            Date: d.label,
            Notifications: d.count,
            'Read rate %': a.charts.readTrend[i]?.rate ?? 0,
            'Failure rate %': a.charts.failureTrend[i]?.rate ?? 0,
          })),
        };
      }

      case 'delivery': {
        const rows = await this.prisma.notificationDelivery.groupBy({
          by: ['channel', 'status'],
          where: { queuedAt: window },
          _count: { _all: true },
        });
        return {
          columns: ['Channel', 'Status', 'Count'],
          rows: rows.map((r) => ({ Channel: r.channel, Status: r.status, Count: r._count._all })),
        };
      }

      case 'read': {
        const rows = await this.prisma.notification.groupBy({
          by: ['category'],
          where: { createdAt: window },
          _count: { _all: true },
        });
        const readRows = await this.prisma.notification.groupBy({
          by: ['category'],
          where: { createdAt: window, read: true },
          _count: { _all: true },
        });
        const readByCat = new Map(readRows.map((r) => [r.category, r._count._all]));
        return {
          columns: ['Category', 'Sent', 'Read', 'Read rate %'],
          rows: rows.map((r) => ({
            Category: r.category,
            Sent: r._count._all,
            Read: readByCat.get(r.category) ?? 0,
            'Read rate %': pct(readByCat.get(r.category) ?? 0, r._count._all),
          })),
        };
      }

      case 'failure': {
        const rows = await this.failures(500);
        return {
          columns: ['Failed at', 'Channel', 'Type', 'Recipient', 'Email', 'Attempts', 'Error'],
          rows: rows.map((r) => ({
            'Failed at': r.failedAt ?? '',
            Channel: r.channel,
            Type: r.type,
            Recipient: r.recipient.name,
            Email: r.recipient.email,
            Attempts: r.attempts,
            Error: r.error ?? '',
          })),
        };
      }

      case 'engagement': {
        const grouped = await this.prisma.notification.groupBy({
          by: ['userId'],
          where: { createdAt: window },
          _count: { _all: true },
        });
        const readGrouped = await this.prisma.notification.groupBy({
          by: ['userId'],
          where: { createdAt: window, read: true },
          _count: { _all: true },
        });
        const readByUser = new Map(readGrouped.map((r) => [r.userId, r._count._all]));
        const users = await this.prisma.user.findMany({
          where: { id: { in: grouped.map((g) => g.userId) } },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        });
        const byId = new Map(users.map((u) => [u.id, u]));
        return {
          columns: ['User', 'Email', 'Role', 'Received', 'Read', 'Read rate %'],
          rows: grouped
            .map((g) => {
              const u = byId.get(g.userId);
              const readCount = readByUser.get(g.userId) ?? 0;
              return {
                User: u ? `${u.firstName} ${u.lastName}`.trim() : g.userId,
                Email: u?.email ?? '',
                Role: u?.role ?? '',
                Received: g._count._all,
                Read: readCount,
                'Read rate %': pct(readCount, g._count._all),
              };
            })
            .sort((a, b) => b.Received - a.Received),
        };
      }

      case 'channel':
      default: {
        const rows = await this.prisma.notificationDelivery.groupBy({
          by: ['channel'],
          where: { queuedAt: window },
          _count: { _all: true },
        });
        const sentRows = await this.prisma.notificationDelivery.groupBy({
          by: ['channel'],
          where: { queuedAt: window, status: { in: [St.SENT, St.DELIVERED, St.READ] } },
          _count: { _all: true },
        });
        const sentByCh = new Map(sentRows.map((r) => [r.channel, r._count._all]));
        return {
          columns: ['Channel', 'Attempts', 'Delivered', 'Delivery rate %'],
          rows: rows.map((r) => ({
            Channel: r.channel,
            Attempts: r._count._all,
            Delivered: sentByCh.get(r.channel) ?? 0,
            'Delivery rate %': pct(sentByCh.get(r.channel) ?? 0, r._count._all),
          })),
        };
      }
    }
  }

  /*
   * Courses, batches and students for the broadcast audience picker.
   *
   * Deliberately served from this module rather than reusing /attendance/batches
   * or /students: those are ADMIN + ACADEMIC_COACH, while broadcasting is
   * ADMIN + SUPERVISOR, so a supervisor would hit 403 on the dropdown for a
   * screen they are otherwise allowed to use.
   */
  async audienceOptions(q?: string) {
    const term = q?.trim();
    const [courses, batches, students] = await Promise.all([
      this.prisma.course.findMany({
        orderBy: { title: 'asc' },
        select: { id: true, title: true },
      }),
      this.prisma.batch.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, course: { select: { title: true } } },
      }),
      this.prisma.studentProfile.findMany({
        where: term
          ? {
              OR: [
                { studentCode: { contains: term, mode: 'insensitive' } },
                { user: { firstName: { contains: term, mode: 'insensitive' } } },
                { user: { lastName: { contains: term, mode: 'insensitive' } } },
                { user: { email: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {},
        orderBy: { studentCode: 'asc' },
        take: term ? 50 : 200,
        select: {
          id: true,
          studentCode: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return {
      courses,
      batches: batches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        course: b.course.title,
      })),
      students: students.map((s) => ({
        id: s.id,
        studentCode: s.studentCode,
        name: `${s.user.firstName} ${s.user.lastName}`.trim(),
        email: s.user.email,
      })),
    };
  }

  /** Registry + enum vocabulary, so the admin filters are never hardcoded. */
  meta() {
    return {
      types: listTypes(),
      categories: Object.values(Cat),
      priorities: Object.values(Pri),
      statuses: Object.values(St),
      channels: Object.values(Ch),
      roles: Object.values(Role),
    };
  }
}
