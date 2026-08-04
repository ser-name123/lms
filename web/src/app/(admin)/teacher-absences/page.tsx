"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, CalendarClock, AlertTriangle, X } from "lucide-react";

import { useAuth } from "@/store/auth";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAbsenceTasks, rescheduleAbsence, dismissAbsence, type AbsenceTask } from "@/lib/api";

const TABS = ["PENDING", "RESCHEDULED", "DISMISSED"] as const;
const tone: Record<string, Tone> = { PENDING: "critical", RESCHEDULED: "good", DISMISSED: "neutral" };
const swalBg = () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff");
const fmt = (v: string) => new Date(v).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function TeacherAbsencesPage() {
  const { user } = useAuth();
  const canAct = user?.role === "ADMIN" || user?.role === "ACADEMIC_COACH";
  const [status, setStatus] = useState<string>("PENDING");
  const [rows, setRows] = useState<AbsenceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AbsenceTask | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchAbsenceTasks(status).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [status]);
  useEffect(() => load(), [load]);

  const dismiss = async (t: AbsenceTask) => {
    const ok = await Swal.fire({ title: "Dismiss this task?", text: "It will no longer need a reschedule.", icon: "question", showCancelButton: true, background: swalBg(), confirmButtonColor: "#ef4444" });
    if (!ok.isConfirmed) return;
    try { await dismissAbsence(t.id); load(); } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  return (
    <>
      <Topbar title="Teacher Absences" subtitle="Missed classes (teacher absent) to reschedule" />
      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-full sm:w-fit">
          {TABS.map((t) => (
            <button key={t} onClick={() => setStatus(t)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${status === t ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading…</div>
            ) : !rows.length ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-ink-3">
                <AlertTriangle className="size-8 text-ink-3/40" />
                <p className="text-sm font-bold text-ink">Nothing here</p>
                <p className="text-xs">No {status.toLowerCase()} teacher-absent classes.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      <th className="px-5 py-3">Teacher</th>
                      <th className="px-5 py-3">Student</th>
                      <th className="px-5 py-3">Course</th>
                      <th className="px-5 py-3">Missed class</th>
                      <th className="px-5 py-3">Status</th>
                      {canAct && <th className="px-5 py-3 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2/30">
                        <td className="px-5 py-3 text-xs font-bold text-ink">{r.teacher?.name ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-ink-2">{r.student?.name ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-ink-3">{r.course ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-ink-2">{fmt(r.originalStartsAt)}</td>
                        <td className="px-5 py-3"><Badge tone={tone[r.status]}>{r.status.toLowerCase()}</Badge></td>
                        {canAct && (
                          <td className="px-5 py-3 text-right">
                            {r.status === "PENDING" ? (
                              <div className="flex justify-end gap-1.5">
                                <Button variant="ghost" size="sm" onClick={() => setTarget(r)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-accent hover:bg-accent/10">Reschedule</Button>
                                <Button variant="ghost" size="sm" onClick={() => dismiss(r)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-ink-3 hover:bg-surface-2">Dismiss</Button>
                              </div>
                            ) : <span className="text-[11px] text-ink-3">{r.resolvedByName ?? "—"}</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {target && <RescheduleModal task={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); load(); }} />}
    </>
  );
}

function RescheduleModal({ task, onClose, onDone }: { task: AbsenceTask; onClose: () => void; onDone: () => void }) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!when) return;
    setBusy(true);
    try {
      await rescheduleAbsence(task.id, new Date(when).toISOString());
      await Swal.fire({ title: "Rescheduled", text: "A new class has been scheduled and everyone notified.", icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      onDone();
    } catch (e) { Swal.fire({ title: "Could not reschedule", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-ink">Reschedule missed class</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <p className="mb-3 text-xs text-ink-3">{task.teacher?.name} · {task.student?.name}</p>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">New date & time</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
          className="mb-4 h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
        <Button onClick={submit} disabled={busy || !when} className="h-10 w-full rounded-xl bg-accent text-xs font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CalendarClock className="mr-1 size-4" />} Confirm reschedule
        </Button>
      </div>
    </div>
  );
}
