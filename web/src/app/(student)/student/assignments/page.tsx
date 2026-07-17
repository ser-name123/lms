"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Upload, Send, FileText, Clock, CheckCircle2, Save, Lightbulb } from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RichHtml } from "@/components/assignments/rich-text";
import {
  fetchMyAssignments, openMyAssignment, saveMyAssignmentDraft, submitMyAssignment,
  uploadAssignmentFile, resolveFileUrl,
  type StudentAssignmentView, type AssignmentAttachment,
} from "@/lib/api";

const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const toast = (t: string, icon: "success" | "error" = "success") => Swal.fire({ toast: true, position: "top-end", icon, title: t, showConfirmButton: false, timer: 1800 });
const fail = (e: unknown) => Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() });
const fmtT = (d?: string | null) => d ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const isDone = (s: StudentAssignmentView) => !!s.submission && ["SUBMITTED", "LATE_SUBMITTED", "UNDER_REVIEW", "EVALUATED"].includes(s.submission.status);
const isGraded = (s: StudentAssignmentView) => s.submission?.status === "EVALUATED" || s.submission?.status === "RETURNED";

export default function StudentAssignmentsPage() {
  const [items, setItems] = useState<StudentAssignmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<StudentAssignmentView | null>(null);

  const load = () => { setLoading(true); fetchMyAssignments().then(setItems).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const pending = items.filter((a) => !isDone(a));
  const done = items.filter((a) => isDone(a) || isGraded(a));

  return (
    <>
      <Topbar title="Homework & Grades" subtitle="Your assignments, submissions and results" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {loading ? <Loading /> : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Clock className="size-4 text-amber-500" /> To Submit ({pending.length})</h3>
              <div className="space-y-2">
                {pending.length === 0 ? <Empty text="Nothing pending 🎉" /> : pending.map((a) => (
                  <Card key={a.id} className="border border-hairline bg-surface"><CardBody className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-bold text-ink">{a.title}</p><p className="text-xs text-ink-3">{a.course} · {a.type || "Assignment"} · {a.maxMarks} marks</p></div>
                      {a.submission?.status === "DRAFT" && <Badge tone="neutral">Draft saved</Badge>}
                      {a.submission?.status === "RETURNED" && <Badge tone="critical">Returned</Badge>}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-ink-3">Due {fmtT(a.dueAt)}{a.lateAllowed ? "" : " · no late"}</span>
                      <button onClick={() => setOpen(a)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white">Open</button>
                    </div>
                    {a.submission?.status === "RETURNED" && a.submission.returnedReason && <p className="mt-2 rounded-lg bg-red-500/5 p-2 text-xs text-red-500">Teacher: {a.submission.returnedReason}</p>}
                  </CardBody></Card>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><CheckCircle2 className="size-4 text-emerald-500" /> Submitted & Graded ({done.length})</h3>
              <div className="space-y-2">
                {done.length === 0 ? <Empty text="No submissions yet" /> : done.map((a) => (
                  <Card key={a.id} className="border border-hairline bg-surface"><CardBody className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-bold text-ink">{a.title}</p><p className="text-xs text-ink-3">{a.course} · submitted {fmtT(a.submission?.submittedAt)}</p></div>
                      {a.submission?.status === "EVALUATED"
                        ? <Badge tone={a.submission.grade != null && a.submission.grade >= a.passingMarks ? "good" : "critical"}>{a.submission.grade}/{a.maxMarks}</Badge>
                        : <Badge tone={a.submission?.isLate ? "warning" : "accent"}>{a.submission?.status}</Badge>}
                    </div>
                    <button onClick={() => setOpen(a)} className="mt-2 text-xs font-bold text-accent hover:underline">View details →</button>
                  </CardBody></Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {open && <AssignmentModal id={open.id} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
    </>
  );
}

function AssignmentModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [a, setA] = useState<StudentAssignmentView | null>(null);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    openMyAssignment(id).then((d) => { setA(d); setContent(d.submission?.content ?? ""); setAttachments((d.submission?.attachments as AssignmentAttachment[]) ?? []); }).catch(() => undefined);
  }, [id]);

  const locked = !!a && isDone(a);
  const upload = async (file?: File) => {
    if (!file || !a) return;
    if (a.allowedFileTypes.length) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (!a.allowedFileTypes.map((t) => t.toLowerCase().replace(/^\./, "")).includes(ext)) return toast(`Only allowed: ${a.allowedFileTypes.join(", ")}`, "error");
    }
    if (a.maxFileSizeMb && file.size > a.maxFileSizeMb * 1024 * 1024) return toast(`Max file size is ${a.maxFileSizeMb} MB`, "error");
    setUploading(true); try { const at = await uploadAssignmentFile(file); setAttachments((x) => [...x, at]); } catch (e) { fail(e); } finally { setUploading(false); }
  };
  const hint = () => {
    if (!a) return;
    const tips = [
      a.instructions ? "Re-read the instructions and address every point listed." : "Break the task into small steps and tackle them one by one.",
      a.subject ? `Focus on the key ideas of "${a.subject}" and explain them in your own words.` : "Explain concepts in your own words rather than copying.",
      "Check spelling, grammar and structure before submitting.",
      a.rubric.length ? `You'll be marked on: ${a.rubric.map((r) => r.name).join(", ")} — cover each one.` : "Make sure your answer is complete and well-organised.",
    ];
    Swal.fire({ title: "💡 Hint (not the full answer)", html: `<ul style="text-align:left;font-size:13px;line-height:1.7">${tips.map((t) => `<li>${t}</li>`).join("")}</ul>`, background: swalBg(), confirmButtonText: "Got it" });
  };
  const draft = async () => { setBusy(true); try { await saveMyAssignmentDraft(id, { content, attachments }); toast("Draft saved"); onDone(); } catch (e) { fail(e); } finally { setBusy(false); } };
  const submit = async () => {
    const r = await Swal.fire({ title: "Submit assignment?", text: "You cannot edit after submission.", icon: "warning", showCancelButton: true, confirmButtonText: "Yes, submit", background: swalBg() });
    if (!r.isConfirmed) return;
    setBusy(true);
    try { await submitMyAssignment(id, { content, attachments }); toast("Submitted"); onDone(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  if (!a) return null;
  const sub = a.submission;
  const graded = sub?.status === "EVALUATED";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-2xl rounded-2xl border border-hairline bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <div><h3 className="text-sm font-black text-ink">{a.title}</h3><p className="text-xs text-ink-3">{a.course} · {a.maxMarks} marks · pass {a.passingMarks}</p></div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
          {a.dueAt && <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3"><Clock className="size-3.5" /> Due {fmtT(a.dueAt)} {!a.lateAllowed && <Badge tone="critical">No late submission</Badge>} {a.lateAllowed && a.latePenaltyPct > 0 && <Badge tone="warning">Late penalty {a.latePenaltyPct}%</Badge>} {a.allowedFileTypes.length > 0 && <Badge tone="neutral">Files: {a.allowedFileTypes.join(", ")}</Badge>} {a.maxFileSizeMb && <Badge tone="neutral">Max {a.maxFileSizeMb} MB</Badge>}</div>}
          {a.instructions && <div><p className="text-[11px] font-bold uppercase text-ink-3">Instructions</p><RichHtml html={a.instructions} className="mt-1" /></div>}
          {a.description && <RichHtml html={a.description} className="text-ink-2" />}
          {a.attachments.length > 0 && <div className="flex flex-wrap gap-2">{a.attachments.map((x, i) => <a key={i} href={resolveFileUrl(x.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-xs font-bold text-accent"><FileText className="size-3" /> {x.name}</a>)}</div>}
          {!locked && <button onClick={hint} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1 text-xs font-bold text-amber-600 hover:bg-surface-2"><Lightbulb className="size-3.5" /> Get a hint</button>}

          {/* Graded result */}
          {graded && sub && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between"><p className="text-sm font-black text-ink">Result</p><Badge tone={sub.grade != null && sub.grade >= a.passingMarks ? "good" : "critical"}>{sub.grade}/{a.maxMarks}</Badge></div>
              {sub.isLate && <p className="mt-1 text-xs text-amber-600">Late submission{sub.penaltyApplied ? ` · −${sub.penaltyApplied}% penalty applied` : ""}</p>}
              {sub.rubricScores && Object.keys(sub.rubricScores).length > 0 && <div className="mt-2 space-y-1">{a.rubric.map((r) => <div key={r.name} className="flex justify-between text-xs"><span className="text-ink-3">{r.name}</span><span className="font-bold text-ink">{sub.rubricScores?.[r.name] ?? 0}/{r.max}</span></div>)}</div>}
              {sub.feedback && <div className="mt-2"><p className="text-[11px] font-bold uppercase text-ink-3">Teacher feedback</p><p className="mt-0.5 text-sm text-ink">{sub.feedback}</p></div>}
              {sub.feedbackFileUrl && <a href={resolveFileUrl(sub.feedbackFileUrl)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent"><FileText className="size-3" /> Download feedback</a>}
            </div>
          )}

          {/* Submission form */}
          {!locked ? (
            <>
              {sub?.status === "RETURNED" && <div className="rounded-lg bg-red-500/5 p-2 text-xs text-red-500">Returned for changes: {sub.returnedReason}</div>}
              <div><p className="mb-1 text-[11px] font-bold uppercase text-ink-3">Your answer</p><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Write your answer or notes…" className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" /></div>
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase text-ink-3">Attach files</p>
                <div className="flex flex-wrap items-center gap-2">
                  {attachments.map((x, i) => <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs"><FileText className="size-3" /> {x.name} <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}><X className="size-3 text-red-500" /></button></span>)}
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2">{uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload<input type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label>
                </div>
              </div>
            </>
          ) : !graded && sub && (
            <div className="rounded-xl border border-hairline bg-surface-2 p-4 text-sm">
              <p className="font-bold text-ink">Submitted {fmtT(sub.submittedAt)} {sub.isLate && <Badge tone="warning">Late</Badge>}</p>
              <p className="mt-1 text-ink-3">Awaiting teacher review.</p>
              {sub.content && <p className="mt-2 whitespace-pre-wrap text-ink-2">{sub.content}</p>}
            </div>
          )}
        </div>
        {!locked && (
          <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">
            <button onClick={onClose} className="h-10 rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2">Close</button>
            <button onClick={draft} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-hairline px-4 text-xs font-bold text-ink hover:bg-surface-2 disabled:opacity-50"><Save className="size-3.5" /> Save Draft</button>
            <button onClick={submit} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Submit</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-hairline py-8 text-center text-sm text-ink-3">{text}</p>; }
function Loading() { return <div className="flex items-center justify-center py-16 text-sm font-bold text-ink-3"><Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading…</div>; }
