"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ClipboardList, Clock, CalendarClock, CheckCircle, Send, Edit2, Trash2, Award, Library, Eye } from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssessmentFormModal } from "@/components/assessments/assessment-form-modal";
import { QuestionFormModal } from "@/components/assessments/question-form-modal";
import { EvaluateModal } from "@/components/assessments/evaluate-modal";
import {
  fetchAssessmentTeacherDashboard, listAssessments, deleteAssessment, assessmentLifecycle,
  getAssessmentAttempts, fetchAssessmentCalendar, listQuestions,
  type AssessmentListRow, type AttemptRosterRow,
} from "@/lib/api";

const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", SCHEDULED: "warning", PUBLISHED: "good", LIVE: "accent", CLOSED: "neutral", ARCHIVED: "neutral" };

export default function TeacherAssessmentsPage() {
  const [tab, setTab] = useState<"list" | "evaluate" | "calendar">("list");
  const [cards, setCards] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<AssessmentListRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showQ, setShowQ] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);

  const load = useCallback(() => {
    fetchAssessmentTeacherDashboard().then((d) => setCards(d.cards)).catch(() => {});
    listAssessments().then((r) => setRows(r.items)).catch(() => {});
  }, []);
  useEffect(() => { load(); listQuestions({ limit: "100" }).then((r) => setSubjects([...new Set(r.items.map((i) => i.subject))])).catch(() => {}); }, [load]);

  const act = async (id: string, action: Parameters<typeof assessmentLifecycle>[1], confirm?: string) => {
    if (confirm) { const r = await Swal.fire({ title: confirm, icon: "question", showCancelButton: true, background: swalBg() }); if (!r.isConfirmed) return; }
    try { await assessmentLifecycle(id, action); load(); } catch (e) { Swal.fire({ title: "Failed", text: (e as Error).message, icon: "error", background: swalBg() }); }
  };
  const del = async (id: string, title: string) => {
    const r = await Swal.fire({ title: "Delete assessment?", text: title, icon: "warning", showCancelButton: true, confirmButtonColor: "#f85a6b", background: swalBg() });
    if (r.isConfirmed) { await deleteAssessment(id); load(); }
  };

  const kpis = [
    { label: "Today's Assessments", value: cards.todays ?? 0, icon: ClipboardList, color: "text-accent bg-accent/10" },
    { label: "Pending Evaluation", value: cards.pendingEvaluation ?? 0, icon: Clock, color: "text-amber-500 bg-amber-500/10" },
    { label: "Upcoming", value: cards.upcoming ?? 0, icon: CalendarClock, color: "text-violet-500 bg-violet-500/10" },
    { label: "Avg Class Score", value: `${cards.avgClassScore ?? 0}%`, icon: CheckCircle, color: "text-emerald-500 bg-emerald-500/10" },
  ];

  return (
    <>
      <Topbar title="Assessments" subtitle="Create tests, evaluate answers, track your class" />
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}><CardBody className="flex items-center gap-3 py-4"><span className={`grid size-10 place-items-center rounded-xl ${k.color}`}><k.icon className="size-5" /></span><div><p className="text-xl font-bold text-ink">{k.value}</p><p className="text-[11px] font-semibold text-ink-3">{k.label}</p></div></CardBody></Card>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-xl border border-hairline bg-surface p-1 w-fit">
            {([["list", "My Assessments"], ["evaluate", "Evaluate"], ["calendar", "Calendar"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === k ? "bg-accent text-accent-ink" : "text-ink-3 hover:text-ink"}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowQ(true)}><Library className="size-4" /> Add Question</Button>
            <Button variant="primary" onClick={() => { setEditId(null); setShowForm(true); }}><Plus className="size-4" /> New Assessment</Button>
          </div>
        </div>

        {tab === "list" && (
          <Card><CardBody className="pt-5">
            <div className="overflow-x-auto rounded-xl border border-hairline">
              <table className="w-full text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold uppercase text-ink-3"><tr><th className="px-4 py-3">Assessment</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Qs·Marks</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-ink-3"><ClipboardList className="mx-auto mb-2 size-8 opacity-60" />No assessments yet — create your first.</td></tr>}
                  {rows.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2/60">
                      <td className="px-4 py-3"><div className="font-semibold text-ink">{a.title}</div><div className="mt-0.5 flex gap-1.5 text-[10px]"><Badge tone="neutral">{a.type}</Badge>{a.subject && <span className="text-ink-3">{a.subject}</span>}</div></td>
                      <td className="px-4 py-3 text-xs">{a.startAt ? new Date(a.startAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"}<div className="text-ink-3">{a.durationMin}m</div></td>
                      <td className="px-4 py-3 text-xs">{a.questions} · {a.totalMarks}</td>
                      <td className="px-4 py-3 text-xs">{a.submitted}/{a.targetCount}{a.pendingEval > 0 && <div className="text-amber-500">{a.pendingEval} to grade</div>}</td>
                      <td className="px-4 py-3"><Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</Badge></td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1">
                        <IconBtn title="Edit" onClick={() => { setEditId(a.id); setShowForm(true); }}><Edit2 className="size-4" /></IconBtn>
                        {(a.status === "DRAFT" || a.status === "SCHEDULED") && <IconBtn title="Publish" onClick={() => act(a.id, "publish")}><Send className="size-4" /></IconBtn>}
                        {a.status === "PUBLISHED" && <IconBtn title="Publish results" onClick={() => act(a.id, "publish-results", "Rank & publish evaluated results?")}><Award className="size-4" /></IconBtn>}
                        <IconBtn title="Delete" onClick={() => del(a.id, a.title)}><Trash2 className="size-4" /></IconBtn>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody></Card>
        )}

        {tab === "evaluate" && <EvaluateTab rows={rows} onGraded={load} />}
        {tab === "calendar" && <TeacherCalendar />}
      </div>

      <AssessmentFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={load} assessmentId={editId} forRole="teacher" />
      <QuestionFormModal open={showQ} onClose={() => setShowQ(false)} onSaved={() => {}} subjects={subjects} />
    </>
  );
}

function EvaluateTab({ rows, onGraded }: { rows: AssessmentListRow[]; onGraded: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [roster, setRoster] = useState<AttemptRosterRow[]>([]);
  const [evalId, setEvalId] = useState<string | null>(null);
  const gradable = rows.filter((r) => r.submitted > 0);

  const loadRoster = useCallback((id: string) => { getAssessmentAttempts(id).then(setRoster).catch(() => {}); }, []);
  useEffect(() => { if (selected) loadRoster(selected); }, [selected, loadRoster]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1"><CardBody className="pt-5 space-y-1.5">
        <p className="mb-2 text-sm font-bold text-ink">Assessments</p>
        {gradable.length === 0 && <p className="text-xs text-ink-3">No submissions to evaluate yet.</p>}
        {gradable.map((r) => (
          <button key={r.id} onClick={() => setSelected(r.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selected === r.id ? "bg-accent text-accent-ink" : "hover:bg-surface-2 text-ink-2"}`}>
            <span className="truncate">{r.title}</span>{r.pendingEval > 0 && <Badge tone="warning">{r.pendingEval}</Badge>}
          </button>
        ))}
      </CardBody></Card>
      <Card className="lg:col-span-2"><CardBody className="pt-5">
        {!selected ? <div className="grid h-40 place-items-center text-sm text-ink-3">Pick an assessment to see submissions.</div> : (
          <table className="w-full text-left text-sm text-ink-2">
            <thead className="bg-surface-2 text-xs font-bold uppercase text-ink-3"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Score</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {roster.map((r) => (
                <tr key={r.studentId}>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-ink-3">{r.studentCode}</span> {r.name}{r.violations > 0 && <span className="ml-1.5 inline-flex items-center rounded bg-critical/15 px-1.5 py-0.5 text-[10px] font-bold text-critical" title="Proctoring violations">⚠ {r.violations}</span>}</td>
                  <td className="px-3 py-2"><Badge tone={r.status === "PUBLISHED" ? "good" : r.status === "NOT_STARTED" ? "neutral" : "warning"}>{r.status}</Badge></td>
                  <td className="px-3 py-2">{r.score != null ? `${Math.round(r.score)}/${r.totalMarks}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.attemptId && r.status !== "NOT_STARTED" ? <Button variant="outline" size="sm" onClick={() => setEvalId(r.attemptId)}><Eye className="size-3.5" /> {r.status === "PUBLISHED" || r.status === "EVALUATED" ? "Review" : "Evaluate"}</Button> : <span className="text-xs text-ink-3">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody></Card>
      <EvaluateModal open={!!evalId} attemptId={evalId} onClose={() => setEvalId(null)} onDone={() => { if (selected) loadRoster(selected); onGraded(); }} />
    </div>
  );
}

function TeacherCalendar() {
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
      <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-ink">My Assessment Calendar</p><input type="month" className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-ink-3">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => { const day = i + 1; const list = byDay.get(day) ?? []; return <div key={day} className="min-h-16 rounded-lg border border-hairline bg-surface-2 p-1"><span className="text-[11px] font-bold text-ink-3">{day}</span>{list.map((it) => <div key={it.id} className="mt-0.5 truncate rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent" title={it.title}>{it.title}</div>)}</div>; })}
      </div>
    </CardBody></Card>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink">{children}</button>;
}
