import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';

import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { NotificationChannel as Ch } from '../generated/prisma/enums';

/*
 * One sender per channel, behind a single interface.
 *
 * IN_APP is not here — the Notification row *is* the in-app delivery, so the
 * engine marks it delivered without calling out.
 *
 * EMAIL uses the existing nodemailer transport (SMTP config lives in
 * SystemSetting, editable from the admin settings screen).
 *
 * PUSH is Web Push. VAPID keys are generated once and stored in SystemSetting
 * rather than committed, so every environment gets its own pair; the public key
 * is served to the browser from /notifications/push/public-key.
 *
 * WHATSAPP and SMS are real channels in the schema and admin UI, but no
 * provider is wired. They report `skipped` with a clear reason instead of
 * pretending to have sent — a silent success here would be worse than nothing.
 */

export interface SendResult {
  ok: boolean;
  /** Not attempted (no address, preference off, provider absent) — not a failure. */
  skipped?: string;
  error?: string;
  providerRef?: string;
  target?: string;
}

export interface OutgoingMessage {
  title: string;
  body: string;
  link: string | null;
  html?: string | null;
}

const VAPID_PUBLIC = 'PUSH_VAPID_PUBLIC_KEY';
const VAPID_PRIVATE = 'PUSH_VAPID_PRIVATE_KEY';
const VAPID_SUBJECT = 'PUSH_VAPID_SUBJECT';

@Injectable()
export class NotificationChannelsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationChannelsService.name);
  private vapidReady = false;
  private vapidPublicKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
  ) {}

  async onModuleInit() {
    await this.ensureVapidKeys().catch((e: Error) =>
      this.logger.error(`Web Push disabled: ${e.message}`),
    );
  }

  // ── Web Push key management ────────────────────────────────────────────────

  /**
   * Generates the VAPID pair on first boot and stores it. Keys must survive
   * restarts: a new pair invalidates every existing browser subscription.
   */
  private async ensureVapidKeys() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    let publicKey = map.get(VAPID_PUBLIC);
    let privateKey = map.get(VAPID_PRIVATE);

    if (!publicKey || !privateKey) {
      const generated = webpush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      await this.prisma.$transaction([
        this.prisma.systemSetting.upsert({
          where: { key: VAPID_PUBLIC },
          update: { value: publicKey },
          create: { key: VAPID_PUBLIC, value: publicKey },
        }),
        this.prisma.systemSetting.upsert({
          where: { key: VAPID_PRIVATE },
          update: { value: privateKey },
          create: { key: VAPID_PRIVATE, value: privateKey },
        }),
      ]);
      this.logger.log('Generated a new Web Push VAPID key pair');
    }

    const subject = map.get(VAPID_SUBJECT) ?? 'mailto:admin@alfurqan.local';
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.vapidPublicKey = publicKey;
    this.vapidReady = true;
  }

  /** The browser needs this to subscribe. Safe to expose — it is the public half. */
  async publicKey(): Promise<{ publicKey: string | null; enabled: boolean }> {
    if (!this.vapidReady) await this.ensureVapidKeys().catch(() => undefined);
    return { publicKey: this.vapidPublicKey, enabled: this.vapidReady };
  }

  // ── Senders ────────────────────────────────────────────────────────────────

  async send(channel: Ch, userId: string, message: OutgoingMessage): Promise<SendResult> {
    switch (channel) {
      case Ch.EMAIL:
        return this.sendEmail(userId, message);
      case Ch.PUSH:
        return this.sendPush(userId, message);
      case Ch.WHATSAPP:
        return { ok: false, skipped: 'WhatsApp provider is not configured' };
      case Ch.SMS:
        return { ok: false, skipped: 'SMS provider is not configured' };
      case Ch.IN_APP:
      default:
        // The row itself is the delivery.
        return { ok: true };
    }
  }

  private async sendEmail(userId: string, message: OutgoingMessage): Promise<SendResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user?.email) return { ok: false, skipped: 'User has no email address' };

    try {
      await this.emails.sendMail(
        user.email,
        message.title,
        message.body,
        undefined,
        message.html ?? this.defaultHtml(user.firstName, message),
      );
      return { ok: true, target: user.email };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Email send failed', target: user.email };
    }
  }

  /** Plain, inline-styled HTML — email clients strip stylesheets. */
  private defaultHtml(firstName: string, message: OutgoingMessage): string {
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
      );
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    const cta = message.link
      ? `<p style="margin:24px 0 0"><a href="${base}${esc(message.link)}"
           style="background:#386FA4;color:#fff;padding:10px 18px;border-radius:8px;
                  text-decoration:none;font-weight:600;display:inline-block">Open in the console</a></p>`
      : '';
    return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
                        color:#14161a;line-height:1.55;max-width:560px">
      <p style="margin:0 0 12px">Hi ${esc(firstName)},</p>
      <h2 style="margin:0 0 8px;font-size:18px">${esc(message.title)}</h2>
      <p style="margin:0;color:#4b5563">${esc(message.body)}</p>
      ${cta}
      <p style="margin:28px 0 0;font-size:12px;color:#9ca3af">
        You can change which notifications you receive in your profile settings.</p>
    </div>`;
  }

  private async sendPush(userId: string, message: OutgoingMessage): Promise<SendResult> {
    if (!this.vapidReady) return { ok: false, skipped: 'Web Push is not configured' };

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return { ok: false, skipped: 'No push subscription on this account' };

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      link: message.link ?? '/dashboard',
    });

    let delivered = 0;
    const errors: string[] = [];
    const dead: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410 mean the browser dropped the subscription — prune it rather
        // than retrying forever against an endpoint that will never accept.
        if (status === 404 || status === 410) dead.push(sub.endpoint);
        else errors.push(e instanceof Error ? e.message : 'push failed');
      }
    }

    if (dead.length) {
      await this.prisma.pushSubscription
        .deleteMany({ where: { endpoint: { in: dead } } })
        .catch(() => undefined);
    }
    if (delivered) {
      await this.prisma.pushSubscription
        .updateMany({ where: { userId }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
      return { ok: true, providerRef: `${delivered} endpoint(s)` };
    }
    if (errors.length) return { ok: false, error: errors[0] };
    return { ok: false, skipped: 'All push subscriptions were expired and have been removed' };
  }

  /** Which channels can actually deliver right now — drives the admin UI. */
  async channelHealth() {
    const [smtp, subs] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: 'SMTP_CONFIG' } }),
      this.prisma.pushSubscription.count(),
    ]);
    const smtpConfigured =
      Boolean(process.env.SMTP_USER && process.env.SMTP_PASS) ||
      Boolean(smtp?.value && smtp.value.includes('"pass"'));

    return [
      { channel: Ch.IN_APP, configured: true, detail: 'Always available' },
      {
        channel: Ch.EMAIL,
        configured: smtpConfigured,
        detail: smtpConfigured ? 'SMTP transport ready' : 'SMTP credentials are not set',
      },
      {
        channel: Ch.PUSH,
        configured: this.vapidReady,
        detail: this.vapidReady
          ? `${subs} browser subscription(s)`
          : 'VAPID keys could not be initialised',
      },
      { channel: Ch.WHATSAPP, configured: false, detail: 'No provider wired' },
      { channel: Ch.SMS, configured: false, detail: 'No provider wired' },
    ];
  }
}
