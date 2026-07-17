"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, Star, TrendingUp, ArrowLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import {
  fetchTeacherFleetAnalytics, fetchTeacherPerformanceReport,
  type TeacherFleetAnalytics, type TeacherPerformanceRow,
} from "@/lib/api";

const COLORS = ["#386FA4", "#133C55", "#59A5D8", "#84D2F6", "#0EA5E9", "#2563EB", "#7C3AED", "#059669", "#F59E0B", "#EF4444"];

export default function TeacherAnalyticsPage() {
  const router = useRouter();
  const [an, setAn] = useState<TeacherFleetAnalytics | null>(null);
  const [rows, setRows] = useState<TeacherPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchTeacherFleetAnalytics().then(setAn),
      fetchTeacherPerformanceReport().then(setRows),
    ]).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="Teacher Analytics" subtitle="Fleet-wide workload, ratings, distribution & performance report" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <button onClick={() => router.push("/teachers")} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Back to Teachers</button>

        {loading ? <Loading /> : !an ? <p className="text-sm text-ink-3">No data.</p> : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi label="Total Teachers" value={an.totalTeachers} icon={Users} color="text-accent bg-accent/10" />
              <Kpi label="Avg Rating" value={`${an.avgRating}★`} icon={Star} color="text-amber-500 bg-amber-500/10" />
              <Kpi label="Trial Conversion" value={`${an.trialConversion}%`} icon={TrendingUp} color="text-emerald-500 bg-emerald-500/10" />
              <Kpi label="Subjects Offered" value={an.subjectDistribution.length} icon={TrendingUp} color="text-violet-500 bg-violet-500/10" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Chart title="Teacher Workload %">
                <Bars data={an.teacherWorkload.map((t) => ({ name: t.name, val: t.workloadPct }))} rotate />
              </Chart>
              <Chart title="Monthly Teaching Hours (all teachers)">
                <Bars data={an.monthlyHours.map((m) => ({ name: m.month.slice(5), val: m.hours }))} />
              </Chart>
              <Chart title="Subject Distribution">
                <Bars data={an.subjectDistribution.map((s) => ({ name: s.name, val: s.count }))} rotate />
              </Chart>
              <Chart title="Country Distribution">
                <PieChartView data={an.countryDistribution} />
              </Chart>
              <Chart title="Rating Distribution">
                <Bars data={an.ratingBuckets.map((r) => ({ name: r.name, val: r.count }))} />
              </Chart>
            </div>

            {/* Performance report */}
            <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
              <div className="border-b border-hairline p-4"><h3 className="text-sm font-bold text-ink">Teacher Performance Report</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                    <th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Students</th><th className="px-4 py-3">Class Hours</th><th className="px-4 py-3">Classes</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">Leaves</th><th className="px-4 py-3">Trial Success</th><th className="px-4 py-3">Parent ★</th><th className="px-4 py-3">Rating</th>
                  </tr></thead>
                  <tbody className="divide-y divide-hairline">
                    {rows.length === 0 ? (
                      <tr><td colSpan={9} className="py-10 text-center text-ink-3">No teachers yet.</td></tr>
                    ) : rows.map((r) => (
                      <tr key={r.teacherCode} className="hover:bg-surface-2/20">
                        <td className="px-4 py-3"><p className="font-bold text-ink">{r.teacher}</p><p className="text-[10px] text-ink-3">{r.teacherCode}</p></td>
                        <td className="px-4 py-3 text-ink-2">{r.students}</td>
                        <td className="px-4 py-3 text-ink-2">{r.classHours}h</td>
                        <td className="px-4 py-3 text-ink-2">{r.totalClasses}</td>
                        <td className="px-4 py-3 text-ink-2">{r.attendance}%</td>
                        <td className="px-4 py-3 text-ink-2">{r.leaves}</td>
                        <td className="px-4 py-3 text-ink-2">{r.trialSuccess}%</td>
                        <td className="px-4 py-3 text-ink-2">{r.parentRating}★</td>
                        <td className="px-4 py-3"><span className="font-black text-accent">{r.rating}★</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
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
function PieChartView({ data }: { data: { name: string; count: number }[] }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet</div>;
  return (<div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart>
    <Pie data={data} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={64} label={(e: { name?: string }) => e.name || ""} labelLine={false}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
  </PieChart></ResponsiveContainer></div>);
}
function Loading() { return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>; }
