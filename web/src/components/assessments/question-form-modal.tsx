"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, Paperclip } from "lucide-react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import {
  createQuestion, updateQuestion, uploadAssessmentFile, QUESTION_TYPES, OBJECTIVE_QUESTION_TYPES,
  type Question,
} from "@/lib/api";

type Opt = { id: string; text: string; correct?: boolean };
type Pair = { left: string; right: string };
type Rubric = { name: string; max: number };

const TYPE_LABELS: Record<string, string> = {
  MCQ: "Multiple Choice", TRUE_FALSE: "True / False", FILL_BLANK: "Fill in the Blank",
  MATCH: "Match the Following", SHORT_ANSWER: "Short Answer", LONG_ANSWER: "Long Answer",
  ESSAY: "Essay", CODING: "Coding", AUDIO: "Audio Response", SPEAKING: "Speaking Test", FILE_UPLOAD: "File Upload",
};

const input = "h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent";
const label = "block text-xs font-bold text-ink-3 uppercase mb-1";

export function QuestionFormModal({ open, onClose, onSaved, question, subjects }: {
  open: boolean; onClose: () => void; onSaved: () => void; question?: Question | null; subjects: string[];
}) {
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [type, setType] = useState("MCQ");
  const [text, setText] = useState("");
  const [marks, setMarks] = useState(1);
  const [negativeMarks, setNegativeMarks] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(60);
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState<Opt[]>([{ id: "a", text: "", correct: false }, { id: "b", text: "", correct: false }]);
  const [tfAnswer, setTfAnswer] = useState("true");
  const [fillAnswer, setFillAnswer] = useState("");
  const [pairs, setPairs] = useState<Pair[]>([{ left: "", right: "" }, { left: "", right: "" }]);
  const [rubric, setRubric] = useState<Rubric[]>([]);
  const [media, setMedia] = useState<{ url: string; name: string; kind?: string }[]>([]);
  const [language, setLanguage] = useState("javascript");
  const [testCases, setTestCases] = useState<{ input: string; expected: string; sample?: boolean }[]>([{ input: "", expected: "", sample: true }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (question) {
      setSubject(question.subject); setChapter(question.chapter ?? ""); setTopic(question.topic ?? "");
      setCategory(question.category ?? ""); setDifficulty(question.difficulty); setType(question.type);
      setText(question.text); setMarks(question.marks); setNegativeMarks(question.negativeMarks);
      setEstimatedTime(question.estimatedTime); setExplanation(question.explanation ?? "");
      setRubric((question.rubric as Rubric[]) ?? []); setMedia(question.media ?? []);
      setLanguage(question.language ?? "javascript");
      setTestCases(question.testCases?.length ? question.testCases : [{ input: "", expected: "", sample: true }]);
      if (question.type === "MCQ" && question.options) setOptions(question.options.map((o) => ({ id: o.id, text: o.text, correct: o.correct })));
      if (question.type === "MATCH" && question.options) setPairs((question.options as unknown as Pair[]).map((p) => ({ left: p.left, right: p.right })));
      if (question.type === "TRUE_FALSE") setTfAnswer(question.correctAnswer ?? "true");
      if (question.type === "FILL_BLANK") setFillAnswer(question.correctAnswer ?? "");
    } else {
      setSubject(subjects[0] ?? ""); setChapter(""); setTopic(""); setCategory(""); setDifficulty("MEDIUM");
      setType("MCQ"); setText(""); setMarks(1); setNegativeMarks(0); setEstimatedTime(60); setExplanation("");
      setOptions([{ id: "a", text: "", correct: false }, { id: "b", text: "", correct: false }]);
      setTfAnswer("true"); setFillAnswer(""); setPairs([{ left: "", right: "" }, { left: "", right: "" }]);
      setRubric([]); setMedia([]); setLanguage("javascript"); setTestCases([{ input: "", expected: "", sample: true }]);
    }
  }, [open, question, subjects]);

  if (!open) return null;
  const isObjective = OBJECTIVE_QUESTION_TYPES.includes(type);
  const isSubjective = !isObjective;

  const attach = async (file: File) => {
    try {
      const up = await uploadAssessmentFile(file);
      const kind = /\.(png|jpe?g|gif|webp)$/i.test(file.name) ? "image" : /\.(mp3|wav|m4a|ogg)$/i.test(file.name) ? "audio" : /\.(mp4|webm|mov)$/i.test(file.name) ? "video" : "file";
      setMedia((m) => [...m, { ...up, kind }]);
    } catch { Swal.fire({ title: "Upload failed", icon: "error" }); }
  };

  const save = async () => {
    if (!subject.trim() || !text.trim()) { Swal.fire({ title: "Subject and question text are required.", icon: "error" }); return; }
    const dto: Record<string, unknown> = {
      subject: subject.trim(), chapter: chapter || undefined, topic: topic || undefined, category: category || undefined,
      difficulty, type, text: text.trim(), marks: Number(marks) || 1, negativeMarks: Number(negativeMarks) || 0,
      estimatedTime: Number(estimatedTime) || 60, explanation: explanation || undefined, media,
    };
    if (type === "MCQ") {
      const cleaned = options.filter((o) => o.text.trim());
      if (cleaned.length < 2) { Swal.fire({ title: "Add at least 2 options.", icon: "error" }); return; }
      if (!cleaned.some((o) => o.correct)) { Swal.fire({ title: "Mark at least one correct option.", icon: "error" }); return; }
      dto.options = cleaned;
    } else if (type === "TRUE_FALSE") dto.correctAnswer = tfAnswer;
    else if (type === "FILL_BLANK") { if (!fillAnswer.trim()) { Swal.fire({ title: "Enter the correct answer.", icon: "error" }); return; } dto.correctAnswer = fillAnswer.trim(); }
    else if (type === "MATCH") { const cleaned = pairs.filter((p) => p.left.trim() && p.right.trim()); if (cleaned.length < 2) { Swal.fire({ title: "Add at least 2 match pairs.", icon: "error" }); return; } dto.options = cleaned; }
    if (type === "CODING") { dto.language = language; dto.testCases = testCases.filter((t) => t.input.trim() || t.expected.trim()); }
    if (isSubjective && rubric.length) dto.rubric = rubric.filter((r) => r.name.trim());

    setSaving(true);
    try {
      if (question) await updateQuestion(question.id, dto); else await createQuestion(dto);
      onSaved(); onClose();
    } catch (e) { Swal.fire({ title: "Save failed", text: (e as Error).message, icon: "error" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-hairline bg-surface shadow-2xl text-ink">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface px-6 py-4">
          <h3 className="text-base font-bold">{question ? "Edit Question" : "New Question"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </header>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={label}>Subject *</label>
              <input list="q-subjects" className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathematics" />
              <datalist id="q-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div><label className={label}>Chapter</label><input className={input} value={chapter} onChange={(e) => setChapter(e.target.value)} /></div>
            <div><label className={label}>Topic</label><input className={input} value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
            <div><label className={label}>Category</label><input className={input} value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><label className={label}>Type</label>
              <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div><label className={label}>Difficulty</label>
              <select className={input} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {["EASY", "MEDIUM", "HARD"].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div><label className={label}>Marks</label><input type="number" min={0} className={input} value={marks} onChange={(e) => setMarks(Number(e.target.value))} /></div>
            <div><label className={label}>Neg. marks</label><input type="number" min={0} step={0.25} className={input} value={negativeMarks} onChange={(e) => setNegativeMarks(Number(e.target.value))} /></div>
          </div>

          <div>
            <label className={label}>Question Text *</label>
            <textarea rows={3} className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-y" value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter the question…" />
          </div>

          {/* Media */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-3">
              <Paperclip className="size-3.5" /> Attach media
              <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }} />
            </label>
            {media.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-1 text-[11px] font-semibold text-accent">
                {m.name}<button onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}><X className="size-3" /></button>
              </span>
            ))}
          </div>

          {/* Type-specific editors */}
          {type === "MCQ" && (
            <div className="space-y-2">
              <label className={label}>Options (tick the correct one/s)</label>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={!!o.correct} onChange={(e) => setOptions((arr) => arr.map((x, j) => j === i ? { ...x, correct: e.target.checked } : x))} className="size-4 accent-emerald-500" />
                  <input className={input} value={o.text} onChange={(e) => setOptions((arr) => arr.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} placeholder={`Option ${i + 1}`} />
                  {options.length > 2 && <button onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))} className="text-ink-3 hover:text-critical"><Trash2 className="size-4" /></button>}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setOptions((arr) => [...arr, { id: String.fromCharCode(97 + arr.length), text: "", correct: false }])}><Plus className="size-3.5" /> Add option</Button>
            </div>
          )}

          {type === "TRUE_FALSE" && (
            <div><label className={label}>Correct Answer</label>
              <div className="flex gap-3">
                {["true", "false"].map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm font-semibold capitalize"><input type="radio" name="tf" checked={tfAnswer === v} onChange={() => setTfAnswer(v)} className="accent-accent" />{v}</label>
                ))}
              </div>
            </div>
          )}

          {type === "FILL_BLANK" && (
            <div><label className={label}>Correct Answer (use | for alternatives)</label>
              <input className={input} value={fillAnswer} onChange={(e) => setFillAnswer(e.target.value)} placeholder="four | 4" /></div>
          )}

          {type === "MATCH" && (
            <div className="space-y-2">
              <label className={label}>Match Pairs (Left ↔ Right)</label>
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={input} value={p.left} onChange={(e) => setPairs((arr) => arr.map((x, j) => j === i ? { ...x, left: e.target.value } : x))} placeholder="Left" />
                  <span className="text-ink-3">↔</span>
                  <input className={input} value={p.right} onChange={(e) => setPairs((arr) => arr.map((x, j) => j === i ? { ...x, right: e.target.value } : x))} placeholder="Right" />
                  {pairs.length > 2 && <button onClick={() => setPairs((arr) => arr.filter((_, j) => j !== i))} className="text-ink-3 hover:text-critical"><Trash2 className="size-4" /></button>}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setPairs((arr) => [...arr, { left: "", right: "" }])}><Plus className="size-3.5" /> Add pair</Button>
            </div>
          )}

          {type === "CODING" && (
            <div className="space-y-2 rounded-xl border border-hairline bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <label className={label + " mb-0"}>Coding — language & test cases</label>
                <select className="h-9 rounded-lg border border-hairline bg-surface px-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {["javascript", "python", "java", "cpp", "c", "other"].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-ink-3">Student writes a <code>solve(input)</code> function that returns the output. JavaScript runs live in the browser sandbox; other languages are graded by the teacher.</p>
              {testCases.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={input} value={t.input} onChange={(e) => setTestCases((arr) => arr.map((x, j) => j === i ? { ...x, input: e.target.value } : x))} placeholder="input" />
                  <span className="text-ink-3">→</span>
                  <input className={input} value={t.expected} onChange={(e) => setTestCases((arr) => arr.map((x, j) => j === i ? { ...x, expected: e.target.value } : x))} placeholder="expected output" />
                  <label className="flex items-center gap-1 text-[10px] text-ink-3" title="Visible sample"><input type="checkbox" checked={!!t.sample} onChange={(e) => setTestCases((arr) => arr.map((x, j) => j === i ? { ...x, sample: e.target.checked } : x))} className="size-3.5 accent-accent" />sample</label>
                  {testCases.length > 1 && <button onClick={() => setTestCases((arr) => arr.filter((_, j) => j !== i))} className="text-ink-3 hover:text-critical"><Trash2 className="size-4" /></button>}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setTestCases((arr) => [...arr, { input: "", expected: "", sample: false }])}><Plus className="size-3.5" /> Add test case</Button>
            </div>
          )}

          {isSubjective && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={label + " mb-0"}>Grading Rubric (optional)</label>
                <Button variant="outline" size="sm" onClick={() => setRubric((r) => [...r, { name: "", max: 5 }])}><Plus className="size-3.5" /> Add criterion</Button>
              </div>
              {rubric.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={input} value={r.name} onChange={(e) => setRubric((arr) => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="e.g. Understanding" />
                  <input type="number" min={1} className="h-10 w-24 rounded-xl border border-hairline bg-surface-2 px-3 text-sm" value={r.max} onChange={(e) => setRubric((arr) => arr.map((x, j) => j === i ? { ...x, max: Number(e.target.value) } : x))} />
                  <button onClick={() => setRubric((arr) => arr.filter((_, j) => j !== i))} className="text-ink-3 hover:text-critical"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
          )}

          <div><label className={label}>Explanation (shown after submission)</label>
            <textarea rows={2} className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-y" value={explanation} onChange={(e) => setExplanation(e.target.value)} /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Est. time (seconds)</label><input type="number" min={0} className={input} value={estimatedTime} onChange={(e) => setEstimatedTime(Number(e.target.value))} /></div>
          </div>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-hairline bg-surface px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : question ? "Save Changes" : "Add Question"}</Button>
        </footer>
      </div>
    </div>
  );
}
