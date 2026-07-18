import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { Role } from '../generated/prisma/enums';
import { RANGE_KEYS } from './dashboard.range';

/** Every role dashboard accepts the same window parameters. */
export class DashboardRangeDto {
  @ApiPropertyOptional({ enum: RANGE_KEYS, default: '30d' })
  @IsOptional()
  @IsIn(RANGE_KEYS)
  range?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-18T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/** Parent dashboards are per-child; omit to get the primary/first child. */
export class ParentDashboardDto extends DashboardRangeDto {
  @ApiPropertyOptional({ description: 'StudentProfile id of the child to view' })
  @IsOptional()
  @IsString()
  childId?: string;
}

// ─── Widgets ─────────────────────────────────────────────────────────────────

export class RoleWidgetItemDto {
  @ApiProperty({ example: 'sa.chart.revenue' })
  @IsString()
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;
}

export class UpdateRoleWidgetsDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({ type: [RoleWidgetItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleWidgetItemDto)
  items!: RoleWidgetItemDto[];
}

export class UserWidgetItemDto {
  @ApiProperty({ example: 'st.schedule' })
  @IsString()
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ enum: ['SM', 'MD', 'LG', 'FULL'] })
  @IsOptional()
  @IsIn(['SM', 'MD', 'LG', 'FULL'])
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

export class SaveUserLayoutDto {
  @ApiProperty({ type: [UserWidgetItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserWidgetItemDto)
  items!: UserWidgetItemDto[];
}

// ─── Announcements ───────────────────────────────────────────────────────────

export const ANNOUNCEMENT_TYPES = ['HOLIDAY', 'MAINTENANCE', 'EXAM', 'COURSE', 'GENERAL'] as const;

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Eid Holiday Notice' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'The academy will remain closed on 20-22 July.' })
  @IsString()
  body!: string;

  @ApiPropertyOptional({ enum: ANNOUNCEMENT_TYPES, default: 'GENERAL' })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_TYPES as unknown as string[])
  type?: string;

  @ApiPropertyOptional({ enum: Role, isArray: true, description: 'Empty = everyone' })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  audience?: Role[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({ description: 'Omit to publish immediately' })
  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateAnnouncementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ enum: ANNOUNCEMENT_TYPES })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_TYPES as unknown as string[])
  type?: string;

  @ApiPropertyOptional({ enum: Role, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  audience?: Role[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

// ─── Global search / calendar ────────────────────────────────────────────────

export class GlobalSearchDto {
  @ApiProperty({ example: 'ahmad' })
  @IsString()
  q!: string;

  @ApiPropertyOptional({ default: 5, description: 'Results per entity type' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}

export class CalendarDto {
  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

// ─── Parent linking ──────────────────────────────────────────────────────────

export class CreateParentAccountDto {
  @ApiProperty({ description: 'StudentProfile id the parent is linked to' })
  @IsString()
  studentId!: string;

  @ApiPropertyOptional({ description: 'Defaults to StudentProfile.parentEmail' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Defaults to StudentProfile.parentName' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Defaults to StudentProfile.parentRelationship' })
  @IsOptional()
  @IsString()
  relationship?: string;
}

export class LinkParentDto {
  @ApiProperty()
  @IsString()
  parentUserId!: string;

  @ApiProperty()
  @IsString()
  studentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
