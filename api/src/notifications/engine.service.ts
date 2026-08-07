import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationCategory as Cat,
  NotificationChannel as Ch,
  NotificationPriority as Pri,
  NotificationStatus as St,
} from '../generated/prisma/enums';
import { NotificationChannelsService, OutgoingMessage } from './channels.service';
import { NotificationStreamService } from './stream.service';
import { describeType } from './registry';

/*
 * The notification engine — the single path every notification takes.
 *
 *   event → resolve recipients → check preferences → select channels
 *         → create rows (QUEUED) → send → record per-channel status → stream
 *
 * The Notification row IS the in-app delivery, so it is written first and the
 * out-of-band channels are attempted afterwards. That ordering matters: a dead
 * SMTP server must never cost the user their in-app notification.
 *
 * Sends are awaited but their failures never propagate — a caller doing
 * `notifications.dispatch(...)` inside a business transaction must not have the
 * transaction rolled back because an email bounced. Failures land in
 * NotificationDelivery, where the retry sweep and the admin failure report
 * pick them up.
 */

export interface DispatchInput {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Overrides the registry classification when a caller knows better. */
  category?: Cat;
  priority?: Pri;
  channels?: Ch[];
  actorId?: string | null;
  actorName?: string | null;
  broadcastId?: string | null;
  templateCode?: string | null;
  meta?: Record<string, unknown> | null;
  html?: string | null;
}

/** Effective preference set. A user with no row gets these. */
const DEFAULT_PREFS = {
  inApp: true,
  email: true,
  push: true,
  whatsapp: false,
  sms: false,
  muteMarketing: false,
  mutedCategories: [] as Cat[],
};

const CHANNEL_PREF_KEY: Record<Ch, keyof typeof DEFAULT_PREFS> = {
  [Ch.IN_APP]: 'inApp',
  [Ch.EMAIL]: 'email',
  [Ch.PUSH]: 'push',
  [Ch.WHATSAPP]: 'whatsapp',
  [Ch.SMS]: 'sms',
};

@Injectable()
export class NotificationEngineService {
  private readonly logger = new Logger(NotificationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: NotificationChannelsService,
    private readonly stream: NotificationStreamService,
  ) {}

  /**
   * Deliver to a set of users. Returns what actually happened so callers and
   * the broadcast runner can report real numbers rather than guesses.
   */
  async dispatch(
    userIds: string[],
    input: DispatchInput,
  ): Promise<{ created: number; suppressed: number; failed: number; notificationIds: string[] }> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return { created: 0, suppressed: 0, failed: 0, notificationIds: [] };

    const def = describeType(input.type);
    const category = input.category ?? def.category;
    const priority = input.priority ?? def.priority;
    const wanted = input.channels?.length ? input.channels : def.channels;

    const prefs = await this.preferencesFor(unique);

    const notificationIds: string[] = [];
    let suppressed = 0;
    let failed = 0;

    /*
     * Recipients are handled concurrently, in bounded batches.
     *
     * This loop used to be strictly sequential, and each recipient awaited an
     * SMTP round trip inside it — so an action that notifies ten people held
     * the HTTP request open for ten of them, one after another. Approving a
     * leave notifies the requester plus every admin, supervisor and coach, and
     * the admin watched their button spin through the lot.
     *
     * The work per recipient is already independent: preferences are read up
     * front, and `attempt` records its own outcome and never throws. So the
     * only reason it was serial was that it was written as a for-loop.
     *
     * Bounded rather than unbounded: an academy-wide broadcast can be hundreds
     * of people, and firing hundreds of simultaneous SMTP connections is how
     * you get rate-limited by the relay — which is the failure this is meant to
     * relieve, not cause. Counts stay exactly as honest as before, because
     * every send is still awaited before dispatch returns.
     */
    const CONCURRENCY = 8;

