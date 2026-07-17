"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock, FileText, Play, CheckCircle2, XCircle, MinusCircle, Flag, ChevronLeft, ChevronRight,
  Send, AlertTriangle, Award, Loader2, Mic, Upload, Trophy,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchMyAssessments, takeAssessment, saveAssessmentAnswer, submitAssessmentAttempt, fetchAttemptResult,
  fetchAttemptCertificate, uploadAssessmentFile,
  type StudentAssessmentRow, type TakePayload, type AttemptResult,
} from "@/lib/api";

const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const STATUS_TONE: Record<string, Tone> = { PUBLISHED: "good", CLOSED: "neutral", LIVE: "accent" };

type View = { mode: "list" } | { mode: "run"; data: TakePayload } | { mode: "result"; attemptId: string };

export default function StudentAssessmentsPage() {
  const [view, setView] = useState<View>({ mode: "list" });
  const [rows, setRows] = useState<StudentAssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => { setLoading(true); fetchMyAssessments().then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const start = async (id: string) => {
    try {
      const data = await takeAssessment(id);
      const ok = await Swal.fire({
        title: data.title, html: `<div style="text-align:left;font-size:13px"><p><b>Duration:</b> ${data.durationMin} min</p><p><b>Questions:</b> ${data.questions.length}</p><p><b>Total marks:</b> ${data.totalMarks}</p>${data.instructions ? `<hr/><p>${data.instructions}</p>` : ""}<hr/><p style="color:#f5a623">The timer starts now. Do not close the tab.</p></div>`,
        icon: "info", showCancelButton: true, confirmButtonText: "Agree & Start", background: swalBg(),
      });
      if (ok.isConfirmed) setView({ mode: "run", data });
    } catch (e) { Swal.fire({ title: "Cannot start", text: (e as Error).message, icon: "error", background: swalBg() }); }
  };

  if (view.mode === "run") return <Runner data={view.data} onDone={(attemptId) => { load(); setView({ mode: "result", attemptId }); }} onExit={() => { load(); setView({ mode: "list" }); }} />;
  if (view.mode === "result") return <Result attemptId={view.attemptId} onBack={() => setView({ mode: "list" })} />;

  const toSubmit = rows.filter((r) => r.canAttempt || r.inProgressAttemptId);
  const done = rows.filter((r) => !r.canAttempt && !r.inProgressAttemptId);

  return (
    <>
      <Topbar title="Assessments" subtitle="Your tests, timers and results" />
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        {loading ? <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-accent" /></div> : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Play className="size-4 text-accent" /> Upcoming & Available ({toSubmit.length})</h2>
              <div className="space-y-3">
                {toSubmit.length === 0 && <Card><CardBody className="py-8 text-center text-sm text-ink-3">Nothing to attempt right now.</CardBody></Card>}
                {toSubmit.map((r) => (
                  <Card key={r.id}><CardBody className="space-y-2">
                    <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-ink">{r.title}</p><p className="text-xs text-ink-3">{r.course ?? r.subject ?? ""}{r.teacher ? ` · ${r.teacher}` : ""}</p></div><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.type}</Badge></div>
                    <div className="flex flex-wrap gap-3 text-xs text-ink-3"><span className="flex items-center gap-1"><Clock className="size-3.5" /> {r.durationMin}m</span><span className="flex items-center gap-1"><FileText className="size-3.5" /> {r.questions} Qs · {r.totalMarks} marks</span>{r.startAt && <span>Starts {new Date(r.startAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>}</div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-ink-3">{r.attemptsAllowed === 0 ? "Unlimited attempts" : `Attempt ${r.attemptsUsed + 1} of ${r.attemptsAllowed}`}</span>
                      <Button variant="primary" size="sm" disabled={!r.windowOpen} onClick={() => start(r.id)}><Play className="size-3.5" /> {r.inProgressAttemptId ? "Resume" : "Start"}</Button>
                    </div>
                  </CardBody></Card>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><CheckCircle2 className="size-4 text-emerald-500" /> Submitted & Results ({done.length})</h2>
              <div className="space-y-3">
                {done.length === 0 && <Card><CardBody className="py-8 text-center text-sm text-ink-3">No completed assessments yet.</CardBody></Card>}
                {done.map((r) => (
                  <Card key={r.id}><CardBody className="space-y-2">
                    <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-ink">{r.title}</p><p className="text-xs text-ink-3">{r.course ?? r.subject ?? ""}</p></div>{r.lastAttempt?.published ? <Badge tone={r.lastAttempt.passed ? "good" : "critical"}>{r.lastAttempt.passed ? "Passed" : "Failed"}</Badge> : <Badge tone="warning">{r.lastAttempt?.status === "SUBMITTED" ? "Awaiting result" : r.lastAttempt?.status ?? "Done"}</Badge>}</div>
                    {r.lastAttempt?.published && <div className="text-sm font-bold text-ink">{Math.round(r.lastAttempt.score)}/{r.lastAttempt.totalMarks} <span className="text-ink-3">({r.lastAttempt.percentage}%)</span></div>}
                    {r.lastAttempt?.published && <Button variant="outline" size="sm" onClick={() => setView({ mode: "result", attemptId: r.lastAttempt!.id })}>View Result</Button>}
                  </CardBody></Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Test runner ─────────────────────────────────────────────────────────────
function Runner({ data, onDone, onExit }: { data: TakePayload; onDone: (attemptId: string) => void; onExit: () => void }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => Object.fromEntries(data.questions.filter((q) => q.savedResponse != null).map((q) => [q.questionId, q.savedResponse])));
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(data.questions.filter((q) => q.markedForReview).map((q) => [q.questionId, true])));
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(data.remainingSec);
  const [submitting, setSubmitting] = useState(false);
  const [violations, setViolations] = useState(0);
  const submittedRef = useRef(false);
  const timeRef = useRef<Record<string, number>>({});
  const proctorRef = useRef<{ type: string; at: string }[]>([]);
  const q = data.questions[idx];
  const curQidRef = useRef(q.questionId);
  curQidRef.current = q?.questionId;

  const persist = useCallback((questionId: string, response: unknown, marked: boolean) => {
    saveAssessmentAnswer(data.attemptId, { questionId, response, markedForReview: marked, timeSpentSec: timeRef.current[questionId] }).catch(() => {});
  }, [data.attemptId]);

  const doSubmit = useCallback(async (auto: boolean) => {
    if (submittedRef.current) return;
    submittedRef.current = true; setSubmitting(true);
    try {
      const payload = data.questions.map((qq) => ({ questionId: qq.questionId, response: answers[qq.questionId], markedForReview: !!flags[qq.questionId], timeSpentSec: timeRef.current[qq.questionId] }));
      const res = await submitAssessmentAttempt(data.attemptId, { autoSubmitted: auto, timeSpentSec: data.durationMin * 60 - remaining, violations: proctorRef.current.length, proctorLog: proctorRef.current, answers: payload });
      onDone(res.attemptId);
    } catch (e) { submittedRef.current = false; setSubmitting(false); Swal.fire({ title: "Submit failed", text: (e as Error).message, icon: "error", background: swalBg() }); }
  }, [answers, flags, data, remaining, onDone]);

  // Countdown + auto-submit + per-question time.
  useEffect(() => {
    const t = setInterval(() => {
      if (curQidRef.current) timeRef.current[curQidRef.current] = (timeRef.current[curQidRef.current] ?? 0) + 1;
      setRemaining((r) => { if (r <= 1) { clearInterval(t); doSubmit(true); return 0; } return r - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [doSubmit]);

  // Proctoring: flag tab-switches / copy attempts, warn, auto-submit after 3.
  useEffect(() => {
    if (!data.proctored) return;
    const flag = (type: string) => {
      proctorRef.current.push({ type, at: new Date().toISOString() });
      const v = proctorRef.current.length; setViolations(v);
      if (v >= 3) { Swal.fire({ title: "Test auto-submitted", text: "Too many violations detected.", icon: "error", background: swalBg() }); doSubmit(true); }
      else Swal.fire({ title: "⚠️ Warning", text: `Leaving the test window is not allowed (${v}/3). The test auto-submits on the 3rd violation.`, icon: "warning", background: swalBg() });
    };
    const onVis = () => { if (document.hidden) flag("tab-hidden"); };
    const onCopy = (e: Event) => { e.preventDefault(); flag("copy"); };
    const onCtx = (e: Event) => e.preventDefault();
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("copy", onCopy);
    document.addEventListener("contextmenu", onCtx);
    return () => { document.removeEventListener("visibilitychange", onVis); document.removeEventListener("copy", onCopy); document.removeEventListener("contextmenu", onCtx); };
  }, [data.proctored, doSubmit]);

  // Auto-save current answer every 30s.
  useEffect(() => {
    const t = setInterval(() => { if (q) persist(q.questionId, answers[q.questionId], !!flags[q.questionId]); }, 30_000);
    return () => clearInterval(t);
  }, [q, answers, flags, persist]);

  const setAns = (response: unknown) => { setAnswers((a) => ({ ...a, [q.questionId]: response })); persist(q.questionId, response, !!flags[q.questionId]); };
  const toggleFlag = () => { const nv = !flags[q.questionId]; setFlags((f) => ({ ...f, [q.questionId]: nv })); persist(q.questionId, answers[q.questionId], nv); };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const answered = data.questions.filter((qq) => answers[qq.questionId] != null && (Array.isArray(answers[qq.questionId]) ? (answers[qq.questionId] as unknown[]).length : String(answers[qq.questionId]).trim())).length;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-6">
        <div><p className="text-sm font-bold text-ink">{data.title}</p><p className="text-[11px] text-ink-3">{answered}/{data.questions.length} answered</p></div>
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-bold ${remaining < 60 ? "bg-critical/10 text-critical animate-pulse" : "bg-surface-2 text-ink"}`}><Clock className="size-4" /> {mm}:{ss}</div>
        <Button variant="primary" size="sm" onClick={() => Swal.fire({ title: "Submit assessment?", text: `${answered}/${data.questions.length} answered. You cannot change answers after submitting.`, icon: "question", showCancelButton: true, confirmButtonText: "Submit", background: swalBg() }).then((r) => { if (r.isConfirmed) doSubmit(false); })} disabled={submitting}>{submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit</Button>
      </header>

      {data.proctored && (
        <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold ${violations ? "bg-critical/15 text-critical" : "bg-amber-500/10 text-amber-600"}`}>
          <AlertTriangle className="size-3.5" /> Proctored test — do not switch tabs or copy. {violations > 0 && `Violations: ${violations}/3`}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><span className="text-sm font-bold text-ink-3">Question {idx + 1} of {data.questions.length}</span><Badge tone="neutral">{q.type}</Badge><Badge tone="accent">{q.marks} marks</Badge></div>
              <button onClick={toggleFlag} className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${flags[q.questionId] ? "bg-amber-500/15 text-amber-500" : "text-ink-3 hover:bg-surface-2"}`}><Flag className="size-3.5" /> {flags[q.questionId] ? "Marked" : "Mark for review"}</button>
            </div>
            <p className="whitespace-pre-wrap text-base font-medium text-ink">{q.text}</p>
            {q.media?.map((m, i) => (
              <div key={i}>{m.kind === "image" ? <img src={m.url.startsWith("http") ? m.url : `${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? ""}${m.url}`} alt={m.name} className="max-h-64 rounded-xl border border-hairline" /> : m.kind === "audio" ? <audio controls src={m.url} /> : m.kind === "video" ? <video controls className="max-h-64 rounded-xl" src={m.url} /> : <a href={m.url} className="text-accent underline">{m.name}</a>}</div>
            ))}
            <AnswerInput q={q} value={answers[q.questionId]} onChange={setAns} attemptId={data.attemptId} />

            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" disabled={!data.allowBack || idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}><ChevronLeft className="size-4" /> Previous</Button>
              {idx < data.questions.length - 1 ? <Button variant="primary" onClick={() => setIdx((i) => i + 1)}>Next <ChevronRight className="size-4" /></Button> : <Button variant="primary" onClick={() => Swal.fire({ title: "Submit assessment?", icon: "question", showCancelButton: true, confirmButtonText: "Submit", background: swalBg() }).then((r) => { if (r.isConfirmed) doSubmit(false); })}>Finish <Send className="size-4" /></Button>}
            </div>
          </div>
        </main>

        <aside className="hidden w-56 shrink-0 overflow-y-auto border-l border-hairline p-4 sm:block">
          <p className="mb-2 text-xs font-bold uppercase text-ink-3">Questions</p>
          <div className="grid grid-cols-5 gap-1.5">
            {data.questions.map((qq, i) => {
              const has = answers[qq.questionId] != null && (Array.isArray(answers[qq.questionId]) ? (answers[qq.questionId] as unknown[]).length : String(answers[qq.questionId]).trim());
              return <button key={qq.questionId} onClick={() => setIdx(i)} className={`relative grid size-8 place-items-center rounded-lg text-xs font-bold ${i === idx ? "ring-2 ring-accent" : ""} ${has ? "bg-emerald-500/20 text-emerald-600" : "bg-surface-2 text-ink-3"}`}>{i + 1}{flags[qq.questionId] && <Flag className="absolute -right-1 -top-1 size-2.5 text-amber-500" />}</button>;
            })}
          </div>
          <div className="mt-4 space-y-1 text-[11px] text-ink-3">
            <p className="flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-500/20" /> Answered</p>
            <p className="flex items-center gap-1.5"><span className="size-3 rounded bg-surface-2" /> Not answered</p>
            <p className="flex items-center gap-1.5"><Flag className="size-3 text-amber-500" /> Marked</p>
          </div>
          <button onClick={() => Swal.fire({ title: "Leave the test?", text: "Your answers are saved; you can resume before the timer ends.", icon: "warning", showCancelButton: true, confirmButtonText: "Leave", background: swalBg() }).then((r) => { if (r.isConfirmed) onExit(); })} className="mt-4 text-xs text-ink-3 underline hover:text-critical">Save & exit</button>
        </aside>
      </div>
    </div>
  );
}

function AnswerInput({ q, value, onChange, attemptId }: { q: TakePayload["questions"][number]; value: unknown; onChange: (v: unknown) => void; attemptId: string }) {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);

  if (q.type === "MCQ" && q.options) {
    const picked = (Array.isArray(value) ? value : []) as string[];
    return <div className="space-y-2">{q.options.map((o) => (
      <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${picked.includes(o.id) ? "border-accent bg-accent-soft" : "border-hairline bg-surface-2"}`}>
        <input type="checkbox" checked={picked.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))} className="size-4 accent-accent" /><span className="text-ink">{o.text}</span>
      </label>
    ))}</div>;
  }
  if (q.type === "TRUE_FALSE") {
    return <div className="flex gap-3">{["true", "false"].map((v) => (
      <label key={v} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold capitalize ${value === v ? "border-accent bg-accent-soft" : "border-hairline bg-surface-2"}`}><input type="radio" checked={value === v} onChange={() => onChange(v)} className="accent-accent" />{v}</label>
    ))}</div>;
  }
  if (q.type === "FILL_BLANK") return <input className="h-11 w-full rounded-xl border border-hairline bg-surface-2 px-4 text-sm" placeholder="Your answer…" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  if (q.type === "MATCH" && q.matchPairs && q.matchOptions) {
    const map = (value as Record<string, string>) ?? {};
    return <div className="space-y-2">{q.matchPairs.map((left) => (
      <div key={left} className="flex items-center gap-3"><span className="w-40 text-sm text-ink">{left}</span><span className="text-ink-3">→</span>
        <select className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-sm" value={map[left] ?? ""} onChange={(e) => onChange({ ...map, [left]: e.target.value })}><option value="">Select…</option>{q.matchOptions!.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      </div>
    ))}</div>;
  }
  if (["AUDIO", "SPEAKING"].includes(q.type)) {
    const rec = async () => {
      if (recording) { recRef.current?.stop(); setRecording(false); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream); const chunks: Blob[] = [];
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const file = new File([new Blob(chunks, { type: "audio/webm" })], `answer-${attemptId}.webm`); const up = await uploadAssessmentFile(file); onChange(up.url); };
        recRef.current = mr; mr.start(); setRecording(true);
      } catch { Swal.fire({ title: "Mic access denied", icon: "error", background: swalBg() }); }
    };
    return <div className="space-y-2"><Button variant={recording ? "primary" : "outline"} onClick={rec}><Mic className="size-4" /> {recording ? "Stop recording" : "Record answer"}</Button>{typeof value === "string" && value && <audio controls src={value} className="w-full" />}</div>;
  }
  if (q.type === "FILE_UPLOAD") {
    return <div className="space-y-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-hairline bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:bg-surface-3"><Upload className="size-4" /> Upload file<input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const up = await uploadAssessmentFile(f); onChange(up.url); } }} /></label>{typeof value === "string" && value && <a href={value} className="block text-xs text-accent underline">Uploaded ✓</a>}</div>;
  }
  if (q.type === "CODING") return <CodingInput q={q} value={value} onChange={onChange} />;
  // SHORT_ANSWER / LONG_ANSWER / ESSAY
  return <textarea rows={q.type === "SHORT_ANSWER" ? 3 : 6} className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Type your answer…" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

// Runs `solve(input)` from user JS against the sample test cases in a sandboxed
// Web Worker (no DOM/network access), with a hard timeout. Client-side aid only —
// the teacher/grader is the source of truth for the mark.
function runJavaScript(code: string, cases: { input: string; expected: string }[]): Promise<{ input: string; expected: string; got: string; ok: boolean }[]> {
  return new Promise((resolve) => {
    const src = `self.onmessage=function(e){var code=e.data.code,cases=e.data.cases,out=[];try{var solve;eval(code+"\\n; solve = (typeof solve!=='undefined')?solve:null;");if(typeof solve!=='function'){self.postMessage([{error:'Define a function solve(input)'}]);return;}for(var i=0;i<cases.length;i++){try{var r=solve(cases[i].input);out.push({input:cases[i].input,expected:cases[i].expected,got:String(r),ok:String(r).trim()===String(cases[i].expected).trim()});}catch(err){out.push({input:cases[i].input,expected:cases[i].expected,got:'Error: '+err.message,ok:false});}}self.postMessage(out);}catch(err){self.postMessage([{error:String(err)}]);}}`;
    const blob = new Blob([src], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    const timer = setTimeout(() => { worker.terminate(); resolve([{ input: "", expected: "", got: "Timed out (possible infinite loop)", ok: false }]); }, 3000);
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); resolve(e.data); };
    worker.postMessage({ code, cases });
  });
}

function CodingInput({ q, value, onChange }: { q: TakePayload["questions"][number]; value: unknown; onChange: (v: unknown) => void; }) {
  const [results, setResults] = useState<{ input: string; expected: string; got: string; ok: boolean; error?: string }[] | null>(null);
  const [running, setRunning] = useState(false);
  const code = (value as string) ?? "function solve(input) {\n  // your code here\n  return input;\n}";
  const samples = (q.testCases ?? []).filter((t) => t.sample !== false);
  const run = async () => {
    if (q.language && q.language !== "javascript") { Swal.fire({ title: "Live run supports JavaScript only", text: "Your code is saved and will be graded by the teacher.", icon: "info", background: swalBg() }); return; }
    setRunning(true);
    const r = await runJavaScript(code, samples.length ? samples : [{ input: "", expected: "" }]);
    setResults(r); setRunning(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-ink-3"><span>Language: <b>{q.language ?? "javascript"}</b> · write a <code>solve(input)</code> function</span></div>
      <textarea rows={10} className="w-full rounded-xl border border-hairline bg-[#0d1117] p-3 font-mono text-sm text-emerald-100 focus:outline-none focus:ring-2 focus:ring-accent" spellCheck={false} value={code} onChange={(e) => onChange(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={run} disabled={running}><Play className="size-3.5" /> {running ? "Running…" : "Run sample tests"}</Button>
        {samples.length > 0 && <span className="text-[11px] text-ink-3">{samples.length} sample case{samples.length > 1 ? "s" : ""}</span>}
      </div>
      {results && (
        <div className="space-y-1 rounded-lg border border-hairline bg-surface-2 p-2 text-xs">
          {results[0]?.error ? <p className="text-critical">{results[0].error}</p> : results.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 ${r.ok ? "text-emerald-500" : "text-critical"}`}>{r.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}<span className="font-mono">in: {r.input || "∅"} → got: {r.got} {r.ok ? "" : `(exp: ${r.expected})`}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Result ────────────────────────────────────────────────────────────────────
function Result({ attemptId, onBack }: { attemptId: string; onBack: () => void }) {
  const [r, setR] = useState<AttemptResult | null>(null);
  useEffect(() => { fetchAttemptResult(attemptId).then(setR).catch(() => {}); }, [attemptId]);

  const cert = async () => {
    try {
      const c = await fetchAttemptCertificate(attemptId);
      const w = window.open("", "_blank"); if (!w) return;
      w.document.write(`<html><head><title>Certificate</title></head><body style="font-family:Georgia,serif;text-align:center;padding:60px;border:14px double #59A5D8;margin:20px">
        <h1 style="color:#59A5D8;letter-spacing:2px">Certificate of Achievement</h1><p style="font-size:18px;margin-top:30px">This is proudly presented to</p>
        <h2 style="font-size:32px;margin:10px">${c.studentName}</h2><p style="font-size:16px">(${c.studentCode})</p>
        <p style="font-size:18px;margin-top:20px">for successfully completing</p><h3 style="font-size:24px;color:#333">${c.assessment}</h3>
        <p style="font-size:20px;margin-top:20px">with a score of <b>${c.percentage}%</b> (${Math.round(c.score)}/${c.totalMarks})</p>
        <p style="margin-top:40px;color:#666">Certificate No: <b>${c.certificateNo}</b></p>
        <p style="color:#666">Issued on ${new Date(c.issuedAt).toLocaleDateString()}</p></body></html>`);
      w.document.close(); w.print();
    } catch (e) { Swal.fire({ title: "Not available", text: (e as Error).message, icon: "info", background: swalBg() }); }
  };

  if (!r) return <><Topbar title="Result" /><div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-accent" /></div></>;
  if (!r.available) return <><Topbar title="Result" /><div className="p-6"><Card><CardBody className="py-12 text-center"><Clock className="mx-auto mb-3 size-10 text-amber-500" /><p className="font-semibold text-ink">Result awaiting teacher evaluation</p><p className="mt-1 text-sm text-ink-3">You&apos;ll be notified once &quot;{r.title}&quot; is published.</p><Button variant="outline" className="mt-4" onClick={onBack}>Back</Button></CardBody></Card></div></>;

  return (
    <>
      <Topbar title="Result" subtitle={r.title} />
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Score" value={`${Math.round(r.score ?? 0)}/${r.totalMarks}`} tone="accent" />
          <StatCard label="Percentage" value={`${r.percentage}%`} tone="accent" />
          <StatCard label="Result" value={r.passed ? "Passed" : "Failed"} tone={r.passed ? "good" : "critical"} />
          <StatCard label="Rank" value={r.rank ? `#${r.rank}${r.totalStudents ? ` / ${r.totalStudents}` : ""}` : "—"} tone="accent" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card><CardBody className="flex items-center gap-2 py-3"><CheckCircle2 className="size-5 text-emerald-500" /><div><p className="text-lg font-bold text-ink">{r.correctCount}</p><p className="text-[11px] text-ink-3">Correct</p></div></CardBody></Card>
          <Card><CardBody className="flex items-center gap-2 py-3"><XCircle className="size-5 text-critical" /><div><p className="text-lg font-bold text-ink">{r.wrongCount}</p><p className="text-[11px] text-ink-3">Wrong</p></div></CardBody></Card>
          <Card><CardBody className="flex items-center gap-2 py-3"><MinusCircle className="size-5 text-ink-3" /><div><p className="text-lg font-bold text-ink">{r.skippedCount}</p><p className="text-[11px] text-ink-3">Skipped</p></div></CardBody></Card>
        </div>

        {r.teacherFeedback && <Card><CardBody><p className="text-xs font-bold uppercase text-ink-3">Teacher Feedback</p><p className="mt-1 text-sm text-ink-2">{r.teacherFeedback}</p></CardBody></Card>}
        {!!r.violations && <Card><CardBody className="flex items-center gap-2 text-critical"><AlertTriangle className="size-4" /><p className="text-sm font-semibold">{r.violations} proctoring violation{r.violations > 1 ? "s" : ""} were recorded during this attempt.</p></CardBody></Card>}
        {r.certEligible && <Card><CardBody className="flex items-center justify-between"><div className="flex items-center gap-3"><Trophy className="size-8 text-amber-500" /><div><p className="font-bold text-ink">Certificate earned!</p><p className="text-xs text-ink-3">You scored above the threshold.</p></div></div><Button variant="primary" onClick={cert}><Award className="size-4" /> Download</Button></CardBody></Card>}

        <Card><CardBody>
          <p className="mb-3 text-sm font-bold text-ink">Question-wise Analysis</p>
          <div className="space-y-3">
            {r.questions?.map((qq, i) => (
              <div key={qq.questionId} className="rounded-xl border border-hairline bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-ink">Q{i + 1}. {qq.text}</p>{qq.isCorrect == null ? <Badge tone="neutral">{qq.awardedMarks ?? 0}/{qq.marks}</Badge> : qq.isCorrect ? <Badge tone="good"><CheckCircle2 className="size-3" /> {qq.awardedMarks}/{qq.marks}</Badge> : <Badge tone="critical"><XCircle className="size-3" /> {qq.awardedMarks}/{qq.marks}</Badge>}</div>
                <p className="mt-1 text-xs text-ink-3">Your answer: <span className="text-ink-2">{renderResp(qq.response)}</span></p>
                {qq.correctAnswer && !qq.isCorrect && <p className="text-xs text-emerald-500">Correct: {qq.correctAnswer}</p>}
                {qq.feedback && <p className="mt-1 text-xs text-accent">{qq.feedback}</p>}
                {qq.explanation && <p className="mt-1 text-xs text-ink-3 italic">{qq.explanation}</p>}
              </div>
            ))}
          </div>
        </CardBody></Card>

        <Button variant="outline" onClick={onBack}><ChevronLeft className="size-4" /> Back to assessments</Button>
      </div>
    </>
  );
}

function renderResp(resp: unknown): string {
  if (resp == null || (typeof resp === "string" && !resp.trim())) return "— (skipped)";
  if (typeof resp === "string") return resp.startsWith("/uploads") ? "(file uploaded)" : resp;
  if (Array.isArray(resp)) return resp.join(", ");
  if (typeof resp === "object") return Object.entries(resp as Record<string, string>).map(([k, v]) => `${k}→${v}`).join("; ");
  return String(resp);
}
function StatCard({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const bg = tone === "good" ? "text-emerald-500" : tone === "critical" ? "text-critical" : "text-accent";
  return <Card><CardBody className="py-4 text-center"><p className={`text-2xl font-bold ${bg}`}>{value}</p><p className="text-[11px] font-semibold text-ink-3">{label}</p></CardBody></Card>;
}
