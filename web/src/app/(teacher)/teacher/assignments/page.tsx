"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Send, ClipboardList, Clock, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssignmentFormModal } from "@/components/assignments/assignment-form-modal";
import { GradeModal } from "@/components/assignments/grade-modal";
import {
  fetchAssignmentTeacherDashboard, listAssignments, deleteAssignment, assignmentLifecycle,
  getAssignment, getAssignmentSubmissions, fetchAssignmentCalendar,
  type AssignmentListRow, type AssignmentSubmissionRow, type AssignmentDetail, type AssignmentCalendarItem,
} from "@/lib/api";

const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const toast = (t: string, icon: "success" | "error" = "success") => Swal.fire({ toast: true, position: "top-end", icon, title: t, showConfirmButton: false, timer: 1800 });
const fail = (e: unknown) => Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() });
const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtT = (d?: string | null) => d ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const statusTone = (s: string): "good" | "warning" | "critical" | "accent" | "neutral" =>
  s === "PUBLISHED" ? "good" : s === "DRAFT" ? "neutral" : s === "SCHEDULED" ? "accent" : s === "CLOSED" ? "warning" : s === "ARCHIVED" ? "critical" : "neutral";

export default function TeacherAssignmentsPage() {
  const [tab, setTab] = useState<"list" | "review" | "calendar">("list");
  const [cards, setCards] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<AssignmentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AssignmentDetail | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAssignmentTeacherDashboard().then((d) => setCards(d.cards)), listAssignments().then((r) => setRows(r.items))])
      .catch(() => undefined).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openEdit = async (id: string) => { try { const d = await getAssignment(id); setEditing(d); setShowCreate(true); } catch (e) { fail(e); } };
  const lifecycle = async (id: string, action: "publish" | "unpublish" | "archive" | "close" | "duplicate") => {
    try { await assignmentLifecycle(id, action); load(); toast(action === "publish" ? "Published & students notified" : `Done: ${action}`); } catch (e) { fail(e); }
  };
  const del = async (id: string) => {
    const r = await Swal.fire({ title: "Delete assignment?", icon: "warning", showCancelButton: true, confirmButtonText: "Delete", background: swalBg() });
    if (!r.isConfirmed) return;
    try { await deleteAssignment(id); load(); toast("Deleted"); } catch (e) { fail(e); }
  };

  const CARDS = [
    { label: "Today's Assignments", value: cards.todays ?? 0, icon: ClipboardList },
    { label: "Pending Review", value: cards.pendingReview ?? 0, icon: Clock },
    { label: "Submitted Today", value: cards.submittedToday ?? 0, icon: Send },
    { label: "Late Submissions", value: cards.lateSubmissions ?? 0, icon: AlertTriangle },
    { label: "Need Recheck", value: cards.needRecheck ?? 0, icon: RefreshCw },
  ];

  return (
    <>
      <Topbar title="Assignments" subtitle="Create, publish and review student assignments" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CARDS.map((c) => (
            <Card key={c.label} className="border border-hairline bg-surface"><CardBody className="flex items-center gap-3 p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent"><c.icon className="size-4.5" /></span>
              <div><p className="text-lg font-black text-ink leading-none">{c.value}</p><p className="mt-0.5 text-[11px] font-semibold text-ink-3">{c.label}</p></div>
            </CardBody></Card>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1">
            {(["list", "review", "calendar"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-xs font-bold capitalize transition-all ${tab === t ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>{t === "list" ? "My Assignments" : t === "review" ? "Review" : "Calendar"}</button>
            ))}
          </div>
          {tab === "list" && <button onClick={() => { setEditing(null); setShowCreate(true); }} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white"><Plus className="size-4" /> New Assignment</button>}
        </div>

        {loading && tab !== "calendar" ? <Loading /> : tab === "list" ? (
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                  <th className="px-4 py-3">Title</th><th className="px-4 py-3">Course / Batch</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Submissions</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-hairline">
                  {rows.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-ink-3">No assignments yet. Create one.</td></tr> : rows.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2/20">
                      <td className="px-4 py-3"><p className="font-bold text-ink">{a.title}</p><p className="text-[10px] text-ink-3">{a.subject || "—"} · {a.difficulty || "—"}</p></td>
                      <td className="px-4 py-3 text-ink-2">{a.course}{a.batch ? ` · ${a.batch}` : ""}</td>
                      <td className="px-4 py-3 text-ink-2">{a.type || "—"}</td>
                      <td className="px-4 py-3 text-ink-2">{fmt(a.dueAt)}</td>
                      <td className="px-4 py-3 text-ink-2">{a.submitted}/{a.targetCount} · <span className="text-accent font-bold">{a.checked} checked</span></td>
                      <td className="px-4 py-3"><Badge tone={statusTone(a.status)}>{a.status}</Badge>{a.locked && <span className="ml-1 text-[10px] text-red-500">🔒</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => { setReviewId(a.id); setTab("review"); }} className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-bold text-accent hover:bg-surface-2">Review</button>
                          {a.status === "DRAFT" && <button onClick={() => lifecycle(a.id, "publish")} className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-bold text-emerald-600 hover:bg-surface-2">Publish</button>}
                          {a.status === "PUBLISHED" && <button onClick={() => lifecycle(a.id, "close")} className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-bold text-ink-2 hover:bg-surface-2">Close</button>}
                          <button onClick={() => openEdit(a.id)} disabled={a.locked} className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40">Edit</button>
                          <button onClick={() => lifecycle(a.id, "duplicate")} className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-bold text-ink-2 hover:bg-surface-2">Duplicate</button>
                          <button onClick={() => del(a.id)} className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-surface-2"><Trash2 className="size-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : tab === "review" ? <ReviewPanel rows={rows} reviewId={reviewId} setReviewId={setReviewId} onGraded={load} /> : <CalendarView />}
      </div>

      {showCreate && <AssignmentFormModal editing={editing} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </>
  );
}

// ── Review panel ──────────────────────────────────────────────────────────────
function ReviewPanel({ rows, reviewId, setReviewId, onGraded }: { rows: AssignmentListRow[]; reviewId: string | null; setReviewId: (id: string | null) => void; onGraded: () => void }) {
  const [subs, setSubs] = useState<AssignmentSubmissionRow[]>([]);
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [grading, setGrading] = useState<AssignmentSubmissionRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (id: string) => { setLoading(true); Promise.all([getAssignment(id).then(setDetail), getAssignmentSubmissions(id).then(setSubs)]).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { if (reviewId) load(reviewId); }, [reviewId]);

  if (!reviewId) return (
    <Card className="border border-hairline bg-surface"><CardBody className="p-5">
      <p className="mb-3 text-sm font-bold text-ink">Pick an assignment to review:</p>
      <div className="space-y-2">
        {rows.filter((a) => a.status !== "DRAFT").map((a) => (
          <button key={a.id} onClick={() => setReviewId(a.id)} className="flex w-full items-center justify-between rounded-xl border border-hairline px-3 py-2 text-left text-sm hover:bg-surface-2">
            <span className="font-bold text-ink">{a.title} <span className="text-xs font-normal text-ink-3">· {a.course}</span></span>
            <Badge tone="accent">{a.submitted}/{a.targetCount}</Badge>
          </button>
        ))}
        {rows.filter((a) => a.status !== "DRAFT").length === 0 && <p className="py-6 text-center text-sm text-ink-3">No published assignments yet.</p>}
      </div>
    </CardBody></Card>
  );

  return (
    <div className="space-y-4">
      <button onClick={() => setReviewId(null)} className="text-xs font-bold text-accent hover:underline">← All assignments</button>
      {loading ? <Loading /> : (
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="border-b border-hairline p-4"><h3 className="text-sm font-black text-ink">{detail?.title}</h3><p className="text-xs text-ink-3">{detail?.courseTitle} · max {detail?.maxMarks} marks · due {fmt(detail?.dueAt)}</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3"><th className="px-4 py-3">Student</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-hairline">
                {subs.map((s) => (
                  <tr key={s.studentId} className="hover:bg-surface-2/20">
                    <td className="px-4 py-3"><p className="font-bold text-ink">{s.name}</p><p className="text-[10px] text-ink-3">{s.studentCode}</p></td>
                    <td className="px-4 py-3 text-ink-2">{fmtT(s.submittedAt)} {s.isLate && <Badge tone="warning">Late</Badge>}</td>
                    <td className="px-4 py-3"><Badge tone={s.status === "EVALUATED" ? "good" : s.status === "RETURNED" ? "critical" : s.status === "ASSIGNED" ? "neutral" : "accent"}>{s.status}</Badge></td>
                    <td className="px-4 py-3 font-bold text-ink">{s.grade != null ? `${s.grade}/${detail?.maxMarks}` : "—"}</td>
                    <td className="px-4 py-3 text-right">{s.submissionId ? <button onClick={() => setGrading(s)} className="rounded-lg bg-accent px-3 py-1 text-[11px] font-bold text-white">{s.grade != null ? "Re-grade" : "Grade"}</button> : <span className="text-ink-3">Not submitted</span>}</td>
                  </tr>
                ))}
                {subs.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-ink-3">No target students.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {grading && detail && <GradeModal sub={grading} detail={detail} onClose={() => setGrading(null)} onGraded={() => { setGrading(null); if (reviewId) load(reviewId); onGraded(); }} />}
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarView() {
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
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black text-ink">Assignment Calendar</h3><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink" /></div>
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

function Loading() { return <div className="flex items-center justify-center py-16 text-sm font-bold text-ink-3"><Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading…</div>; }
