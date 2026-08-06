import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

const MEETING_TYPES = [
  'BIWEEKLY_TEACHER', 'MONTHLY_STAFF', 'TRAINING', 'PERFORMANCE_REVIEW',
  'SUPERVISOR_TEACHER', 'COACH_TEACHER', 'ADMIN_STAFF', 'TEACHER_TEACHER',
  'DEPARTMENT', 'STUDENT_MEETING',
];
const PLATFORMS = ['JITSI', 'ZOOM', 'TEAMS', 'OTHER'];
const ACTION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const ACTION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ATTENDANCE_STATUSES = ['INVITED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

/*
 * Who is invited. The spec lets an organiser pick individuals OR whole groups
 * ("All Teachers", "Supervisors", "Departments"), so both arrive and are merged
 * server-side — resolving a group in the browser would freeze the invitee list
 * at page-load time and miss anyone hired since.
 */
export class ParticipantSelectionDto {
  /** Explicit User ids. */
  @IsOptional() @IsArray() @IsString({ each: true }) userIds?: string[];
  /** Whole roles: TEACHER, SUPERVISOR, ACADEMIC_COACH, ADMIN. */
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
  /** Teachers of these courses — the spec's "Departments". */
  @IsOptional() @IsArray() @IsString({ each: true }) courseIds?: string[];
  /** Student profile ids, for a coach/supervisor ↔ student meeting. */
  @IsOptional() @IsArray() @IsString({ each: true }) studentIds?: string[];
  /** Ids from the above that are optional attendees. */
  @IsOptional() @IsArray() @IsString({ each: true }) optionalUserIds?: string[];
}

export class CreateMeetingDto {
  @IsString() @MaxLength(200) title!: string;
  @IsIn(MEETING_TYPES) type!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @IsDateString() startsAt!: string;
  /** Either endsAt or durationMins; the service derives whichever is missing. */
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsInt() @Min(5) @Max(600) durationMins?: number;
  @IsOptional() @IsString() timeZone?: string;

  @IsOptional() @IsIn(PLATFORMS) platform?: string;
  /** Ignored for JITSI, which generates its own room. */
  @IsOptional() @IsString() meetingLink?: string;

  @IsOptional() participants?: ParticipantSelectionDto;
  /** Defaults to the creator; admin/supervisor may organise on someone's behalf. */
  @IsOptional() @IsString() organizerId?: string;
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsIn(MEETING_TYPES) type?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(PLATFORMS) platform?: string;
  @IsOptional() @IsString() meetingLink?: string;
  @IsOptional() participants?: ParticipantSelectionDto;
}

export class RescheduleMeetingDto {
  @IsDateString() startsAt!: string;
  @IsOptional() @IsInt() @Min(5) @Max(600) durationMins?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CancelMeetingDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class SaveMinutesDto {
  @IsOptional() @IsString() @MaxLength(20000) summary?: string;
  @IsOptional() @IsString() @MaxLength(20000) discussionPoints?: string;
  @IsOptional() @IsString() @MaxLength(20000) decisions?: string;
  @IsOptional() @IsString() @MaxLength(20000) remarks?: string;
}

export class MarkAttendanceDto {
  @IsString() userId!: string;
  @IsIn(ATTENDANCE_STATUSES) status!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ActionItemDto {
  @IsString() @MaxLength(2000) description!: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsIn(ACTION_PRIORITIES) priority?: string;
  @IsOptional() @IsIn(ACTION_STATUSES) status?: string;
}

export class UpdateActionItemDto {
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsIn(ACTION_PRIORITIES) priority?: string;
  @IsOptional() @IsIn(ACTION_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) completionNote?: string;
}

export class AddAttachmentDto {
  @IsString() @MaxLength(300) title!: string;
  @IsString() @MaxLength(2000) url!: string;
  @IsOptional() @IsIn(['RECORDING', 'DOCUMENT', 'PRESENTATION', 'TRAINING_MATERIAL']) kind?: string;
}

export class ListMeetingsQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() organizerId?: string;
  @IsOptional() @IsString() participantId?: string;
  /*
   * Paged, because the business rule is that meeting history is kept for ever.
   * A fixed `take` reads as "this is all of them" while quietly dropping the
   * oldest — the page number and total make the truncation visible instead.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class SaveMeetingConfigDto {
  @IsOptional() @IsInt() @Min(0) @Max(120) lateAfterMins?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) minAttendancePct?: number;
  @IsOptional() @IsInt() @Min(1) @Max(168) reminderHoursBefore?: number;
  @IsOptional() @IsInt() @Min(5) @Max(720) finalReminderMins?: number;
  @IsOptional() @IsBoolean() notifyOnStart?: boolean;
  @IsOptional() @IsBoolean() notifyOnAbsence?: boolean;
  @IsOptional() @IsBoolean() requireMinutesToComplete?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(240) absenceGraceMins?: number;
  @IsOptional() @IsString() jitsiBaseUrl?: string;
  @IsOptional() @IsInt() @Min(1) @Max(52) defaultGenerateAheadWeeks?: number;
}

export class SaveSeriesDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsIn(MEETING_TYPES) type?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(52) intervalWeeks?: number;
  @IsOptional() @IsInt() @Min(0) @Max(6) weekday?: number;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsInt() @Min(5) @Max(600) durationMins?: number;
  @IsOptional() @IsDateString() anchorDate?: string;
  @IsOptional() @IsString() organizerId?: string;
  @IsOptional() @IsIn(PLATFORMS) platform?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) inviteRoles?: string[];
  /** §8.2's "(Optional: Academic Coach and Admin may attend.)" */
  @IsOptional() @IsArray() @IsString({ each: true }) optionalInviteRoles?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(52) generateAheadWeeks?: number;
}
