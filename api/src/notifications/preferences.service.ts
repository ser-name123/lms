import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationCategory as Cat } from '../generated/prisma/enums';
import { UpdatePreferencesDto } from './dto';

/*
 * Per-user channel and category opt-in.
 *
 * A user with no row is not "unconfigured" — they are on the defaults, which is
 * everything except WhatsApp and SMS. `get` therefore never creates a row; it
 * returns the effective settings. The row appears the first time the user saves.
 */

const DEFAULTS = {
  inApp: true,
  email: true,
  push: true,
  whatsapp: false,
  sms: false,
  muteMarketing: false,
  mutedCategories: [] as Cat[],
};

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    const [pushSubscriptions] = await Promise.all([
      this.prisma.pushSubscription.count({ where: { userId } }),
    ]);
    return {
      ...(row
        ? {
            inApp: row.inApp,
            email: row.email,
            push: row.push,
            whatsapp: row.whatsapp,
            sms: row.sms,
            muteMarketing: row.muteMarketing,
            mutedCategories: row.mutedCategories,
          }
        : DEFAULTS),
      // Surfaced so the UI can say "push is on, but this browser is not subscribed".
      pushSubscriptions,
      // Neither has a provider yet; the UI greys them out rather than lying.
      whatsappAvailable: false,
      smsAvailable: false,
      customised: Boolean(row),
    };
  }

  async update(userId: string, dto: UpdatePreferencesDto) {
    const data = {
      inApp: dto.inApp ?? undefined,
      email: dto.email ?? undefined,
      push: dto.push ?? undefined,
      whatsapp: dto.whatsapp ?? undefined,
      sms: dto.sms ?? undefined,
      muteMarketing: dto.muteMarketing ?? undefined,
      mutedCategories: dto.mutedCategories ?? undefined,
    };
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...DEFAULTS, ...data },
    });
    return this.get(userId);
  }

  async reset(userId: string) {
    await this.prisma.notificationPreference.deleteMany({ where: { userId } });
    return this.get(userId);
  }

  // ── Web Push subscriptions ─────────────────────────────────────────────────

  async subscribePush(
    userId: string,
    dto: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
  ) {
    /*
     * Upsert on endpoint, not on (userId, endpoint): a shared browser that
     * switches accounts must move the endpoint to the new user rather than
     * leaving the previous one subscribed to it.
     */
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { userId, p256dh: dto.p256dh, auth: dto.auth, userAgent: dto.userAgent ?? null },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent ?? null,
      },
    });
    return { success: true };
  }

  async unsubscribePush(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { success: true };
  }
}