    const deliverTo = async (userId: string): Promise<'created' | 'suppressed' | 'failed'> => {
      const pref = prefs.get(userId) ?? DEFAULT_PREFS;

      /*
       * CRITICAL overrides every mute. A failed payment or a security alert is
       * not something a preference toggle may silence — the spec says these
       * always show, and silently dropping one is the worst failure this
       * module could have.
       */
      const critical = priority === Pri.CRITICAL;

      if (!critical) {
        if (pref.mutedCategories.includes(category)) return 'suppressed';
        if (def.marketing && pref.muteMarketing) return 'suppressed';
      }

      // Which channels survive this user's preferences.
      const selected = wanted.filter((c) => critical || pref[CHANNEL_PREF_KEY[c]]);
      const optedOut = wanted.filter((c) => !selected.includes(c));

      /*
       * In-app off with nothing else left means the user asked for silence on
       * this one — record nothing rather than writing a row they will never
       * see. A critical notification never reaches here.
       */
      if (!selected.length) return 'suppressed';

      const inApp = selected.includes(Ch.IN_APP);
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          category,
          priority,
          // An out-of-band-only notification is not "unread" in the bell.
          status: inApp ? St.SENT : St.QUEUED,
          read: !inApp,
          actorId: input.actorId ?? null,
          actorName: input.actorName ?? null,
          broadcastId: input.broadcastId ?? null,
          templateCode: input.templateCode ?? null,
          meta: (input.meta ?? undefined) as never,
          deliveries: {
            create: [
              ...selected.map((channel) => ({
                channel,
                status: channel === Ch.IN_APP ? St.DELIVERED : St.QUEUED,
                deliveredAt: channel === Ch.IN_APP ? new Date() : null,
                sentAt: channel === Ch.IN_APP ? new Date() : null,
              })),
              // Opt-outs are recorded too, so the delivery report can show
              // "not sent because the user turned it off" instead of a hole.
              ...optedOut.map((channel) => ({
                channel,
                status: St.ARCHIVED,
                skippedReason: 'User preference is off for this channel',
              })),
            ],
          },
        },
        select: { id: true, title: true, body: true, link: true, type: true, category: true, priority: true, createdAt: true, read: true },
      });

      notificationIds.push(notification.id);

      if (inApp) {
        this.stream.publish({ userId, kind: 'notification', payload: notification });
      }

      // Out-of-band channels, together rather than in turn, never throwing.
      const message: OutgoingMessage = {
        title: input.title,
        body: input.body ?? '',
        link: input.link ?? null,
        html: input.html ?? null,
      };
      const outcomes = await Promise.all(
        selected
          .filter((c) => c !== Ch.IN_APP)
          .map((channel) => this.attempt(notification.id, channel, userId, message)),
      );

      /*
       * Counted per recipient, not per delivery, so it stays in the same unit as
       * `created` — a caller showing "3 sent / 1 failed" is talking about people.
       * A recipient whose email bounced but whose in-app row landed still counts
       * here: something the sender asked for did not happen.
       */
      return outcomes.includes('failed') ? 'failed' : 'created';
    };

    for (let i = 0; i < unique.length; i += CONCURRENCY) {
      const results = await Promise.all(unique.slice(i, i + CONCURRENCY).map(deliverTo));
      for (const r of results) {
        if (r === 'suppressed') suppressed++;
        else if (r === 'failed') failed++;
      }
    }

    return { created: notificationIds.length, suppressed, failed, notificationIds };
  }

  /** One channel attempt, recorded whatever the outcome. */
  private async attempt(
    notificationId: string,
    channel: Ch,
    userId: string,
    message: OutgoingMessage,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    let result;
    try {
      result = await this.channels.send(channel, userId, message);
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : 'sender threw' };
    }

    const now = new Date();
    const data = result.ok
      ? { status: St.SENT, sentAt: now, deliveredAt: now, providerRef: result.providerRef ?? null, target: result.target ?? null, lastError: null }
      : result.skipped
        ? { status: St.ARCHIVED, skippedReason: result.skipped, target: result.target ?? null }
        : { status: St.FAILED, failedAt: now, lastError: result.error ?? 'unknown error', target: result.target ?? null };

    await this.prisma.notificationDelivery
      .updateMany({
        where: { notificationId, channel },
        data: { ...data, attempts: { increment: 1 } },
      })
      .catch((e: Error) => this.logger.warn(`Could not record ${channel} delivery: ${e.message}`));

    return result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed';
  }

  /** Preferences for many users in one query; missing rows get the defaults. */
  private async preferencesFor(userIds: string[]) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds } },
    });
    return new Map(
      rows.map((r) => [
        r.userId,
        {
          inApp: r.inApp,
          email: r.email,
          push: r.push,
          whatsapp: r.whatsapp,
          sms: r.sms,
          muteMarketing: r.muteMarketing,
          mutedCategories: r.mutedCategories,
        },
      ]),
    );
  }
}
