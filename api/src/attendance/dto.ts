import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// ── Configurable attendance rules (stored as JSON in SystemSetting) ───────────
export class AttendanceConfigDto {
  @ApiPropertyOptional({ description: '% of class duration for PRESENT', default: 75 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) presentThreshold?: number;

  @ApiPropertyOptional({ description: '% of class duration for LATE (below present)', default: 30 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) lateThreshold?: number;

  @ApiPropertyOptional({ description: 'Auto-lock attendance N minutes after class ends', default: 30 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440) autoLockMinutes?: number;

  @ApiPropertyOptional({ description: 'Grace minutes before a join counts as LATE', default: 5 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120) lateGraceMinutes?: number;

  @ApiPropertyOptional({ description: 'Allow admin manual correction', default: true })
  @IsOptional() @IsBoolean() allowManualCorrection?: boolean;
}

// ── Batch ─────────────────────────────────────────────────────────────────────
export class CreateBatchDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() courseId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() level?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) daysOfWeek?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeZone?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number;
  @ApiPropertyOptional({ type: [String], description: 'StudentProfile ids to add' })
  @IsOptional() @IsArray() @IsString({ each: true }) studentIds?: string[];
}

export class UpdateBatchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() level?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] })
  @IsOptional() @IsIn(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) daysOfWeek?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeZone?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number;
}

export class AssignStudentsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) studentIds!: string[];
}

// ── Class scheduling ──────────────────────────────────────────────────────────
export class ScheduleClassDto {
  @ApiProperty() @IsString() @IsNotEmpty() batchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiProperty({ description: 'ISO start datetime' }) @IsString() @IsNotEmpty() startsAt!: string;
  @ApiProperty({ description: 'ISO end datetime' }) @IsString() @IsNotEmpty() endsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingUrl?: string;
}

// Bulk-generate classes from the batch's weekly schedule between two dates.
export class GenerateClassesDto {
  @ApiProperty() @IsString() @IsNotEmpty() batchId!: string;
  @ApiProperty({ description: 'ISO from date' }) @IsString() @IsNotEmpty() from!: string;
  @ApiProperty({ description: 'ISO to date' }) @IsString() @IsNotEmpty() to!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingUrl?: string;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
export class JoinClassDto {
  @ApiPropertyOptional() @IsOptional() @IsString() device?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() browser?: string;
}

export class MarkAttendanceDto {
  @ApiProperty() @IsString() @IsNotEmpty() studentId!: string;
  @ApiProperty({ enum: ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'LEAVE_APPROVED', 'NO_SHOW'] })
  @IsIn(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'LEAVE_APPROVED', 'NO_SHOW']) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}

export class BulkMarkAttendanceDto {
  @ApiProperty({ type: [MarkAttendanceDto] })
  @IsArray() entries!: MarkAttendanceDto[];
}

export class EndClassDto {
  @ApiPropertyOptional({ enum: ['PRESENT', 'LATE', 'ABSENT', 'CLASS_CANCELLED'] })
  @IsOptional() @IsIn(['PRESENT', 'LATE', 'ABSENT', 'CLASS_CANCELLED']) teacherStatus?: string;
}

// ── Manual correction ─────────────────────────────────────────────────────────
export class RequestCorrectionDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId!: string;
  @ApiProperty({ enum: ['STUDENT', 'TEACHER'] }) @IsIn(['STUDENT', 'TEACHER']) targetType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() studentId?: string;
  @ApiProperty({ description: 'New status to apply' }) @IsString() @IsNotEmpty() toStatus!: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
}

export class ReviewCorrectionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
