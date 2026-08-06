"use client";

import { Badge, type Tone } from "@/components/ui/badge";
import type {
  MeetingActionPriority, MeetingActionStatus, MeetingAttendanceStatus,
  MeetingMinutesStatus, MeetingStatus, MeetingType,
} from "@/lib/api";

/*
 * The vocabulary of Module 8, in one place.
 *
 * Every panel — admin, supervisor, coach, teacher, student — renders the same
 * meeting row, so a status that reads "SCHEDULED" on one screen and "Upcoming"
 * on another is a bug waiting to be reported as one. These maps are the single
 * answer to "what does this word look like".
 */

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  BIWEEKLY_TEACHER: "Biweekly teacher meeting",
  MONTHLY_STAFF: "Monthly staff meeting",
  TRAINING: "Training session",
  PERFORMANCE_REVIEW: "Performance review",
  SUPERVISOR_TEACHER: "Supervisor ↔ teacher",
  COACH_TEACHER: "Coach ↔ teacher",
  ADMIN_STAFF: "Admin ↔ staff",
  TEACHER_TEACHER: "Teacher ↔ teacher",
  DEPARTMENT: "Department meeting",
  STUDENT_MEETING: "Meeting with student",
};

/** The types a given role may create. Mirrors what the API will accept. */
export const CREATABLE_TYPES: Record<string, MeetingType[]> = {
  ADMIN: Object.keys(MEETING_TYPE_LABELS) as MeetingType[],
  SUPERVISOR: Object.keys(MEETING_TYPE_LABELS) as MeetingType[],
  ACADEMIC_COACH: ["COACH_TEACHER", "TRAINING", "DEPARTMENT", "PERFORMANCE_REVIEW", "STUDENT_MEETING"],
  // A teacher can meet a colleague or their supervisor, and nothing else —
  // showing them "Performance review" would offer an option the server refuses.
  TEACHER: ["TEACHER_TEACHER", "SUPERVISOR_TEACHER"],
};

const STATUS_TONE: Record<MeetingStatus, Tone> = {
  SCHEDULED: "accent",
  LIVE: "good",
  COMPLETED: "neutral",
  CANCELLED: "critical",
};
const STATUS_LABEL: Record<MeetingStatus, string> = {
  SCHEDULED: "Scheduled",
  LIVE: "Live now",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

const ATT_TONE: Record<MeetingAttendanceStatus, Tone> = {
  INVITED: "neutral",
  PRESENT: "good",
  LATE: "warning",
  ABSENT: "critical",
  EXCUSED: "accent",
};
const ATT_LABEL: Record<MeetingAttendanceStatus, string> = {
  // "Invited" and not "Absent": before the meeting runs, nobody has missed it.
  INVITED: "Invited",
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  EXCUSED: "Excused",
};

export function AttendanceBadge({ status }: { status: MeetingAttendanceStatus }) {
  return <Badge tone={ATT_TONE[status] ?? "neutral"}>{ATT_LABEL[status] ?? status}</Badge>;
}

const MINUTES_TONE: Record<MeetingMinutesStatus, Tone> = {
  NOT_STARTED: "critical",
  DRAFT: "warning",
  PUBLISHED: "good",
};
const MINUTES_LABEL: Record<MeetingMinutesStatus, string> = {
  NOT_STARTED: "No minutes",
  DRAFT: "Minutes in draft",
  PUBLISHED: "Minutes published",
};

export function MinutesBadge({ status }: { status: MeetingMinutesStatus }) {
  return <Badge tone={MINUTES_TONE[status] ?? "neutral"}>{MINUTES_LABEL[status] ?? status}</Badge>;
}

const ACTION_TONE: Record<MeetingActionStatus, Tone> = {
  PENDING: "neutral",
  IN_PROGRESS: "accent",
  COMPLETED: "good",
  CANCELLED: "critical",
};
export const ACTION_LABEL: Record<MeetingActionStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function ActionStatusBadge({ status }: { status: MeetingActionStatus }) {
  return <Badge tone={ACTION_TONE[status] ?? "neutral"}>{ACTION_LABEL[status] ?? status}</Badge>;
}

export const PRIORITY_TONE: Record<MeetingActionPriority, Tone> = {
  LOW: "neutral",
  MEDIUM: "accent",
  HIGH: "warning",
  URGENT: "critical",
};

export function PriorityBadge({ priority }: { priority: MeetingActionPriority }) {
  return <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>;
}

export const PLATFORM_LABEL: Record<string, string> = {
  JITSI: "Jitsi (auto link)",
  ZOOM: "Zoom",
  TEAMS: "Microsoft Teams",
  OTHER: "Other / manual link",
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Formatters ──────────────────────────────────────────────────────────────

export const fmtDateTime = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

export const fmtDay = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDuration = (mins: number) => {
  if (!mins || mins < 1) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

/** A datetime-local input value from an ISO string, in the viewer's own zone. */
export const toLocalInput = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * How a meeting reads relative to now, for the list.
 * Deliberately not derived from `status` alone: a meeting can be SCHEDULED and
 * already over because nobody started it, and calling that "upcoming" is a lie.
 */
export function relativeWhen(startsAt: string, endsAt: string, status: MeetingStatus) {
  if (status === "CANCELLED") return { label: "Cancelled", tone: "critical" as Tone };
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (status === "LIVE" || (now >= start && now <= end)) return { label: "Happening now", tone: "good" as Tone };
  if (now > end) return { label: "Finished", tone: "neutral" as Tone };
  const mins = Math.round((start - now) / 60_000);
  if (mins < 60) return { label: `In ${mins} min`, tone: "warning" as Tone };
  const hours = Math.round(mins / 60);
  if (hours < 24) return { label: `In ${hours}h`, tone: "accent" as Tone };
  return { label: `In ${Math.round(hours / 24)} day(s)`, tone: "neutral" as Tone };
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-1 text-2xl font-black ${tone ?? "text-ink"}`}>{value}</p>
    </div>
  );
}
