"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Lock, CalendarClock, Video, Ban } from "lucide-react";
import Swal from "sweetalert2";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchAttendanceClasses, fetchClassAttendance, markAttendance, endClass, cancelClass,
  type AttendanceClass, type ClassAttendanceSheet,
} from "@/lib/api";
import { STUDENT_STATUS_TONE, CLASS_STATUS_TONE, STUDENT_STATUSES } from "./meta";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

export function ClassesPanel() {
  const [classes, setClasses] = useState<AttendanceClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => { setLoading(true); fetchAttendanceClasses({ status }).then(setClasses).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 focus:outline-none focus:border-accent">
          {["All", "SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"].map((s) => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
        </select>
      </div>

      {loading ? <Loading /> : classes.length === 0 ? (
        <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="flex flex-col items-center gap-2 py-14 text-center text-ink-3"><CalendarClock className="size-8 text-ink-3/40" /><p className="text-sm font-bold text-ink">No classes</p><p className="text-xs">Schedule classes from a batch to see them here.</p></CardBody></Card>
      ) : (
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                <th className="px-4 py-3">Class</th><th className="px-4 py-3">Batch</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Students</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Locked</th>
              </tr></thead>
              <tbody className="divide-y divide-hairline">
                {classes.map((c) => (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-surface-2/30">
                    <td className="px-4 py-3 font-bold text-ink">{c.title}</td>
                    <td className="px-4 py-3 text-ink-3">{c.batchName || "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{c.teacherName || "—"}</td>
                    <td className="px-4 py-3 text-ink-3">{new Date(c.startsAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-3 text-ink-2">{c.studentCount ?? 0}</td>
                    <td className="px-4 py-3"><Badge tone={CLASS_STATUS_TONE[c.status]}>{c.status}</Badge></td>
                    <td className="px-4 py-3">{c.attendanceLocked ? <Lock className="size-3.5 text-ink-3" /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {openId && <AttendanceSheet classId={openId} onClose={() => { setOpenId(null); load(); }} />}
    </div>
  );
}

export function AttendanceSheet({ classId, onClose }: { classId: string; onClose: () => void }) {
  const [sheet, setSheet] = useState<ClassAttendanceSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const load = () => fetchClassAttendance(classId).then((s) => {
    setSheet(s);
    setRemarks(Object.fromEntries(s.attendees.map((a) => [a.studentId, a.remarks || ""])));
  }).catch(() => undefined);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classId]);

  const mark = async (studentId: string, s: string, note?: string) => {
    setBusy(true);
    try { const updated = await markAttendance(classId, studentId, s, note); setSheet(updated); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  // Save a remark on blur — needs an existing status to attach to.
  const saveRemark = async (studentId: string, currentStatus: string | null) => {
    if (!currentStatus) { Swal.fire({ title: "Set a status first", text: "Pick Present/Late/etc before adding a remark.", icon: "info", background: swalBg() }); return; }
    await mark(studentId, currentStatus, remarks[studentId] || "");
  };

  const finalize = async () => {
    const ok = await Swal.fire({ title: "End class & finalise attendance?", icon: "question", showCancelButton: true, confirmButtonText: "End class", background: swalBg() });
    if (!ok.isConfirmed) return;
    setBusy(true);
    try { const updated = await endClass(classId); setSheet(updated); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Class ended", showConfirmButton: false, timer: 1600 }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    const ok = await Swal.fire({ title: "Cancel this class?", text: "No attendance is counted; students are notified.", icon: "warning", showCancelButton: true, confirmButtonText: "Cancel class", confirmButtonColor: "#e11d48", background: swalBg() });
    if (!ok.isConfirmed) return;
    setBusy(true);
    try { await cancelClass(classId); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Class cancelled", showConfirmButton: false, timer: 1600 }); load(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-hairline bg-surface px-5 py-4">
          <div>
            <h3 className="text-base font-black text-ink">{sheet?.title || "Class"}</h3>
            {sheet && <p className="text-[11px] text-ink-3">{sheet.batchName} · {new Date(sheet.startsAt).toLocaleString()} {sheet.attendanceLocked && "· 🔒 Locked"}</p>}
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg border border-hairline text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        {!sheet ? <Loading /> : (
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={CLASS_STATUS_TONE[sheet.status]}>{sheet.status}</Badge>
              {sheet.teacherStatus && <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-2">Teacher: {sheet.teacherStatus}{sheet.teacherLateMinutes ? ` (${sheet.teacherLateMinutes}m late)` : ""}</span>}
              {sheet.meetingUrl && <a href={sheet.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"><Video className="size-3.5" /> Meeting link</a>}
              {!sheet.attendanceLocked && sheet.status !== "CANCELLED" && (
                <div className="ml-auto flex gap-1.5">
                  {sheet.status !== "COMPLETED" && (
                    <button onClick={cancel} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-[11px] font-bold text-rose-600 hover:bg-rose-500/20 disabled:opacity-60"><Ban className="size-3.5" /> Cancel</button>
                  )}
                  {sheet.status !== "COMPLETED" && (
                    <button onClick={finalize} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-60">End & Finalise</button>
                  )}
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-hairline">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                  <th className="px-3 py-2.5">Student</th><th className="px-3 py-2.5">Join</th><th className="px-3 py-2.5">Leave</th><th className="px-3 py-2.5">Dur</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Remarks</th>
                </tr></thead>
                <tbody className="divide-y divide-hairline">
                  {sheet.attendees.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2/20">
                      <td className="px-3 py-2.5"><p className="font-bold text-ink">{a.name}</p><p className="text-[10px] text-ink-3">{a.studentCode}</p></td>
                      <td className="px-3 py-2.5 text-ink-3">{a.joinedAt ? new Date(a.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}{a.lateMinutes ? <span className="ml-1 text-amber-600">+{a.lateMinutes}m</span> : ""}</td>
                      <td className="px-3 py-2.5 text-ink-3">{a.leftAt ? new Date(a.leftAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="px-3 py-2.5 text-ink-3">{a.durationMins != null ? `${a.durationMins}m` : "—"}</td>
                      <td className="px-3 py-2.5">
                        {sheet.attendanceLocked ? (
                          a.status ? <Badge tone={STUDENT_STATUS_TONE[a.status]}>{a.status.replace(/_/g, " ")}</Badge> : "—"
                        ) : (
                          <select value={a.status || ""} onChange={(e) => mark(a.studentId, e.target.value, remarks[a.studentId])} disabled={busy}
                            className="h-8 rounded-lg border border-hairline bg-surface px-2 text-[11px] font-bold text-ink focus:outline-none focus:border-accent">
                            <option value="">—</option>
                            {STUDENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {sheet.attendanceLocked ? (
                          <span className="text-ink-3">{a.remarks || "—"}</span>
                        ) : (
                          <input value={remarks[a.studentId] ?? ""} onChange={(e) => setRemarks((r) => ({ ...r, [a.studentId]: e.target.value }))} onBlur={() => saveRemark(a.studentId, a.status)}
                            placeholder="Add remark…" className="h-8 w-32 rounded-lg border border-hairline bg-surface px-2 text-[11px] text-ink focus:outline-none focus:border-accent" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-ink-3">Present/Late/Absent auto-computed from join duration; you can override until the class is locked.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Loading() { return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>; }
