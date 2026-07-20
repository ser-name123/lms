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
  ValidateNested,
} from 'class-validator';
import { LeadPriority, LeadStatus } from '../generated/prisma/enums';

export const LEARN_OPTIONS = ['Quran', 'Arabic Language', 'Islamic Studies'] as const;
export const SESSION_FOR_OPTIONS = ['MYSELF', 'FAMILY_MEMBER'] as const;
export const TEACHER_PREFERENCE_OPTIONS = ['Male', 'Female', 'Either'] as const;
export const HOW_FOUND_OPTIONS = ['FRIEND', 'SOCIAL_MEDIA', 'EMAIL', 'GOOGLE', 'OTHER'] as const;

/** One extra child attending the same trial slot. */
export class SiblingDto {
  @ApiProperty() @IsString() @IsNotEmpty() firstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
}

/*
 * Public trial booking form.
 *
 * Deliberately short: name, contact, what they want to learn, and a concrete
 * date + slot. Everything the old form asked for up front (grade, school, DOB,
 * level, language, goals, medical notes) is the coach's job to collect once
 * there is a real conversation — asking a stranger for it costs bookings.
 */
export class CreateLeadDto {
  @ApiProperty() @IsString() @IsNotEmpty() studentFirstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() studentLastName!: string;

  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ description: 'National number, without the dial code' })
  @IsString()
  @IsNotEmpty()
  mobile!: string;
  @ApiPropertyOptional({ example: '+91', description: 'Dial code, auto-detected from the visitor' })
  @IsOptional()
  @IsString()
  countryCode?: string;
  @ApiPropertyOptional({ description: 'Auto-detected, visitor may override' })
  @IsOptional()
  @IsString()
  country?: string;
  @ApiPropertyOptional({ description: 'IANA zone of the visitor' })
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiPropertyOptional({ enum: LEARN_OPTIONS })
  @IsOptional()
  @IsIn(LEARN_OPTIONS as unknown as string[])
  interestedSubject?: string;

  @ApiPropertyOptional({ enum: SESSION_FOR_OPTIONS })
  @IsOptional()
  @IsIn(SESSION_FOR_OPTIONS as unknown as string[])
  sessionFor?: string;

  @ApiPropertyOptional({ enum: TEACHER_PREFERENCE_OPTIONS })
  @IsOptional()
  @IsIn(TEACHER_PREFERENCE_OPTIONS as unknown as string[])
  preferredTeacherGender?: string;

  @ApiPropertyOptional({ enum: HOW_FOUND_OPTIONS })
  @IsOptional()
  @IsIn(HOW_FOUND_OPTIONS as unknown as string[])
  howFound?: string;

  @ApiProperty({ example: '2026-08-01', description: 'Tomorrow to +30 days' })
  @IsString()
  @IsNotEmpty()
  preferredDate!: string;

  @ApiProperty({ example: '10:30', description: 'One of the offered 30-minute slots' })
  @IsString()
  @IsNotEmpty()
  preferredSlot!: string;

  @ApiPropertyOptional({ type: [SiblingDto], description: 'Extra children on the same slot' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiblingDto)
  siblings?: SiblingDto[];

  // Tracking (client supplies UTM/referrer/browser/device; IP added server-side)
  @ApiPropertyOptional() @IsOptional() @IsString() browser?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() device?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referralUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() utmSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() utmCampaign?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() utmMedium?: string;
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
