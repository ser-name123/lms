"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, CheckSquare, Square, Shuffle, ListChecks } from "lucide-react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createAssessment, updateAssessment, getAssessment, listQuestions, fetchAssessmentMeta,
  fetchAssessmentTargetStudents, ASSESSMENT_TYPES, type Question, type AssessmentDetail,
} from "@/lib/api";

const input = "h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent";
const label = "block text-xs font-bold text-ink-3 uppercase mb-1";
const TYPE_LABELS: Record<string, string> = {
  QUIZ: "Quiz", WEEKLY_TEST: "Weekly Test", MONTHLY_TEST: "Monthly Test", UNIT_TEST: "Unit Test",
  MID_TERM: "Mid Term", FINAL_EXAM: "Final Exam", ORAL_TEST: "Oral Test", PRACTICE_TEST: "Practice Test", MOCK_TEST: "Mock Test",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso); const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function AssessmentFormModal({ open, onClose, onSaved, assessmentId, forRole }: {
  open: boolean; onClose: () => void; onSaved: () => void; assessmentId?: string | null; forRole: "admin" | "teacher";
}) {
  const [meta, setMeta] = useState<{ courses: { id: string; title: string }[]; batches: { id: string; code: string; name: string }[] }>({ courses: [], batches: [] });
  const [bank, setBank] = useState<Question[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; studentCode: string; name: string }[]>([]);

  const [form, setForm] = useState({
    title: "", courseId: "", batchId: "", subject: "", chapter: "", topic: "", type: "QUIZ", instructions: "",
    durationMin: 60, totalMarks: 100, passingMarks: 40, attemptsAllowed: 1, questionOrder: "FIXED",
    allowBack: true, showResultImmediately: false, negativeMarking: false, selectionMode: "MANUAL",
    startAt: "", endAt: "", targetType: "BATCH", certificateEnabled: false, certificateThreshold: 70, proctored: false,
  });
  const [rr, setRr] = useState({ easy: 0, medium: 0, hard: 0 });
  const [selectedQ, setSelectedQ] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchAssessmentMeta().then((m) => setMeta({ courses: m.courses, batches: m.batches })).catch(() => {});
    listQuestions({ limit: "200" }).then((r) => setBank(r.items)).catch(() => {});
    if (assessmentId) {
      getAssessment(assessmentId).then((a: AssessmentDetail) => {
        setForm({
          title: a.title, courseId: a.courseId ?? "", batchId: a.batchId ?? "", subject: a.subject ?? "",
          chapter: a.chapter ?? "", topic: a.topic ?? "", type: a.type, instructions: a.instructions ?? "",
          durationMin: a.durationMin, totalMarks: a.totalMarks, passingMarks: a.passingMarks, attemptsAllowed: a.attemptsAllowed,
          questionOrder: a.questionOrder, allowBack: a.allowBack, showResultImmediately: a.showResultImmediately,
          negativeMarking: a.negativeMarking, selectionMode: a.selectionMode, startAt: toLocalInput(a.startAt), endAt: toLocalInput(a.endAt),
          targetType: a.targetType, certificateEnabled: a.certificateEnabled, certificateThreshold: a.certificateThreshold, proctored: a.proctored ?? false,
        });
        setSelectedQ(a.questionList.map((q) => q.id));
        setSelectedStudents(a.targetStudentIds ?? []);
        const r = (a.randomRules as { easy?: number; medium?: number; hard?: number } | null) ?? {};
        setRr({ easy: r.easy ?? 0, medium: r.medium ?? 0, hard: r.hard ?? 0 });
      }).catch(() => {});
    } else {
      setForm((f) => ({ ...f, title: "", courseId: "", batchId: "", subject: "" }));
      setSelectedQ([]); setSelectedStudents([]); setRr({ easy: 0, medium: 0, hard: 0 });
    }
  }, [open, assessmentId]);

  useEffect(() => {
    if (form.targetType === "SELECTED") fetchAssessmentTargetStudents(form.courseId || undefined, form.batchId || undefined).then(setCandidates).catch(() => {});
  }, [form.targetType, form.courseId, form.batchId]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const filteredBank = useMemo(() => {
    const q = bankSearch.toLowerCase();
    return bank.filter((b) => !q || b.text.toLowerCase().includes(q) || b.subject.toLowerCase().includes(q) || (b.topic ?? "").toLowerCase().includes(q));
  }, [bank, bankSearch]);

  const selectedMarks = useMemo(() => bank.filter((b) => selectedQ.includes(b.id)).reduce((s, b) => s + b.marks, 0), [bank, selectedQ]);

  if (!open) return null;

  const save = async (publish: boolean) => {
    if (!form.title.trim()) { Swal.fire({ title: "Title is required.", icon: "error" }); return; }
    if (form.selectionMode === "MANUAL" && !selectedQ.length && !assessmentId) { Swal.fire({ title: "Pick at least one question.", icon: "error" }); return; }
    const dto: Record<string, unknown> = {
      title: form.title.trim(), courseId: form.courseId || undefined, batchId: form.batchId || undefined,
      subject: form.subject || undefined, chapter: form.chapter || undefined, topic: form.topic || undefined,
      type: form.type, instructions: form.instructions || undefined, durationMin: Number(form.durationMin) || 60,
      totalMarks: Number(form.totalMarks) || 100, passingMarks: Number(form.passingMarks) || 40,
      attemptsAllowed: Number(form.attemptsAllowed), questionOrder: form.questionOrder, allowBack: form.allowBack,
      showResultImmediately: form.showResultImmediately, negativeMarking: form.negativeMarking, selectionMode: form.selectionMode,
      targetType: form.targetType, certificateEnabled: form.certificateEnabled, certificateThreshold: Number(form.certificateThreshold), proctored: form.proctored,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
      endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
    };
    if (form.selectionMode === "MANUAL") dto.questionIds = selectedQ;
    else dto.randomRules = { subject: form.subject || undefined, easy: rr.easy, medium: rr.medium, hard: rr.hard };
    if (form.targetType === "SELECTED") dto.targetStudentIds = selectedStudents;

    setSaving(true);
    try {
      let id = assessmentId;
      if (assessmentId) await updateAssessment(assessmentId, dto);
      else { const created = await createAssessment(dto); id = created.id; }
      if (publish && id) { const { assessmentLifecycle } = await import("@/lib/api"); await assessmentLifecycle(id, "publish"); }
      onSaved(); onClose();
    } catch (e) { Swal.fire({ title: "Save failed", text: (e as Error).message, icon: "error" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-hairline bg-surface shadow-2xl text-ink">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface px-6 py-4">
          <h3 className="text-base font-bold">{assessmentId ? "Edit Assessment" : "New Assessment"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </header>

        <div className="p-6 space-y-5">
          {/* Basic */}
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Basic Information</p>
            <div><label className={label}>Title *</label><input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. English Weekly Test" /></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><label className={label}>Course</label>
                <select className={input} value={form.courseId} onChange={(e) => set("courseId", e.target.value)}>
                  <option value="">—</option>{meta.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div><label className={label}>Batch</label>
                <select className={input} value={form.batchId} onChange={(e) => set("batchId", e.target.value)}>
                  <option value="">—</option>{meta.batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
              </div>
              <div><label className={label}>Type</label>
                <select className={input} value={form.type} onChange={(e) => set("type", e.target.value)}>
                  {ASSESSMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div><label className={label}>Subject</label><input className={input} value={form.subject} onChange={(e) => set("subject", e.target.value)} /></div>
              <div><label className={label}>Chapter</label><input className={input} value={form.chapter} onChange={(e) => set("chapter", e.target.value)} /></div>
              <div><label className={label}>Topic</label><input className={input} value={form.topic} onChange={(e) => set("topic", e.target.value)} /></div>
            </div>
            <div><label className={label}>Instructions</label>
              <textarea rows={2} className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent" value={form.instructions} onChange={(e) => set("instructions", e.target.value)} /></div>
          </section>

          {/* Rules */}
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Rules</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><label className={label}>Duration (min)</label><input type="number" min={1} className={input} value={form.durationMin} onChange={(e) => set("durationMin", Number(e.target.value))} /></div>
              <div><label className={label}>Passing marks</label><input type="number" min={0} className={input} value={form.passingMarks} onChange={(e) => set("passingMarks", Number(e.target.value))} /></div>
              <div><label className={label}>Attempts (0 = ∞)</label><input type="number" min={0} className={input} value={form.attemptsAllowed} onChange={(e) => set("attemptsAllowed", Number(e.target.value))} /></div>
              <div><label className={label}>Question order</label>
                <select className={input} value={form.questionOrder} onChange={(e) => set("questionOrder", e.target.value)}><option value="FIXED">Fixed</option><option value="RANDOM">Random</option></select></div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowBack} onChange={(e) => set("allowBack", e.target.checked)} className="size-4 accent-accent" /> Allow going back</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.showResultImmediately} onChange={(e) => set("showResultImmediately", e.target.checked)} className="size-4 accent-accent" /> Show result immediately</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.negativeMarking} onChange={(e) => set("negativeMarking", e.target.checked)} className="size-4 accent-accent" /> Negative marking</label>
            </div>
          </section>

          {/* Question selection */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Questions</p>
              <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-xs font-semibold">
                <button onClick={() => set("selectionMode", "MANUAL")} className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${form.selectionMode === "MANUAL" ? "bg-accent text-accent-ink" : "text-ink-3"}`}><ListChecks className="size-3.5" /> Manual</button>
                <button onClick={() => set("selectionMode", "RANDOM")} className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${form.selectionMode === "RANDOM" ? "bg-accent text-accent-ink" : "text-ink-3"}`}><Shuffle className="size-3.5" /> Random</button>
              </div>
            </div>

            {form.selectionMode === "MANUAL" ? (
              <div className="rounded-xl border border-hairline">
                <div className="flex items-center justify-between gap-2 border-b border-hairline p-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
                    <input className="h-9 w-full rounded-lg border border-hairline bg-surface-2 pl-8 pr-3 text-xs" placeholder="Search question bank…" value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} />
                  </div>
                  <span className="text-xs font-semibold text-ink-3">{selectedQ.length} selected · {selectedMarks} marks</span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-hairline">
                  {filteredBank.length === 0 && <p className="p-4 text-center text-xs text-ink-3">No questions in the bank yet.</p>}
                  {filteredBank.map((b) => {
                    const on = selectedQ.includes(b.id);
                    return (
                      <button key={b.id} onClick={() => setSelectedQ((s) => on ? s.filter((x) => x !== b.id) : [...s, b.id])} className="flex w-full items-start gap-2 p-2.5 text-left hover:bg-surface-2">
                        {on ? <CheckSquare className="mt-0.5 size-4 shrink-0 text-accent" /> : <Square className="mt-0.5 size-4 shrink-0 text-ink-3" />}
                        <span className="flex-1">
                          <span className="line-clamp-1 text-sm text-ink">{b.text}</span>
                          <span className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-ink-3">
                            <Badge tone="neutral">{b.type}</Badge><Badge tone="accent">{b.difficulty}</Badge><span>{b.subject} · {b.marks} marks</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label}>Easy</label><input type="number" min={0} className={input} value={rr.easy} onChange={(e) => setRr((r) => ({ ...r, easy: Number(e.target.value) }))} /></div>
                <div><label className={label}>Medium</label><input type="number" min={0} className={input} value={rr.medium} onChange={(e) => setRr((r) => ({ ...r, medium: Number(e.target.value) }))} /></div>
                <div><label className={label}>Hard</label><input type="number" min={0} className={input} value={rr.hard} onChange={(e) => setRr((r) => ({ ...r, hard: Number(e.target.value) }))} /></div>
                <p className="col-span-3 text-xs text-ink-3">Questions are auto-picked from the bank ({form.subject || "any subject"}) on save.</p>
              </div>
            )}
          </section>

          {/* Targeting */}
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Target</p>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={form.targetType === "BATCH"} onChange={() => set("targetType", "BATCH")} className="accent-accent" /> Whole batch / course</label>
              <label className="flex items-center gap-2"><input type="radio" checked={form.targetType === "SELECTED"} onChange={() => set("targetType", "SELECTED")} className="accent-accent" /> Selected students</label>
            </div>
            {form.targetType === "SELECTED" && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-hairline divide-y divide-hairline">
                {candidates.length === 0 && <p className="p-3 text-center text-xs text-ink-3">Pick a course/batch to load students.</p>}
                {candidates.map((c) => {
                  const on = selectedStudents.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => setSelectedStudents((s) => on ? s.filter((x) => x !== c.id) : [...s, c.id])} className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-surface-2">
                      {on ? <CheckSquare className="size-4 text-accent" /> : <Square className="size-4 text-ink-3" />}
                      <span className="font-mono text-xs text-ink-3">{c.studentCode}</span> {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Schedule + certificate */}
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Schedule & Certificate</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Starts at</label><input type="datetime-local" className={input} value={form.startAt} onChange={(e) => set("startAt", e.target.value)} /></div>
              <div><label className={label}>Ends at</label><input type="datetime-local" className={input} value={form.endAt} onChange={(e) => set("endAt", e.target.value)} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.certificateEnabled} onChange={(e) => set("certificateEnabled", e.target.checked)} className="size-4 accent-accent" /> Certificate on pass</label>
              {form.certificateEnabled && <span className="flex items-center gap-2 text-xs">Threshold %<input type="number" min={0} max={100} className="h-9 w-20 rounded-lg border border-hairline bg-surface-2 px-2" value={form.certificateThreshold} onChange={(e) => set("certificateThreshold", Number(e.target.value))} /></span>}
              <label className="flex items-center gap-2" title="Flag tab-switching / copy attempts and auto-submit after 3"><input type="checkbox" checked={form.proctored} onChange={(e) => set("proctored", e.target.checked)} className="size-4 accent-accent" /> Proctored (anti-cheat)</label>
            </div>
          </section>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-hairline bg-surface px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>Save Draft</Button>
          <Button variant="primary" onClick={() => save(true)} disabled={saving}>{saving ? "Saving…" : "Save & Publish"}</Button>
        </footer>
      </div>
    </div>
  );
}
