"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, ClipboardList, Clock, CheckCircle2, AlertTriangle, Archive, Copy, Lock, Unlock, Eye, Trash2, Download, Plus, Pencil } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid } from "recharts";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssignmentFormModal } from "@/components/assignments/assignment-form-modal";
import {
  fetchAssignmentAdminDashboard, fetchAssignmentAnalytics, listAssignments, getAssignment,
  deleteAssignment, assignmentLifecycle, fetchAssignmentReport, fetchAssignmentCalendar, fetchAssignmentMeta,
  type AssignmentListRow, type AssignmentAnalytics, type AssignmentCalendarItem, type AssignmentDetail,
} from "@/lib/api";

const COLORS = ["#386FA4", "#133C55", "#59A5D8", "#84D2F6", "#0EA5E9", "#2563EB", "#7C3AED", "#059669", "#F59E0B", "#EF4444"];
const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const toast = (t: string, icon: "success" | "error" = "success") => Swal.fire({ toast: true, position: "top-end", icon, title: t, showConfirmButton: false, timer: 1600 });
const fail = (e: unknown) => Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() });
const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const statusTone = (s: string): "good" | "warning" | "critical" | "accent" | "neutral" =>
  s === "PUBLISHED" ? "good" : s === "DRAFT" ? "neutral" : s === "SCHEDULED" ? "accent" : s === "CLOSED" ? "warning" : "critical";

const REPORTS = [
  { key: "completion", label: "Assignment Completion" },
  { key: "teacher", label: "Teacher Performance" },
  { key: "late", label: "Late Submission" },
  { key: "course", label: "Course Report" },
];

export default function AdminAssignmentsPage() {
  const [tab, setTab] = useState<"overview" | "list" | "calendar" | "reports">("overview");
  return (
    <>
      <Topbar title="Assignment Management" subtitle="Monitor, moderate and analyse assignments across the academy" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-1">
          {(["overview", "list", "calendar", "reports"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold capitalize transition-all ${tab === t ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>{t}</button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "list" && <ListTab />}
        {tab === "calendar" && <CalendarTab />}
        {tab === "reports" && <ReportsTab />}
      </div>
    </>
  );
}

function Overview() {
  const [cards, setCards] = useState<Record<string, number>>({});
  const [an, setAn] = useState<AssignmentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { Promise.all([fetchAssignmentAdminDashboard().then((d) => setCards(d.cards)), fetchAssignmentAnalytics().then(setAn)]).catch(() => undefined).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  const KPIS = [
    { label: "Total Assignments", value: cards.total ?? 0, icon: ClipboardList, c: "text-accent bg-accent/10" },
    { label: "Submitted", value: cards.submitted ?? 0, icon: CheckCircle2, c: "text-emerald-500 bg-emerald-500/10" },
    { label: "Pending Review", value: cards.pendingReview ?? 0, icon: Clock, c: "text-amber-500 bg-amber-500/10" },
    { label: "Checked", value: cards.checked ?? 0, icon: CheckCircle2, c: "text-sky-500 bg-sky-500/10" },
    { label: "Late", value: cards.lateSubmissions ?? 0, icon: AlertTriangle, c: "text-orange-500 bg-orange-500/10" },
    { label: "Overdue", value: cards.overdue ?? 0, icon: AlertTriangle, c: "text-red-500 bg-red-500/10" },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k) => (
          <Card key={k.label} className="border border-hairline bg-surface"><CardBody className="flex items-center gap-3 p-4"><span className={`grid size-10 place-items-center rounded-xl ${k.c}`}><k.icon className="size-5" /></span><div><p className="text-xl font-black text-ink leading-none">{k.value}</p><p className="mt-1 text-[11px] font-semibold text-ink-3">{k.label}</p></div></CardBody></Card>
        ))}
      </div>
      {an && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Mini label="Assignments" value={an.cards.assignments} /><Mini label="Completed" value={an.cards.completed} />
            <Mini label="Pending" value={an.cards.pending} /><Mini label="Late" value={an.cards.late} /><Mini label="Avg Marks" value={an.cards.avgMarks} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Chart title="Submission Trend"><LineView data={an.submissionTrend.map((m) => ({ name: m.month.slice(2), val: m.count }))} /></Chart>
            <Chart title="Marks Trend"><LineView data={an.marksTrend.map((m) => ({ name: m.month.slice(2), val: m.score }))} color="#059669" /></Chart>
            <Chart title="Teacher-wise"><Bars data={an.teacherWise.map((t) => ({ name: t.name, val: t.value }))} rotate /></Chart>
            <Chart title="Course-wise"><Bars data={an.courseWise.map((c) => ({ name: c.name, val: c.value }))} rotate /></Chart>
            <Chart title="Difficulty-wise"><PieView data={an.difficultyWise} /></Chart>
            <Chart title="Batch-wise"><Bars data={an.batchWise.map((b) => ({ name: b.name, val: b.value }))} rotate /></Chart>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RankCard title="Top Students" rows={an.topStudents} tone="good" />
            <RankCard title="Weak Students" rows={an.weakStudents} tone="critical" />
          </div>
        </>
      )}
    </div>
  );
}

