"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { CalendarClock, Clock, Loader2, PauseCircle, UserCheck, Users } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyLeaves, ImpactOptionBadge, ImpactStatusBadge, LEAVE_TYPE_LABELS, Stat,
  fmtDateTime, fmtWindow,
} from "@/components/leaves/shared";
import {
  decideLeaveImpact, fetchLeaveImpact, fetchLeaveImpacts, fetchReplacementTeachers,
  type LeaveImpactDetail, type LeaveImpactRow, type ReplacementTeacher,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Could not arrange that",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });
const escapeAttr = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TABS = [
  { key: "OPEN", label: "Needs a decision" },
  { key: "RESOLVED", label: "Arranged" },
  { key: "REVERTED", label: "Stood down" },
] as const;

/**
 * §9.5 — the Academic Coach's queue.
 *
 * One row per affected family, because the spec has the coach speak to each of
 * them and two families on the same absent teacher will routinely answer
 * differently: one waits, one takes a stand-in.
 */
export default function LeaveImpactsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("OPEN");
  const [rows, setRows] = useState<LeaveImpactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<LeaveImpactDetail | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchLeaveImpacts(tab)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tab]);
  useEffect(() => load(), [load]);

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      setDetail(null);
      load();
      await Swal.fire({ title: message, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const open = async (row: LeaveImpactRow) => {
    try {
      setDetail(await fetchLeaveImpact(row.id));
    } catch (e) {
      fail(e);
    }
  };

  /** Option 1 — the family waits for their own teacher. */
  const chooseWait = async (impact: LeaveImpactDetail) => {
    const r = await Swal.fire({
      title: "Wait for the same teacher?",
      html:
        `<p style="font-size:12px;text-align:left">${impact.affectedClassCount} class(es) will be paused.` +
        ` ${escapeAttr(impact.studentName)}'s billing cycle is extended by the same number of days, and their teacher's` +
        ` recurring slot is held — so nothing is lost and nothing is charged twice.</p>` +
        `<input id="sw-notes" class="swal2-input" placeholder="Note from the call (optional)">`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Pause and extend",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: () => ({ notes: (document.getElementById("sw-notes") as HTMLInputElement)?.value || undefined }),
    });
    if (!r.isConfirmed) return;
    await act(
      () => decideLeaveImpact(impact.id, { option: "WAIT_FOR_TEACHER", notes: (r.value as { notes?: string })?.notes }),
      "Classes paused and the billing cycle extended",
    );
  };

  /** Option 2 — a stand-in takes the classes. */
  const chooseTemp = async (impact: LeaveImpactDetail) => {
    let list: ReplacementTeacher[] = [];
    try {
      list = await fetchReplacementTeachers(impact.id);
    } catch (e) {
      return fail(e);
    }
    if (!list.length) {
      return Swal.fire({
        title: "Nobody is free",
        text: "No other teacher is available across this window. Wait for the same teacher, or reschedule the classes.",
        icon: "info",
        background: swalBg(),
      });
    }

    const r = await Swal.fire({
      title: "Assign a temporary teacher",
      html:
        `<select id="sw-teacher" class="swal2-input">` +
        list
          .map(
            (t) =>
              `<option value="${t.id}"${t.free ? "" : " disabled"}>${escapeAttr(t.name)}${
                t.sameCourse ? " · same course" : ""
              }${t.free ? "" : ` · busy for ${t.clashes} of these slots`}</option>`,
          )
          .join("") +
        `</select>` +
        `<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin:8px 0;text-align:left">` +
        `<input id="sw-restore" type="checkbox" checked> Put the original teacher back when they return</label>` +
        `<input id="sw-notes" class="swal2-input" placeholder="Note from the call (optional)">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Assign",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: () => {
        const id = (document.getElementById("sw-teacher") as HTMLSelectElement)?.value;
        if (!id) {
          Swal.showValidationMessage("Pick a teacher");
          return false;
        }
        return {
          temporaryTeacherId: id,
          restoreOriginal: (document.getElementById("sw-restore") as HTMLInputElement)?.checked ?? true,
          notes: (document.getElementById("sw-notes") as HTMLInputElement)?.value || undefined,
        };
      },
    });
    if (!r.isConfirmed || !r.value) return;
    await act(
      () => decideLeaveImpact(impact.id, { option: "TEMPORARY_TEACHER", ...(r.value as object) }),
      "Temporary teacher assigned",
    );
  };

  /** Option 3 — move each class to a new time. */
  const chooseReschedule = async (impact: LeaveImpactDetail) => {
    if (!impact.classes.length) {
      return fail(new Error("There are no classes left to move."));
    }
    const r = await Swal.fire({
      title: "Reschedule the classes",
      width: 620,
      html:
        `<p style="font-size:12px;text-align:left;margin-bottom:8px">Pick a new time for each class. It must fall outside ` +
        `${escapeAttr(fmtWindow(impact.from, impact.to))}, and the teacher must be free.</p>` +
        impact.classes
          .map(
            (c, i) =>
              `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                 <span style="flex:1;font-size:11px;text-align:left">${escapeAttr(c.title ?? "Class")}<br>
                   <span style="opacity:.6">${escapeAttr(fmtDateTime(c.startsAt))}</span></span>
                 <input id="sw-move-${i}" type="datetime-local" class="swal2-input" style="margin:0;flex:1">
               </div>`,
          )
          .join(""),
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Move them",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: () => {
        const moves: { classId: string; startsAt: string }[] = [];
        for (let i = 0; i < impact.classes.length; i++) {
          const v = (document.getElementById(`sw-move-${i}`) as HTMLInputElement)?.value;
          if (!v) {
            Swal.showValidationMessage("Give every class a new time");
            return false;
          }
          moves.push({ classId: impact.classes[i].id, startsAt: new Date(v).toISOString() });
        }
        return { reschedules: moves };
      },
    });
    if (!r.isConfirmed || !r.value) return;
    await act(
      () => decideLeaveImpact(impact.id, { option: "RESCHEDULE", ...(r.value as object) }),
      "Classes rescheduled",
    );
  };

  const openCount = rows.filter((r) => r.status === "OPEN").length;

  return (
    <>
      <Topbar
        title="Affected Classes"
        subtitle="A teacher is away — decide what happens to each student's classes"
      />

      <div className="animate-fade-up space-y-5 p-4 lg:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Waiting on you"
            value={tab === "OPEN" ? openCount : "—"}
            tone={openCount ? "text-amber-600 dark:text-amber-400" : undefined}
          />
          <Stat label="Classes disrupted" value={rows.reduce((a, r) => a + r.affectedClassCount, 0)} />
          <Stat label="Cycle days given back" value={rows.reduce((a, r) => a + (r.cycleExtendedDays ?? 0), 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
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
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !rows.length ? (
          <EmptyLeaves
            text={
              tab === "OPEN"
                ? "Nothing is waiting. When a teacher's unavailability is approved, the families they teach appear here."
                : "Nothing here yet."
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((row) => (
              <Card key={row.id} className="border border-hairline bg-surface transition hover:border-accent/50">
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{row.studentName}</p>
                      <p className="text-[11px] text-ink-3">
                        {row.studentCode ? `${row.studentCode} · ` : ""}
                        {row.courseTitle ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-ink-2">
                        {row.teacherName} away {fmtWindow(row.from, row.to)}
                        {row.leaveType ? ` · ${LEAVE_TYPE_LABELS[row.leaveType] ?? row.leaveType}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={row.affectedClassCount ? "warning" : "neutral"}>
                          {row.affectedClassCount} class{row.affectedClassCount === 1 ? "" : "es"}
                        </Badge>
                        <ImpactStatusBadge status={row.status} />
                        {row.status !== "OPEN" ? <ImpactOptionBadge option={row.option} /> : null}
                      </div>
                      {row.temporaryTeacherName ? (
                        <p className="mt-1 text-[11px] text-ink-3">Covered by {row.temporaryTeacherName}</p>
                      ) : null}
                      {row.cycleExtendedDays ? (
                        <p className="mt-1 text-[11px] text-ink-3">Cycle extended {row.cycleExtendedDays} day(s)</p>
                      ) : null}
                      {row.decidedByName ? (
                        <p className="mt-1 text-[10px] text-ink-3">
                          Decided by {row.decidedByName} · {fmtDateTime(row.decidedAt)}
                        </p>
                      ) : null}
                      {row.notes ? <p className="mt-1 text-[11px] italic text-ink-3">“{row.notes}”</p> : null}
                    </div>
                    {row.status === "OPEN" ? (
                      <Button variant="primary" size="sm" disabled={busy} onClick={() => open(row)}>
                        Arrange
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <Card className="my-8 w-full max-w-2xl border border-hairline bg-surface shadow-xl">
            <CardBody className="p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-ink">{detail.studentName}</h2>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {detail.teacherName} is away {fmtWindow(detail.from, detail.to)} · {detail.courseTitle ?? "—"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>

              <div className="mb-4 rounded-2xl border border-hairline bg-surface-2/30 p-3">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                  Classes affected ({detail.classes.length})
                </p>
                {!detail.classes.length ? (
                  <p className="text-xs text-ink-3">No scheduled classes remain in the window.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.classes.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-xs text-ink-2">
                        <Clock className="size-3 shrink-0 text-ink-3" />
                        {c.title} · {fmtDateTime(c.startsAt)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="mb-2 text-xs text-ink-3">
                Speak to the family, then record what they chose.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="outline" disabled={busy} onClick={() => chooseWait(detail)}>
                  <PauseCircle className="size-4" /> Wait for them
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => chooseTemp(detail)}>
                  <UserCheck className="size-4" /> Stand-in teacher
                </Button>
                <Button variant="outline" disabled={busy || !detail.classes.length} onClick={() => chooseReschedule(detail)}>
                  <CalendarClock className="size-4" /> Reschedule
                </Button>
              </div>
              <p className="mt-3 text-[11px] text-ink-3">
                <Users className="mr-1 inline size-3" />
                Waiting pauses the classes and extends the billing cycle by the same days — the family pays for nothing
                they did not get.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  );
}
