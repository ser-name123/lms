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
  Trash2,
} from "lucide-react";
import Swal from "sweetalert2";
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
import { fetchLeads, fetchLeadStats, fetchLeadFunnel, bulkDeleteLeads, type Lead, type LeadStats, type LeadFunnel } from "@/lib/api";
import {
  ALL_LEAD_STATUSES,
  LEAD_PIPELINE,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_TONE,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
} from "@/components/leads/lead-meta";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

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
  /*
   * The table used to ask for one page of 100 and print "Total Requests 340"
   * above it, with no way to reach lead 101. Paged properly now.
   */
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, hiddenConverted: 0 });
  const PAGE_SIZE = 25;
  /*
   * Selection is by id, not by row index — the list re-sorts and re-pages
   * under it, and an index-based selection would silently move to whatever
   * row landed in that position.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    fetchLeads({ page, limit: PAGE_SIZE, status, priority, search: search || undefined })
      .then((res) => {
        setItems(res.items);
        setMeta({
          total: res.meta.total,
          totalPages: res.meta.totalPages,
          hiddenConverted: res.meta.hiddenConverted ?? 0,
        });
        // Never carry a tick across a reload — the rows behind it have changed.
        setSelected(new Set());
      })
      .catch((e) => console.error("Failed to load leads", e))
      .finally(() => setLoading(false));
    fetchLeadStats().then(setStats).catch(() => undefined);
    fetchLeadFunnel().then(setFunnelData).catch(() => undefined);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [status, priority, page]);

  // A filter change makes the current page number meaningless.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [status, priority]);


  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allOnPage = items.length > 0 && items.every((l) => selected.has(l.id));
  const toggleAll = () =>
    setSelected((prev) => (allOnPage ? new Set() : new Set([...prev, ...items.map((l) => l.id)])));

  /*
   * Deleting is irreversible and takes the trial, its Zoom room and the whole
   * timeline with it, so the confirmation names who is going rather than
   * printing a count and hoping.
   */
  const removeSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const names = items
      .filter((l) => ids.includes(l.id))
      .slice(0, 5)
      .map((l) => `${l.studentFirstName} ${l.studentLastName}`);
    const more = ids.length - names.length;

    const { isConfirmed } = await Swal.fire({
      title: `Delete ${ids.length} trial request${ids.length > 1 ? "s" : ""}?`,
      html:
        `<p style="font-size:13px;text-align:left">${names.join("<br/>")}` +
        (more > 0 ? `<br/>…and ${more} more` : "") +
        `</p><p style="font-size:12px;color:#6b7280;text-align:left;margin-top:10px">` +
        `Their trial classes, Zoom rooms and history go too. This cannot be undone. ` +
        `Anyone already enrolled as a student will be skipped.</p>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Delete ${ids.length}`,
      confirmButtonColor: "#e11d48",
      background: swalBg(),
    });
    if (!isConfirmed) return;

    setDeleting(true);
    try {
      const res = await bulkDeleteLeads(ids);
      if (res.failed) {
        // Say which ones stayed and why, rather than a bare count.
        await Swal.fire({
          title: `${res.deleted} deleted, ${res.failed} kept`,
          html: `<p style="font-size:12px;text-align:left">${res.failures.map((f) => f.reason).join("<br/><br/>")}</p>`,
          icon: "info",
          background: swalBg(),
        });
      } else {
        Swal.fire({
          toast: true, position: "top-end", icon: "success",
          title: `${res.deleted} deleted`, showConfirmButton: false, timer: 1900,
        });
      }
      load();
    } catch (e) {
      Swal.fire({
        title: "Could not delete",
        text: e instanceof Error ? e.message : "Failed.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setDeleting(false);
    }
  };

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
    // Out of trials that have actually concluded, which is why "Upcoming" is
    // shown too — otherwise the four tiles cannot be added up by the reader.
    { label: "Upcoming", value: tr?.upcoming ?? 0, icon: CalendarClock, color: "text-amber-500 bg-amber-500/10" },
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

        {/*
          * Only present while something is ticked. A delete button sitting
          * permanently above a list of families is an accident waiting for a
          * mis-click.
          */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
            <p className="text-xs font-bold text-ink">
              {selected.size} selected
            </p>
            <button onClick={() => setSelected(new Set())}
              className="text-[11px] font-bold text-ink-3 hover:text-ink-2">
              Clear
            </button>
            <button onClick={removeSelected} disabled={deleting}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 text-xs font-bold text-rose-600 hover:bg-rose-500/20 disabled:opacity-50">
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete selected
            </button>
          </div>
        )}

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
                    <th className="w-10 px-5 py-4">
                      <input type="checkbox" checked={allOnPage} onChange={toggleAll}
                        aria-label="Select every request on this page"
                        className="size-3.5 cursor-pointer accent-[var(--accent)]" />
                    </th>
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
                    <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)} className={`cursor-pointer transition-colors ${selected.has(l.id) ? "bg-accent/5" : "hover:bg-surface-2/30"}`}>
                      {/* The row navigates on click, so the tick must not. */}
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)}
                          aria-label={`Select ${l.studentFirstName} ${l.studentLastName}`}
                          className="size-3.5 cursor-pointer accent-[var(--accent)]" />
                      </td>
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

          {/*
            * Said plainly rather than left as a discrepancy between the
            * "Total Requests" tile and the rows underneath it.
            */}
          {status === "All" && meta.hiddenConverted > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3 text-[11px] text-ink-3">
              <span>
                {meta.hiddenConverted} converted request
                {meta.hiddenConverted > 1 ? "s are" : " is"} not shown — they are students now.
              </span>
              <button onClick={() => setStatus("CONVERTED")}
                className="font-bold text-accent hover:underline">
                Show them
              </button>
            </div>
          )}

          {meta.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
              <p className="text-[11px] font-bold text-ink-3">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, meta.total)} of {meta.total}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="h-8 rounded-lg border border-hairline px-3 text-[11px] font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40">
                  Previous
                </button>
                <span className="text-[11px] font-bold text-ink-3">Page {page} of {meta.totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages}
                  className="h-8 rounded-lg border border-hairline px-3 text-[11px] font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          )}
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