function ListTab() {
  const [rows, setRows] = useState<AssignmentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; code: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssignmentDetail | null>(null);

  const load = () => {
    setLoading(true);
    const q: Record<string, string> = {};
    if (search) q.search = search;
    if (status !== "All") q.status = status;
    if (courseId) q.courseId = courseId;
    if (batchId) q.batchId = batchId;
    if (teacherId) q.teacherId = teacherId;
    if (subject) q.subject = subject;
    if (from) q.from = new Date(from).toISOString();
    if (to) q.to = new Date(to).toISOString();
    listAssignments(q).then((r) => setRows(r.items)).catch(() => undefined).finally(() => setLoading(false));
  };
  useEffect(() => { fetchAssignmentMeta().then((m) => { setCourses(m.courses); setBatches(m.batches); setTeachers(m.teachers ?? []); }).catch(() => undefined); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search, status, courseId, batchId, teacherId, subject, from, to]);

  const act = async (id: string, action: "publish" | "unpublish" | "archive" | "close" | "lock" | "unlock" | "duplicate") => {
    try { await assignmentLifecycle(id, action); load(); toast(`Done: ${action}`); } catch (e) { fail(e); }
  };
  const del = async (id: string) => { const r = await Swal.fire({ title: "Delete?", icon: "warning", showCancelButton: true, confirmButtonText: "Delete", background: swalBg() }); if (!r.isConfirmed) return; try { await deleteAssignment(id); load(); toast("Deleted"); } catch (e) { fail(e); } };
  const view = async (id: string) => {
    try { const d = await getAssignment(id); Swal.fire({ title: d.title, background: swalBg(), html: `<div style="text-align:left;font-size:13px"><p><b>Course:</b> ${d.courseTitle}</p><p><b>Teacher:</b> ${d.teacherName ?? "—"}</p><p><b>Type:</b> ${d.type ?? "—"} · ${d.difficulty ?? "—"}</p><p><b>Due:</b> ${fmt(d.dueAt)}</p><p><b>Marks:</b> ${d.maxMarks} (pass ${d.passingMarks})</p><p><b>Targets:</b> ${d.targetCount} students</p><p><b>Status:</b> ${d.status}</p><p style="margin-top:8px">${d.instructions ?? d.description ?? ""}</p></div>` }); } catch (e) { fail(e); }
  };
  const edit = async (id: string) => { try { setEditing(await getAssignment(id)); setShowForm(true); } catch (e) { fail(e); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title / topic…" className="h-10 w-56 rounded-xl border border-hairline bg-surface pl-9 pr-3 text-xs text-ink focus:outline-none focus:border-accent" /></div>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink"><option value="">All Courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink"><option value="">All Batches</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink"><option value="">All Teachers</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-10 w-28 rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-accent" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Due from" className="h-10 rounded-xl border border-hairline bg-surface px-2 text-xs text-ink" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Due to" className="h-10 rounded-xl border border-hairline bg-surface px-2 text-xs text-ink" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink">{["All", "DRAFT", "SCHEDULED", "PUBLISHED", "CLOSED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white"><Plus className="size-4" /> New</button>
      </div>
      {showForm && <AssignmentFormModal editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {loading ? <Loading /> : (
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                <th className="px-4 py-3">Title</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Batch</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Submissions</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-hairline">
                {rows.length === 0 ? <tr><td colSpan={8} className="py-12 text-center text-ink-3">No assignments.</td></tr> : rows.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-2/20">
                    <td className="px-4 py-3"><p className="font-bold text-ink">{a.title}</p><p className="text-[10px] text-ink-3">{a.subject || "—"} · {a.type || "—"}</p></td>
                    <td className="px-4 py-3 text-ink-2">{a.course}</td>
                    <td className="px-4 py-3 text-ink-2">{a.batch || "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{a.teacher || "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{fmt(a.dueAt)}</td>
                    <td className="px-4 py-3 text-ink-2">{a.submitted}/{a.targetCount} · {a.checked}✓</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="View" onClick={() => view(a.id)}><Eye className="size-3.5" /></IconBtn>
                        <IconBtn title="Edit" onClick={() => edit(a.id)}><Pencil className="size-3.5" /></IconBtn>
                        {a.status === "DRAFT" || a.status === "SCHEDULED" ? <IconBtn title="Publish" onClick={() => act(a.id, "publish")}><CheckCircle2 className="size-3.5 text-emerald-600" /></IconBtn> : <IconBtn title="Unpublish" onClick={() => act(a.id, "unpublish")}><Clock className="size-3.5" /></IconBtn>}
                        <IconBtn title={a.locked ? "Unlock" : "Lock"} onClick={() => act(a.id, a.locked ? "unlock" : "lock")}>{a.locked ? <Unlock className="size-3.5 text-amber-500" /> : <Lock className="size-3.5" />}</IconBtn>
                        <IconBtn title="Duplicate" onClick={() => act(a.id, "duplicate")}><Copy className="size-3.5" /></IconBtn>
                        <IconBtn title="Archive" onClick={() => act(a.id, "archive")}><Archive className="size-3.5" /></IconBtn>
                        <IconBtn title="Delete" onClick={() => del(a.id)}><Trash2 className="size-3.5 text-red-500" /></IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CalendarTab() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [items, setItems] = useState<AssignmentCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); fetchAssignmentCalendar(month).then(setItems).catch(() => undefined).finally(() => setLoading(false)); }, [month]);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const byDay = new Map<number, AssignmentCalendarItem[]>();
  for (const it of items) if (it.day) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  return (
    <Card className="border border-hairline bg-surface"><CardBody className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black text-ink">Assignment Calendar</h3>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink" />
      </div>
      {loading ? <Loading /> : (
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1 text-[10px] font-bold uppercase text-ink-3">{d}</div>)}
          {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1; const list = byDay.get(day) ?? [];
            return (
              <div key={day} className={`min-h-16 rounded-lg border p-1 text-left ${list.length ? "border-accent/40 bg-accent/5" : "border-hairline"}`}>
                <p className="text-[10px] font-bold text-ink-3">{day}</p>
                {list.slice(0, 3).map((it) => <p key={it.id} className="truncate rounded bg-accent/10 px-1 text-[9px] font-bold text-accent" title={`${it.title} · ${it.course}`}>{it.title}</p>)}
                {list.length > 3 && <p className="text-[9px] text-ink-3">+{list.length - 3}</p>}
              </div>
            );
          })}
        </div>
      )}
    </CardBody></Card>
  );
}

function ReportsTab() {
  const [type, setType] = useState("completion");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); fetchAssignmentReport(type).then((r) => setRows(r)).catch(() => setRows([])).finally(() => setLoading(false)); }, [type]);
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const csv = () => {
    if (!rows.length) return;
    const data = [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "")}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = encodeURI(`data:text/csv;charset=utf-8,${data}`); a.download = `assignments_${type}.csv`; a.click();
  };
  return (
    <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-4">
        <div className="flex items-center gap-2"><h3 className="text-sm font-bold text-ink">Report</h3><select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink">{REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
        <button onClick={csv} disabled={!rows.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40"><Download className="size-3.5" /> CSV</button>
      </div>
      <div className="overflow-x-auto">
        {loading ? <Loading /> : rows.length === 0 ? <p className="p-8 text-center text-sm text-ink-3">No data.</p> : (
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{cols.map((c) => <th key={c} className="px-4 py-3">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-hairline">{rows.map((r, i) => <tr key={i} className="hover:bg-surface-2/20">{cols.map((c) => <td key={c} className="px-4 py-2.5 text-ink-2">{String(r[c] ?? "—")}</td>)}</tr>)}</tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

// ── Shared ──
function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) { return <button title={title} onClick={onClick} className="grid size-7 place-items-center rounded-lg border border-hairline text-ink-2 hover:bg-surface-2">{children}</button>; }
function Mini({ label, value }: { label: string; value: number }) { return <Card className="border border-hairline bg-surface"><CardBody className="p-3 text-center"><p className="text-lg font-black text-ink">{value}</p><p className="text-[10px] font-bold uppercase text-ink-3">{label}</p></CardBody></Card>; }
function Chart({ title, children }: { title: string; children: React.ReactNode }) { return <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5"><h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">{title}</h3>{children}</CardBody></Card>; }
function RankCard({ title, rows, tone }: { title: string; rows: { name: string; avg: number }[]; tone: "good" | "critical" }) {
  return <Card className="border border-hairline bg-surface"><CardBody className="p-5"><h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink-3">{title}</h3>{rows.length === 0 ? <p className="text-sm text-ink-3">No data</p> : <div className="space-y-1.5">{rows.map((r, i) => <div key={i} className="flex items-center justify-between text-sm"><span className="text-ink">{r.name}</span><Badge tone={tone}>{r.avg}</Badge></div>)}</div>}</CardBody></Card>;
}
function Bars({ data, rotate }: { data: { name: string; val: number }[]; rotate?: boolean }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet</div>;
  return <div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: rotate ? 30 : 0 }}><XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={0} angle={rotate ? -30 : 0} textAnchor={rotate ? "end" : "middle"} height={rotate ? 40 : 20} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Bar dataKey="val" radius={[6, 6, 0, 0]}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>;
}
function LineView({ data, color = "#386FA4" }: { data: { name: string; val: number }[]; color?: string }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet</div>;
  return <div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>;
}
function PieView({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet</div>;
  return <div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64} label={(e: { name?: string }) => e.name || ""} labelLine={false}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} /></PieChart></ResponsiveContainer></div>;
}
function Loading() { return <div className="flex items-center justify-center py-16 text-sm font-bold text-ink-3"><Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading…</div>; }
