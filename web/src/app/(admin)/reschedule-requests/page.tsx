"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { CalendarClock, CheckCircle2, ClipboardList, Loader2, XCircle } from "lucide-react";

import { useAuth } from "@/store/auth";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchRescheduleRequests,
  reviewRescheduleRequest,
  fetchStudentReschedules,
  type StaffRescheduleRequest,
  type StudentRescheduleLogEntry,
  type RescheduleRequestStatus,
} from "@/lib/api";

const TABS = ["PENDING", "APPROVED", "REJECTED"] as const;

const statusTone: Record<RescheduleRequestStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "good",
  REJECTED: "critical",
};
const statusLabel: Record<RescheduleRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fmt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function RescheduleRequestsPage() {
  const [view, setView] = useState<"teacher" | "student">("teacher");
  const [items, setItems] = useState<StaffRescheduleRequest[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StaffRescheduleRequest | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchRescheduleRequests({ status })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { if (view === "teacher") load(); }, [load, view]);

  return (
    <>
      <Topbar title="Reschedule Requests" subtitle="Teacher approvals + student self-reschedule log" />

      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        {/* Two feeds: the teacher approval queue, and the read-only log of
            student self-reschedules (auto-applied, so no approval needed). */}
        <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-full sm:w-fit overflow-x-auto">
          {(["teacher", "student"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                view === v ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {v === "teacher" ? "Teacher requests" : "Student reschedules"}
            </button>
          ))}
        </div>

        {view === "student" ? (
          <StudentRescheduleLog />
        ) : (
        <>
        <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-full sm:w-fit overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatus(t)}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                status === t ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {statusLabel[t]}
            </button>
          ))}
        </div>

        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
                <Loader2 className="size-4 animate-spin text-accent" /> Loading…
              </div>
            ) : !items.length ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-ink-3">
                <ClipboardList className="size-8 text-ink-3/40" />
                <p className="text-sm font-bold text-ink">Nothing here</p>
                <p className="text-xs">No {statusLabel[status as RescheduleRequestStatus].toLowerCase()} requests.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Teacher</th>
                      <th className="px-6 py-4">Move</th>
                      <th className="px-6 py-4">Requested</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {items.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-ink">{r.student?.name}</p>
                          <p className="text-[10px] text-ink-3">{r.student?.code}</p>
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-2">{r.teacher?.name ?? "—"}</td>
                        <td className="px-6 py-4 text-xs text-ink-2">
                          {fmt(r.oldStartsAt)} <span className="text-ink-3">→</span> {fmt(r.newStartsAt)}
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-3">{fmtDate(r.createdAt)}</td>
                        <td className="px-6 py-4">
                          <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelected(r)}
                            className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-accent hover:bg-accent/10">
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
        </>
        )}
      </div>

      {selected && (
        <ReviewDrawer
          request={selected}
          onClose={() => setSelected(null)}
          onDecided={() => { setSelected(null); load(); }}
        />
      )}
    </>
  );
}

function StudentRescheduleLog() {
  const [rows, setRows] = useState<StudentRescheduleLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchStudentReschedules()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-0">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-ink-3">
            <ClipboardList className="size-8 text-ink-3/40" />
            <p className="text-sm font-bold text-ink">Nothing here</p>
            <p className="text-xs">No student self-reschedules yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Move</th>
                  <th className="px-6 py-4">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-ink">{r.student?.name ?? "—"}</p>
                      <p className="text-[10px] text-ink-3">{r.student?.code}</p>
                    </td>
                    <td className="px-6 py-4 text-xs text-ink-2">
                      {r.oldStartsAt || r.newStartsAt ? (
                        <>{fmt(r.oldStartsAt)} <span className="text-ink-3">→</span> {fmt(r.newStartsAt)}</>
                      ) : (
                        <span className="text-ink-3">{r.description ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-ink-3">{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ReviewDrawer({ request, onClose, onDecided }: { request: StaffRescheduleRequest; onClose: () => void; onDecided: () => void }) {
  const { user } = useAuth();
  const canReview = user?.role === "ADMIN" || user?.role === "ACADEMIC_COACH";
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await reviewRescheduleRequest(request.id, { approve, notes: notes.trim() || undefined });
      await Swal.fire({
        title: approve ? "Approved" : "Rejected",
        text: approve ? "The class has been moved and everyone notified." : "The teacher and student have been told; the class stays put.",
        icon: "success", background: swalBg(), confirmButtonColor: "#10b981",
      });
      onDecided();
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline p-5">
          <div>
            <h3 className="text-sm font-black text-ink">{request.student?.name}</h3>
            <p className="text-[11px] text-ink-3">{request.student?.code} · Teacher reschedule</p>
          </div>
          <Badge tone={statusTone[request.status]}>{statusLabel[request.status]}</Badge>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-hairline bg-surface-2/40 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Requested move</p>
            <p className="mt-1 text-sm font-bold text-ink">{fmt(request.oldStartsAt)}</p>
            <p className="text-xs text-ink-3">→ {fmt(request.newStartsAt)}</p>
            <p className="mt-2 text-[11px] text-ink-3">Teacher: {request.teacher?.name ?? "—"}</p>
            {request.reason && (
              <p className="mt-2 text-xs text-ink-2"><span className="text-ink-3">Reason: </span>{request.reason}</p>
            )}
          </div>

          {request.status === "PENDING" && canReview && (
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Notes (shown to the teacher)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={busy}
                className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
            </div>
          )}
          {request.status === "PENDING" && !canReview && (
            <p className="rounded-xl border border-hairline bg-surface-2/40 p-3 text-xs text-ink-3">
              You are viewing this for monitoring. Approval and rejection are handled by the academic coach or an admin.
            </p>
          )}
          {request.status !== "PENDING" && request.reviewNotes && (
            <p className="rounded-xl border border-hairline bg-surface-2/40 p-3 text-xs text-ink-2">
              <span className="text-ink-3">Decision notes: </span>{request.reviewNotes}
            </p>
          )}
        </div>

        {request.status === "PENDING" && canReview ? (
          <div className="flex gap-2 border-t border-hairline p-4">
            <Button onClick={() => decide(false)} disabled={busy}
              className="h-11 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-critical hover:bg-critical/5">
              <XCircle className="mr-1 size-4" /> Reject
            </Button>
            <Button onClick={() => decide(true)} disabled={busy}
              className="h-11 flex-1 rounded-xl bg-accent text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />} Approve
            </Button>
          </div>
        ) : request.status !== "PENDING" ? (
          <div className="border-t border-hairline p-4">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <CalendarClock className="size-3.5" />
              Decided {fmtDate(request.reviewedAt)}
              {request.reviewedByName ? ` by ${request.reviewedByName}` : ""}
              {request.appliedAt ? ` · applied ${fmtDate(request.appliedAt)}` : ""}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
