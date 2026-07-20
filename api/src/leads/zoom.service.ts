import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/*
 * Zoom meetings for trial classes, via a Server-to-Server OAuth app.
 *
 * Credentials live in SystemSetting rather than env vars so an admin can wire
 * Zoom up from Settings without a redeploy — the same pattern SMTP and the
 * web-push VAPID pair already use.
 *
 * When Zoom is not configured, or the call fails, this reports it plainly
 * instead of inventing a link. A trial email carrying a URL that opens nothing
 * is worse than one that says the link is coming: the visitor would sit in a
 * dead room at the appointed time and conclude the academy stood them up.
 */

const ACCOUNT_ID = 'ZOOM_ACCOUNT_ID';
const CLIENT_ID = 'ZOOM_CLIENT_ID';
const CLIENT_SECRET = 'ZOOM_CLIENT_SECRET';

export interface ZoomMeeting {
  meetingId: string;
  joinUrl: string;
  hostUrl: string | null;
}

export interface ZoomResult {
  ok: boolean;
  meeting?: ZoomMeeting;
  /** Why there is no meeting — surfaced to admins, never to the visitor. */
  reason?: string;
}

@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);

  /** Cached access token; Zoom's are short-lived (1h), so refresh early. */
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async credentials() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET] } },
    });
    const map = new Map(rows.map((r) => [r.key, (r.value ?? '').trim()]));
    const accountId = map.get(ACCOUNT_ID);
    const clientId = map.get(CLIENT_ID);
    const clientSecret = map.get(CLIENT_SECRET);
    if (!accountId || !clientId || !clientSecret) return null;
    return { accountId, clientId, clientSecret };
  }

  /** Whether an admin has wired Zoom up — drives the Settings health badge. */
  async isConfigured(): Promise<boolean> {
    return (await this.credentials()) !== null;
  }

  private async accessToken(): Promise<string | null> {
    // 60s of headroom so a token cannot expire mid-request.
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const creds = await this.credentials();
    if (!creds) return null;

    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`,
      { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Zoom rejected the credentials (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error('Zoom returned no access token');

    this.token = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  /**
   * Creates a scheduled meeting. Never throws — a Zoom outage must not cost the
   * academy the booking, so the caller gets `ok: false` and carries on.
   */
  async createTrialMeeting(input: {
    topic: string;
    startAt: Date;
    durationMins: number;
    timeZone?: string | null;
    agenda?: string;
  }): Promise<ZoomResult> {
    let token: string | null;
    try {
      token = await this.accessToken();
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Zoom authentication failed';
      this.logger.error(reason);
      return { ok: false, reason };
    }
    if (!token) return { ok: false, reason: 'Zoom is not configured' };

    try {
      // "me" is the Server-to-Server app's own user — the academy's Zoom account.
      const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: input.topic,
          type: 2, // scheduled
          start_time: input.startAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          duration: input.durationMins,
          timezone: input.timeZone || 'UTC',
          agenda: input.agenda ?? '',
          settings: {
            join_before_host: true,
            waiting_room: false,
            approval_type: 2, // no registration — the link in the email is enough
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const reason = `Zoom could not create the meeting (${res.status}): ${body.slice(0, 200)}`;
        this.logger.error(reason);
        return { ok: false, reason };
      }

      const json = (await res.json()) as {
        id?: number | string;
        join_url?: string;
        start_url?: string;
      };
      if (!json.join_url) return { ok: false, reason: 'Zoom returned no join URL' };

      return {
        ok: true,
        meeting: {
          meetingId: String(json.id ?? ''),
          joinUrl: json.join_url,
          hostUrl: json.start_url ?? null,
        },
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Zoom request failed';
      this.logger.error(reason);
      return { ok: false, reason };
    }
  }

  /** Moves an existing meeting. Used when a trial is rescheduled. */
  async rescheduleMeeting(meetingId: string, startAt: Date, durationMins: number) {
    const token = await this.accessToken().catch(() => null);
    if (!token || !meetingId) return false;
    const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: startAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        duration: durationMins,
      }),
    }).catch(() => null);
    return Boolean(res?.ok);
  }

  /**
   * Deletes a meeting when its trial is cancelled, so the academy's Zoom
   * account does not fill up with rooms nobody will ever join.
   */
  async cancelMeeting(meetingId: string) {
    const token = await this.accessToken().catch(() => null);
    if (!token || !meetingId) return false;
    const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    // 204 on success, 404 if it was already gone — both mean "not there now".
    return Boolean(res && (res.ok || res.status === 404));
  }
}
