"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  MessageSquarePlus,
  ClipboardList,
  Loader2,
  Star,
  X,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  fetchTeacherProgressDashboard,
  fetchTeacherProgressStudent,
  fetchTeacherStudentFeedback,
  addTeacherFeedback,
  type ProgressStatus,
  type TeacherProgressDashboard,
} from "@/lib/api";

const STATUS_TONE: Record<ProgressStatus, Tone> = {
  EXCELLENT: "good",
  GOOD: "accent",
  AVERAGE: "warning",
  NEEDS_ATTENTION: "warning",
  CRITICAL: "critical",
  NO_DATA: "neutral",
};
const STATUS_LABEL: Record<ProgressStatus, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  AVERAGE: "Average",
  NEEDS_ATTENTION: "Needs Attention",
  CRITICAL: "Critical",
  NO_DATA: "No Data",
};

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const toast = (title: string, icon: "success" | "error" = "success") =>
  Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 1800, background: swalBg() });
const fail = (e: unknown) =>
  Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Something went wrong", icon: "error", background: swalBg() });

export default function TeacherProgressPage() {
  const [dash, setDash] = useState<TeacherProgressDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchTeacherProgressDashboard()
      .then(setDash)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const c = dash?.cards;
  const students = dash?.students ?? [];

  return (
    <>
      <Topbar title="Student Progress" subtitle="Track and support your students" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              <Kpi label="Total Students" value={c?.totalStudents ?? 0} icon={Users} color="text-accent bg-accent/10" />
              <Kpi label="Improving" value={c?.studentsImproving ?? 0} icon={TrendingUp} color="text-emerald-500 bg-emerald-500/10" />
              <Kpi label="At Risk" value={c?.studentsAtRisk ?? 0} icon={AlertTriangle} color="text-red-500 bg-red-500/10" />
              <Kpi label="Pending Feedback" value={c?.pendingFeedback ?? 0} icon={MessageSquarePlus} color="text-amber-500 bg-amber-500/10" />
              <Kpi label="Pending Reviews" value={c?.pendingReviews ?? 0} icon={ClipboardList} color="text-ink-2 bg-surface-3" />
            </div>

            {/* Roster table */}
            <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-hairline bg-surface-2/50 text-[11px] uppercase tracking-wider text-ink-3">
                      <tr>
                        <th className="px-4 py-3 font-bold">Student</th>
                        <th className="px-4 py-3 font-bold">Attendance</th>
                        <th className="px-4 py-3 font-bold">Avg Score</th>
                        <th className="px-4 py-3 font-bold">Progress</th>
                        <th className="px-4 py-3 font-bold">Status</th>
                        <th className="px-4 py-3 font-bold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.length === 0 ? (
                        <tr><td colSpan={6} className="p-8 text-center text-xs text-ink-3">No students assigned yet.</td></tr>
                      ) : (
                        students.map((s) => (
                          <tr key={s.studentId} className="border-b border-hairline/60 hover:bg-surface-2/40">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-hairline bg-accent-soft/20 text-[11px] font-extrabold text-accent">
                                  {s.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={s.avatarUrl} alt={s.name} className="size-full object-cover" />
                                  ) : (
                                    <span>{s.name.slice(0, 2).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink">{s.name}</div>
                                  <div className="text-[11px] text-ink-3">{s.studentCode}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-ink-2">{s.attendance != null ? `${s.attendance}%` : "—"}</td>
                            <td className="px-4 py-3 text-ink-2">{s.avgScore != null ? `${s.avgScore}%` : "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                                  <div className="h-full rounded-full bg-accent" style={{ width: `${s.progress}%` }} />
                                </div>
                                <span className="text-xs font-bold text-ink">{s.progress}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                <button
                                  onClick={() => setDetailId(s.studentId)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
                                >
                                  <MessageSquarePlus className="size-3.5" /> View / Feedback
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {detailId && <DetailDrawer studentId={detailId} onClose={() => setDetailId(null)} onSaved={load} />}
    </>
  );
}

function DetailDrawer({ studentId, onClose, onSaved }: { studentId: string; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [participation, setParticipation] = useState(0);
  const [homework, setHomework] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [understanding, setUnderstanding] = useState(0);
  const [behavior, setBehavior] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [suggestions, setSuggestions] = useState("");

  const loadDetail = useCallback(() => {
    fetchTeacherProgressStudent(studentId).then(setD).catch(() => undefined);
    fetchTeacherStudentFeedback(studentId).then((h) => setHistory(h ?? [])).catch(() => setHistory([]));
  }, [studentId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const save = async () => {
    setSaving(true);
    try {
      await addTeacherFeedback({
        studentId,
        participation: participation || undefined,
        homework: homework || undefined,
        communication: communication || undefined,
        understanding: understanding || undefined,
        behavior: behavior || undefined,
        remarks: remarks || undefined,
        suggestions: suggestions || undefined,
      });
      toast("Feedback saved");
      setParticipation(0);
      setHomework(0);
      setCommunication(0);
      setUnderstanding(0);
      setBehavior(0);
      setRemarks("");
      setSuggestions("");
      loadDetail();
      onSaved();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !saving &&
    (participation || homework || communication || understanding || behavior || remarks.trim() || suggestions.trim());

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface p-4">
          <h3 className="text-sm font-bold text-ink">{d?.student?.name ?? "Student Progress"}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-3"><X className="size-4" /></button>
        </div>
        {!d ? (
          <div className="grid h-64 place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
        ) : (
          <div className="space-y-4 p-4">
            {/* Score stats */}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Overall" value={d.scores?.overall != null ? `${d.scores.overall}%` : "—"} />
              <Stat label="Status" value={STATUS_LABEL[d.scores?.status as ProgressStatus] ?? d.scores?.status ?? "—"} />
              <Stat label="Attendance" value={d.scores?.attendancePct != null ? `${d.scores.attendancePct}%` : "—"} />
              <Stat label="Assignments" value={d.scores?.assignmentPct != null ? `${d.scores.assignmentPct}%` : "—"} />
              <Stat label="Assessments" value={d.scores?.assessmentPct != null ? `${d.scores.assessmentPct}%` : "—"} />
              <Stat label="Feedback" value={d.scores?.feedbackScore != null ? `${d.scores.feedbackScore}%` : "—"} />
            </div>

            {d.subjects?.length > 0 && (
              <Section title="Subject-wise Progress">
                {d.subjects.map((s: any) => (
                  <Bar2 key={s.subject} label={s.subject} value={s.progress} />
                ))}
              </Section>
            )}

            {d.assessments?.byType?.length > 0 && (
              <Section title="Assessment Performance">
                {d.assessments.byType.map((t: any) => (
                  <Bar2 key={t.type} label={`${t.type} (${t.count})`} value={t.avg} />
                ))}
              </Section>
            )}

            {/* Quick Feedback form */}
            <div className="space-y-3 rounded-xl border border-hairline bg-surface p-3">
              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">Quick Feedback</h4>
              <StarRow label="Participation" value={participation} onChange={setParticipation} />
              <StarRow label="Homework" value={homework} onChange={setHomework} />
              <StarRow label="Communication" value={communication} onChange={setCommunication} />
              <StarRow label="Understanding" value={understanding} onChange={setUnderstanding} />
              <StarRow label="Behavior" value={behavior} onChange={setBehavior} />
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Remarks</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="Overall remarks…"
                  className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent/40 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Suggestions / improvement tips</label>
                <textarea
                  value={suggestions}
                  onChange={(e) => setSuggestions(e.target.value)}
                  rows={2}
                  placeholder="How can the student improve?"
                  className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent/40 focus:outline-none"
                />
              </div>
              <button
                onClick={save}
                disabled={!canSave}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
                Save Feedback
              </button>
            </div>

            {/* Feedback history */}
            <Section title="Feedback History">
              {history.length === 0 ? (
                <p className="text-xs text-ink-3">No feedback yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((f: any) => (
                    <div key={f.id} className="space-y-1.5 rounded-lg border border-hairline bg-surface-2 p-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <MiniStars label="Part." value={f.participation} />
                          <MiniStars label="HW" value={f.homework} />
                          <MiniStars label="Comm." value={f.communication} />
                          <MiniStars label="Under." value={f.understanding} />
                          <MiniStars label="Behav." value={f.behavior} />
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold text-ink-3">
                          {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ""}
                        </span>
                      </div>
                      {f.remarks && <p className="text-xs text-ink-2"><span className="font-bold text-ink">Remarks:</span> {f.remarks}</p>}
                      {f.suggestions && <p className="text-xs text-ink-2"><span className="font-bold text-ink">Tips:</span> {f.suggestions}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          className="text-ink-3 transition-colors hover:text-amber-500"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star className={`size-5 ${n <= value ? "fill-amber-400 text-amber-400" : ""}`} />
        </button>
      ))}
    </div>
  );
}

function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      <StarRating value={value} onChange={onChange} />
    </div>
  );
}

function MiniStars({ label, value }: { label: string; value: number | null | undefined }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-3">
      {label}
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={`size-2.5 ${n <= v ? "fill-amber-400 text-amber-400" : "text-ink-3/40"}`} />
        ))}
      </span>
    </span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-2 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-0.5 text-base font-extrabold text-ink">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-surface p-3">
      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">{title}</h4>
      {children}
    </div>
  );
}

function Bar2({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-ink-2">{label}</span>
        <span className="font-bold text-ink">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
