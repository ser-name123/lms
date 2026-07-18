"use client";

/*
 * Widgets that appear on more than one role's dashboard. Each fetches its own
 * slice, so a slow feed never blocks the KPI cards above it.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  GraduationCap,
  Megaphone,
  Receipt,
  Users,
  UserPlus,
  FileCheck2,
  Loader2,
} from "lucide-react";

import Swal from "sweetalert2";

import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  fetchAnnouncementFeed,
  fetchCalendar,
  fetchDashboardActivity,
  fetchReport,
  ApiError,
  fetchNotifications,
  markAllNotificationsRead,
  markAnnouncementRead,
  markNotificationRead,
  type AnnouncementFeedItem,
  type AnnouncementType,
  type AppNotification,
  type CalendarEvent,
  type DashboardActivityItem,
  type ReportPayload,
} from "@/lib/api";
import { WidgetCard } from "./widget-grid";
import { EmptyState, Spinner, clockTime, relativeTime } from "./primitives";

// ─── Announcements ───────────────────────────────────────────────────────────

const ANNOUNCEMENT_TONE: Record<AnnouncementType, Tone> = {
  HOLIDAY: "accent",
  MAINTENANCE: "warning",
  EXAM: "critical",
  COURSE: "good",
  GENERAL: "neutral",
};

export function AnnouncementsWidget() {
  const [items, setItems] = useState<AnnouncementFeedItem[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchAnnouncementFeed()
      .then((a) => active && setItems(a))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, []);

  const onRead = async (id: string) => {
    setItems((prev) => prev?.map((a) => (a.id === id ? { ...a, read: true } : a)) ?? null);
    await markAnnouncementRead(id).catch(() => undefined);
  };

  return (
    <WidgetCard title="Announcements" subtitle="Published by the academy">
      {items === null ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState title="No announcements" icon={Megaphone} />
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className={cn(
                "rounded-lg border border-hairline p-3",
                !a.read && "border-accent/30 bg-accent-soft",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {a.pinned ? <BellRing className="size-3.5 text-accent" aria-hidden /> : null}
                    <span className="truncate">{a.title}</span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-2">{a.body}</p>
                </div>
                <Badge tone={ANNOUNCEMENT_TONE[a.type] ?? "neutral"}>{a.type}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-ink-3">
                  {a.publishedAt ? relativeTime(a.publishedAt) : ""}
                </span>
                <div className="flex items-center gap-2">
                  {a.link ? (
                    <Link href={a.link} className="text-xs font-semibold text-accent hover:underline">
                      Open
                    </Link>
                  ) : null}
                  {!a.read ? (
                    <button
                      type="button"
                      onClick={() => onRead(a.id)}
                      className="text-xs font-semibold text-ink-3 hover:text-ink"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

/*
 * The same feed the topbar bell shows, as a dashboard widget. Every role is
 * eligible for it, and each user only ever sees their own rows — the
 * /notifications endpoints scope on the caller's id.
 */
