"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, UserCheck, PauseCircle, GraduationCap, ArrowLeft, Download } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid } from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { fetchStudentFleetAnalytics, fetchStudentMgmtReport, type StudentFleetAnalytics } from "@/lib/api";

const COLORS = ["#386FA4", "#133C55", "#59A5D8", "#84D2F6", "#0EA5E9", "#2563EB", "#7C3AED", "#059669", "#F59E0B", "#EF4444"];

const REPORTS = [
  { key: "student", label: "All Students" },
  { key: "active", label: "Active Students" },
  { key: "inactive", label: "Inactive / On-hold" },
  { key: "dropout", label: "Dropout Report" },
  { key: "course", label: "Course Report" },
  { key: "batch", label: "Batch Report" },
  { key: "teacher", label: "Teacher-wise" },
  { key: "country", label: "Country-wise" },
  { key: "trial-conversion", label: "Trial Conversion" },
];

export default function StudentAnalyticsPage() {
  const router = useRouter();
  const [an, setAn] = useState<StudentFleetAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState("student");
  const [report, setReport] = useState<Record<string, unknown>[] | Record<string, unknown> | null>(null);
  const [repLoading, setRepLoading] = useState(false);

  useEffect(() => { fetchStudentFleetAnalytics().then(setAn).catch(() => undefined).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    setRepLoading(true);
    fetchStudentMgmtReport(reportType).then((r) => setReport(r as never)).catch(() => setReport(null)).finally(() => setRepLoading(false));
  }, [reportType]);

  const exportCsv = () => {
    if (!Array.isArray(report) || report.length === 0) return;
    const cols = Object.keys(report[0]);
    const rows = report.map((r) => cols.map((c) => `"${String((r as Record<string, unknown>)[c] ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [cols.join(","), ...rows].join("\n");
    const a = document.createElement("a");
    a.href = encodeURI(`data:text/csv;charset=utf-8,${csv}`);
    a.download = `students_${reportType}.csv`;
    a.click();
  };

  return (
    <>
      <Topbar title="Student Analytics" subtitle="Enrolment, distribution, growth & downloadable reports" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <button onClick={() => router.push("/students")} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Back to Students</button>

        {loading ? <Loading /> : !an ? <p className="text-sm text-ink-3">No data.</p> : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
              <Kpi label="Total" value={an.cards.total} icon={Users} color="text-accent bg-accent/10" />
              <Kpi label="Active" value={an.cards.active} icon={UserCheck} color="text-emerald-500 bg-emerald-500/10" />
              <Kpi label="Trial" value={an.cards.trial} icon={GraduationCap} color="text-sky-500 bg-sky-500/10" />
              <Kpi label="On Hold" value={an.cards.onHold} icon={PauseCircle} color="text-amber-500 bg-amber-500/10" />
              <Kpi label="Completed" value={an.cards.completed} icon={GraduationCap} color="text-violet-500 bg-violet-500/10" />
              <Kpi label="Dropouts" value={an.cards.dropouts} icon={Users} color="text-red-500 bg-red-500/10" />
              <Kpi label="Avg Attend." value={`${an.cards.avgAttendance}%`} icon={UserCheck} color="text-teal-500 bg-teal-500/10" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Chart title="Monthly Admissions">
                <LineView data={an.monthlyAdmissions.map((m) => ({ name: m.month.slice(2), val: m.count }))} />
              </Chart>
              <Chart title="Student Growth (cumulative)">
                <LineView data={an.studentGrowth.map((m) => ({ name: m.month.slice(2), val: m.total }))} area />
              </Chart>
              <Chart title="Course-wise Students">
                <Bars data={an.courseWise.map((c) => ({ name: c.name, val: c.value }))} rotate />
              </Chart>
              <Chart title="Country-wise Students">
                <PieChartView data={an.countryWise} />
              </Chart>
              <Chart title="Teacher-wise Distribution">
                <Bars data={an.teacherWise.map((t) => ({ name: t.name, val: t.value }))} rotate />
              </Chart>
              <Chart title="Coach-wise Distribution">
                <Bars data={an.coachWise.map((c) => ({ name: c.name, val: c.value }))} rotate />
              </Chart>
              <Chart title="Batch Occupancy">
                <Bars data={an.batchOccupancy.map((b) => ({ name: b.name, val: b.students }))} rotate />
              </Chart>
            </div>

            {/* Reports */}
            <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">Reports</h3>
                  <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink">
                    {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
                <button onClick={exportCsv} disabled={!Array.isArray(report) || report.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40"><Download className="size-3.5" /> CSV</button>
              </div>
              <div className="overflow-x-auto">
                {repLoading ? <Loading /> : <ReportTable data={report} />}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function ReportTable({ data }: { data: Record<string, unknown>[] | Record<string, unknown> | null }) {
  if (!data) return <p className="p-8 text-center text-sm text-ink-3">No data.</p>;
  if (!Array.isArray(data)) {
    return (
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-hairline bg-surface-2 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">{k}</p><p className="mt-1 text-lg font-black text-ink">{String(v)}</p></div>
        ))}
      </div>
    );
  }
  if (data.length === 0) return <p className="p-8 text-center text-sm text-ink-3">No rows.</p>;
  const cols = Object.keys(data[0]);
  return (
    <table className="w-full text-left text-xs">
      <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
        {cols.map((c) => <th key={c} className="px-4 py-3">{c}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-hairline">
        {data.map((r, i) => (
          <tr key={i} className="hover:bg-surface-2/20">
            {cols.map((c) => <td key={c} className="px-4 py-2.5 text-ink-2">{String((r as Record<string, unknown>)[c] ?? "—")}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="flex items-center gap-3 p-4"><span className={`grid size-10 place-items-center rounded-xl ${color}`}><Icon className="size-5" /></span><div><p className="text-xl font-black text-ink leading-none">{value}</p><p className="mt-1 text-[11px] font-semibold text-ink-3">{label}</p></div></CardBody></Card>;
}
function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5"><h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">{title}</h3>{children}</CardBody></Card>;
}
function Bars({ data, rotate }: { data: { name: string; val: number }[]; rotate?: boolean }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet</div>;
  return (<div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: rotate ? 30 : 0 }}>
    <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={0} angle={rotate ? -30 : 0} textAnchor={rotate ? "end" : "middle"} height={rotate ? 40 : 20} />
    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
    <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Bar dataKey="val" radius={[6, 6, 0, 0]}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
  </BarChart></ResponsiveContainer></div>);
}
function LineView({ data, area }: { data: { name: string; val: number }[]; area?: boolean }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet</div>;
  return (<div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
    <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
    <Line type="monotone" dataKey="val" stroke={area ? "#059669" : "#386FA4"} strokeWidth={2} dot={false} />
  </LineChart></ResponsiveContainer></div>);
}
function PieChartView({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet</div>;
  return (<div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart>
    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64} label={(e: { name?: string }) => e.name || ""} labelLine={false}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
  </PieChart></ResponsiveContainer></div>);
}
function Loading() { return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>; }
