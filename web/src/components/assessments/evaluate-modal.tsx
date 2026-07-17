"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle2, XCircle, Award } from "lucide-react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAttempt, evaluateAttempt, type AttemptDetail } from "@/lib/api";

const OBJECTIVE = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCH"];

function renderResponse(resp: unknown): string {
  if (resp == null) return "—";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) return resp.join(", ");
  if (typeof resp === "object") return Object.entries(resp as Record<string, string>).map(([k, v]) => `${k} → ${v}`).join("; ");
  return String(resp);
}

export function EvaluateModal({ open, onClose, attemptId, onDone }: {
  open: boolean; onClose: () => void; attemptId: string | null; onDone: () => void;
}) {
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [grades, setGrades] = useState<Record<string, { awardedMarks: number; rubricScores: Record<string, number>; feedback: string }>>({});
  const [teacherFeedback, setTeacherFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !attemptId) return;
    setAttempt(null);
    getAttempt(attemptId).then((a) => {
      setAttempt(a); setTeacherFeedback(a.teacherFeedback ?? "");
      const g: typeof grades = {};
      for (const ans of a.answerList) {
        if (!ans.autoGraded) g[ans.questionId] = { awardedMarks: ans.awardedMarks ?? 0, rubricScores: (ans.rubricScores as Record<string, number>) ?? {}, feedback: ans.feedback ?? "" };
      }
      setGrades(g);
    }).catch(() => {});
  }, [open, attemptId]);

  if (!open || !attemptId) return null;

  const submit = async (publish: boolean) => {
    if (!attempt) return;
    setSaving(true);
    try {
      const answers = Object.entries(grades).map(([questionId, g]) => ({ questionId, awardedMarks: Number(g.awardedMarks) || 0, rubricScores: g.rubricScores, feedback: g.feedback || undefined }));
      await evaluateAttempt(attemptId, { answers, teacherFeedback: teacherFeedback || undefined, publish });
      onDone(); onClose();
    } catch (e) { Swal.fire({ title: "Evaluation failed", text: (e as Error).message, icon: "error" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-hairline bg-surface shadow-2xl text-ink">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface px-6 py-4">
          <div>
            <h3 className="text-base font-bold">Evaluate Attempt</h3>
            {attempt && <p className="text-xs text-ink-3">{attempt.studentName} · {attempt.assessment.title}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </header>

        {!attempt ? <div className="p-10 text-center text-sm text-ink-3">Loading…</div> : (
          <div className="p-6 space-y-4">
            {attempt.answerList.map((ans, i) => {
              const objective = OBJECTIVE.includes(ans.question.type);
              const g = grades[ans.questionId];
              return (
                <div key={ans.answerId} className="rounded-xl border border-hairline bg-surface-2 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">Q{i + 1}. {ans.question.text}</p>
                    <Badge tone={objective ? "neutral" : "accent"}>{ans.question.type} · {ans.maxMarks}m</Badge>
                  </div>
                  <p className="text-xs text-ink-3">Answer: <span className="text-ink-2">{renderResponse(ans.response)}</span></p>

                  {objective ? (
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {ans.isCorrect ? <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="size-4" /> Correct · {ans.awardedMarks}m</span>
                        : <span className="flex items-center gap-1 text-critical"><XCircle className="size-4" /> Wrong · {ans.awardedMarks}m</span>}
                      <span className="text-ink-3">(auto-graded)</span>
                    </div>
                  ) : (
                    <div className="space-y-2 border-t border-hairline pt-2">
                      {(ans.question.rubric as { name: string; max: number }[] | null)?.length ? (
                        <div className="space-y-1.5">
                          {(ans.question.rubric as { name: string; max: number }[]).map((r) => (
                            <div key={r.name} className="flex items-center gap-2 text-xs">
                              <span className="w-32 text-ink-2">{r.name}</span>
                              <input type="number" min={0} max={r.max} className="h-8 w-20 rounded-lg border border-hairline bg-surface px-2 text-sm"
                                value={g?.rubricScores[r.name] ?? 0}
                                onChange={(e) => setGrades((s) => {
                                  const rs = { ...(s[ans.questionId]?.rubricScores ?? {}), [r.name]: Number(e.target.value) };
                                  const total = Object.values(rs).reduce((a, b) => a + b, 0);
                                  return { ...s, [ans.questionId]: { ...s[ans.questionId], rubricScores: rs, awardedMarks: total, feedback: s[ans.questionId]?.feedback ?? "" } };
                                })} />
                              <span className="text-ink-3">/ {r.max}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink-3 uppercase">Marks</span>
                        <input type="number" min={0} max={ans.maxMarks} className="h-9 w-24 rounded-lg border border-hairline bg-surface px-2 text-sm"
                          value={g?.awardedMarks ?? 0}
                          onChange={(e) => setGrades((s) => ({ ...s, [ans.questionId]: { ...s[ans.questionId], awardedMarks: Number(e.target.value), rubricScores: s[ans.questionId]?.rubricScores ?? {}, feedback: s[ans.questionId]?.feedback ?? "" } }))} />
                        <span className="text-xs text-ink-3">/ {ans.maxMarks}</span>
                      </div>
                      <input className="h-9 w-full rounded-lg border border-hairline bg-surface px-3 text-sm" placeholder="Feedback for this answer…"
                        value={g?.feedback ?? ""}
                        onChange={(e) => setGrades((s) => ({ ...s, [ans.questionId]: { ...s[ans.questionId], feedback: e.target.value, awardedMarks: s[ans.questionId]?.awardedMarks ?? 0, rubricScores: s[ans.questionId]?.rubricScores ?? {} } }))} />
                    </div>
                  )}
                </div>
              );
            })}

            <div>
              <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Overall feedback</label>
              <textarea rows={2} className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent" value={teacherFeedback} onChange={(e) => setTeacherFeedback(e.target.value)} />
            </div>
          </div>
        )}

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-hairline bg-surface px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={saving || !attempt}>Save (Evaluated)</Button>
          <Button variant="primary" onClick={() => submit(true)} disabled={saving || !attempt}><Award className="size-4" /> Save & Publish Result</Button>
        </footer>
      </div>
    </div>
  );
}
