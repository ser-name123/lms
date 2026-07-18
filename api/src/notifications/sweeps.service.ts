import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel as Ch, NotificationStatus as St } from '../generated/prisma/enums';
import { NotificationChannelsService } from './channels.service';
import { NotificationBroadcastService } from './broadcast.service';

/*
 * Two background passes, following the project's setInterval convention (no
 * @nestjs/schedule anywhere in this codebase):
 *
 *   1. Scheduled broadcasts whose time has arrived.
 *   2. Failed channel deliveries, retried with a widening backoff.
 *
 * Both are per-process, like the nine sweeps that already exist here. With more
 * than one API instance they would double-fire; that is a known, documented
 * property of this deployment, not an oversight.
 */

const MAX_ATTEMPTS = 4;
/** Minutes to wait before attempt N. A dead SMTP host should not be hammered. */
const BACKOFF_MINUTES = [1, 5, 20, 60];

@Injectable()
export class NotificationSweepsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationSweepsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: NotificationChannelsService,
    private readonly broadcasts: NotificationBroadcastService,
  ) {}

  onModuleInit() {
    // Staggered start so boot is not a thundering herd against the DB.
    setTimeout(() => {
      setInterval(() => this.dispatchScheduled().catch(() => undefined), 60_000).unref();
      setInterval(() => this.retryFailed().catch(() => undefined), 5 * 60_000).unref();
    }, 25_000).unref();
  }

  /** Send any broadcast whose scheduledAt has passed. */
  async dispatchScheduled() {
    const due = await this.broadcasts.due();
    let sent = 0;
    for (const b of due) {
      try {
        await this.broadcasts.run(b.id);
        sent++;
      } catch (e) {
        this.logger.warn(
          `Scheduled broadcast ${b.id} failed: ${e instanceof Error ? e.message : e}`,
        );
        await this.prisma.notificationBroadcast
          .update({ where: { id: b.id }, data: { status: St.FAILED } })
          .catch(() => undefined);
      }
    }
    if (sent) this.logger.log(`Dispatched ${sent} scheduled broadcast(s)`);
    return { dispatched: sent, due: due.length };
  }

  /**
   * Retry failed deliveries that are past their backoff and under the attempt
   * cap. IN_APP is excluded — it never leaves the database, so a failure there
   * is not a transport problem a retry would fix.
   */
  async retryFailed() {
    const now = Date.now();
    const candidates = await this.prisma.notificationDelivery.findMany({
      where: {
        status: St.FAILED,
        attempts: { lt: MAX_ATTEMPTS },
        channel: { not: Ch.IN_APP },
      },
      orderBy: { failedAt: 'asc' },
      take: 50,
      include: {
        notification: {
          select: { id: true, userId: true, title: true, body: true, link: true },
        },
      },
    });

    let retried = 0;
    let recovered = 0;

    for (const d of candidates) {
      const waitMinutes = BACKOFF_MINUTES[Math.min(d.attempts, BACKOFF_MINUTES.length - 1)];
      const readyAt = (d.failedAt ?? d.queuedAt).getTime() + waitMinutes * 60_000;
      if (now < readyAt) continue;

      retried++;
      const result = await this.channels
        .send(d.channel, d.notification.userId, {
          title: d.notification.title,
          body: d.notification.body ?? '',
          link: d.notification.link,
        })
        .catch((e: Error) => ({ ok: false, error: e.message }) as const);

      const at = new Date();
      if (result.ok) {
        recovered++;
        await this.prisma.notificationDelivery.update({
          where: { id: d.id },
          data: {
            status: St.SENT,
            sentAt: at,
            deliveredAt: at,
            lastError: null,
            attempts: { increment: 1 },
          },
        });
      } else if ('skipped' in result && result.skipped) {
        // A skip is terminal: the address or subscription is simply not there.
        await this.prisma.notificationDelivery.update({
          where: { id: d.id },
          data: { status: St.ARCHIVED, skippedReason: result.skipped, attempts: { increment: 1 } },
        });
      } else {
        await this.prisma.notificationDelivery.update({
          where: { id: d.id },
          data: {
            failedAt: at,
            lastError: 'error' in result ? (result.error ?? 'retry failed') : 'retry failed',
            attempts: { increment: 1 },
          },
        });
      }
    }

    if (retried) this.logger.log(`Retried ${retried} delivery(ies), ${recovered} recovered`);
    return { retried, recovered, candidates: candidates.length };
  }

  /** Retry one delivery immediately, from the admin failure table. */
  async retryOne(deliveryId: string) {
    const d = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        notification: { select: { id: true, userId: true, title: true, body: true, link: true } },
      },
    });
    if (!d) return { success: false, reason: 'Delivery not found' };

    const result = await this.channels
      .send(d.channel, d.notification.userId, {
        title: d.notification.title,
        body: d.notification.body ?? '',
        link: d.notification.link,
      })
      .catch((e: Error) => ({ ok: false, error: e.message }) as const);

    const at = new Date();
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: result.ok
        ? { status: St.SENT, sentAt: at, deliveredAt: at, lastError: null, attempts: { increment: 1 } }
        : {
            status: St.FAILED,
            failedAt: at,
            lastError:
              'skipped' in result && result.skipped
                ? result.skipped
                : 'error' in result
                  ? (result.error ?? 'retry failed')
                  : 'retry failed',
            attempts: { increment: 1 },
          },
    });

    return { success: result.ok, reason: result.ok ? null : 'See the delivery log for details' };
  }
}
