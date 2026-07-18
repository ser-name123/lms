import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationCategory as Cat,
  NotificationChannel as Ch,
  NotificationPriority as Pri,
  NotificationStatus as St,
  Role,
} from '../generated/prisma/enums';
import { NotificationEngineService } from './engine.service';
import { NotificationStreamService } from './stream.service';

/*
 * The façade 16 other services already inject.
 *
 * `createFor` / `createForRoles` keep their original signatures — the ~49
 * existing call sites were not touched — but now run through the engine, so
 * every one of them gained category, priority, per-channel delivery, user
 * preferences and real-time streaming for free. The type registry
 * (registry.ts) is what supplies the classification.
 */

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  /** Escape hatches for callers that know better than the registry. */
  category?: Cat;
  priority?: Pri;
  channels?: Ch[];
  actorId?: string;
  actorName?: string;
  meta?: Record<string, unknown>;
}

export interface NotificationFilter {
  limit?: number;
  cursor?: string;
  category?: Cat;
  priority?: Pri;
  unreadOnly?: boolean;
  includeArchived?: boolean;
  q?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: NotificationEngineService,
    private readonly stream: NotificationStreamService,
  ) {}

  /** Deliver one notification to a specific user. */
  async createFor(userId: string, input: NotifyInput) {
    const { notificationIds } = await this.engine.dispatch([userId], input);
    return { id: notificationIds[0] ?? null, delivered: notificationIds.length > 0 };
  }

  /** Fan a notification out to every user in the given roles. */
  async createForRoles(roles: Role[], input: NotifyInput) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: roles }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!users.length) return { count: 0 };
    const result = await this.engine.dispatch(
      users.map((u) => u.id),
      input,
    );
    return { count: result.created, suppressed: result.suppressed };
  }

  /** Deliver to an explicit set of users (used by broadcasts and role compose). */
  async createForUsers(userIds: string[], input: NotifyInput & { broadcastId?: string }) {
    return this.engine.dispatch(userIds, input);
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /**
   * The user's own feed. Ordering puts CRITICAL first regardless of age — the
   * spec requires critical notifications to sit at the top — then newest first.
   */
  async list(userId: string, filter: NotificationFilter = {}) {
    const limit = Math.min(Math.max(filter.limit ?? 30, 1), 100);
    const where = {
      userId,
      ...(filter.includeArchived ? {} : { archivedAt: null }),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.unreadOnly ? { read: false } : {}),
      ...(filter.q
        ? {
            OR: [
              { title: { contains: filter.q, mode: 'insensitive' as const } },
              { body: { contains: filter.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  /**
   * Kept returning a bare array because the topbar bell and the dashboard
   * widget both call it that way. New screens use `list`.
   */
  async listSimple(userId: string, limit = 30) {
    const { items } = await this.list(userId, { limit });
    return items;
  }

  async unreadCount(userId: string) {
    const [count, critical] = await Promise.all([
      this.prisma.notification.count({ where: { userId, read: false, archivedAt: null } }),
      this.prisma.notification.count({
        where: { userId, read: false, archivedAt: null, priority: Pri.CRITICAL },
      }),
    ]);
    return { count, critical };
  }

  /** Per-category unread counts — drives the inbox filter chips. */
  async summary(userId: string) {
    const grouped = await this.prisma.notification.groupBy({
      by: ['category'],
      where: { userId, archivedAt: null },
      _count: { _all: true },
    });
    const unread = await this.prisma.notification.groupBy({
      by: ['category'],
      where: { userId, archivedAt: null, read: false },
      _count: { _all: true },
    });
    const unreadByCat = new Map(unread.map((u) => [u.category, u._count._all]));
    return Object.values(Cat).map((category) => ({
      category,
      total: grouped.find((g) => g.category === category)?._count._all ?? 0,
      unread: unreadByCat.get(category) ?? 0,
    }));
  }

  // ── Mutating ───────────────────────────────────────────────────────────────

  async markRead(id: string, userId: string) {
    const now = new Date();
    // Ownership is enforced by the where clause, so a foreign id is a no-op
    // rather than an error that would confirm the row exists.
    await this.prisma.notification.updateMany({
      where: { id, userId, read: false },
      data: { read: true, readAt: now, status: St.READ },
    });
    await this.prisma.notificationDelivery
      .updateMany({
        where: { notificationId: id, channel: Ch.IN_APP },
        data: { status: St.READ },
      })
      .catch(() => undefined);
    this.stream.publish({ userId, kind: 'read', payload: { id } });
    return { success: true };
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, read: false, archivedAt: null },
      data: { read: true, readAt: now, status: St.READ },
    });
    this.stream.publish({ userId, kind: 'read-all', payload: { count } });
    return { success: true, count };
  }

  /** Archive hides a notification from the feed without destroying history. */
  async archive(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, archivedAt: null },
      data: { archivedAt: new Date(), status: St.ARCHIVED },
    });
    return { success: true };
  }

  async archiveAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, read: true, archivedAt: null },
      data: { archivedAt: new Date(), status: St.ARCHIVED },
    });
    return { success: true, count };
  }
}
