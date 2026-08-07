"use client";

import { Badge, type Tone } from "@/components/ui/badge";
import type {
  LeaveCategory, LeaveImpactOption, LeaveImpactStatus, LeaveRequestStatus, LeaveType,
} from "@/lib/api";

/*
 * The vocabulary of Module 9, in one place.
 *
 * Five panels render the same leave row, so a status that reads "DECLINED" on
 * one screen and "Rejected" on another is a bug waiting to be filed as one.
 */

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  // Pre-Module-9 values, still on existing rows.
  SICK: "Sick leave",
  CASUAL: "Casual leave",
  ANNUAL: "Annual leave",
  UNPAID: "Unpaid leave",
  OTHER: "Other",
  // §9.1 staff leave
  EMERGENCY: "Emergency leave",
  PERSONAL: "Personal leave",
  TRAINING: "Training leave",
  // §9.1 teacher unavailability
  MEDICAL: "Medical leave",
  VACATION: "Vacation",
  FAMILY_EMERGENCY: "Family emergency",
  SCHEDULE_CONFLICT: "Temporary schedule conflict",
  RELIGIOUS_HOLIDAY: "Religious holiday",
};

export const CATEGORY_LABELS: Record<LeaveCategory, string> = {
  STAFF_LEAVE: "Staff leave",
  TEACHER_UNAVAILABILITY: "Teacher unavailability",
};

const STATUS_TONE: Record<LeaveRequestStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "good",
  DECLINED: "critical",
  CANCELLED: "neutral",
  INFO_REQUESTED: "accent",
};

/*
 * DECLINED is shown as "Rejected" — the spec's word. The enum value predates
 * Module 9 and renaming it in the database would orphan existing rows, so the
 * translation happens here rather than in a migration.
 */
const STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Rejected",
  CANCELLED: "Cancelled",
  INFO_REQUESTED: "Info requested",
};

export function LeaveStatusBadge({ status }: { status: LeaveRequestStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function PaidBadge({ isPaid }: { isPaid: boolean | null }) {
  // Null means the row was approved before §9.3 existed. Saying "Paid" would be
  // a guess about someone's wages, so it says what it knows.
  if (isPaid === null) return <Badge tone="neutral">Not recorded</Badge>;
  return <Badge tone={isPaid ? "good" : "warning"}>{isPaid ? "Paid" : "Unpaid"}</Badge>;
}

export const IMPACT_OPTION_LABELS: Record<LeaveImpactOption, string> = {
  PENDING_REVIEW: "Awaiting decision",
  WAIT_FOR_TEACHER: "Waiting for the same teacher",
  TEMPORARY_TEACHER: "Temporary teacher",
  RESCHEDULE: "Classes rescheduled",
};

const IMPACT_OPTION_TONE: Record<LeaveImpactOption, Tone> = {
  PENDING_REVIEW: "warning",
  WAIT_FOR_TEACHER: "accent",
  TEMPORARY_TEACHER: "good",
  RESCHEDULE: "neutral",
};

export function ImpactOptionBadge({ option }: { option: LeaveImpactOption }) {
  return <Badge tone={IMPACT_OPTION_TONE[option] ?? "neutral"}>{IMPACT_OPTION_LABELS[option] ?? option}</Badge>;
}

const IMPACT_STATUS_LABEL: Record<LeaveImpactStatus, string> = {
  OPEN: "Needs a decision",
  RESOLVED: "Arranged",
  REVERTED: "Stood down",
};

export function ImpactStatusBadge({ status }: { status: LeaveImpactStatus }) {
  const tone: Tone = status === "OPEN" ? "warning" : status === "RESOLVED" ? "good" : "neutral";
  return <Badge tone={tone}>{IMPACT_STATUS_LABEL[status] ?? status}</Badge>;
}

/** "12 Mar 2026" */
export const fmtDay = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/** "12 Mar, 18:00" */
export const fmtDateTime = (d?: string | Date | null) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/** "12 – 16 Mar 2026", collapsing a single day to just that day. */
export const fmtWindow = (from?: string | Date | null, to?: string | Date | null) => {
  if (!from) return "—";
  const a = new Date(from);
  const b = to ? new Date(to) : a;
  if (a.toDateString() === b.toDateString()) return fmtDay(a);
  return `${a.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${fmtDay(b)}`;
};

/** `<input type="date">` wants YYYY-MM-DD in local terms. */
export const toDateInput = (d?: string | Date | null) => {
  const x = d ? new Date(d) : new Date();
  const off = x.getTimezoneOffset();
  return new Date(x.getTime() - off * 60_000).toISOString().slice(0, 10);
};

/**
 * Days between two dates, inclusive — the same rule the server uses so the form
 * can show the total before it is saved without the two ever disagreeing.
 */
export function totalDaysBetween(start: string, end: string, nonWorkingWeekdays: number[] = []): number {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) return 0;
  const skip = new Set(nonWorkingWeekdays.filter((n) => n >= 0 && n <= 6));
  if (skip.size >= 7) return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  let days = 0;
  for (const c = new Date(from); c <= to; c.setUTCDate(c.getUTCDate() + 1)) {
    if (!skip.has(c.getUTCDay())) days += 1;
  }
  return days;
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-1 text-xl font-black ${tone ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

export function EmptyLeaves({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-10 text-center">
      <p className="text-sm font-bold text-ink">Nothing here</p>
      <p className="mt-1 text-xs text-ink-3">{text}</p>
    </div>
  );
}
