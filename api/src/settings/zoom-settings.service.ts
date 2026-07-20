import { Injectable } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PrismaService } from '../prisma/prisma.service';

/*
 * Zoom Server-to-Server OAuth credentials, stored in SystemSetting so an admin
 * can wire Zoom up from Settings without a redeploy — the same place SMTP and
 * the web-push VAPID pair live.
 *
 * The client secret is never sent back to the browser. `GET` reports only
 * whether each part is present, so a screen can show "configured" without ever
 * putting the secret somewhere it could be read from a devtools panel or a
 * cached response.
 */

const ACCOUNT_ID = 'ZOOM_ACCOUNT_ID';
const CLIENT_ID = 'ZOOM_CLIENT_ID';
const CLIENT_SECRET = 'ZOOM_CLIENT_SECRET';

export class ZoomCredentialsDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiProperty() @IsString() clientId!: string;
  /** Omit to keep the stored secret — the UI never receives it to send back. */
  @ApiPropertyOptional({ description: 'Leave blank to keep the existing secret' })
  @IsOptional()
  @IsString()
  clientSecret?: string;
}

export interface ZoomStatus {
  configured: boolean;
  accountId: string | null;
  clientId: string | null;
  hasSecret: boolean;
}

@Injectable()
export class ZoomSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async status(): Promise<ZoomStatus> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET] } },
    });
    const map = new Map(rows.map((r) => [r.key, (r.value ?? '').trim()]));
    const accountId = map.get(ACCOUNT_ID) || null;
    const clientId = map.get(CLIENT_ID) || null;
    const hasSecret = Boolean(map.get(CLIENT_SECRET));

    return {
      configured: Boolean(accountId && clientId && hasSecret),
      accountId,
      clientId,
      hasSecret,
    };
  }

  async save(dto: ZoomCredentialsDto): Promise<ZoomStatus> {
    const put = async (key: string, value: string) => {
      await this.prisma.systemSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    };

    await put(ACCOUNT_ID, dto.accountId.trim());
    await put(CLIENT_ID, dto.clientId.trim());
    // A blank secret means "leave it alone", so re-saving the account id does
    // not silently wipe the credential and break every future booking.
    if (dto.clientSecret?.trim()) await put(CLIENT_SECRET, dto.clientSecret.trim());

    return this.status();
  }

  /** Clears every stored value — used by "Disconnect". */
  async clear(): Promise<ZoomStatus> {
    await this.prisma.systemSetting.deleteMany({
      where: { key: { in: [ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET] } },
    });
    return this.status();
  }
}
