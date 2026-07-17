"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users2, CalendarClock, FileBarChart, ClipboardCheck, Settings2,
  Loader2, TrendingUp, UserCheck, UserX, GraduationCap, AlertTriangle, Plus,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  fetchAdminAttendanceDashboard, fetchCorrections, reviewCorrection, fetchAttendanceConfig,
  updateAttendanceConfig, fetchAttendanceReport, fetchAttendanceAnalytics,
  type AdminAttendanceDashboard, type AttendanceCorrection, type AttendanceConfig, type AttendanceAnalytics,
} from "@/lib/api";
import { BatchesPanel } from "@/components/attendance/batches-panel";
import { ClassesPanel } from "@/components/attendance/classes-panel";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "batches", label: "Batches", icon: Users2 },
  { key: "classes", label: "Classes", icon: CalendarClock },
  { key: "reports", label: "Reports", icon: FileBarChart },
  { key: "corrections", label: "Corrections", icon: ClipboardCheck },
  { key: "settings", label: "Rules", icon: Settings2 },
] as const;

export default function AttendancePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  return (
    <>
      <Topbar title="Attendance" subtitle="Batches · classes · session attendance · reports" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${tab === t.key ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "batches" && <BatchesPanel />}
        {tab === "classes" && <ClassesPanel />}
        {tab === "reports" && <Reports />}
        {tab === "corrections" && <Corrections />}
        {tab === "settings" && <RulesSettings />}
      </div>
    </>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview() {
  const [d, setD] = useState<AdminAttendanceDashboard | null>(null);
  const [an, setAn] = useState<AttendanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchAdminAttendanceDashboard().then(setD).catch(() => undefined).finally(() => setLoading(false));
    fetchAttendanceAnalytics().then(setAn).catch(() => undefined);
  }, []);

  if (loading) return <Loading />;
  if (!d) return <p className="text-sm text-ink-3">No data.</p>;

  const kpis = [
    { label: "Today's Classes", value: d.todayClasses, icon: CalendarClock, color: "text-ink-2 bg-surface-3" },
    { label: "Running Now", value: d.runningClasses, icon: TrendingUp, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Completed", value: d.completedClasses, icon: ClipboardCheck, color: "text-blue-500 bg-blue-500/10" },
    { label: "Students Present", value: d.studentsPresent, icon: UserCheck, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Students Absent", value: d.studentsAbsent, icon: UserX, color: "text-rose-500 bg-rose-500/10" },
    { label: "Teachers Present", value: d.teachersPresent, icon: GraduationCap, color: "text-violet-500 bg-violet-500/10" },
    { label: "Attendance %", value: `${d.attendanceRate}%`, icon: TrendingUp, color: "text-accent bg-accent/10" },
    { label: "Pending Corrections", value: d.pendingCorrections, icon: AlertTriangle, color: "text-amber-500 bg-amber-500/10" },
  ];
  const maxRate = 100;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border border-hairline bg-surface shadow-sm">
            <CardBody className="flex items-center gap-3 p-4">
              <span className={`grid size-10 place-items-center rounded-xl ${k.color}`}><k.icon className="size-5" /></span>
              <div><p className="text-xl font-black text-ink leading-none">{k.value}</p><p className="text-[11px] font-semibold text-ink-3 mt-1">{k.label}</p></div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="border border-hairline bg-surface shadow-sm">
        <CardBody className="p-5">
          <h3 className="mb-4 text-xs font-extrabold uppercase tracking-wider text-ink-3">Daily Attendance (last 7 days)</h3>
          <div className="flex items-end justify-between gap-2 h-40">
            {d.dailyTrend.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-ink-2">{day.rate}%</span>
                <div className="flex w-full flex-col justify-end rounded-t-md bg-surface-3 overflow-hidden" style={{ height: "110px" }}>
                  <div className="w-full rounded-t-md bg-accent transition-all" style={{ height: `${(day.rate / maxRate) * 100}%` }} />
                </div>
                <span className="text-[9px] font-semibold text-ink-3">{new Date(day.date).toLocaleDateString("en-US", { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {an && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Weekly Attendance %"><RateBars data={an.weekly.map((w) => ({ name: w.period.split("-W")[1] ? `W${w.period.split("-W")[1]}` : w.period, rate: w.rate }))} /></ChartCard>
            <ChartCard title="Monthly Attendance %"><RateBars data={an.monthly.map((m) => ({ name: m.period.slice(5), rate: m.rate }))} /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Teacher-wise"><RateBars data={an.teacherWise.map((t) => ({ name: t.name, rate: t.rate }))} /></ChartCard>
            <ChartCard title="Course-wise"><RateBars data={an.courseWise.map((t) => ({ name: t.name, rate: t.rate }))} /></ChartCard>
            <ChartCard title="Batch-wise"><RateBars data={an.batchWise.map((t) => ({ name: t.name, rate: t.rate }))} /></ChartCard>
            <ChartCard title="Country-wise"><RateBars data={an.countryWise.map((t) => ({ name: t.name, rate: t.rate }))} /></ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

const BAR_COLORS = ["#386FA4", "#133C55", "#59A5D8", "#84D2F6", "#0EA5E9", "#2563EB", "#7C3AED", "#059669"];
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">{title}</h3>
        {children}
      </CardBody>
    </Card>
  );
}
function RateBars({ data }: { data: { name: string; rate: number }[] }) {
  if (!data.length) return <div className="grid h-40 place-items-center text-xs text-ink-3">No data yet</div>;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 34 : 20} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ fontSize: 12, borderRadius: 10 }} formatter={(v) => [`${v}%`, "Attendance"]} />
          <Bar dataKey="rate" radius={[6, 6, 0, 0]}>{data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  { key: "student", label: "Student" },
  { key: "teacher", label: "Teacher" },
  { key: "course", label: "Course" },
  { key: "batch", label: "Batch" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
  { key: "low", label: "Low (<75%)" },
  { key: "perfect", label: "Perfect" },
  { key: "no-show", label: "No-show" },
  { key: "late", label: "Late Join" },
];
function Reports() {
  const [type, setType] = useState("student");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const load = (t: string) => { setLoading(true); fetchAttendanceReport(t).then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); };
  useEffect(() => { load(type); /* eslint-disable-next-line */ }, [type]);

  const cols = rows[0] ? Object.keys(rows[0]).filter((c) => c !== "studentId") : [];

  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {REPORT_TYPES.map((r) => (
            <button key={r.key} onClick={() => setType(r.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${type === r.key ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3 hover:text-ink-2"}`}>{r.label}</button>
          ))}
        </div>
        {loading ? <Loading /> : rows.length === 0 ? <p className="py-10 text-center text-xs text-ink-3">No records for this report.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-hairline text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                {cols.map((c) => <th key={c} className="px-3 py-2.5">{c.replace(/([A-Z])/g, " $1")}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-surface-2/30">
                    {cols.map((c) => <td key={c} className="px-3 py-2.5 text-ink-2">{fmtCell(r[c])}</td>)}
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
function fmtCell(v: unknown) {
  if (v == null) return "—";
  if (typeof v === "string" && /\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toLocaleString();
  if (typeof v === "number" && v >= 0) return String(v);
  return String(v);
}

// ── Corrections ───────────────────────────────────────────────────────────────
function Corrections() {
  const [rows, setRows] = useState<AttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); fetchCorrections().then(setRows).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const review = async (id: string, decision: "APPROVED" | "REJECTED") => {
    const { value, isConfirmed } = await Swal.fire({
      title: decision === "APPROVED" ? "Approve correction?" : "Reject correction?",
      input: "textarea", inputPlaceholder: "Review note (optional)…",
      showCancelButton: true, confirmButtonText: decision === "APPROVED" ? "Approve" : "Reject",
      confirmButtonColor: decision === "APPROVED" ? "#059669" : "#e11d48", background: swalBg(),
    });
    if (!isConfirmed) return;
    try { await reviewCorrection(id, decision, value || undefined); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Done", showConfirmButton: false, timer: 1600 }); load(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  if (loading) return <Loading />;
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <h3 className="mb-4 text-sm font-bold text-ink">Manual Correction Requests</h3>
        {rows.length === 0 ? <p className="py-8 text-center text-xs text-ink-3">No correction requests.</p> : (
          <div className="space-y-2.5">
            {rows.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2/30 p-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-ink">{c.class?.title || "Class"}</p>
                    <Badge tone={c.status === "PENDING" ? "warning" : c.status === "APPROVED" ? "good" : "critical"}>{c.status}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {c.targetType} · {c.fromStatus || "—"} → <b className="text-ink-2">{c.toStatus}</b> · by {c.requestedByName || "teacher"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-3">Reason: {c.reason}</p>
                </div>
                {c.status === "PENDING" && (
                  <div className="flex gap-1.5">
                    <button onClick={() => review(c.id, "APPROVED")} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-500/20">Approve</button>
                    <button onClick={() => review(c.id, "REJECTED")} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-500/20">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Rules / settings ──────────────────────────────────────────────────────────
function RulesSettings() {
  const [cfg, setCfg] = useState<AttendanceConfig | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchAttendanceConfig().then(setCfg).catch(() => undefined); }, []);

  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    try { const updated = await updateAttendanceConfig(cfg); setCfg(updated); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Rules saved", showConfirmButton: false, timer: 1600 }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };
  if (!cfg) return <Loading />;

  const num = (k: keyof AttendanceConfig, label: string, hint: string, suffix: string) => (
    <div className="rounded-xl border border-hairline bg-surface-2/30 p-4">
      <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      <div className="mt-2 flex items-center gap-2">
        <input type="number" value={cfg[k] as number} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })}
          className="h-10 w-24 rounded-lg border border-hairline bg-surface px-3 text-sm font-bold text-ink focus:outline-none focus:border-accent" />
        <span className="text-xs font-semibold text-ink-3">{suffix}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-3">{hint}</p>
    </div>
  );

  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <h3 className="mb-1 text-sm font-bold text-ink">Attendance Rules</h3>
        <p className="mb-4 text-xs text-ink-3">Present / Late / Absent are computed from % of class duration attended. All values are configurable.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {num("presentThreshold", "Present threshold", "Attended ≥ this % of duration ⇒ Present.", "% of duration")}
          {num("lateThreshold", "Late threshold", "Between this % and present ⇒ Late; below ⇒ Absent.", "% of duration")}
          {num("lateGraceMinutes", "Late grace", "Join within these minutes isn't counted late.", "minutes")}
          {num("autoLockMinutes", "Auto-lock", "Lock attendance this long after class ends.", "minutes after end")}
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-ink-2">
          <input type="checkbox" checked={cfg.allowManualCorrection} onChange={(e) => setCfg({ ...cfg, allowManualCorrection: e.target.checked })} />
          Allow manual correction (admin approval required)
        </label>
        <button onClick={save} disabled={busy} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />} Save Rules
        </button>
      </CardBody>
    </Card>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>;
}
