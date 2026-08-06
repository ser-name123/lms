"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, Plus } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyMeetings, MeetingCard } from "@/components/meetings/meeting-list";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { ACTION_LABEL, ActionStatusBadge, PriorityBadge, Stat, fmtDay } from "@/components/meetings/shared";
import {
  fetchMyMeetingActions, fetchMyMeetingStats, fetchMyMeetings, updateMeetingActionItem,
  type MeetingActionItem, type MyMeetingStats, type MyMeetings,
} from "@/lib/api";

type Tab = "upcoming" | "past" | "cancelled" | "actions";

/**
 * The teacher's meetings.
 *
 * A teacher may schedule a meeting with a colleague or their supervisor (8.4)
 * but has no reports and no configuration — those belong to the staff who run
 * the academy, and the meeting-type list they are offered reflects that.
 */
export default function TeacherMeetingsPage() {
  const router = useRouter();
  const [data, setData] = useState<MyMeetings | null>(null);
  const [stats, setStats] = useState<MyMeetingStats | null>(null);
  const [actions, setActions] = useState<MeetingActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMyMeetings().catch(() => null),
      fetchMyMeetingStats().catch(() => null),
      fetchMyMeetingActions().catch(() => []),
    ])
      .then(([m, s, a]) => {
        setData(m);
        setStats(s);
        setActions(a);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const move = async (id: string, status: string) => {
    setBusy(true);
    try {
      await updateMeetingActionItem(id, { status });
      load();
    } catch {
      /* the row simply stays where it was */
    } finally {
      setBusy(false);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "upcoming", label: `Upcoming (${data?.upcoming.length ?? 0})` },
    { key: "past", label: `Past (${data?.past.length ?? 0})` },
    // §8.9 wants cancelled meetings visible alongside upcoming and completed.
    // A slot that was called off has to be findable, or it reads as one the
    // teacher forgot to attend.
    { key: "cancelled", label: `Cancelled (${data?.cancelled.length ?? 0})` },
    { key: "actions", label: `My action items (${actions.length})` },
  ];

  return (
    <>
      <Topbar title="Meetings" subtitle="Staff meetings you are invited to, and what you owe from them" />

      <div className="animate-fade-up space-y-5 p-4 lg:p-6">
        {stats ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Upcoming" value={stats.upcoming} tone="text-accent" />
            <Stat label="Attended" value={stats.attended} />
            <Stat label="Missed" value={stats.missed} tone={stats.missed ? "text-red-600 dark:text-red-400" : undefined} />
            <Stat label="Attendance" value={`${stats.attendancePct}%`} />
            <Stat
              label="Open actions"
              value={stats.openActions}
              tone={stats.overdueActions ? "text-amber-600 dark:text-amber-400" : undefined}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                tab === t.key ? "bg-accent text-accent-ink" : "border border-hairline bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setFormOpen(true)}>
            <Plus className="size-3.5" /> Schedule a meeting
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : tab === "actions" ? (
          !actions.length ? (
            <Card className="border border-hairline bg-surface">
              <CardBody className="p-12 text-center">
                <ListChecks className="mx-auto size-8 text-ink-3" />
                <p className="mt-3 text-sm font-bold text-ink">Nothing outstanding</p>
                <p className="mt-1 text-xs text-ink-3">Action items assigned to you in a meeting appear here.</p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-2">
              {actions.map((a) => (
                <Card
                  key={a.id}
                  className={`border bg-surface ${a.overdue ? "border-red-500/30" : "border-hairline"}`}
                >
                  <CardBody className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{a.description}</p>
                        <p className="mt-0.5 text-[11px] text-ink-3">
                          {a.meeting ? (
                            <Link href={`/teacher/meetings/${a.meeting.id}`} className="hover:underline">
                              {a.meeting.title}
                            </Link>
                          ) : null}
                          {a.dueDate ? ` · due ${fmtDay(a.dueDate)}` : ""}
                          {a.overdue ? " · overdue" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <PriorityBadge priority={a.priority} />
                        <ActionStatusBadge status={a.status} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(["IN_PROGRESS", "COMPLETED"] as const)
                        .filter((s) => s !== a.status)
                        .map((s) => (
                          <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => move(a.id, s)}>
                            Mark {ACTION_LABEL[s].toLowerCase()}
                          </Button>
                        ))}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )
        ) : (
          (() => {
            const rows =
              tab === "upcoming" ? (data?.upcoming ?? [])
              : tab === "cancelled" ? (data?.cancelled ?? [])
              : (data?.past ?? []);
            if (!rows.length) {
              return (
                <EmptyMeetings
                  text={
                    tab === "upcoming"
                      ? "You have no meetings coming up. You will be notified when one is scheduled."
                      : tab === "cancelled"
                        ? "None of your meetings have been cancelled."
                        : "No meetings have finished yet."
                  }
                />
              );
            }
            return (
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((m) => (
                  <MeetingCard key={m.id} m={m} href={`/teacher/meetings/${m.id}`} />
                ))}
              </div>
            );
          })()
        )}
      </div>

      {formOpen ? (
        <MeetingForm
          role="TEACHER"
          onClose={() => setFormOpen(false)}
          onSaved={(id) => router.push(`/teacher/meetings/${id}`)}
        />
      ) : null}
    </>
  );
}
