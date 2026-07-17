import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListProgressDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() coachId?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() status?: string; // progress status (EXCELLENT..CRITICAL) or "AtRisk"
  @IsOptional() @Type(() => Number) @IsInt() minAttendance?: number;
  @IsOptional() @IsString() sortBy?: string;
}

class WeightsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) attendance?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) assignments?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) assessments?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) feedback?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) coach?: number;
}
class ThresholdsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) excellent?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) good?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) average?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) needsAttention?: number;
}
class RiskDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) attendance?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) assignment?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) assessment?: number;
}
export class UpdateProgressConfigDto {
  @IsOptional() weights?: WeightsDto;
  @IsOptional() thresholds?: ThresholdsDto;
  @IsOptional() risk?: RiskDto;
}

export class AddRemarkDto {
  @IsString() text!: string;
}

export class FlagStudentDto {
  @IsOptional() @IsString() @IsIn(['AT_RISK', 'CRITICAL']) level?: string;
  @IsOptional() @IsString() note?: string;
}

export class CreateFeedbackDto {
  @IsString() studentId!: string;
  @IsOptional() @IsString() @IsIn(['CLASS', 'WEEKLY', 'MONTHLY']) kind?: string;
  @IsOptional() @IsString() classSessionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) participation?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) homework?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) communication?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) understanding?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) behavior?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() suggestions?: string;
}

// ── Coach DTOs ──────────────────────────────────────────────────────────────
export class CreateMonthlyReviewDto {
  @IsString() studentId!: string;
  @IsOptional() @IsString() monthLabel?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) academic?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) attendance?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) behavior?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) participation?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) learningSpeed?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) homework?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) communication?: number;
  @IsOptional()
  @IsString()
  @IsIn(['CONTINUE_BATCH', 'MOVE_ADVANCED', 'EXTRA_PRACTICE', 'PARENT_MEETING'])
  recommendation?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateGoalDto {
  @IsString() studentId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() skillId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) currentPct?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) targetPct?: number;
  @IsOptional() @IsString() deadline?: string;
}

export class UpdateGoalDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) currentPct?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) targetPct?: number;
  @IsOptional() @IsString() deadline?: string;
  @IsOptional() @IsString() @IsIn(['ACTIVE', 'ACHIEVED', 'MISSED', 'CANCELLED']) status?: string;
}

export class CreateParentMeetingDto {
  @IsString() studentId!: string;
  @IsString() scheduledAt!: string;
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() actionItems?: unknown;
  @IsOptional() @IsString() nextReviewAt?: string;
}

export class UpdateParentMeetingDto {
  @IsOptional() @IsString() @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() actionItems?: unknown;
  @IsOptional() @IsString() nextReviewAt?: string;
}

export class ResolveRiskDto {
  @IsOptional() @IsString() note?: string;
}
