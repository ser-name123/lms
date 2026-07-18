import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import {
  BroadcastAudience,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  Role,
} from '../generated/prisma/enums';

// ─── Feed ────────────────────────────────────────────────────────────────────

export class ListNotificationsDto {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'id of the last row from the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ description: 'true to return only unread rows' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({ description: 'free-text search over title and body' })
  @IsOptional()
  @IsString()
  q?: string;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export class UpdatePreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inApp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() email?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() push?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() whatsapp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() muteMarketing?: boolean;

  @ApiPropertyOptional({ enum: NotificationCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationCategory, { each: true })
  mutedCategories?: NotificationCategory[];
}

export class PushSubscribeDto {
  @ApiProperty() @IsString() @IsNotEmpty() endpoint!: string;
  @ApiProperty() @IsString() @IsNotEmpty() p256dh!: string;
  @ApiProperty() @IsString() @IsNotEmpty() auth!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userAgent?: string;
}

export class PushUnsubscribeDto {
  @ApiProperty() @IsString() @IsNotEmpty() endpoint!: string;
}

// ─── Compose / broadcast ─────────────────────────────────────────────────────

/** A direct message from one user to specific recipients. */
export class ComposeDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) body!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];
}

export class BroadcastDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) body!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateCode?: string;

  @ApiProperty({ enum: BroadcastAudience })
  @IsEnum(BroadcastAudience)
  audience!: BroadcastAudience;

  @ApiPropertyOptional({ enum: Role, isArray: true, description: 'required when audience = ROLE' })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @ApiPropertyOptional({ description: 'required when audience = COURSE' })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ description: 'required when audience = BATCH' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ type: [String], description: 'required when audience = STUDENTS' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ example: '2026-07-20T08:00:00.000Z', description: 'omit to send now' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'park it as an editable draft instead of sending or scheduling' })
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}

// ─── Templates ───────────────────────────────────────────────────────────────

export class CreateTemplateDto {
  @ApiProperty({ description: 'unique, UPPER_SNAKE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiProperty({ description: 'supports {{placeholder}}' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ description: 'supports {{placeholder}}' })
  @IsString()
  @IsNotEmpty()
  bodyText!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() bodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class PreviewTemplateDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  vars?: Record<string, string>;
}

// ─── Admin notification centre ───────────────────────────────────────────────

export class NotificationCentreDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AnalyticsDto {
  @ApiPropertyOptional({ enum: ['7d', '30d', '90d', '12m'], default: '30d' })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export const REPORT_KINDS = [
  'daily',
  'delivery',
  'read',
  'failure',
  'engagement',
  'channel',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
