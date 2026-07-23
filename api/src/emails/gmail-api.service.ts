import { Injectable, Logger } from '@nestjs/common';
import MailComposer from 'nodemailer/lib/mail-composer';

import { PrismaService } from '../prisma/prisma.service';

/*
 * Sending as gmail.com from a host that blocks SMTP.
 *
 * Render (and similar) block outbound ports 587 and 465, which are the only
 * ports Gmail's SMTP offers — so Gmail SMTP simply cannot run there. The Gmail
 * REST API goes over HTTPS (443), which is never blocked, and it sends AS the
 * account, so a gmail.com message passes SPF and DKIM instead of being relayed
 * through a third party that gmail.com never authorised.
 *
 * No Google SDK: the two calls needed are plain HTTPS. An access token is
 * minted from the stored refresh token (OAuth 'refresh_token' grant) and the
 * MIME message is POSTed to users.messages.send. The refresh token is the
 * durable credential — obtained once via scripts/gmail-oauth.cjs — and is
 * treated as a secret: masked on read, redacted on export.
 */

const SETTING_KEY = 'GMAIL_API_CONFIG';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface GmailApiConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The gmail.com address these credentials belong to; also the From. */
  sender: string;
}

export interface ComposedMail {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  fromName?: string;
  attachments?: { filename: string; content: Buffer }[];
}

@Injectable()
export class GmailApiService {
  private readonly logger = new Logger(GmailApiService.name);

  /** Access tokens last ~1h; cached so a burst of sends mints one, not many. */
  private accessToken: string | null = null;
  private accessTokenExpiry = 0;
  private cachedRefreshToken: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ── Config ─────────────────────────────────────────────────────────────────

  async config(): Promise<GmailApiConfig | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });
    if (!row?.value) return null;
    try {
      const c = JSON.parse(row.value) as Partial<GmailApiConfig>;
      if (c.clientId && c.clientSecret && c.refreshToken && c.sender) {
        return c as GmailApiConfig;
      }
    } catch {
      this.logger.error(`${SETTING_KEY} is not valid JSON — Gmail API disabled`);
    }
    return null;
  }

  async configured(): Promise<boolean> {
    return (await this.config()) !== null;
  }

  /** Whether it is set and the sender, never the secrets. */
  async publicConfig() {
    const c = await this.config();
    return {
      configured: c !== null,
      sender: c?.sender ?? null,
      hasClientId: Boolean(c?.clientId),
      hasClientSecret: Boolean(c?.clientSecret),
      hasRefreshToken: Boolean(c?.refreshToken),
    };
  }

  /** Blank fields keep the stored value — the form never receives the secrets. */
  async saveConfig(input: Partial<GmailApiConfig>): Promise<void> {
    const current = (await this.config()) ?? {
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      sender: '',
    };
    const merged: GmailApiConfig = {
      clientId: input.clientId?.trim() || current.clientId,
      clientSecret: input.clientSecret?.trim() || current.clientSecret,
      refreshToken: input.refreshToken?.trim() || current.refreshToken,
      sender: input.sender === undefined ? current.sender : input.sender.trim(),
    };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(merged) },
      create: { key: SETTING_KEY, value: JSON.stringify(merged) },
    });
    // A changed refresh token invalidates the cached access token.
    this.accessToken = null;
    this.cachedRefreshToken = null;
    this.logger.log('Gmail API configuration updated');
  }

  async clearConfig(): Promise<void> {
    await this.prisma.systemSetting
      .delete({ where: { key: SETTING_KEY } })
      .catch(() => undefined);
    this.accessToken = null;
    this.cachedRefreshToken = null;
  }

  // ── Access token ─────────────────────────────────────────────────────────────

  private async getAccessToken(cfg: GmailApiConfig): Promise<string> {
    const now = Date.now();
    if (
      this.accessToken &&
      this.cachedRefreshToken === cfg.refreshToken &&
      now < this.accessTokenExpiry
    ) {
      return this.accessToken;
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: cfg.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      throw new Error(
        `Google refused the refresh token: ${data.error ?? res.status} ${data.error_description ?? ''}`.trim(),
      );
    }
    this.accessToken = data.access_token;
    // Refresh a minute early so a token never expires mid-send.
    this.accessTokenExpiry = now + (data.expires_in ?? 3600) * 1000 - 60_000;
    this.cachedRefreshToken = cfg.refreshToken;
    return this.accessToken;
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  /** Builds the RFC822 message Gmail wants, base64url-encoded. */
  private async buildRaw(cfg: GmailApiConfig, mail: ComposedMail): Promise<string> {
    const composer = new MailComposer({
      from: `"${mail.fromName ?? 'AL FURQAN Console'}" <${cfg.sender}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments,
    });
    const message: Buffer = await new Promise((resolve, reject) => {
      composer.compile().build((err, msg) => (err ? reject(err) : resolve(msg)));
    });
    return message
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Sends one message via the Gmail API. Returns Gmail's message id.
   *
   * A non-2xx from Gmail throws with the reason, so the caller — EmailsService —
   * can log it and decide, exactly as it does for an SMTP failure. A caller that
   * swallows failures does not make the failure silent here: the throw is logged
   * before it leaves EmailsService.
   */
  async send(mail: ComposedMail): Promise<{ id: string; from: string }> {
    const cfg = await this.config();
    if (!cfg) throw new Error('Gmail API is not configured');

    const token = await this.getAccessToken(cfg);
    const raw = await this.buildRaw(cfg, mail);

    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    const data = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !data.id) {
      throw new Error(
        `Gmail API rejected the message: ${res.status} ${data.error?.message ?? ''}`.trim(),
      );
    }
    return { id: data.id, from: cfg.sender };
  }

  /** Proves the credentials work by minting a token, for the settings screen. */
  async testConnection(): Promise<{ ok: boolean; message: string; sender?: string }> {
    const cfg = await this.config();
    if (!cfg) return { ok: false, message: 'Gmail API is not configured.' };
    try {
      await this.getAccessToken(cfg);
      return {
        ok: true,
        message: `Google accepted the credentials for ${cfg.sender}.`,
        sender: cfg.sender,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Google rejected the credentials.' };
    }
  }
}
