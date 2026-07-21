"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText, CalendarClock, Radio, CheckCircle, ClipboardList, BarChart3, Plus, Search, Edit2, Trash2,
  Copy, Lock, Unlock, Send, Archive, Eye, Library, ChevronLeft, ChevronRight, Users, Award, Download, Upload,
} from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid } from "recharts";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { QuestionFormModal } from "@/components/assessments/question-form-modal";
import { AssessmentFormModal } from "@/components/assessments/assessment-form-modal";
import {
  listAssessments, deleteAssessment, bulkDeleteAssessments, assessmentLifecycle, fetchAssessmentAdminDashboard, fetchAssessmentAnalytics,
  fetchAssessmentCalendar, fetchAssessmentReport, fetchAssessmentMeta, listQuestions, deleteQuestion,
  getAssessmentAttempts, createQuestion, type AssessmentListRow, type Question,
} from "@/lib/api";
import { useBulkSelect, SelectAllBox, SelectBox, BulkBar } from "@/components/ui/bulk-select";

const STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", SCHEDULED: "warning", PUBLISHED: "good", LIVE: "accent", CLOSED: "neutral", ARCHIVED: "neutral" };
const CHART = ["#59A5D8", "#7BC950", "#F5A623", "#B07BE0", "#f85a6b", "#4FD1C5"];
const swalBg = () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff");

type Tab = "overview" | "list" | "bank" | "calendar" | "reports";

