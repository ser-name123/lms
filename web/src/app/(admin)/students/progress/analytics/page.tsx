"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  Award,
  AlertTriangle,
  GraduationCap,
  Target,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { fetchProgressAnalytics } from "@/lib/api";

const COLORS = ["#386FA4", "#059669", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#ec4899"];

type Analytics = Awaited<ReturnType<typeof fetchProgressAnalytics>>;

export default function ProgressAnalyticsPage() {
  const router = useRouter();
  const [an, setAn] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgressAnalytics()
      .then(setAn)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const c = an?.cards;
  const ch = an?.charts;

  return (
    <>
      <Topbar title="Progress Analytics" subtitle="Deep-dive analytics across the academy" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <button
          onClick={() => router.push("/students/progress")}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to Progress
        </button>

        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : !an ? (
          <p className="text-sm text-ink-3">No analytics data.</p>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Average Progress" value={`${c?.averageProgress ?? 0}%`} icon={TrendingUp} color="text-accent bg-accent/10" />
              <Kpi label="Top Performers" value={c?.topPerformers ?? 0} icon={Award} color="text-amber-500 bg-amber-500/10" />
              <Kpi label="Students At Risk" value={c?.studentsAtRisk ?? 0} icon={AlertTriangle} color="text-red-500 bg-red-500/10" />
              <Kpi label="Course Completion" value={`${c?.courseCompletion ?? 0}%`} icon={GraduationCap} color="text-violet-500 bg-violet-500/10" />
              <Kpi label="Goal Completion" value={`${c?.goalCompletion ?? 0}%`} icon={Target} color="text-rose-500 bg-rose-500/10" />
              <Kpi label="Average Attendance" value={`${c?.averageAttendance ?? 0}%`} icon={CalendarCheck} color="text-emerald-500 bg-emerald-500/10" />
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Chart title="Learning Curve">
                <LineView data={(ch?.learningCurve ?? []).map((d) => ({ name: d.month, value: d.value }))} />
              </Chart>
              <Chart title="Skill Distribution">
                <Bars data={ch?.skillDistribution ?? []} />
              </Chart>
              <Chart title="Goal Achievement">
                <Bars data={ch?.goalAchievement ?? []} />
              </Chart>
              <Chart title="Teacher Impact">
                <Bars data={ch?.teacherImpact ?? []} />
              </Chart>
              <Chart title="Batch Comparison">
                <Bars data={ch?.batchComparison ?? []} />
              </Chart>
              <Chart title="Weekly Growth">
                <LineView data={ch?.weeklyGrowth ?? []} />
              </Chart>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="flex items-center gap-3 p-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="size-5" /></span>
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold text-ink">{value}</div>
          <div className="truncate text-[11px] font-semibold text-ink-3">{label}</div>
        </div>
      </CardBody>
    </Card>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-4">
        <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">{title}</h3>
        {children}
      </CardBody>
    </Card>
  );
}

function Bars({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet.</div>;
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3)" }} interval={0} angle={-15} textAnchor="end" height={44} />
          <YAxis tick={{ fontSize: 10, fill: "var(--ink-3)" }} domain={[0, 100]} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LineView({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet — trend builds over time.</div>;
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--ink-3)" }} domain={[0, 100]} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey="value" stroke="#386FA4" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
