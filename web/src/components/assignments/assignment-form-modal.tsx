"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Upload, Send, FileText, Sparkles } from "lucide-react";
import Swal from "sweetalert2";

import { RichText } from "./rich-text";
import {
  fetchAssignmentMeta, fetchTargetStudents, createAssignment, updateAssignment, assignmentLifecycle, uploadAssignmentFile,
  type AssignmentDetail, type AssignmentAttachment, type RubricItem,
} from "@/lib/api";

const inp = "h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent";
const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const toast = (t: string, icon: "success" | "error" = "success") => Swal.fire({ toast: true, position: "top-end", icon, title: t, showConfirmButton: false, timer: 1800 });
const fail = (e: unknown) => Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() });
const TYPES = ["HOMEWORK", "WORKSHEET", "ESSAY", "PROJECT", "PRESENTATION", "READING", "CODING", "MCQ", "FILE_UPLOAD", "RESEARCH", "SPEAKING_TASK", "LISTENING_TASK"];
const FILE_TYPES = ["pdf", "docx", "zip", "png", "jpg", "mp4", "mp3", "txt", "py", "js"];

// Rule-based "quick generate" (template), labelled honestly — not an LLM.
function generateTemplate(type: string, topic: string, difficulty: string): { description: string; instructions: string; rubric: RubricItem[] } {
  const t = topic || "the topic";
  const desc = `<p>A <b>${difficulty.toLowerCase()}</b> ${type.replace(/_/g, " ").toLowerCase()} on <b>${t}</b>.</p><ul><li>Review the material on ${t}.</li><li>Complete all parts and submit before the deadline.</li></ul>`;
  const instr = `<ol><li>Read the reference material carefully.</li><li>Answer every question in your own words.</li><li>Cite any sources you use.</li><li>Submit as a single file where required.</li></ol>`;
  const rubric = type === "ESSAY" || type === "RESEARCH"
    ? [{ name: "Content", max: 40 }, { name: "Structure", max: 20 }, { name: "Language", max: 20 }, { name: "Originality", max: 20 }]
    : [{ name: "Accuracy", max: 50 }, { name: "Completeness", max: 30 }, { name: "Presentation", max: 20 }];
  return { description: desc, instructions: instr, rubric };
}

