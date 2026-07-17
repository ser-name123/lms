import {
  IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, MinLength,
} from 'class-validator';
import { UserStatus } from '../generated/prisma/enums';

// ── Basic profile ──
export class UpdateStudentBasicDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() timeZone?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() profession?: string;
}

// ── Academic information ──
export class UpdateStudentAcademicDto {
  @IsOptional() @IsString() currentGrade?: string;
  @IsOptional() @IsString() currentSchool?: string;
  @IsOptional() @IsString() board?: string;
  @IsOptional() @IsString() learningLevel?: string;
  @IsOptional() @IsString() preferredLanguage?: string;
  @IsOptional() @IsString() learningGoal?: string;
}

// ── Parent / Guardian ──
export class UpdateStudentParentDto {
  @IsOptional() @IsString() parentName?: string;
  @IsOptional() @IsString() guardianName?: string;
  @IsOptional() @IsString() parentRelationship?: string;
  @IsOptional() @IsEmail() parentEmail?: string;
  @IsOptional() @IsString() parentMobile?: string;
  @IsOptional() @IsString() parentWhatsapp?: string;
}

// ── Course / Batch / Teacher assignment ──
export class AssignCourseDto {
  @IsString() courseId!: string; // relational Course id OR courseCode (resolved in service)
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() packageId?: string;
  @IsOptional() @IsIn(['TRIAL', 'PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'])
  status?: string;
}

export class UpdateEnrollmentDto {
  @IsOptional() @IsIn(['TRIAL', 'PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'])
  status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
}

export class ChangeTeacherDto {
  @IsString() enrollmentId!: string;
  @IsString() toTeacherId!: string;
  @IsString() @MinLength(3) reason!: string;
}

export class ChangeBatchDto {
  @IsString() batchId!: string;
  @IsOptional() @IsString() reason?: string;
}

// ── Status / freeze ──
export class SetStudentStatusDto {
  @IsIn(Object.values(UserStatus)) status!: UserStatus;
}

export class FreezeStudentDto {
  @IsString() @MinLength(3) reason!: string;
}

// ── Notes / Documents / Communication ──
export class AddNoteDto {
  @IsString() @MinLength(1) text!: string;
}

export class AddDocumentDto {
  @IsString() type!: string;   // PASSPORT / NATIONAL_ID / BIRTH_CERT / SCHOOL_REPORT / MEDICAL / PHOTO / OTHER
  @IsString() label!: string;
  @IsString() url!: string;
}

export class ArchiveDocumentDto {
  @IsString() docId!: string;
  @IsOptional() archived?: boolean;
}

export class SendStudentMessageDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsIn(['IN_APP', 'EMAIL', 'BOTH']) channel?: string;
  @IsOptional() @IsIn(['STUDENT', 'PARENT', 'BOTH']) audience?: string;
}

// ── Log a manual communication that happened outside the system (call / WhatsApp) ──
export class LogCommunicationDto {
  @IsIn(['CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'INTERNAL']) channel!: string;
  @IsString() @MinLength(1) summary!: string;
}

// ── Academic Coach ──
export class AssignCoachDto {
  @IsOptional() @IsString() coachId?: string | null;
}

// ── Transfer approval workflow ──
export class RequestTransferDto {
  @IsIn(['TEACHER', 'BATCH', 'COURSE']) kind!: string;
  @IsString() @MinLength(3) reason!: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class DecideTransferDto {
  @IsOptional() @IsString() note?: string;
}
