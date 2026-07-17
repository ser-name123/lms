import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RubricItemDto {
  @IsString() name!: string;
  @IsInt() @Min(1) max!: number;
}

export class AttachmentDto {
  @IsString() url!: string;
  @IsString() name!: string;
}

export class CreateAssignmentDto {
  @IsString() @MinLength(2) title!: string;
  @IsString() courseId!: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() chapter?: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsIn(['EASY', 'MEDIUM', 'HARD']) difficulty?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsInt() @Min(1) maxMarks?: number;
  @IsOptional() @IsInt() @Min(0) passingMarks?: number;
  @IsOptional() @IsBoolean() lateAllowed?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) latePenaltyPct?: number;
  @IsOptional() @IsString() publishAt?: string;
  @IsOptional() @IsIn(['DRAFT', 'SCHEDULED', 'PUBLISHED']) status?: string;
  @IsOptional() @IsIn(['BATCH', 'SELECTED']) targetType?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) targetStudentIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedFileTypes?: string[];
  @IsOptional() @IsInt() @Min(1) maxFileSizeMb?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RubricItemDto) rubric?: RubricItemDto[];
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class ListAssignmentsQuery {
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

export class SubmitAssignmentDto {
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() fileUrl?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
}

export class GradeSubmissionDto {
  @IsInt() @Min(0) grade!: number;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsString() feedbackFileUrl?: string;
  @IsOptional() rubricScores?: Record<string, number>;
  @IsOptional() @IsBoolean() returned?: boolean;
  @IsOptional() @IsString() returnedReason?: string;
}

export class LifecycleDto {
  @IsOptional() @IsString() reason?: string;
}
