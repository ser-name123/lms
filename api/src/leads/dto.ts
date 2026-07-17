import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LeadPriority, LeadStatus } from '../generated/prisma/enums';

// Public website lead form. Only the essentials are required so a genuine
// inquiry is never blocked by an optional field.
export class CreateLeadDto {
  // Section 1 — Student
  @ApiProperty() @IsString() @IsNotEmpty() studentFirstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() studentLastName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentGrade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentSchool?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeZone?: string;

  // Section 2 — Parent
  @ApiPropertyOptional() @IsOptional() @IsString() parentName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relationship?: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() mobile!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() whatsappNumber?: string;

  // Section 3 — Learning requirements
  @ApiPropertyOptional() @IsOptional() @IsString() interestedSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preferredLanguage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preferredTeacherGender?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) preferredDays?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) preferredTimeSlots?: string[];

  // Section 4 — Additional questions
  @ApiPropertyOptional() @IsOptional() @IsString() learningGoal?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() previousCoaching?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specialRequirements?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() medicalDisability?: string;

  // Section 5 — Consent (must be accepted client-side; captured for audit)
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptPrivacy?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptTerms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() recaptchaToken?: string;

  // Tracking (client supplies UTM/referrer/browser/device; IP added server-side)
  @ApiPropertyOptional() @IsOptional() @IsString() browser?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() device?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referralUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() utmSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() utmCampaign?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() utmMedium?: string;
}

export class VerifyLeadOtpDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() otp!: string;
}

export class CheckLeadDuplicateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobile?: string;
}

// Admin/coach update: status move, priority, coach assignment, or a note.
export class UpdateLeadDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsIn(Object.values(LeadStatus))
  status?: string;

  @ApiPropertyOptional({ enum: LeadPriority })
  @IsOptional()
  @IsIn(Object.values(LeadPriority))
  priority?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() assignedCoachId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class EvaluateLeadDto {
  // { English: 8, Reading: 5, Listening: 9, ... } each 1–10.
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  @IsObject()
  scores!: Record<string, number>;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class AssignTeacherLeadDto {
  // Provide a teacherId for a manual assign, or set auto=true to let the engine
  // pick the best-fit teacher.
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() auto?: boolean;
}

// ── Phase 3 — Trial scheduling / meeting / attendance ───────────────────────
export class ScheduleTrialDto {
  @ApiProperty({ description: 'ISO datetime of the trial class' })
  @IsString() @IsNotEmpty() scheduledAt!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional({ default: 30 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(240) durationMins?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() timeZone?: string;
  @ApiPropertyOptional({ description: 'Zoom / Google Meet' })
  @IsOptional() @IsString() meetingProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingLink?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateTrialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(240) durationMins?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() timeZone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingLink?: string;
  @ApiPropertyOptional({ enum: ['SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] })
  @IsOptional() @IsIn(['SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class TrialAttendanceDto {
  @ApiProperty({ enum: ['PRESENT', 'ABSENT'] })
  @IsIn(['PRESENT', 'ABSENT']) attendance!: string;
}

// Step 12 — feedback captured from either the teacher or the parent.
export class TrialFeedbackDto {
  @ApiProperty({ enum: ['teacher', 'parent'] })
  @IsIn(['teacher', 'parent']) side!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() feedback?: string;
  // Teacher: recommend enrolment? Parent: interested in enrolling?
  @ApiPropertyOptional() @IsOptional() @IsBoolean() positive?: boolean;
}

// Step 13 — coach's final decision; ENROLL converts the lead into a student.
export class CoachDecisionDto {
  @ApiProperty({ enum: ['ENROLL', 'REJECT', 'FOLLOW_UP'] })
  @IsIn(['ENROLL', 'REJECT', 'FOLLOW_UP']) decision!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ description: 'LmsCourse code to enrol into on conversion' })
  @IsOptional() @IsString() courseCode?: string;
}

export class ListLeadsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit: number = 20;

  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coachId?: string;

  // Optional numeric guard reused by nothing yet, kept for future range use.
  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  minScore?: number;
}