export default function AssessmentsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <>
      <Topbar title="Assessments Console" subtitle="Online tests, question bank, evaluation & analytics" />
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface p-1 w-fit">
          {([["overview", "Overview", BarChart3], ["list", "Assessments", ClipboardList], ["bank", "Question Bank", Library], ["calendar", "Calendar", CalendarClock], ["reports", "Reports", FileText]] as const).map(([k, lbl, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${tab === k ? "bg-accent text-accent-ink" : "text-ink-3 hover:text-ink"}`}>
              <Icon className="size-4" /> {lbl}
            </button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "list" && <AssessmentList />}
        {tab === "bank" && <QuestionBank />}
        {tab === "calendar" && <CalendarTab />}
        {tab === "reports" && <ReportsTab />}
      </div>
    </>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview() {
  const [cards, setCards] = useState<Record<string, number>>({});
  const [an, setAn] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetchAssessmentAdminDashboard().then((d) => setCards(d.cards)).catch(() => {});
    fetchAssessmentAnalytics().then((d) => setAn(d)).catch(() => {});
  }, []);
  const kpis = [
    { label: "Total", value: cards.total ?? 0, icon: FileText, color: "text-accent bg-accent/10" },
    { label: "Scheduled", value: cards.scheduled ?? 0, icon: CalendarClock, color: "text-amber-500 bg-amber-500/10" },
    { label: "Live", value: cards.live ?? 0, icon: Radio, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Completed", value: cards.completed ?? 0, icon: CheckCircle, color: "text-violet-500 bg-violet-500/10" },
    { label: "Pending Eval", value: cards.pendingEvaluation ?? 0, icon: ClipboardList, color: "text-rose-500 bg-rose-500/10" },
    { label: "Published Results", value: cards.publishedResults ?? 0, icon: Award, color: "text-sky-500 bg-sky-500/10" },
  ];
  const a = (an ?? {}) as Record<string, { name: string; value: number }[] | { range: string; value: number }[] | { month: string; score: number }[] | Record<string, number>>;
  const distribution = (a.scoreDistribution as { range: string; value: number }[]) ?? [];
  const subjectWise = (a.subjectWise as { name: string; value: number }[]) ?? [];
  const trend = (a.monthlyTrend as { month: string; score: number }[]) ?? [];
  const anCards = (a.cards as Record<string, number>) ?? {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}><CardBody className="flex items-center gap-3 py-4">
            <span className={`grid size-10 place-items-center rounded-xl ${k.color}`}><k.icon className="size-5" /></span>
            <div><p className="text-xl font-bold text-ink">{k.value}</p><p className="text-[11px] font-semibold text-ink-3">{k.label}</p></div>
          </CardBody></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardBody>
          <p className="mb-3 text-sm font-bold text-ink">Score Distribution</p>
          {distribution.some((d) => d.value) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distribution}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="range" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{distribution.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}</Bar></BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </CardBody></Card>
        <Card><CardBody>
          <p className="mb-3 text-sm font-bold text-ink">Subject-wise Avg %</p>
          {subjectWise.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subjectWise} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} /><YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#7BC950" /></BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </CardBody></Card>
        <Card><CardBody>
          <p className="mb-3 text-sm font-bold text-ink">Monthly Trend</p>
          {trend.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="score" stroke="#59A5D8" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </CardBody></Card>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[["Avg Score", `${anCards.avgScore ?? 0}%`], ["Highest", `${anCards.highest ?? 0}%`], ["Lowest", `${anCards.lowest ?? 0}%`], ["Pass %", `${anCards.passPct ?? 0}%`], ["Fail %", `${anCards.failPct ?? 0}%`], ["Pending", anCards.pendingEvaluation ?? 0]].map(([l, v]) => (
          <Card key={l}><CardBody className="py-3 text-center"><p className="text-lg font-bold text-ink">{v}</p><p className="text-[11px] font-semibold text-ink-3">{l}</p></CardBody></Card>
        ))}
      </div>
    </div>
  );
}

// ── Assessment list ───────────────────────────────────────────────────────────
function AssessmentList() {
  const [rows, setRows] = useState<AssessmentListRow[]>([]);
  const [meta, setMeta] = useState<{ courses: { id: string; title: string }[]; batches: { id: string; code: string; name: string }[]; teachers?: { id: string; name: string }[] }>({ courses: [], batches: [] });
  const [filters, setFilters] = useState({ search: "", courseId: "", batchId: "", teacherId: "", status: "" });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<AssessmentListRow | null>(null);
  const { selected, ids, toggle, toggleAll, allShown, clear, busy, confirmAndDelete } =
    useBulkSelect(rows);

  const load = useCallback(() => {
    const q: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) q[k] = v; });
    listAssessments(q).then((r) => setRows(r.items)).catch(() => {});
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchAssessmentMeta().then(setMeta).catch(() => {}); }, []);

  const act = async (id: string, action: Parameters<typeof assessmentLifecycle>[1], confirm?: string) => {
    if (confirm) { const r = await Swal.fire({ title: confirm, icon: "question", showCancelButton: true, background: swalBg() }); if (!r.isConfirmed) return; }
    try { await assessmentLifecycle(id, action); load(); } catch (e) { Swal.fire({ title: "Action failed", text: (e as Error).message, icon: "error", background: swalBg() }); }
  };
  const del = async (id: string, title: string) => {
    const r = await Swal.fire({ title: "Delete assessment?", text: title, icon: "warning", showCancelButton: true, confirmButtonColor: "#f85a6b", background: swalBg() });
    if (r.isConfirmed) { await deleteAssessment(id); load(); }
  };

  return (
    <div className="space-y-4">
      <Card><CardBody className="space-y-3 pt-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pl-10 pr-4 text-sm" placeholder="Search assessments…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs" value={filters.courseId} onChange={(e) => setFilters((f) => ({ ...f, courseId: e.target.value }))}><option value="">All courses</option>{meta.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            <select className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs" value={filters.batchId} onChange={(e) => setFilters((f) => ({ ...f, batchId: e.target.value }))}><option value="">All batches</option>{meta.batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
            {meta.teachers && <select className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs" value={filters.teacherId} onChange={(e) => setFilters((f) => ({ ...f, teacherId: e.target.value }))}><option value="">All teachers</option>{meta.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
            <select className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}><option value="">All status</option>{["DRAFT", "SCHEDULED", "PUBLISHED", "LIVE", "CLOSED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <Button variant="primary" onClick={() => { setEditId(null); setShowForm(true); }}><Plus className="size-4" /> New</Button>
          </div>
        </div>

        <BulkBar count={ids.length} busy={busy} noun="assessment" onClear={clear}
          onDelete={() => confirmAndDelete("assessment", (a) => a.title, bulkDeleteAssessments, load)} />

        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-left text-sm text-ink-2">
            <thead className="bg-surface-2 text-xs font-bold uppercase text-ink-3">
              <tr><th className="w-10 px-4 py-3"><SelectAllBox checked={allShown} onChange={toggleAll} /></th><th className="px-4 py-3">Assessment</th><th className="px-4 py-3">Course / Batch</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Qs · Marks</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline bg-surface">
              {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-ink-3"><ClipboardList className="mx-auto mb-2 size-8 opacity-60" />No assessments yet.</td></tr>}
              {rows.map((a) => (
                <tr key={a.id} className={selected.has(a.id) ? "bg-accent/5" : "hover:bg-surface-2/60"}>
                  <td className="px-4 py-3"><SelectBox checked={selected.has(a.id)} onChange={() => toggle(a.id)} label={a.title} /></td>
                  <td className="px-4 py-3"><div className="font-semibold text-ink">{a.title}</div><div className="mt-0.5 flex gap-1.5 text-[10px]"><Badge tone="neutral">{a.type}</Badge>{a.subject && <span className="text-ink-3">{a.subject}</span>}</div></td>
                  <td className="px-4 py-3 text-xs">{a.course ?? "—"}{a.batch && <div className="text-ink-3">{a.batch}</div>}</td>
                  <td className="px-4 py-3 text-xs">{a.teacher ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{a.startAt ? new Date(a.startAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"}<div className="text-ink-3">{a.durationMin}m</div></td>
                  <td className="px-4 py-3 text-xs">{a.questions} · {a.totalMarks}</td>
                  <td className="px-4 py-3 text-xs"><button className="underline decoration-dotted hover:text-accent" onClick={() => setRosterFor(a)}>{a.submitted}/{a.targetCount} done</button>{a.pendingEval > 0 && <div className="text-amber-500">{a.pendingEval} to grade</div>}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</Badge>{a.locked && <Lock className="ml-1 inline size-3 text-ink-3" />}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconBtn title="Roster" onClick={() => setRosterFor(a)}><Eye className="size-4" /></IconBtn>
                      <IconBtn title="Edit" onClick={() => { setEditId(a.id); setShowForm(true); }}><Edit2 className="size-4" /></IconBtn>
                      {a.status === "DRAFT" || a.status === "SCHEDULED" ? <IconBtn title="Publish" onClick={() => act(a.id, "publish")}><Send className="size-4" /></IconBtn> : null}
                      {a.status === "PUBLISHED" && <IconBtn title="Publish results" onClick={() => act(a.id, "publish-results", "Rank & publish all evaluated results?")}><Award className="size-4" /></IconBtn>}
                      {a.status === "PUBLISHED" && <IconBtn title="Close" onClick={() => act(a.id, "close")}><Archive className="size-4" /></IconBtn>}
                      {a.locked ? <IconBtn title="Unlock" onClick={() => act(a.id, "unlock")}><Unlock className="size-4" /></IconBtn> : <IconBtn title="Lock" onClick={() => act(a.id, "lock")}><Lock className="size-4" /></IconBtn>}
                      <IconBtn title="Clone" onClick={() => act(a.id, "clone")}><Copy className="size-4" /></IconBtn>
                      <IconBtn title="Delete" onClick={() => del(a.id, a.title)}><Trash2 className="size-4" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody></Card>

      <AssessmentFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={load} assessmentId={editId} forRole="admin" />
      {rosterFor && <RosterModal assessment={rosterFor} onClose={() => setRosterFor(null)} />}
    </div>
  );
}

function RosterModal({ assessment, onClose }: { assessment: AssessmentListRow; onClose: () => void }) {
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof getAssessmentAttempts>>>([]);
  useEffect(() => { getAssessmentAttempts(assessment.id).then(setRoster).catch(() => {}); }, [assessment.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-hairline bg-surface shadow-2xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-hairline bg-surface px-6 py-4"><div><h3 className="font-bold text-ink">{assessment.title}</h3><p className="text-xs text-ink-3">Attempt roster</p></div><Button variant="ghost" size="icon" onClick={onClose}>✕</Button></header>
        <table className="w-full text-left text-sm text-ink-2">
          <thead className="bg-surface-2 text-xs font-bold uppercase text-ink-3"><tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">Rank</th></tr></thead>
          <tbody className="divide-y divide-hairline">
            {roster.map((r) => (
              <tr key={r.studentId}><td className="px-4 py-2"><span className="font-mono text-xs text-ink-3">{r.studentCode}</span> {r.name}{r.violations > 0 && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-critical/15 px-1.5 py-0.5 text-[10px] font-bold text-critical" title="Proctoring violations">⚠ {r.violations}</span>}</td><td className="px-4 py-2"><Badge tone={r.status === "PUBLISHED" ? "good" : r.status === "NOT_STARTED" ? "neutral" : "warning"}>{r.status}</Badge></td><td className="px-4 py-2">{r.score != null ? `${Math.round(r.score)}/${r.totalMarks} (${r.percentage}%)` : "—"}</td><td className="px-4 py-2">{r.rank ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Question Bank ─────────────────────────────────────────────────────────────
function QuestionBank() {
  const [items, setItems] = useState<Question[]>([]);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number }>({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ search: "", subject: "", type: "", difficulty: "", page: 1 });
  const [subjects, setSubjects] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Question | null>(null);

  const load = useCallback(() => {
    const q: Record<string, string> = { page: String(filters.page), limit: "24" };
    if (filters.search) q.search = filters.search; if (filters.subject) q.subject = filters.subject;
    if (filters.type) q.type = filters.type; if (filters.difficulty) q.difficulty = filters.difficulty;
    listQuestions(q).then((r) => { setItems(r.items); setMeta({ page: r.meta.page, pages: r.meta.pages, total: r.meta.total }); setSubjects((s) => [...new Set([...s, ...r.items.map((i) => i.subject)])]); }).catch(() => {});
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const del = async (q: Question) => {
    const r = await Swal.fire({ title: "Delete question?", text: q.text.slice(0, 80), icon: "warning", showCancelButton: true, confirmButtonColor: "#f85a6b", background: swalBg() });
    if (r.isConfirmed) { const res = await deleteQuestion(q.id); if (res.archived) Swal.fire({ title: "Archived", text: "In use by an assessment, so archived instead.", icon: "info", background: swalBg() }); load(); }
  };

  // Bulk import. CSV header: subject,type,difficulty,text,marks,options,correct,correctAnswer
  //  · MCQ: options pipe-separated ("3|4|5"), correct = 1-based index/es (";" for multi)
  //  · TRUE_FALSE / FILL_BLANK: correctAnswer column ("|" for FILL alternatives)
  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { Swal.fire({ title: "Empty CSV", icon: "error", background: swalBg() }); return; }
    const split = (l: string) => { const out: string[] = []; let cur = "", inQ = false; for (const c of l) { if (c === '"') inQ = !inQ; else if (c === "," && !inQ) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map((s) => s.trim()); };
    const header = split(lines[0]).map((h) => h.toLowerCase());
    const col = (row: string[], name: string) => row[header.indexOf(name)] ?? "";
    let ok = 0, failed = 0;
    for (const line of lines.slice(1)) {
      try {
        const row = split(line);
        const type = (col(row, "type") || "MCQ").toUpperCase();
        const dto: Record<string, unknown> = { subject: col(row, "subject") || "General", type, difficulty: (col(row, "difficulty") || "MEDIUM").toUpperCase(), text: col(row, "text"), marks: Number(col(row, "marks")) || 1 };
        if (!dto.text) { failed++; continue; }
        if (type === "MCQ") {
          const opts = col(row, "options").split("|").map((t, i) => ({ id: String.fromCharCode(97 + i), text: t.trim() })).filter((o) => o.text);
          const correctIdx = col(row, "correct").split(";").map((n) => Number(n.trim()) - 1);
          dto.options = opts.map((o, i) => ({ ...o, correct: correctIdx.includes(i) }));
        } else if (type === "TRUE_FALSE" || type === "FILL_BLANK") dto.correctAnswer = col(row, "correctanswer");
        await createQuestion(dto); ok++;
      } catch { failed++; }
    }
    Swal.fire({ title: "Import complete", text: `${ok} added${failed ? `, ${failed} skipped` : ""}.`, icon: ok ? "success" : "error", background: swalBg() });
    load();
  };

  return (
    <div className="space-y-4">
      <Card><CardBody className="space-y-3 pt-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-sm"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" /><input className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pl-10 pr-4 text-sm" placeholder="Search questions…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs" value={filters.subject} onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value, page: 1 }))}><option value="">All subjects</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))}><option value="">All types</option>{["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCH", "SHORT_ANSWER", "LONG_ANSWER", "ESSAY", "CODING"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs" value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value, page: 1 }))}><option value="">All levels</option>{["EASY", "MEDIUM", "HARD"].map((d) => <option key={d} value={d}>{d}</option>)}</select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2" title="CSV header: subject,type,difficulty,text,marks,options,correct,correctAnswer"><Upload className="size-3.5" /> Import CSV<input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} /></label>
            <Button variant="primary" onClick={() => { setEdit(null); setShowForm(true); }}><Plus className="size-4" /> New Question</Button>
          </div>
        </div>
        <p className="text-xs text-ink-3">{meta.total} questions in the bank</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((q) => (
            <div key={q.id} className="rounded-xl border border-hairline bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-ink">{q.text}</p>
                <div className="flex shrink-0 gap-1"><IconBtn title="Edit" onClick={() => { setEdit(q); setShowForm(true); }}><Edit2 className="size-3.5" /></IconBtn><IconBtn title="Delete" onClick={() => del(q)}><Trash2 className="size-3.5" /></IconBtn></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]"><Badge tone="accent">{q.type}</Badge><Badge tone={q.difficulty === "HARD" ? "critical" : q.difficulty === "EASY" ? "good" : "warning"}>{q.difficulty}</Badge><span className="text-ink-3">{q.subject}{q.topic ? ` · ${q.topic}` : ""} · {q.marks}m</span></div>
            </div>
          ))}
        </div>
        {meta.pages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}><ChevronLeft className="size-4" /></Button>
            <span className="text-xs font-semibold text-ink-3">Page {meta.page} / {meta.pages}</span>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}><ChevronRight className="size-4" /></Button>
          </div>
        )}
      </CardBody></Card>
      <QuestionFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={load} question={edit} subjects={subjects} />
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarTab() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchAssessmentCalendar>>>([]);
  useEffect(() => { fetchAssessmentCalendar(month).then(setItems).catch(() => {}); }, [month]);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const byDay = new Map<number, typeof items>();
  for (const it of items) if (it.day) { const arr = byDay.get(it.day) ?? []; arr.push(it); byDay.set(it.day, arr); }
  return (
    <Card><CardBody>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Assessment Calendar</p>
        <input type="month" className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-ink-3">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1; const list = byDay.get(day) ?? [];
          return <div key={day} className="min-h-16 rounded-lg border border-hairline bg-surface-2 p-1 text-left"><span className="text-[11px] font-bold text-ink-3">{day}</span>{list.map((it) => <div key={it.id} className="mt-0.5 truncate rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent" title={it.title}>{it.title}</div>)}</div>;
        })}
      </div>
    </CardBody></Card>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────
function ReportsTab() {
  const [type, setType] = useState("assessment");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [passFail, setPassFail] = useState<{ passed: number; failed: number } | null>(null);
  useEffect(() => {
    setPassFail(null); setData([]);
    fetchAssessmentReport(type).then((d) => { if (type === "pass-fail") setPassFail(d as { passed: number; failed: number }); else setData(d as Record<string, unknown>[]); }).catch(() => {});
  }, [type]);
  const cols = data[0] ? Object.keys(data[0]) : [];
  const csv = () => {
    if (!data.length) return;
    const rows = [cols.join(","), ...data.map((r) => cols.map((c) => `"${String(r[c] ?? "")}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `assessment-${type}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const REPORTS = [["assessment", "Assessment"], ["teacher", "Teacher"], ["top-performers", "Top Performers"], ["weak-students", "Weak Students"], ["pass-fail", "Pass / Fail"], ["question-analysis", "Question Analysis"], ["difficulty", "Difficulty"]];
  return (
    <Card><CardBody className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">{REPORTS.map(([k, l]) => <button key={k} onClick={() => setType(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${type === k ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3"}`}>{l}</button>)}</div>
        {data.length > 0 && <Button variant="outline" size="sm" onClick={csv}><Download className="size-3.5" /> CSV</Button>}
      </div>
      {passFail ? (
        <div className="mx-auto max-w-xs"><ResponsiveContainer width="100%" height={240}><PieChart><Pie data={[{ name: "Passed", value: passFail.passed }, { name: "Failed", value: passFail.failed }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label><Cell fill="#7BC950" /><Cell fill="#f85a6b" /></Pie><Tooltip /></PieChart></ResponsiveContainer><p className="text-center text-sm font-semibold text-ink-2">Passed {passFail.passed} · Failed {passFail.failed}</p></div>
      ) : data.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-left text-sm text-ink-2"><thead className="bg-surface-2 text-xs font-bold uppercase text-ink-3"><tr>{cols.map((c) => <th key={c} className="px-4 py-2">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-hairline">{data.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="px-4 py-2">{String(r[c] ?? "—")}</td>)}</tr>)}</tbody></table>
        </div>
      )}
    </CardBody></Card>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink">{children}</button>;
}
function Empty() { return <div className="grid h-40 place-items-center text-sm text-ink-3"><div className="text-center"><BarChart3 className="mx-auto mb-2 size-8 opacity-50" />No data yet</div></div>; }
