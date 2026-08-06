"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3, ChevronLeft, ChevronRight, ListChecks, Loader2, Plus, Search, SlidersHorizontal,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { EmptyMeetings, MeetingCard } from "@/components/meetings/meeting-list";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { MEETING_TYPE_LABELS, Stat, fmtDay } from "@/components/meetings/shared";
import {
  fetchMeetingDashboard, fetchMeetings, fetchMyMeetingActions,
  type MeetingActionItem, type MeetingDashboard, type MeetingListRow, type MeetingStatus,
} from "@/lib/api";

const input =
  "h-9 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

const STATUSES: (MeetingStatus | "")[] = ["", "SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"];

/*
 * Meeting history is kept permanently, so the list is paged rather than capped.
 * A fixed cap reads as "this is all of them" while quietly hiding the oldest.
 */
const PAGE_SIZE = 24;

/**
 * The staff meetings screen — admin, supervisor and academic coach.
 *
 * All three land here through the `(admin)` route group. Per-meeting controls
 * are decided in the detail view by what the API returns for this caller, so a
 * coach gets the same list without being handed buttons the server refuses.
 */
export default function MeetingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<MeetingListRow[]>([]);
  const [dash, setDash] = useState<MeetingDashboard | null>(null);
  const [actions, setActions] = useState<MeetingActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMeetings({
        search: search.trim() || undefined,
        status: status || undefined,
        type: type || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        // The picker gives a date; the API compares instants, so take the whole
        // of the chosen day rather than midnight at the start of it.
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        page,
        pageSize: PAGE_SIZE,
      }).catch(() => null),
      fetchMeetingDashboard().catch(() => null),
      fetchMyMeetingActions().catch(() => []),
    ])
      .then(([m, d, a]) => {
        setRows(m?.rows ?? []);
        setTotal(m?.total ?? 0);
        setPageSize(m?.pageSize ?? PAGE_SIZE);
        setDash(d);
        setActions(a);
      })
      .finally(() => setLoading(false));
  }, [search, status, type, from, to, page]);

  // Debounced, so typing in the search box is not one request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Any change to the filters starts again at page one — staying on page 4 of
  // a result set that now has two pages shows an empty screen.
  useEffect(() => setPage(1), [search, status, type, from, to]);

  const lastPage = Math.max(1, Math.ceil(total / (pageSize || PAGE_SIZE)));

  const canConfigure = user?.role === "ADMIN" || user?.role === "SUPERVISOR";

  return (
    <>
      <Topbar title="Staff Meetings" subtitle="Schedule, run and minute the academy's internal meetings" />

      <div className="animate-fade-up space-y-5 p-4 lg:p-6">
        {dash ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Upcoming" value={dash.upcoming} tone="text-accent" />
            <Stat
              label="Live now"
              value={dash.live}
              tone={dash.live ? "text-emerald-600 dark:text-emerald-400" : undefined}
            />
            <Stat label="Last 30 days" value={dash.thisMonth} />
            <Stat
              label="Minutes owed"
              value={dash.minutesDue}
              tone={dash.minutesDue ? "text-red-600 dark:text-red-400" : undefined}
            />
            <Stat
              label="Open actions"
              value={dash.openActions}
              tone={dash.overdueActions ? "text-amber-600 dark:text-amber-400" : undefined}
            />
            <Stat label="Avg attendance" value={`${dash.avgAttendancePct}%`} />
          </div>
        ) : null}

        {/* What this person owes, before what everyone else is doing. */}
        {actions.length ? (
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                <ListChecks className="size-3.5" /> Assigned to you
              </p>
              <div className="space-y-1.5">
                {actions.slice(0, 5).map((a) => (
                  <Link
                    key={a.id}
                    href={`/meetings/${a.meeting?.id}`}
                    className={`block rounded-xl border p-2.5 text-xs transition hover:border-accent ${
                      a.overdue ? "border-red-500/30 bg-red-500/5" : "border-hairline bg-surface-2/30"
                    }`}
                  >
                    <span className="font-semibold text-ink">{a.description}</span>
                    <span className="text-ink-3">
                      {a.dueDate ? ` · due ${fmtDay(a.dueDate)}` : ""}
                      {a.overdue ? " · overdue" : ""}
                      {a.meeting ? ` · ${a.meeting.title}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              className={`${input} w-56 pl-8`}
              placeholder="Title or agenda…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus | "")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
          <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(MEETING_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={input}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            title="From date"
          />
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
          {from || to ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear dates
            </Button>
          ) : null}

          <div className="ml-auto flex gap-2">
            <Link href="/meetings/reports">
              <Button variant="outline" size="sm">
                <BarChart3 className="size-3.5" /> Reports
              </Button>
            </Link>
            {canConfigure ? (
              <Link href="/meetings/settings">
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="size-3.5" /> Setup
                </Button>
              </Link>
            ) : null}
            <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-3.5" /> Schedule
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !rows.length ? (
          <EmptyMeetings text="No meetings match these filters. Schedule one to get started." />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((m) => (
                <MeetingCard key={m.id} m={m} href={`/meetings/${m.id}`} />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-ink-3">
                Showing {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} of {total}
              </p>
              {lastPage > 1 ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="size-3.5" /> Previous
                  </Button>
                  <span className="text-[11px] font-bold text-ink-3">
                    Page {page} of {lastPage}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {formOpen ? (
        <MeetingForm
          role={user?.role ?? "TEACHER"}
          onClose={() => setFormOpen(false)}
          onSaved={(id) => router.push(`/meetings/${id}`)}
        />
      ) : null}
    </>
  );
}
