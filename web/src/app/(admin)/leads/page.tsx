"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Users,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Star,
  ArrowRight,
  CalendarClock,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { fetchLeads, fetchLeadStats, fetchLeadFunnel, type Lead, type LeadStats, type LeadFunnel } from "@/lib/api";
import {
  ALL_LEAD_STATUSES,
  LEAD_PIPELINE,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_TONE,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
} from "@/components/leads/lead-meta";

const BAR_COLORS = ["#386FA4", "#133C55", "#59A5D8", "#84D2F6", "#91E5F6", "#0EA5E9"];

export default function LeadsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [funnelData, setFunnelData] = useState<LeadFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("All");
  const [priority, setPriority] = useState("All");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    fetchLeads({ page: 1, limit: 100, status, priority, search: search || undefined })
      .then((res) => setItems(res.items))
      .catch((e) => console.error("Failed to load leads", e))
      .finally(() => setLoading(false));
    fetchLeadStats().then(setStats).catch(() => undefined);
    fetchLeadFunnel().then(setFunnelData).catch(() => undefined);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [status, priority]);

  const kpis = [
    { label: "Total Requests", value: stats?.total ?? 0, icon: Users, color: "text-ink-2 bg-surface-3" },
    { label: "New", value: stats?.newLeads ?? 0, icon: Sparkles, color: "text-blue-500 bg-blue-500/10" },
    { label: "In Pipeline", value: stats?.inPipeline ?? 0, icon: TrendingUp, color: "text-amber-500 bg-amber-500/10" },
    { label: "Converted", value: stats?.converted ?? 0, icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Conversion %", value: `${stats?.conversionRate ?? 0}%`, icon: Star, color: "text-violet-500 bg-violet-500/10" },
    { label: "Rejected", value: stats?.rejected ?? 0, icon: XCircle, color: "text-rose-500 bg-rose-500/10" },
  ];

  // Prefer the cumulative "reached this stage" funnel from the analytics
  // endpoint; fall back to the raw current-status counts.
  const funnel = funnelData?.funnel?.length
    ? funnelData.funnel.map((f) => ({ stage: LEAD_STATUS_LABEL[f.stage as Lead["status"]] ?? f.stage, count: f.reached }))
    : LEAD_PIPELINE.map((s) => ({ stage: LEAD_STATUS_LABEL[s], count: stats?.statusCounts?.[s] ?? 0 }));
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  const tr = funnelData?.trials;
  const trialStats = [
    { label: "Trials Scheduled", value: tr?.scheduled ?? 0, icon: CalendarClock, color: "text-accent bg-accent/10" },
    { label: "Attended", value: tr?.attended ?? 0, icon: UserCheck, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "No-shows", value: tr?.noShow ?? 0, icon: UserX, color: "text-rose-500 bg-rose-500/10" },
    { label: "Attendance %", value: `${tr?.attendanceRate ?? 0}%`, icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
    { label: "Avg Teacher ★", value: tr?.avgTeacherRating ?? 0, icon: Star, color: "text-amber-500 bg-amber-500/10" },
    { label: "Avg Parent ★", value: tr?.avgParentRating ?? 0, icon: Star, color: "text-violet-500 bg-violet-500/10" },
  ];

  return (
    <>
      <Topbar title="Trial Classes" subtitle="Free-trial requests → evaluation → trial → conversion" />

      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <Card key={k.label} className="border border-hairline bg-surface shadow-sm">
              <CardBody className="flex items-center gap-3 p-4">
                <span className={`grid size-10 place-items-center rounded-xl ${k.color}`}>
                  <k.icon className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-black text-ink leading-none">{k.value}</p>
                  <p className="text-[11px] font-semibold text-ink-3 mt-1">{k.label}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Funnel + charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border border-hairline bg-surface shadow-sm lg:col-span-1">
            <CardBody className="p-5">
              <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">Conversion Funnel</h3>
              <div className="space-y-2">
                {funnel.map((f) => (
                  <div key={f.stage}>
                    <div className="mb-0.5 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-ink-2">{f.stage}</span>
                      <span className="font-bold text-ink">{f.count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card className="border border-hairline bg-surface shadow-sm">
            <CardBody className="p-5">
              <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">Leads by Subject</h3>
              <MiniBar data={(stats?.bySubject ?? []).slice(0, 6).map((s) => ({ name: s.subject, count: s.count }))} />
            </CardBody>
          </Card>

          <Card className="border border-hairline bg-surface shadow-sm">
            <CardBody className="p-5">
              <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">Leads by Country</h3>
              <MiniBar data={(stats?.byCountry ?? []).slice(0, 6).map((s) => ({ name: s.country, count: s.count }))} />
            </CardBody>
          </Card>
        </div>

        {/* Trial & conversion analytics */}
        <div>
          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">Trial &amp; Conversion Analytics</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {trialStats.map((k) => (
              <Card key={k.label} className="border border-hairline bg-surface shadow-sm">
                <CardBody className="flex items-center gap-3 p-4">
                  <span className={`grid size-10 place-items-center rounded-xl ${k.color}`}>
                    <k.icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-xl font-black text-ink leading-none">{k.value}</p>
                    <p className="text-[11px] font-semibold text-ink-3 mt-1">{k.label}</p>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 focus:outline-none focus:border-accent">
              <option value="All">All Statuses</option>
              {ALL_LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 focus:outline-none focus:border-accent">
              <option value="All">All Priorities</option>
              {LEAD_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, mobile, lead #…" className="h-10 w-full rounded-xl border border-hairline bg-surface pl-9 pr-3 text-xs text-ink focus:outline-none focus:border-accent" />
          </form>
        </div>

        {/* Table */}
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto min-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm font-bold text-ink-3">
                <Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading leads…
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-ink-3">
                <Users className="size-8 text-ink-3/40" />
                <p className="text-sm font-bold">No trial requests found.</p>
                <p className="text-xs">New free-trial requests will appear here.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                    <th className="px-5 py-4">Request ID</th>
                    <th className="px-5 py-4">Student</th>
                    <th className="px-5 py-4">Parent</th>
                    <th className="px-5 py-4">Subject</th>
                    <th className="px-5 py-4">Country</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Priority</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {items.map((l) => (
                    <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)} className="cursor-pointer hover:bg-surface-2/30 transition-colors">
                      <td className="px-5 py-3.5 text-xs font-mono font-bold text-accent">{l.leadNumber}</td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-bold text-ink">{l.studentFirstName} {l.studentLastName}</p>
                        <p className="text-[10px] text-ink-3">{l.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-ink-2">{l.parentName || "—"}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-2">{l.interestedSubject || "—"}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-3">{l.country || "—"}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-3">{new Date(l.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                      <td className="px-5 py-3.5"><Badge tone={LEAD_PRIORITY_TONE[l.priority]}>{l.priority}</Badge></td>
                      <td className="px-5 py-3.5"><Badge tone={LEAD_STATUS_TONE[l.status]}>{LEAD_STATUS_LABEL[l.status]}</Badge></td>
                      <td className="px-5 py-3.5 text-right">
                        <ArrowRight className="ml-auto size-4 text-ink-3" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function MiniBar({ data }: { data: { name: string; count: number }[] }) {
  if (!data.length) {
    return <div className="grid h-40 place-items-center text-xs text-ink-3">No data yet</div>;
  }
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
