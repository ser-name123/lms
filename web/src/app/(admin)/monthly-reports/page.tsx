"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, FileText, BarChart3, X, CheckCircle2, XCircle } from "lucide-react";

import { useAuth } from "@/store/auth";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchStaffReports, supervisorReviewReport, adminReviewReport, approveReport, rejectReport,
  fetchTeacherAttendanceAnalytics, type MonthlyReport, type MonthlyReportStatus, type TeacherAttendanceAnalyticsRow,
} from "@/lib/api";

const REPORT_TABS = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"] as const;
const tone: Record<MonthlyReportStatus, Tone> = { DRAFT: "neutral", SUBMITTED: "warning", UNDER_REVIEW: "accent", APPROVED: "good", REJECTED: "critical" };
const swalBg = () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff");

export default function MonthlyReportsPage() {
  const [view, setView] = useState<"reports" | "analytics">("reports");
  return (
    <>
      <Topbar title="Monthly Reports" subtitle="Teacher monthly student reports + attendance analytics" />
      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-full sm:w-fit">
          {(["reports", "analytics"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${view === v ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>
              {v === "reports" ? <FileText className="size-3.5" /> : <BarChart3 className="size-3.5" />}
              {v === "reports" ? "Reports" : "Attendance analytics"}
            </button>
          ))}
        </div>
        {view === "reports" ? <ReportsView /> : <AnalyticsView />}
      </div>
    </>
  );
}

function ReportsView() {
  const { user } = useAuth();
  const isSupervisorOrAdmin = user?.role === "SUPERVISOR" || user?.role === "ADMIN";
  const [status, setStatus] = useState<string>("SUBMITTED");
  const [rows, setRows] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<MonthlyReport | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchStaffReports(status).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [status]);
  useEffect(() => load(), [load]);

  return (
    <>
      <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-full sm:w-fit overflow-x-auto">
        {REPORT_TABS.map((t) => (
          <button key={t} onClick={() => setStatus(t)}
            className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${status === t ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>
            {t.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>
      <Card className="border border-hairline bg-surface shadow-sm">
        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading…</div>
          ) : !rows.length ? (
            <div className="py-16 text-center text-xs text-ink-3">No {status.replace(/_/g, " ").toLowerCase()} reports.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                    <th className="px-5 py-3">Student</th><th className="px-5 py-3">Teacher</th><th className="px-5 py-3">Month</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/30">
                      <td className="px-5 py-3 text-xs font-bold text-ink">{r.student?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-ink-2">{r.teacher?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-ink-3">{r.monthLabel}</td>
                      <td className="px-5 py-3"><Badge tone={tone[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge></td>
                      <td className="px-5 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => setOpen(r)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-accent hover:bg-accent/10">Open</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      {open && <ReportDrawer report={open} canApprove={isSupervisorOrAdmin} isAdmin={user?.role === "ADMIN"} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </>
  );
}

function ReportDrawer({ report, canApprove, isAdmin, onClose, onChanged }: { report: MonthlyReport; canApprove: boolean; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); await Swal.fire({ title: msg, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" }); onChanged(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };
  const doReject = async () => {
    const { value } = await Swal.fire({ title: "Return report", input: "textarea", inputPlaceholder: "Notes for the teacher…", showCancelButton: true, background: swalBg(), confirmButtonColor: "#ef4444" });
    if (value === undefined) return;
    act(() => rejectReport(report.id, value || undefined), "Returned to teacher");
  };
  const pending = report.status === "SUBMITTED" || report.status === "UNDER_REVIEW";

  const Field = ({ label, value }: { label: string; value: string | null }) => (
    <div><p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p><p className="mt-0.5 text-xs text-ink-2">{value || "—"}</p></div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline p-5">
          <div><h3 className="text-sm font-black text-ink">{report.student?.name}</h3><p className="text-[11px] text-ink-3">{report.monthLabel} · {report.teacher?.name}</p></div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Badge tone={tone[report.status]}>{report.status.replace(/_/g, " ").toLowerCase()}</Badge>
          <Field label="Progress summary" value={report.summary} />
          <Field label="Strengths" value={report.strengths} />
          <Field label="Areas to improve" value={report.areasToImprove} />
          <Field label="Recommendation" value={report.recommendation} />
          <Field label="Attendance note" value={report.attendanceNote} />
          <div className="rounded-lg border border-hairline bg-surface-2/40 p-3 text-[11px] text-ink-3">
            {report.supervisorReviewedByName && <p>Supervisor reviewed: {report.supervisorReviewedByName}</p>}
            {report.adminReviewedByName && <p>Admin reviewed: {report.adminReviewedByName}</p>}
            {report.approvedByName && <p>Approved by: {report.approvedByName}</p>}
            {report.reviewNotes && <p className="text-amber-500">Notes: {report.reviewNotes}</p>}
          </div>
        </div>
        {pending && canApprove && (
          <div className="space-y-2 border-t border-hairline p-4">
            <div className="flex gap-2">
              <Button onClick={() => act(() => supervisorReviewReport(report.id), "Marked reviewed")} disabled={busy} className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-[11px] font-bold text-ink-2 hover:bg-surface-2">Supervisor review</Button>
              {isAdmin && <Button onClick={() => act(() => adminReviewReport(report.id), "Marked reviewed")} disabled={busy} className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-[11px] font-bold text-ink-2 hover:bg-surface-2">Admin review</Button>}
            </div>
            <div className="flex gap-2">
              <Button onClick={doReject} disabled={busy} className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-critical hover:bg-critical/5"><XCircle className="mr-1 size-4" /> Return</Button>
              <Button onClick={() => act(() => approveReport(report.id), "Approved")} disabled={busy} className="h-10 flex-1 rounded-xl bg-accent text-xs font-bold text-white"><CheckCircle2 className="mr-1 size-4" /> Approve</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsView() {
  const [rows, setRows] = useState<TeacherAttendanceAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchTeacherAttendanceAnalytics().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-0">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading…</div>
        ) : !rows.length ? (
          <div className="py-16 text-center text-xs text-ink-3">No completed classes this month yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                  <th className="px-5 py-3">Teacher</th><th className="px-5 py-3">Classes</th><th className="px-5 py-3">Present</th><th className="px-5 py-3">Late</th><th className="px-5 py-3">Absent</th><th className="px-5 py-3">Avg late</th><th className="px-5 py-3">Punctuality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r) => (
                  <tr key={r.teacher.id} className="hover:bg-surface-2/30">
                    <td className="px-5 py-3 text-xs font-bold text-ink">{r.teacher.name ?? r.teacher.id}</td>
                    <td className="px-5 py-3 text-xs text-ink-2">{r.totalClasses}</td>
                    <td className="px-5 py-3 text-xs text-emerald-500">{r.present}</td>
                    <td className="px-5 py-3 text-xs text-amber-500">{r.late}</td>
                    <td className="px-5 py-3 text-xs text-red-500">{r.absent}</td>
                    <td className="px-5 py-3 text-xs text-ink-3">{r.avgLateMinutes} min</td>
                    <td className="px-5 py-3 text-xs font-bold text-ink">{r.punctualityPct}%</td>
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