export function NotificationsWidget() {
  const [items, setItems] = useState<AppNotification[] | null>(null);

  const load = () =>
    fetchNotifications(8)
      .then(setItems)
      .catch(() => setItems([]));

  /*
   * There is no push transport, so "real-time" here means polling on the same
   * 60s cadence as the topbar bell. Paused while the tab is hidden so a parked
   * dashboard does not hammer the API all day.
   */
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const unread = items?.filter((n) => !n.read).length ?? 0;

  const readAll = async () => {
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? null);
    await markAllNotificationsRead().catch(() => undefined);
  };

  const readOne = async (id: string) => {
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null);
    await markNotificationRead(id).catch(() => undefined);
  };

  return (
    <WidgetCard
      title="Notifications"
      subtitle={unread ? `${unread} unread` : "You are up to date"}
      action={
        unread ? (
          <button
            type="button"
            onClick={readAll}
            className="text-xs font-semibold text-ink-3 hover:text-ink"
          >
            Mark all read
          </button>
        ) : null
      }
    >
      {items === null ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState title="No notifications" icon={BellRing} />
      ) : (
        <ul className="space-y-1.5">
          {items.map((n) => {
            const row = (
              <>
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-accent",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{n.title}</span>
                  {n.body ? (
                    <span className="block truncate text-xs text-ink-3">{n.body}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-ink-3">{relativeTime(n.createdAt)}</span>
              </>
            );

            return (
              <li key={n.id}>
                {n.link ? (
                  <Link
                    href={n.link}
                    onClick={() => !n.read && readOne(n.id)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-2",
                      !n.read && "bg-accent-soft",
                    )}
                  >
                    {row}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => !n.read && readOne(n.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2",
                      !n.read && "bg-accent-soft",
                    )}
                  >
                    {row}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

const EVENT_TONE: Record<CalendarEvent["kind"], Tone> = {
  CLASS: "accent",
  ASSIGNMENT: "warning",
  ASSESSMENT: "critical",
  MEETING: "good",
  HOLIDAY: "neutral",
};

export function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const from = month.toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59).toISOString();
    setEvents(null);
    fetchCalendar(from, to)
      .then((e) => active && setEvents(e))
      .catch(() => active && setEvents([]));
    return () => {
      active = false;
    };
  }, [month]);

  /** Events bucketed by local YYYY-MM-DD so a day cell is one lookup. */
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      const d = new Date(e.at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = new Date();
  const isThisMonth =
    today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth();

  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <WidgetCard
      title="Calendar"
      subtitle="Classes, assignments, tests, meetings and holidays"
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="rounded-md px-2 py-1 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            ‹
          </button>
          <span className="text-xs font-semibold text-ink">
            {month.toLocaleString([], { month: "short", year: "numeric" })}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="rounded-md px-2 py-1 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            ›
          </button>
        </div>
      }
    >
      {events === null ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={`${d}${i}`} className="py-1 text-[10px] font-bold text-ink-3">
                {d}
              </span>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = `${month.getFullYear()}-${month.getMonth()}-${day}`;
              const dayEvents = byDay.get(key) ?? [];
              const isToday = isThisMonth && today.getDate() === day;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(selected === key ? null : key)}
                  aria-label={`${day} — ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                  aria-pressed={selected === key}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md text-xs transition-colors",
                    isToday && "ring-1 ring-accent",
                    selected === key ? "bg-accent text-accent-ink" : "hover:bg-surface-2",
                    !dayEvents.length && "text-ink-3",
                  )}
                >
                  <span className="tnum font-semibold">{day}</span>
                  {dayEvents.length ? (
                    <span className="mt-0.5 flex gap-0.5">
                      {/* Up to three dots; the aria-label carries the exact count. */}
                      {dayEvents.slice(0, 3).map((e, idx) => (
                        <span
                          key={idx}
                          className="size-1 rounded-full bg-current opacity-70"
                          aria-hidden
                        />
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-hairline pt-3">
            {selected ? (
              selectedEvents.length ? (
                <ul className="space-y-1.5">
                  {selectedEvents.map((e) => (
                    <li key={`${e.kind}-${e.id}`}>
                      <Link
                        href={e.link}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
                      >
                        <Badge tone={EVENT_TONE[e.kind]}>{e.kind}</Badge>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                          {e.title}
                        </span>
                        <span className="tnum shrink-0 text-xs text-ink-3">{clockTime(e.at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-center text-xs text-ink-3">Nothing scheduled</p>
              )
            ) : (
              <p className="py-2 text-center text-xs text-ink-3">
                {events.length} event{events.length === 1 ? "" : "s"} this month — pick a day
              </p>
            )}
          </div>
        </>
      )}
    </WidgetCard>
  );
}

// ─── Recent activity ─────────────────────────────────────────────────────────

const ACTIVITY_ICON = {
  student: Users,
  payment: Receipt,
  enroll: GraduationCap,
  assignment: ClipboardList,
  registration: UserPlus,
  assessment: FileCheck2,
} as const;

export function ActivityWidget() {
  const [items, setItems] = useState<DashboardActivityItem[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchDashboardActivity()
      .then((a) => active && setItems(a))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, []);

  return (
    <WidgetCard title="Recent activity" subtitle="Latest across the academy">
      {items === null ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState title="No activity yet" icon={ClipboardList} />
      ) : (
        <ul className="space-y-1">
          {items.map((a) => {
            const Icon = ACTIVITY_ICON[a.kind] ?? ClipboardList;
            return (
              <li key={`${a.kind}-${a.id}`}>
                <Link
                  href={a.link}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2">
                    <Icon className="size-4 text-ink-2" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="font-semibold text-ink">{a.who}</span>{" "}
                    <span className="text-ink-3">{a.action}</span>{" "}
                    <span className="font-medium text-ink-2">{a.target}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{relativeTime(a.at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

// ─── Quick reports ───────────────────────────────────────────────────────────

const REPORTS = [
  { key: "attendance", label: "Attendance Report", path: "/attendance/reports/student", icon: CalendarDays },
  { key: "progress", label: "Progress Report", path: "/progress/reports?type=student", icon: GraduationCap },
  { key: "financial", label: "Financial Report", path: "/finance/reports?type=collection", icon: Receipt },
  { key: "teacher", label: "Teacher Report", path: "/teacher-management/reports/performance", icon: Users },
  { key: "student", label: "Student Report", path: "/student-management/reports/student", icon: FileText },
] as const;

/** RFC-4180 quoting: wrap in quotes and double any embedded quote. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(payload: ReportPayload): string {
  const headers = payload.columns?.length
    ? payload.columns
    : Object.keys(payload.rows[0] ?? {});
  const lines = [headers.map(csvCell).join(",")];
  for (const row of payload.rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  return lines.join("\r\n");
}

export function ReportsWidget() {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (report: (typeof REPORTS)[number]) => {
    setBusy(report.key);
    try {
      const payload = await fetchReport(report.path);
      if (!payload.rows.length) {
        await Swal.fire({
          title: "Nothing to export",
          text: `${report.label} has no rows yet.`,
          icon: "info",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        return;
      }

      // BOM so Excel opens UTF-8 names correctly.
      const blob = new Blob([`﻿${toCsv(payload)}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.key}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      await Swal.fire({
        title: "Could not download",
        text:
          err instanceof ApiError && err.status === 403
            ? "Your role cannot access this report."
            : err instanceof Error
              ? err.message
              : "Report download failed.",
        icon: "error",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <WidgetCard title="Quick reports" subtitle="Downloads as CSV">
      <ul className="grid gap-2 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => download(r)}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 rounded-lg border border-hairline px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2">
                <r.icon className="size-4 text-ink-2" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {r.label}
              </span>
              {busy === r.key ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" aria-hidden />
              ) : (
                <Download className="size-4 shrink-0 text-ink-3" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

// ─── Upcoming schedule (shared table shape) ──────────────────────────────────

export function ScheduleTable({
  rows,
  emptyLabel,
  showTeacher = true,
  joinLabel = "Join",
}: {
  rows: {
    id: string;
    title: string;
    time: string;
    course?: string;
    subject?: string;
    batch?: string | null;
    teacher?: string;
    students?: number;
    status: string;
    meetingUrl: string | null;
  }[];
  emptyLabel: string;
  showTeacher?: boolean;
  joinLabel?: string;
}) {
  if (!rows.length) return <EmptyState title={emptyLabel} icon={CalendarDays} />;

  // Only the admin feed carries a headcount; teacher/student schedules omit it.
  const showStudents = rows.some((r) => r.students !== undefined);

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="text-xs font-semibold text-ink-3">
            <th className="px-2 pb-2">Time</th>
            <th className="px-2 pb-2">{"subject" in (rows[0] ?? {}) ? "Subject" : "Course"}</th>
            {showTeacher ? <th className="px-2 pb-2">Teacher</th> : null}
            {showStudents ? <th className="px-2 pb-2 text-right">Students</th> : null}
            <th className="px-2 pb-2">Status</th>
            <th className="px-2 pb-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-hairline">
              <td className="tnum px-2 py-2.5 font-semibold text-ink">{clockTime(r.time)}</td>
              <td className="px-2 py-2.5">
                <p className="font-medium text-ink">{r.subject ?? r.course ?? r.title}</p>
                {r.batch ? <p className="text-xs text-ink-3">{r.batch}</p> : null}
              </td>
              {showTeacher ? (
                <td className="px-2 py-2.5 text-ink-2">{r.teacher ?? "—"}</td>
              ) : null}
              {showStudents ? (
                <td className="tnum px-2 py-2.5 text-right text-ink-2">{r.students ?? "—"}</td>
              ) : null}
              <td className="px-2 py-2.5">
                <Badge
                  tone={r.status === "LIVE" ? "good" : r.status === "COMPLETED" ? "neutral" : "accent"}
                >
                  {r.status}
                </Badge>
              </td>
              <td className="px-2 py-2.5 text-right">
                {r.meetingUrl ? (
                  <a
                    href={r.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:opacity-90"
                  >
                    {joinLabel}
                  </a>
                ) : (
                  <span className="text-xs text-ink-3">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
