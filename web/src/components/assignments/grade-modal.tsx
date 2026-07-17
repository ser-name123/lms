"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X, Send, FileText, Mic, Square, ShieldAlert, Upload } from "lucide-react";
import Swal from "sweetalert2";

import { Badge } from "@/components/ui/badge";
import { RichHtml } from "./rich-text";
import {
  gradeAssignmentSubmission, uploadAssignmentFile, computeSubmissionSimilarity, resolveFileUrl,
  type AssignmentSubmissionRow, type AssignmentDetail,
} from "@/lib/api";

const inp = "h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent";
const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const toast = (t: string, icon: "success" | "error" = "success") => Swal.fire({ toast: true, position: "top-end", icon, title: t, showConfirmButton: false, timer: 1800 });
const fail = (e: unknown) => Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() });

export function GradeModal({ sub, detail, onClose, onGraded }: { sub: AssignmentSubmissionRow; detail: AssignmentDetail; onClose: () => void; onGraded: () => void }) {
  const rubric = detail.rubric ?? [];
  const [scores, setScores] = useState<Record<string, number>>(sub.rubricScores ?? {});
  const [grade, setGrade] = useState(sub.grade != null ? String(sub.grade) : "");
  const [feedback, setFeedback] = useState(sub.feedback ?? "");
  const [feedbackFileUrl, setFeedbackFileUrl] = useState<string | null>(null);
  const [returned, setReturned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [similarity, setSimilarity] = useState<{ similarityPct: number; matchedWith: string | null } | null>(sub.similarityPct != null ? { similarityPct: sub.similarityPct, matchedWith: null } : null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rubricTotal = rubric.reduce((a, r) => a + (scores[r.name] ?? 0), 0);

  useEffect(() => { if (sub.submissionId && sub.content) computeSubmissionSimilarity(sub.submissionId).then(setSimilarity).catch(() => undefined); }, [sub.submissionId, sub.content]);

  const uploadFeedback = async (file?: File) => { if (!file) return; setUploading(true); try { const a = await uploadAssignmentFile(file); setFeedbackFileUrl(a.url); toast("Attached"); } catch (e) { fail(e); } finally { setUploading(false); } };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream); chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `feedback-${Date.now()}.webm`, { type: "audio/webm" });
        setUploading(true); try { const a = await uploadAssignmentFile(file); setFeedbackFileUrl(a.url); toast("Voice feedback attached"); } catch (e) { fail(e); } finally { setUploading(false); }
      };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { toast("Microphone unavailable", "error"); }
  };
  const stopRec = () => { recRef.current?.stop(); setRecording(false); };

  const save = async () => {
    const g = rubric.length ? rubricTotal : Number(grade);
    if (isNaN(g)) return toast("Enter marks", "error");
    setBusy(true);
    try { await gradeAssignmentSubmission(sub.submissionId!, { grade: g, feedback: feedback || undefined, feedbackFileUrl: feedbackFileUrl || undefined, rubricScores: rubric.length ? scores : undefined, returned, returnedReason: returned ? feedback : undefined }); toast(returned ? "Returned to student" : "Graded"); onGraded(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline p-4"><h3 className="text-sm font-black text-ink">Grade — {sub.name}</h3><button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><X className="size-4" /></button></div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            {sub.isLate && <Badge tone="warning">Late{sub.penaltyApplied ? ` · −${sub.penaltyApplied}%` : ""}</Badge>}
            {similarity && <Badge tone={similarity.similarityPct >= 40 ? "critical" : similarity.similarityPct >= 20 ? "warning" : "good"}><ShieldAlert className="mr-1 inline size-3" />Similarity {similarity.similarityPct}%{similarity.matchedWith ? ` (vs ${similarity.matchedWith})` : ""}</Badge>}
          </div>
          {sub.content && <div><p className="text-[11px] font-bold uppercase text-ink-3">Student's answer</p><p className="mt-1 whitespace-pre-wrap rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink">{sub.content}</p></div>}
          {(sub.fileUrl || sub.attachments.length > 0) && (
            <div><p className="text-[11px] font-bold uppercase text-ink-3">Files</p><div className="mt-1 flex flex-wrap gap-2">
              {sub.fileUrl && <a href={resolveFileUrl(sub.fileUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-xs font-bold text-accent"><FileText className="size-3" /> Submission</a>}
              {sub.attachments.map((a, i) => <a key={i} href={resolveFileUrl(a.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-xs font-bold text-accent"><FileText className="size-3" /> {a.name}</a>)}
            </div></div>
          )}
          {rubric.length > 0 ? (
            <div><p className="mb-1 text-[11px] font-bold uppercase text-ink-3">Rubric ({rubricTotal} total)</p>
              {rubric.map((r) => (
                <div key={r.name} className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm text-ink">{r.name} <span className="text-xs text-ink-3">/ {r.max}</span></span>
                  <input type="number" max={r.max} min={0} value={scores[r.name] ?? ""} onChange={(e) => setScores({ ...scores, [r.name]: Math.min(r.max, Number(e.target.value)) })} className="h-9 w-20 rounded-lg border border-hairline bg-surface px-2 text-sm" />
                </div>
              ))}
            </div>
          ) : (
            <Field label={`Marks (out of ${detail.maxMarks})`}><input type="number" value={grade} onChange={(e) => setGrade(e.target.value)} className={inp} /></Field>
          )}
          <Field label="Feedback"><textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Grammar is good. Please improve sentence formation." className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase text-ink-3">Voice / file feedback:</span>
            {!recording ? <button onClick={startRec} className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2"><Mic className="size-3.5" /> Record</button>
              : <button onClick={stopRec} className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-400 px-2.5 text-xs font-bold text-red-500"><Square className="size-3.5" /> Stop</button>}
            <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-hairline px-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2">{uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Attach<input type="file" className="hidden" onChange={(e) => uploadFeedback(e.target.files?.[0])} /></label>
            {feedbackFileUrl && <a href={resolveFileUrl(feedbackFileUrl)} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent">attached ✓</a>}
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-ink-2"><input type="checkbox" checked={returned} onChange={(e) => setReturned(e.target.checked)} /> Return for resubmission (instead of finalizing)</label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">
          <button onClick={onClose} className="h-10 rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {returned ? "Return" : "Save Grade"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-3">{label}</span>{children}</label>; }
export { RichHtml };
