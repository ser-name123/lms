import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveCategory, LeaveRequestStatus, LeaveType } from '../generated/prisma/enums';

/* ── §9.1 request ─────────────────────────────────────────────────────────── */

export class CreateLeaveDto {
  /**
   * Whose leave this is. Optional: staff raising their own request leave it
   * unset and the service uses the caller, so a teacher cannot file leave in a
   * colleague's name by posting someone else's id.
   */
  @ApiPropertyOptional({ description: "Admin-only; defaults to the caller" })
  @IsOptional() @IsString() userId?: string;

  @ApiPropertyOptional({ enum: LeaveCategory })
  @IsOptional() @IsEnum(LeaveCategory) category?: LeaveCategory;

  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType) leaveType!: LeaveType;

  @ApiProperty({ example: '2026-08-16T00:00:00.000Z' })
  @IsDateString() startDate!: string;

  @ApiProperty({ example: '2026-08-18T00:00:00.000Z' })
  @IsDateString() endDate!: string;

  @ApiProperty({ example: 'Medical checkup' })
  @IsString() @MaxLength(2000) reason!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;

  @ApiPropertyOptional({ description: 'Supporting document (/uploads path)' })
  @IsOptional() @IsString() @MaxLength(2000) documentUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(300) documentName?: string;
}

/** A staff member correcting their own request while it is still PENDING. */
export class EditOwnLeaveDto {
  @IsOptional() @IsEnum(LeaveType) leaveType?: LeaveType;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsString() @MaxLength(2000) documentUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) documentName?: string;
}

/* ── §9.2 approval workflow ───────────────────────────────────────────────── */

export class ApproveLeaveDto {
  /**
   * §9.3 — paid or unpaid, decided here. Required rather than defaulted: the
   * spec makes it an explicit act at approval, and a silent default is how an
   * unpaid leave quietly becomes paid.
   */
  @ApiProperty() @IsBoolean() isPaid!: boolean;

  /** §9.2 "Modify Leave Dates" — approving a different window from the one asked for. */
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;

  /** Overrides the computed deduction when the admin knows better. */
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deductionAmount?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) adminNotes?: string;
}

export class RejectLeaveDto {
  @ApiProperty() @IsString() @MaxLength(2000) reason!: string;
}

export class RequestInfoDto {
  @ApiProperty() @IsString() @MaxLength(2000) question!: string;
}

export class RespondInfoDto {
  @ApiProperty() @IsString() @MaxLength(2000) response!: string;
}

export class CancelLeaveDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

/** Kept for the pre-Module-9 admin screen, which PATCHes a status directly. */
export class UpdateLeaveDto {
  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional() @IsEnum(LeaveRequestStatus) status?: LeaveRequestStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000) adminNotes?: string;

  @ApiPropertyOptional({ description: '§9.3 paid/unpaid, when approving through this route' })
  @IsOptional() @IsBoolean() isPaid?: boolean;
}

/* ── §9.5 affected classes ────────────────────────────────────────────────── */

export class DecideImpactDto {
  @ApiProperty({ enum: ['WAIT_FOR_TEACHER', 'TEMPORARY_TEACHER', 'RESCHEDULE'] })
  @IsIn(['WAIT_FOR_TEACHER', 'TEMPORARY_TEACHER', 'RESCHEDULE'])
  option!: 'WAIT_FOR_TEACHER' | 'TEMPORARY_TEACHER' | 'RESCHEDULE';

  /** Option 2 — the stand-in. TeacherProfile id. */
  @ApiPropertyOptional() @IsOptional() @IsString() temporaryTeacherId?: string;

  /** Option 2 — whether the original teacher comes back afterwards (§9.11). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() restoreOriginal?: boolean;

  /** Option 3 — the new slots, one per affected class. */
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional() @IsArray() reschedules?: { classId: string; startsAt: string }[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

/* ── Listing ──────────────────────────────────────────────────────────────── */

export class ListLeavesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 20;

  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional() @IsEnum(LeaveRequestStatus) status?: LeaveRequestStatus;
  @ApiPropertyOptional({ enum: LeaveCategory })
  @IsOptional() @IsEnum(LeaveCategory) category?: LeaveCategory;
  @ApiPropertyOptional({ enum: LeaveType })
  @IsOptional() @IsEnum(LeaveType) leaveType?: LeaveType;
  @ApiPropertyOptional({ description: 'ADMIN | SUPERVISOR | ACADEMIC_COACH | TEACHER' })
  @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ description: 'true | false — §9.3 paid vs unpaid' })
  @IsOptional() @IsString() paid?: string;
  @ApiPropertyOptional({ example: 'date_desc' })
  @IsOptional() @IsString() sortBy?: string;
}

/* ── §9.11 configuration ──────────────────────────────────────────────────── */

export class SaveLeaveConfigDto {
  @IsOptional() @IsArray() @IsString({ each: true }) staffTypes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) unavailabilityTypes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) paidByDefault?: string[];
  @IsOptional() @IsIn(['DAILY_RATE', 'FIXED']) deductionMode?: 'DAILY_RATE' | 'FIXED';
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fixedDeductionPerDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31) workingDaysPerMonth?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) nonWorkingWeekdays?: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) noticeDaysExpected?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) maxConsecutiveDays?: number;
  @IsOptional() @IsBoolean() allowSelfCancel?: boolean;
  @IsOptional() @IsBoolean() autoRestoreOnReturn?: boolean;
}