export function AssignmentFormModal({ editing, onClose, onSaved }: { editing: AssignmentDetail | null; onClose: () => void; onSaved: () => void }) {
  const [meta, setMeta] = useState<{ courses: { id: string; title: string }[]; batches: { id: string; code: string; name: string }[] }>({ courses: [], batches: [] });
  const [candidates, setCandidates] = useState<{ id: string; studentCode: string; name: string }[]>([]);
  const [f, setF] = useState({
    title: editing?.title ?? "", courseId: editing?.courseId ?? "", batchId: editing?.batchId ?? "",
    subject: editing?.subject ?? "", chapter: editing?.chapter ?? "", topic: editing?.topic ?? "",
    difficulty: editing?.difficulty ?? "MEDIUM", type: editing?.type ?? "HOMEWORK",
    dueAt: editing?.dueAt ? editing.dueAt.slice(0, 16) : "", maxMarks: String(editing?.maxMarks ?? 100), passingMarks: String(editing?.passingMarks ?? 40),
    lateAllowed: editing?.lateAllowed ?? true, latePenaltyPct: String(editing?.latePenaltyPct ?? 0),
    publishAt: editing?.publishAt ? editing.publishAt.slice(0, 16) : "", status: editing?.status && editing.status !== "PUBLISHED" ? editing.status : "DRAFT",
    targetType: editing?.targetType ?? "BATCH", maxFileSizeMb: editing?.maxFileSizeMb ? String(editing.maxFileSizeMb) : "",
  });
  const [description, setDescription] = useState(editing?.description ?? "");
  const [instructions, setInstructions] = useState(editing?.instructions ?? "");
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>(editing?.attachments ?? []);
  const [rubric, setRubric] = useState<RubricItem[]>(editing?.rubric ?? []);
  const [allowedFileTypes, setAllowedFileTypes] = useState<string[]>(editing?.allowedFileTypes ?? []);
  const [selected, setSelected] = useState<string[]>(editing?.targetStudentIds ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { fetchAssignmentMeta().then(setMeta).catch(() => undefined); }, []);
  useEffect(() => {
    if (f.targetType === "SELECTED") fetchTargetStudents(f.courseId || undefined, f.batchId || undefined).then(setCandidates).catch(() => undefined);
  }, [f.targetType, f.courseId, f.batchId]);

  const upload = async (file?: File) => { if (!file) return; setUploading(true); try { const a = await uploadAssignmentFile(file); setAttachments((x) => [...x, a]); } catch (e) { fail(e); } finally { setUploading(false); } };
  const quickGen = () => { const g = generateTemplate(f.type, f.topic, f.difficulty); setDescription(g.description); setInstructions(g.instructions); if (rubric.length === 0) setRubric(g.rubric); toast("Template generated — edit as needed"); };

  const save = async (publish: boolean) => {
    if (!f.title || !f.courseId) return toast("Title + course required", "error");
    if (f.targetType === "SELECTED" && selected.length === 0) return toast("Pick at least one student", "error");
    setBusy(true);
    const dto = {
      title: f.title, courseId: f.courseId, batchId: f.batchId || undefined, subject: f.subject || undefined,
      chapter: f.chapter || undefined, topic: f.topic || undefined, difficulty: f.difficulty, type: f.type,
      description: description || undefined, instructions: instructions || undefined,
      dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : undefined, maxMarks: Number(f.maxMarks), passingMarks: Number(f.passingMarks),
      lateAllowed: f.lateAllowed, latePenaltyPct: Number(f.latePenaltyPct),
      publishAt: f.status === "SCHEDULED" && f.publishAt ? new Date(f.publishAt).toISOString() : undefined,
      status: publish ? "PUBLISHED" : f.status, attachments, rubric,
      targetType: f.targetType, targetStudentIds: f.targetType === "SELECTED" ? selected : [],
      allowedFileTypes, maxFileSizeMb: f.maxFileSizeMb ? Number(f.maxFileSizeMb) : undefined,
    };
    try {
      if (editing) { await updateAssignment(editing.id, dto); if (publish && editing.status !== "PUBLISHED") await assignmentLifecycle(editing.id, "publish"); }
      else await createAssignment(dto);
      toast(publish ? "Published" : "Saved"); onSaved();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-3xl rounded-2xl border border-hairline bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <h3 className="text-sm font-black text-ink">{editing ? "Edit Assignment" : "New Assignment"}</h3>
          <div className="flex items-center gap-2">
            <button onClick={quickGen} className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-xs font-bold text-accent hover:bg-surface-2"><Sparkles className="size-3.5" /> Quick generate</button>
            <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><X className="size-4" /></button>
          </div>
        </div>
        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
          <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. English Grammar Worksheet 5" className={inp} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Course"><select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })} className={inp}><option value="">Select…</option>{meta.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
            <Field label="Batch (optional)"><select value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })} className={inp}><option value="">Whole course</option>{meta.batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></Field>
            <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inp}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Subject"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className={inp} /></Field>
            <Field label="Chapter"><input value={f.chapter} onChange={(e) => setF({ ...f, chapter: e.target.value })} className={inp} /></Field>
            <Field label="Topic"><input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} className={inp} /></Field>
            <Field label="Difficulty"><select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })} className={inp}>{["EASY", "MEDIUM", "HARD"].map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
          </div>
          <Field label="Description"><RichText value={description} onChange={setDescription} placeholder="Describe the assignment…" /></Field>
          <Field label="Instructions"><RichText value={instructions} onChange={setInstructions} placeholder="Read Chapter 5. Upload PDF only. Max 5 pages." /></Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Due date & time"><input type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} className={inp} /></Field>
            <Field label="Max marks"><input type="number" value={f.maxMarks} onChange={(e) => setF({ ...f, maxMarks: e.target.value })} className={inp} /></Field>
            <Field label="Passing marks"><input type="number" value={f.passingMarks} onChange={(e) => setF({ ...f, passingMarks: e.target.value })} className={inp} /></Field>
            <Field label="Late penalty %"><input type="number" value={f.latePenaltyPct} onChange={(e) => setF({ ...f, latePenaltyPct: e.target.value })} className={inp} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-bold text-ink-2"><input type="checkbox" checked={f.lateAllowed} onChange={(e) => setF({ ...f, lateAllowed: e.target.checked })} /> Late submission allowed</label>
            <Field label="Max file size (MB)"><input type="number" value={f.maxFileSizeMb} onChange={(e) => setF({ ...f, maxFileSizeMb: e.target.value })} placeholder="any" className="h-10 w-28 rounded-xl border border-hairline bg-surface px-3 text-sm" /></Field>
            <Field label="Publish"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={inp}><option value="DRAFT">Save as Draft</option><option value="SCHEDULED">Schedule</option></select></Field>
            {f.status === "SCHEDULED" && <Field label="Publish at"><input type="datetime-local" value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} className={inp} /></Field>}
          </div>

          {/* Allowed file types */}
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Allowed file types (empty = any)</p>
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setAllowedFileTypes(allowedFileTypes.includes(t) ? allowedFileTypes.filter((x) => x !== t) : [...allowedFileTypes, t])} className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${allowedFileTypes.includes(t) ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3 hover:bg-surface-2"}`}>{t}</button>
              ))}
            </div>
          </div>

          {/* Target audience */}
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Target audience</p>
            <div className="flex gap-1.5">
              {(["BATCH", "SELECTED"] as const).map((t) => <button key={t} type="button" onClick={() => setF({ ...f, targetType: t })} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${f.targetType === t ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3 hover:bg-surface-2"}`}>{t === "BATCH" ? "Entire batch / course" : "Selected students"}</button>)}
            </div>
            {f.targetType === "SELECTED" && (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-hairline p-2">
                {candidates.length === 0 ? <p className="p-2 text-xs text-ink-3">Pick a course/batch to load students.</p> : candidates.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                    <input type="checkbox" checked={selected.includes(s.id)} onChange={() => setSelected(selected.includes(s.id) ? selected.filter((x) => x !== s.id) : [...selected, s.id])} />
                    <span className="text-ink">{s.name}</span><span className="text-xs text-ink-3">{s.studentCode}</span>
                  </label>
                ))}
                {candidates.length > 0 && <p className="px-2 pt-1 text-[11px] text-ink-3">{selected.length} selected</p>}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Attachments</p>
            <div className="flex flex-wrap items-center gap-2">
              {attachments.map((a, i) => <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs"><FileText className="size-3" /> {a.name} <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}><X className="size-3 text-red-500" /></button></span>)}
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2">{uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload<input type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label>
            </div>
          </div>

          {/* Rubric */}
          <div>
            <div className="mb-1 flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Rubric (evaluation criteria)</p><button onClick={() => setRubric([...rubric, { name: "", max: 20 }])} className="text-[11px] font-bold text-accent">+ Add criterion</button></div>
            {rubric.map((r, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2">
                <input value={r.name} onChange={(e) => setRubric(rubric.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="e.g. Content" className={inp} />
                <input type="number" value={r.max} onChange={(e) => setRubric(rubric.map((x, j) => j === i ? { ...x, max: Number(e.target.value) } : x))} className="h-10 w-24 rounded-xl border border-hairline bg-surface px-3 text-sm" />
                <button onClick={() => setRubric(rubric.filter((_, j) => j !== i))}><X className="size-4 text-red-500" /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">
          <button onClick={onClose} className="h-10 rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2">Cancel</button>
          <button onClick={() => save(false)} disabled={busy} className="h-10 rounded-xl border border-hairline px-4 text-xs font-bold text-ink hover:bg-surface-2 disabled:opacity-50">Save Draft</button>
          <button onClick={() => save(true)} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Publish</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-3">{label}</span>{children}</label>; }
