"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Users, CalendarPlus, X, Trash2, GraduationCap } from "lucide-react";
import Swal from "sweetalert2";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchBatches, createBatch, fetchBatch, assignBatchStudents, removeBatchStudent,
  scheduleClass, generateClasses,
  fetchStudentsCourses, fetchStudentsTeachers, fetchStudents,
  type Batch,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const BATCH_TONE: Record<string, "good" | "warning" | "neutral" | "critical"> = {
  ACTIVE: "good", PAUSED: "warning", COMPLETED: "neutral", CANCELLED: "critical",
};

export function BatchesPanel() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);

  const load = () => { setLoading(true); fetchBatches().then(setBatches).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    fetchStudentsCourses().then(setCourses).catch(() => undefined);
    fetchStudentsTeachers().then((r) => setTeachers(r.map((t) => ({ id: t.id, name: `${t.user.firstName} ${t.user.lastName}` })))).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Batches</h3>
        <button onClick={() => setShowCreate((s) => !s)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90">
          <Plus className="size-4" /> New Batch
        </button>
      </div>

      {showCreate && <CreateBatchForm courses={courses} teachers={teachers} onCancel={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}

      {loading ? <Loading /> : batches.length === 0 ? (
        <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="flex flex-col items-center gap-2 py-14 text-center text-ink-3"><Users className="size-8 text-ink-3/40" /><p className="text-sm font-bold text-ink">No batches yet</p><p className="text-xs">Create a batch, assign a teacher + students, then schedule classes.</p></CardBody></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((b) => (
            <button key={b.id} onClick={() => setDetailId(b.id)} className="text-left">
              <Card className="border border-hairline bg-surface shadow-sm transition-all hover:border-accent/40 hover:shadow-md">
                <CardBody className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-accent">{b.code}</span>
                    <Badge tone={BATCH_TONE[b.status]}>{b.status}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm font-black text-ink">{b.name}</p>
                  <p className="text-[11px] text-ink-3">{b.courseName || "—"}{b.level ? ` · ${b.level}` : ""}</p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold text-ink-3">
                    <span className="inline-flex items-center gap-1"><GraduationCap className="size-3.5" /> {b.teacherName || "No teacher"}</span>
                    <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {b.studentCount ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><CalendarPlus className="size-3.5" /> {b.classCount ?? 0}</span>
                  </div>
                </CardBody>
              </Card>
            </button>
          ))}
        </div>
      )}

      {detailId && <BatchDetail batchId={detailId} teachers={teachers} onClose={() => { setDetailId(null); load(); }} />}
    </div>
  );
}

function CreateBatchForm({ courses, teachers, onCancel, onCreated }: {
  courses: { id: string; title: string }[]; teachers: { id: string; name: string }[]; onCancel: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [level, setLevel] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name || !courseId) { Swal.fire({ title: "Name + course required", icon: "info", background: swalBg() }); return; }
    // Days default to none and nothing used to insist, which is how batches
    // with no timetable got created — and no class can be generated for one.
    if (!days.length || !startTime || !endTime) {
      Swal.fire({ title: "Pick the weekly days and times", text: "A batch without them can have no classes generated for it.", icon: "info", background: swalBg() });
      return;
    }
    setBusy(true);
    try {
      await createBatch({ name, courseId, teacherId: teacherId || undefined, level: level || undefined, daysOfWeek: days, startTime, endTime, capacity: capacity ? Number(capacity) : undefined });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Batch created", showConfirmButton: false, timer: 1600 });
      onCreated();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border border-accent/30 bg-surface shadow-sm">
      <CardBody className="p-5">
        <h4 className="mb-3 text-sm font-bold text-ink">New Batch</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Batch name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grade 5 Morning" className={inp} /></F>
          <F label="Course"><select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inp}><option value="">— Select —</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></F>
          <F label="Teacher"><select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inp}><option value="">— Unassigned —</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></F>
          <F label="Level (optional)"><input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Beginner" className={inp} /></F>
          <F label="Start time"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inp} /></F>
          <F label="End time"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inp} /></F>
          <F label="Capacity (optional)"><input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inp} /></F>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">Weekly days</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${days.includes(d) ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3"}`}>{d.slice(0, 3)}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create</button>
          <button onClick={onCancel} className="inline-flex h-10 items-center rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2">Cancel</button>
        </div>
      </CardBody>
    </Card>
  );
}

function BatchDetail({ batchId, teachers, onClose }: { batchId: string; teachers: { id: string; name: string }[]; onClose: () => void }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [allStudents, setAllStudents] = useState<{ id: string; name: string; code: string }[]>([]);
  const [addId, setAddId] = useState("");
  const [busy, setBusy] = useState(false);
  void teachers;

  const load = () => fetchBatch(batchId).then(setBatch).catch(() => undefined);
  useEffect(() => {
    load();
    fetchStudents({ page: 1, limit: 500, status: "ACTIVE" }).then((r) => setAllStudents(r.items.map((s: any) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}`, code: s.studentCode })))).catch(() => undefined);
  }, [batchId]);

  const add = async () => { if (!addId) return; setBusy(true); try { await assignBatchStudents(batchId, [addId]); setAddId(""); await load(); } finally { setBusy(false); } };
  const remove = async (sid: string) => { setBusy(true); try { await removeBatchStudent(batchId, sid); await load(); } finally { setBusy(false); } };

  const schedule = async () => {
    const { value, isConfirmed } = await Swal.fire({
      title: "Schedule a class",
      html: `<input id="s1" type="datetime-local" class="swal2-input" placeholder="Start"/><input id="s2" type="datetime-local" class="swal2-input" placeholder="End"/><input id="s3" class="swal2-input" placeholder="Meeting link (optional)"/>`,
      background: swalBg(), showCancelButton: true, confirmButtonText: "Schedule",
      preConfirm: () => {
        const a = (document.getElementById("s1") as HTMLInputElement)?.value;
        const b = (document.getElementById("s2") as HTMLInputElement)?.value;
        const m = (document.getElementById("s3") as HTMLInputElement)?.value;
        if (!a || !b) { Swal.showValidationMessage("Start & end required"); return false; }
        return { a, b, m };
      },
    });
    if (!isConfirmed || !value) return;
    try {
      const v = value as { a: string; b: string; m: string };
      await scheduleClass({ batchId, startsAt: new Date(v.a).toISOString(), endsAt: new Date(v.b).toISOString(), meetingUrl: v.m || undefined });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Class scheduled", showConfirmButton: false, timer: 1600 });
      load();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  const generate = async () => {
    const { value, isConfirmed } = await Swal.fire({
      title: "Generate classes",
      text: "From the batch's weekly days + times, between two dates.",
      html: `<input id="g1" type="date" class="swal2-input"/><input id="g2" type="date" class="swal2-input"/><input id="g3" class="swal2-input" placeholder="Meeting link (optional)"/>`,
      background: swalBg(), showCancelButton: true, confirmButtonText: "Generate",
      preConfirm: () => {
        const a = (document.getElementById("g1") as HTMLInputElement)?.value;
        const b = (document.getElementById("g2") as HTMLInputElement)?.value;
        const m = (document.getElementById("g3") as HTMLInputElement)?.value;
        if (!a || !b) { Swal.showValidationMessage("Both dates required"); return false; }
        return { a, b, m };
      },
    });
    if (!isConfirmed || !value) return;
    try {
      const v = value as { a: string; b: string; m: string };
      const res = await generateClasses({ batchId, from: v.a, to: v.b, meetingUrl: v.m || undefined });
      Swal.fire({ icon: "success", title: `${res.generated} classes generated`, background: swalBg() });
      load();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  const inBatch = new Set((batch?.students || []).map((s) => s.id));
  const available = allStudents.filter((s) => !inBatch.has(s.id));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-hairline bg-surface px-5 py-4">
          <div><p className="font-mono text-[11px] font-bold text-accent">{batch?.code}</p><h3 className="text-base font-black text-ink">{batch?.name || "Batch"}</h3></div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg border border-hairline text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        {!batch ? <Loading /> : (
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Course" value={batch.courseName} />
              <Info label="Teacher" value={batch.teacherName} />
              <Info label="Level" value={batch.level} />
              <Info label="Schedule" value={batch.daysOfWeek?.length ? `${batch.daysOfWeek.map((d) => d.slice(0, 3)).join(", ")} · ${batch.startTime}-${batch.endTime}` : "—"} />
            </div>

            <div className="flex gap-2">
              <button onClick={schedule} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-xs font-bold text-white hover:opacity-90"><CalendarPlus className="size-4" /> Schedule Class</button>
              <button onClick={generate} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-hairline text-xs font-bold text-ink-2 hover:bg-surface-2"><CalendarPlus className="size-4 text-accent" /> Auto-generate</button>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold text-ink">Students ({batch.students?.length ?? 0})</p>
              <div className="mb-2 flex gap-2">
                <select value={addId} onChange={(e) => setAddId(e.target.value)} className={inp}><option value="">— Add a student —</option>{available.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</select>
                <button onClick={add} disabled={busy || !addId} className="inline-flex h-10 items-center gap-1 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"><Plus className="size-4" /></button>
              </div>
              <div className="space-y-1.5">
                {(batch.students || []).map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-hairline bg-surface-2/30 px-3 py-2">
                    <div><p className="text-xs font-bold text-ink">{s.name}</p><p className="text-[10px] text-ink-3">{s.studentCode}</p></div>
                    <button onClick={() => remove(s.id)} className="text-ink-3 hover:text-rose-500"><Trash2 className="size-4" /></button>
                  </div>
                ))}
                {(batch.students || []).length === 0 && <p className="py-3 text-center text-[11px] text-ink-3">No students yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inp = "h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>{children}</div>;
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-lg border border-hairline bg-surface-2/30 px-3 py-2"><p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p><p className="mt-0.5 text-xs font-bold text-ink">{value || "—"}</p></div>;
}
function Loading() { return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>; }
