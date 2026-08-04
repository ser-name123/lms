"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, FilePlus2, Send, X } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchMyReports, saveMyReport, submitMyReport, fetchTeacherStudents,
  type MonthlyReport, type MonthlyReportStatus,
} from "@/lib/api";

const tone: Record<MonthlyReportStatus, Tone> = { DRAFT: "neutral", SUBMITTED: "warning", UNDER_REVIEW: "accent", APPROVED: "good", REJECTED: "critical" };
const swalBg = () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff");
const monthValue = () => { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export default function TeacherReportsPage() {
  const [rows, setRows] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);

  const load = () => { setLoading(true); fetchMyReports().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); };
  useEffect(() => load(), []);

  return (
    <>
      <Topbar title="Monthly Reports" subtitle="Submit a monthly progress report for each student" />
      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        <div className="flex justify-end">
          <Button onClick={() => setCompose(true)} className="h-10 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90"><FilePlus2 className="mr-1 size-4" /> New report</Button>
        </div>

        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading…</div>
            ) : !rows.length ? (
              <div className="py-16 text-center text-xs text-ink-3">No reports yet. Click “New report”.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      <th className="px-5 py-3">Student</th><th className="px-5 py-3">Month</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2/30">
                        <td className="px-5 py-3 text-xs font-bold text-ink">{r.student?.name ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-ink-3">{r.monthLabel}</td>
                        <td className="px-5 py-3">
                          <Badge tone={tone[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge>
                          {r.reviewNotes && r.status === "REJECTED" && <p className="mt-1 text-[11px] text-amber-500">{r.reviewNotes}</p>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {(r.status === "DRAFT" || r.status === "REJECTED") ? (
                            <SubmitBtn id={r.id} onDone={load} />
                          ) : <span className="text-[11px] text-ink-3">{r.approvedByName ? `Approved · ${r.approvedByName}` : "Submitted"}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {compose && <ComposeModal onClose={() => setCompose(false)} onDone={() => { setCompose(false); load(); }} />}
    </>
  );
}

function SubmitBtn({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await submitMyReport(id); await Swal.fire({ title: "Submitted", icon: "success", background: swalBg(), confirmButtonColor: "#10b981" }); onDone(); }
    catch (e) { Swal.fire({ title: "Cannot submit", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };
  return <Button onClick={submit} disabled={busy} className="h-8 rounded-lg bg-accent px-3 text-[11px] font-bold text-white">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="mr-1 size-3.5" />} Submit</Button>;
}

function ComposeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ studentId: "", month: monthValue(), summary: "", strengths: "", areasToImprove: "", recommendation: "", attendanceNote: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchTeacherStudents().then((list) => setStudents((list || []).map((s: any) => ({ id: s.id, name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.studentCode || s.id })))).catch(() => setStudents([]));
  }, []);

  const save = async (thenSubmit: boolean) => {
    if (!form.studentId || !form.summary.trim()) { Swal.fire({ title: "Pick a student + add a summary", icon: "warning", background: swalBg() }); return; }
    setBusy(true);
    try {
      const [y, m] = form.month.split("-").map(Number);
      const ps = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const pe = new Date(Date.UTC(y, m, 0)).toISOString();
      const saved = await saveMyReport({ studentId: form.studentId, periodStart: ps, periodEnd: pe, summary: form.summary, strengths: form.strengths, areasToImprove: form.areasToImprove, recommendation: form.recommendation, attendanceNote: form.attendanceNote });
      if (thenSubmit) await submitMyReport(saved.id);
      await Swal.fire({ title: thenSubmit ? "Submitted" : "Saved", icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      onDone();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  const Field = ({ k, label }: { k: keyof typeof form; label: string }) => (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      <textarea value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} rows={2}
        className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline p-5">
          <h3 className="text-sm font-black text-ink">New monthly report</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Student</label>
              <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink">
                <option value="">— Choose —</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Month</label>
              <input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink" />
            </div>
          </div>
          <Field k="summary" label="Progress summary *" />
          <Field k="strengths" label="Strengths" />
          <Field k="areasToImprove" label="Areas to improve" />
          <Field k="recommendation" label="Recommendation" />
          <Field k="attendanceNote" label="Attendance note" />
        </div>
        <div className="flex gap-2 border-t border-hairline p-4">
          <Button onClick={() => save(false)} disabled={busy} className="h-11 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 hover:bg-surface-2">Save draft</Button>
          <Button onClick={() => save(true)} disabled={busy} className="h-11 flex-1 rounded-xl bg-accent text-xs font-bold text-white">{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />} Submit</Button>
        </div>
      </div>
    </div>
  );
}
