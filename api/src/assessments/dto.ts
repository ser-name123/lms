import {
  IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const QUESTION_TYPES = [
  'MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCH', 'SHORT_ANSWER', 'LONG_ANSWER',
  'ESSAY', 'CODING', 'AUDIO', 'SPEAKING', 'FILE_UPLOAD',
] as const;

export const OBJECTIVE_TYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCH'] as const;

export const ASSESSMENT_TYPES = [
  'QUIZ', 'WEEKLY_TEST', 'MONTHLY_TEST', 'UNIT_TEST', 'MID_TERM', 'FINAL_EXAM',
  'ORAL_TEST', 'PRACTICE_TEST', 'MOCK_TEST',
] as const;

export class OptionDto {
  @IsString() id!: string;
  @IsString() text!: string;
  @IsOptional() @IsBoolean() correct?: boolean;
}

export class RubricItemDto {
  @IsString() name!: string;
  @IsInt() @Min(1) max!: number;
}

export class MediaDto {
  @IsString() url!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() kind?: string; // image / audio / video
}

export class TestCaseDto {
  @IsString() input!: string;
  @IsString() expected!: string;
  @IsOptional() @IsBoolean() sample?: boolean;
}

// ── Question bank ─────────────────────────────────────────────────────────────
export class CreateQuestionDto {
  @IsString() subject!: string;
  @IsOptional() @IsString() chapter?: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['EASY', 'MEDIUM', 'HARD']) difficulty?: string;
  @IsIn(QUESTION_TYPES as unknown as string[]) type!: string;
  @IsString() @MinLength(1) text!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  @IsOptional() @IsString() correctAnswer?: string;
  @IsOptional() @IsInt() @Min(0) marks?: number;
  @IsOptional() @IsNumber() @Min(0) negativeMarks?: number;
  @IsOptional() @IsInt() @Min(0) estimatedTime?: number;
  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MediaDto) media?: MediaDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RubricItemDto) rubric?: RubricItemDto[];
  @IsOptional() @IsString() language?: string; // CODING
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TestCaseDto) testCases?: TestCaseDto[]; // CODING
}

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

export class ListQuestionsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() difficulty?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() archived?: string; // "true" to include only archived
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number = 50;
}

// ── Assessment ────────────────────────────────────────────────────────────────
export class RandomRulesDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsInt() @Min(0) easy?: number;
  @IsOptional() @IsInt() @Min(0) medium?: number;
  @IsOptional() @IsInt() @Min(0) hard?: number;
}

export class CreateAssessmentDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() chapter?: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() skillId?: string;
  @IsOptional() @IsIn(ASSESSMENT_TYPES as unknown as string[]) type?: string;
  @IsOptional() @IsString() instructions?: string;

  @IsOptional() @IsInt() @Min(1) durationMin?: number;
  @IsOptional() @IsInt() @Min(1) totalMarks?: number;
  @IsOptional() @IsInt() @Min(0) passingMarks?: number;
  @IsOptional() @IsInt() @Min(0) attemptsAllowed?: number;
  @IsOptional() @IsIn(['FIXED', 'RANDOM']) questionOrder?: string;
  @IsOptional() @IsBoolean() allowBack?: boolean;
  @IsOptional() @IsBoolean() showResultImmediately?: boolean;
  @IsOptional() @IsBoolean() negativeMarking?: boolean;

  @IsOptional() @IsIn(['MANUAL', 'RANDOM']) selectionMode?: string;
  @IsOptional() @ValidateNested() @Type(() => RandomRulesDto) randomRules?: RandomRulesDto;

  @IsOptional() @IsString() startAt?: string;
  @IsOptional() @IsString() endAt?: string;
  @IsOptional() @IsString() publishAt?: string;
  @IsOptional() @IsIn(['DRAFT', 'SCHEDULED', 'PUBLISHED']) status?: string;

  @IsOptional() @IsIn(['BATCH', 'SELECTED']) targetType?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) targetStudentIds?: string[];

  @IsOptional() @IsBoolean() certificateEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) certificateThreshold?: number;
  @IsOptional() @IsBoolean() proctored?: boolean;

  // Manual question selection: bank question ids (in order).
  @IsOptional() @IsArray() @IsString({ each: true }) questionIds?: string[];
}

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {}

export class SetQuestionsDto {
  @IsArray() @IsString({ each: true }) questionIds!: string[];
}

export class ListAssessmentsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number = 50;
}

// ── Attempts (student) ────────────────────────────────────────────────────────
export class SaveAnswerDto {
  @IsString() questionId!: string;
  @IsOptional() response?: unknown; // option ids array / text / fileUrl / match map
  @IsOptional() @IsBoolean() markedForReview?: boolean;
  @IsOptional() @IsInt() @Min(0) timeSpentSec?: number;
}

export class SubmitAttemptDto {
  @IsOptional() @IsBoolean() autoSubmitted?: boolean;
  @IsOptional() @IsInt() @Min(0) timeSpentSec?: number;
  @IsOptional() @IsInt() @Min(0) violations?: number;
  @IsOptional() @IsArray() proctorLog?: { type: string; at: string }[];
  // Optional final snapshot of all answers (belt-and-suspenders over auto-save).
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SaveAnswerDto) answers?: SaveAnswerDto[];
}

// ── Teacher evaluation (subjective) ───────────────────────────────────────────
export class GradeAnswerDto {
  @IsString() questionId!: string;
  @IsNumber() @Min(0) awardedMarks!: number;
  @IsOptional() rubricScores?: Record<string, number>;
  @IsOptional() @IsString() feedback?: string;
}

export class EvaluateAttemptDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GradeAnswerDto) answers?: GradeAnswerDto[];
  @IsOptional() @IsString() teacherFeedback?: string;
  @IsOptional() @IsBoolean() publish?: boolean; // publish this attempt's result immediately
}
