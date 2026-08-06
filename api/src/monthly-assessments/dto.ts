import {
  IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min,
  MinLength, ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'] as const;
const TEMPLATE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

// ─── Grading scales ──────────────────────────────────────────────────────────

export class GradeBandDto {
  @IsString() @MinLength(1) grade!: string;
  @IsNumber() @Min(0) @Max(100) minPercent!: number;
  @IsNumber() @Min(0) @Max(100) maxPercent!: number;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class SaveGradingScaleDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GradeBandDto) bands!: GradeBandDto[];
}

export class UpdateGradingScaleDto extends PartialType(SaveGradingScaleDto) {}

// ─── Templates + criteria ────────────────────────────────────────────────────

export class CriterionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MinLength(1) name!: string;
  @IsInt() @Min(1) maxMarks!: number;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
}

export class CreateTemplateDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() courseId!: string;
  @IsOptional() @IsString() levelId?: string;
  @IsOptional() @IsIn(FREQUENCIES as unknown as string[]) frequency?: string;
  @IsOptional() @IsInt() @Min(1) maxMarks?: number;
  @IsOptional() @IsInt() @Min(0) passingMarks?: number;
  @IsOptional() @IsString() gradingScaleId?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsIn(TEMPLATE_STATUSES as unknown as string[]) status?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CriterionDto) criteria!: CriterionDto[];
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}

export class ListTemplatesQuery {
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() levelId?: string;
  @IsOptional() @IsIn(TEMPLATE_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() search?: string;
}

// ─── Module config (deadlines + ranking weightage) ───────────────────────────

export class RankingWeightageDto {
  @IsNumber() @Min(0) @Max(100) assessment!: number;
  @IsNumber() @Min(0) @Max(100) attendance!: number;
  @IsNumber() @Min(0) @Max(100) assignment!: number;
  @IsNumber() @Min(0) @Max(100) homework!: number;
  @IsNumber() @Min(0) @Max(100) teacherRating!: number;
}

export class SaveAssessmentConfigDto {
  @IsOptional() @IsInt() @Min(0) @Max(28) minDaysBeforeAssessment?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) dueDaysAfterCycleEnd?: number;
  @IsOptional() @IsInt() @Min(0) @Max(30) reminderDaysBefore?: number;
  @IsOptional() @IsBoolean() overdueReminders?: boolean;
  @IsOptional() @IsBoolean() requireSupervisorApproval?: boolean;
  @IsOptional() @IsBoolean() autoRankOnPublish?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) studentVisibleTopN?: number;
  @IsOptional() @ValidateNested() @Type(() => RankingWeightageDto) ranking?: RankingWeightageDto;
}

// ─── Badge configuration ─────────────────────────────────────────────────────

export class SaveBadgeDto {
  @IsString() rule!: string;
  @IsOptional() @IsString() @MinLength(1) label?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(0) threshold?: number;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

// ─── The assessment itself ───────────────────────────────────────────────────

export class ScoreDto {
  @IsOptional() @IsString() criterionId?: string;
  @IsString() @MinLength(1) criterionName!: string;
  @IsInt() @Min(0) maxMarks!: number;
  @IsNumber() @Min(0) marks!: number;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class SaveAssessmentDto {
  @IsString() studentId!: string;
  @IsString() courseId!: string;
  /** ISO date inside the cycle being assessed. Omit for the current due cycle. */
  @IsOptional() @IsString() cycleStart?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScoreDto) scores!: ScoreDto[];
  @IsOptional() @IsString() teacherRemarks?: string;
  @IsOptional() @IsString() recommendations?: string;
}

export class ReturnAssessmentDto {
  @IsString() @MinLength(3) reason!: string;
}

export class ReopenAssessmentDto {
  @IsOptional() @IsString() reason?: string;
}

export class SubmitFeedbackDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsString() @MinLength(2) comment!: string;
}

export class ReviewFeedbackDto {
  @IsOptional() @IsString() note?: string;
}

export class ListAssessmentsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() status?: string;
  /** ISO date; matches the cycle whose start equals it. */
  @IsOptional() @IsString() cycleStart?: string;
  @IsOptional() @IsString() monthLabel?: string;
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

export class GenerateRankingDto {
  /** Restrict to one course; omitted = every course with published assessments. */
  @IsOptional() @IsString() courseId?: string;
  /** ISO cycle start. Omitted = the most recent cycle with published assessments. */
  @IsOptional() @IsString() cycleStart?: string;
  /** Generate without publishing, so staff can review the table first. */
  @IsOptional() @IsBoolean() publish?: boolean;
}

export class ListRankingsQuery {
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() cycleStart?: string;
  @IsOptional() @IsInt() @Type(() => Number) @Min(1) @Max(500) limit?: number;
}
