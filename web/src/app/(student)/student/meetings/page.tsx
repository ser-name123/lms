"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { EmptyMeetings, MeetingCard } from "@/components/meetings/meeting-list";
import { Stat } from "@/components/meetings/shared";
import { fetchMyMeetingStats, fetchMyMeetings, type MyMeetingStats, type MyMeetings } from "@/lib/api";

type Tab = "upcoming" | "past" | "cancelled";

/**
 * The student's meetings.
 *
 * Read-and-join only. A student can be invited by an academic coach or
 * supervisor (the spec's addendum) but never schedules one, so there is no
 * create button, no action-item assignment and no minutes editor — the server
 * refuses all three, and offering them would be a lie in the UI.
 */
export default function StudentMeetingsPage() {
  const [data, setData] = useState<MyMeetings | null>(null);
  const [stats, setStats] = useState<MyMeetingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("upcoming");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchMyMeetings().catch(() => null), fetchMyMeetingStats().catch(() => null)])
      .then(([m, s]) => {
        setData(m);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const rows =
    tab === "upcoming" ? (data?.upcoming ?? [])
    : tab === "cancelled" ? (data?.cancelled ?? [])
    : (data?.past ?? []);

  return (
    <>
      <Topbar title="My Meetings" subtitle="Meetings your coach or supervisor has scheduled with you" />

      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {stats && (stats.upcoming || stats.attended || stats.missed) ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Upcoming" value={stats.upcoming} tone="text-accent" />
            <Stat label="Attended" value={stats.attended} />
            <Stat label="Missed" value={stats.missed} tone={stats.missed ? "text-red-600 dark:text-red-400" : undefined} />
          </div>
        ) : null}

        <div className="flex gap-2">
          {(
            [
              ["upcoming", `Upcoming (${data?.upcoming.length ?? 0})`],
              ["past", `Past (${data?.past.length ?? 0})`],
              // §8.9 — a cancelled meeting must stay visible. A student who
              // set aside the time needs to see it was called off.
              ["cancelled", `Cancelled (${data?.cancelled.length ?? 0})`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                tab === k ? "bg-accent text-accent-ink" : "border border-hairline bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !rows.length ? (
          <EmptyMeetings
            text={
              tab === "upcoming"
                ? "You have no meetings scheduled. Your coach will let you know if one is arranged."
                : tab === "cancelled"
                  ? "None of your meetings have been cancelled."
                  : "You have not been in a meeting yet."
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((m) => (
              <MeetingCard key={m.id} m={m} href={`/student/meetings/${m.id}`} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
