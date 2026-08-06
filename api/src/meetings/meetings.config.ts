/*
 * Module 8 configuration: the recurring-meeting defaults, reminder offsets and
 * the thresholds that turn a join time into an attendance status.
 *
 * Stored as one JSON blob in SystemSetting, the same way FINANCE_CONFIG and
 * ASSESSMENT_CONFIG are — there is one of it, it is read on nearly every
 * request, and a row per field would be joins for no gain. The recurrence rule
 * itself is NOT here: that is a `StaffMeetingSeries` row, because an academy
 * can run more than one recurring meeting and each needs its own weekday, time
 * and invitee list.
 */

export const MEETING_CONFIG_KEY = 'MEETING_CONFIG';

export interface MeetingConfig {
  /** Minutes after the start time before a join counts as LATE rather than PRESENT. */
  lateAfterMins: number;
  /**
   * Share of the meeting a participant must actually be in to count as attending.
   * Someone who joins for ninety seconds of an hour has not attended it.
   */
  minAttendancePct: number;
  /** Send the day-before reminder this many hours out. */
  reminderHoursBefore: number;
  /** Send the final reminder this many minutes out. */
  finalReminderMins: number;
  /** Tell participants when the organiser starts the meeting. */
  notifyOnStart: boolean;
  /** Notify a participant (and staff) when they are marked absent. */
  notifyOnAbsence: boolean;
  /** Minutes must be published before a meeting can be marked COMPLETED. */
  requireMinutesToComplete: boolean;
  /** How long after the end time the sweep waits before marking non-joiners absent. */
  absenceGraceMins: number;
  /** Base URL for auto-generated Jitsi rooms. */
  jitsiBaseUrl: string;
  /** How far ahead the series generator creates occurrences. */
  defaultGenerateAheadWeeks: number;
}

export const DEFAULT_MEETING_CONFIG: MeetingConfig = {
  lateAfterMins: 10,
  minAttendancePct: 50,
  reminderHoursBefore: 24,
  finalReminderMins: 60,
  notifyOnStart: true,
  notifyOnAbsence: true,
  requireMinutesToComplete: true,
  absenceGraceMins: 15,
  jitsiBaseUrl: 'https://meet.jit.si',
  defaultGenerateAheadWeeks: 8,
};

/** The spec's default biweekly staff meeting: alternate Saturdays, 6pm, 60 min. */
export const DEFAULT_SERIES = {
  name: 'Biweekly Teacher Meeting',
  type: 'BIWEEKLY_TEACHER',
  intervalWeeks: 2,
  weekday: 6, // Saturday
  startTime: '18:00',
  durationMins: 60,
  inviteRoles: ['TEACHER', 'SUPERVISOR'],
  // The spec's exact wording: "(Optional: Academic Coach and Admin may attend.)"
  optionalInviteRoles: ['ACADEMIC_COACH', 'ADMIN'],
  description: 'Standing biweekly meeting for all active teachers and supervisors.',
} as const;

/** Types that count towards the training-attendance report. */
export const TRAINING_TYPES = ['TRAINING'];

/**
 * A Jitsi room name for a meeting.
 *
 * Derived from the meeting id, not the title: a room called
 * "Biweekly Teacher Meeting" is guessable and joinable by anyone on the public
 * Jitsi instance, whereas a uuid-derived one is not. The prefix keeps the
 * academy's rooms recognisable in logs.
 */
export function jitsiRoomFor(meetingId: string, baseUrl: string): string {
  const room = `alfurqan-${meetingId.replace(/-/g, '')}`;
  return `${baseUrl.replace(/\/+$/, '')}/${room}`;
}

/**
 * Attendance status from the times actually recorded.
 *
 * Returns EXCUSED for nobody — that is a human decision and is never derived.
 * A participant who never joined is ABSENT; one who joined after the grace
 * window, or who was present for less than the required share of the meeting,
 * is LATE. Anything else is PRESENT.
 */
export function attendanceStatusFor(
  joinedAt: Date | null | undefined,
  leftAt: Date | null | undefined,
  meeting: { startsAt: Date; endsAt: Date; durationMins: number },
  cfg: Pick<MeetingConfig, 'lateAfterMins' | 'minAttendancePct'>,
): { status: 'PRESENT' | 'LATE' | 'ABSENT'; durationMins: number; lateMinutes: number } {
  if (!joinedAt) return { status: 'ABSENT', durationMins: 0, lateMinutes: 0 };

  const joined = new Date(joinedAt);
  const left = leftAt ? new Date(leftAt) : new Date(meeting.endsAt);
  const durationMins = Math.max(0, Math.round((left.getTime() - joined.getTime()) / 60_000));

  const lateMinutes = Math.max(
    0,
    Math.round((joined.getTime() - new Date(meeting.startsAt).getTime()) / 60_000),
  );

  const scheduled = meeting.durationMins > 0 ? meeting.durationMins : 1;
  const attendedPct = (durationMins / scheduled) * 100;

  // Too little of the meeting to call it attendance, but they did turn up —
  // LATE rather than ABSENT, because ABSENT should mean "never came".
  if (attendedPct < cfg.minAttendancePct) {
    return { status: 'LATE', durationMins, lateMinutes };
  }
  if (lateMinutes > cfg.lateAfterMins) {
    return { status: 'LATE', durationMins, lateMinutes };
  }
  return { status: 'PRESENT', durationMins, lateMinutes };
}

/**
 * The occurrence dates of a series between two instants.
 *
 * Stepped from the anchor in whole `intervalWeeks` blocks so "every alternate
 * Saturday" stays on the same alternation for ever — computing it from "this
 * week" instead would drift the moment the generator missed a run.
 */
export function occurrencesBetween(
  series: { anchorDate: Date; intervalWeeks: number; startTime: string },
  from: Date,
  to: Date,
  limit = 200,
): Date[] {
  const step = Math.max(1, series.intervalWeeks) * 7 * 86_400_000;
  const [hh, mm] = parseTime(series.startTime);

  const anchor = new Date(series.anchorDate);
  anchor.setUTCHours(hh, mm, 0, 0);

  const out: Date[] = [];
  if (!Number.isFinite(anchor.getTime()) || step <= 0) return out;

  // Jump straight to the first occurrence at or after `from` rather than
  // walking from the anchor, which may be years back.
  let t = anchor.getTime();
  if (t < from.getTime()) {
    const skipped = Math.ceil((from.getTime() - t) / step);
    t += skipped * step;
  }
  while (t <= to.getTime() && out.length < limit) {
    out.push(new Date(t));
    t += step;
  }
  return out;
}

/** "18:00" → [18, 0]. Anything unparseable falls back to 18:00. */
export function parseTime(value: string | null | undefined): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return [18, 0];
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return [18, 0];
  return [hh, mm];
}

/**
 * The first date on or after `from` that falls on `weekday`, at `startTime`.
 * Used to seed a series' anchor from an admin's "every alternate Saturday".
 */
export function nextWeekdayAt(from: Date, weekday: number, startTime: string): Date {
  const [hh, mm] = parseTime(startTime);
  const d = new Date(from);
  d.setUTCHours(hh, mm, 0, 0);
  const delta = (((weekday - d.getUTCDay()) % 7) + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  // Landed on today but the time has already gone — take the next one.
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
