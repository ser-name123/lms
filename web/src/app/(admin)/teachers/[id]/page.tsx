"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, User, BookOpen, CalendarClock, Users2, CalendarDays,
  TrendingUp, FileText, MessageSquare, Star, Save, Plus, X, Send, Download,
  GraduationCap, Clock, Wand2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchTeacherManagement, updateTeacherTeaching, updateTeacherProfileFields,
  setTeacherAvailability, approveTeacherAvailability, fetchManagedTeacherStudents,
  transferTeacherStudents, fetchTeacherSchedule, fetchTeacherPerformance,
  fetchTeacherAnalytics, fetchTeacherDocuments, fetchTeacherCommunication,
  sendTeacherMessage, setTeacherStatus, fetchStudentsTeachers,
  fetchAssignableStudents, assignTeacherStudents, removeTeacherStudent,
  fetchTeacherBatches, assignTeacherBatches, unassignTeacherBatch, archiveTeacher,
  type TeacherManagement, type TeacherStudentRow, type TeacherPerformance,
  type TeacherScheduleData, type TeacherAnalytics, type TeacherDocuments,
  type TeacherAvailability, type AppNotification, type TeacherBatches,
} from "@/lib/api";

const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const inp = "h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent";

const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "availability", label: "Availability", icon: CalendarClock },
  { key: "students", label: "Students", icon: Users2 },
  { key: "batches", label: "Batches", icon: GraduationCap },
  { key: "schedule", label: "Schedule", icon: CalendarDays },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "communication", label: "Communication", icon: MessageSquare },
] as const;

export default function TeacherHubPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<TeacherManagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("profile");

  const reload = () => fetchTeacherManagement(id).then(setT).catch(() => undefined);
  useEffect(() => { setLoading(true); fetchTeacherManagement(id).then(setT).catch(() => undefined).finally(() => setLoading(false)); }, [id]);

  const changeStatus = async (status: string) => {
    try { await setTeacherStatus(id, status); reload(); Swal.fire({ toast: true, position: "top-end", icon: "success", title: `Status: ${status}`, showConfirmButton: false, timer: 1500 }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  const archiveToggle = async () => {
    if (!t) return;
    const target = !t.archived;
    const ok = await Swal.fire({ title: target ? "Archive this teacher?" : "Unarchive?", text: target ? "The account will be deactivated but not deleted." : "The account will be reactivated.", icon: "question", showCancelButton: true, confirmButtonText: target ? "Archive" : "Unarchive", background: swalBg() });
    if (!ok.isConfirmed) return;
    try { await archiveTeacher(id, target); reload(); Swal.fire({ toast: true, position: "top-end", icon: "success", title: target ? "Archived" : "Unarchived", showConfirmButton: false, timer: 1500 }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  if (loading) return (<><Topbar title="Teacher" subtitle="Loading…" /><div className="flex items-center justify-center py-32 text-sm font-bold text-ink-3"><Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading…</div></>);
  if (!t) return (<><Topbar title="Teacher" subtitle="Not found" /><div className="p-6"><button onClick={() => router.push("/teachers")} className="text-sm font-bold text-accent hover:underline">← Back to Teachers</button></div></>);

  return (
    <>
      <Topbar title={t.name} subtitle={`${t.teacherCode} · Teacher Management`} />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <button onClick={() => router.push("/teachers")} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Back to Teachers</button>

        {/* Header */}
        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-16 place-items-center overflow-hidden rounded-2xl bg-accent/10 text-lg font-black text-accent">
                {t.avatarUrl ? <img src={t.avatarUrl} alt="" className="size-full object-cover" /> : `${t.firstName[0]}${t.lastName[0]}`}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-black text-ink">{t.name}</h2>
                  <Badge tone={t.status === "ACTIVE" ? "good" : t.status === "INACTIVE" ? "critical" : "warning"}>{t.status}</Badge>
                  <Stars value={t.rating} />
                </div>
                <p className="mt-0.5 text-xs text-ink-3">{t.email} · {t.country || "—"} · {t.subjects.slice(0, 3).join(", ") || "No subjects"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <MiniStat label="Students" value={t.workload.activeStudents} />
                  <MiniStat label="Classes/wk" value={t.workload.classesThisWeek} />
                  <MiniStat label="Hours/wk" value={t.workload.hoursThisWeek} />
                  <MiniStat label="Workload" value={`${t.workload.workloadPct}%`} tone={t.workload.workloadPct > 85 ? "critical" : t.workload.workloadPct > 60 ? "warning" : "good"} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {t.archived && <Badge tone="neutral">Archived</Badge>}
              <select value={t.status} onChange={(e) => changeStatus(e.target.value)} disabled={t.archived} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink focus:outline-none focus:border-accent disabled:opacity-50">
                <option value="ACTIVE">Active</option><option value="PAUSED">On Leave</option><option value="INACTIVE">Suspended</option>
              </select>
              <button onClick={archiveToggle} className="h-10 rounded-xl border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2">{t.archived ? "Unarchive" : "Archive"}</button>
            </div>
          </CardBody>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-1">
          {TABS.map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-all ${tab === tb.key ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>
              <tb.icon className="size-3.5" /> {tb.label}
            </button>
          ))}
        </div>

        {tab === "profile" && <ProfileTab t={t} onSaved={reload} />}
        {tab === "subjects" && <SubjectsTab t={t} onSaved={reload} />}
        {tab === "availability" && <AvailabilityTab t={t} onSaved={reload} />}
        {tab === "students" && <StudentsTab teacherId={id} />}
        {tab === "batches" && <BatchesTab teacherId={id} />}
        {tab === "schedule" && <ScheduleTab teacherId={id} />}
        {tab === "performance" && <PerformanceTab teacherId={id} />}
        {tab === "documents" && <DocumentsTab teacherId={id} />}
        {tab === "communication" && <CommunicationTab teacherId={id} />}
      </div>
    </>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────
function ProfileTab({ t, onSaved }: { t: TeacherManagement; onSaved: () => void }) {
  const [f, setF] = useState({
    gender: t.gender || "", dateOfBirth: t.dateOfBirth?.slice(0, 10) || "", nationality: t.nationality || "",
    timeZone: t.timeZone || "", address: t.address || "", whatsapp: t.whatsapp || "",
    qualification: t.qualification || "", experienceYears: t.experienceYears || "",
    languages: t.languages.join(", "), bio: t.bio || "", specialisation: t.specialisation || "", joiningDate: t.joiningDate?.slice(0, 10) || "",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await updateTeacherProfileFields(t.id, { ...f, languages: f.languages.split(",").map((s) => s.trim()).filter(Boolean) });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Profile saved", showConfirmButton: false, timer: 1500 });
      onSaved();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };
  const F = (label: string, key: keyof typeof f, type = "text") => (
    <div><label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      {key === "bio" || key === "address"
        ? <textarea value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} rows={2} className={inp + " h-auto py-2"} />
        : <input type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={inp} />}
    </div>
  );
  return (
    <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div><label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Email</label><input value={t.email} disabled className={inp + " opacity-60"} /></div>
        <div><label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Mobile</label><input value={t.mobile || ""} disabled className={inp + " opacity-60"} /></div>
        {F("WhatsApp", "whatsapp")}
        {F("Gender", "gender")}
        {F("Date of Birth", "dateOfBirth", "date")}
        {F("Nationality", "nationality")}
        {F("Time Zone", "timeZone")}
        {F("Qualification", "qualification")}
        {F("Experience (years)", "experienceYears")}
        {F("Languages (comma-sep)", "languages")}
        {F("Specialisation", "specialisation")}
        {F("Joining Date", "joiningDate", "date")}
        {F("Address", "address")}
        {F("Bio", "bio")}
      </div>
      <button onClick={save} disabled={busy} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save Profile</button>
    </CardBody></Card>
  );
}

// ── Subjects / Levels / Modes ─────────────────────────────────────────────────
const MODE_OPTIONS = ["One to One", "Group Class"];
function SubjectsTab({ t, onSaved }: { t: TeacherManagement; onSaved: () => void }) {
  const [subjects, setSubjects] = useState<string[]>(t.subjects);
  const [levels, setLevels] = useState<string[]>(t.levels);
  const [modes, setModes] = useState<string[]>(t.teachingModes);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await updateTeacherTeaching(t.id, { subjects, levels, teachingModes: modes }); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Saved", showConfirmButton: false, timer: 1400 }); onSaved(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };
  return (
    <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="space-y-5 p-5">
      <ChipEditor label="Subjects" values={subjects} setValues={setSubjects} placeholder="e.g. English, Mathematics" />
      <ChipEditor label="Levels / Grades" values={levels} setValues={setLevels} placeholder="e.g. Grade 5" />
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">Teaching Modes</p>
        <div className="flex gap-2">
          {MODE_OPTIONS.map((m) => (
            <button key={m} type="button" onClick={() => setModes((c) => c.includes(m) ? c.filter((x) => x !== m) : [...c, m])}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${modes.includes(m) ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3"}`}>{m}</button>
          ))}
        </div>
      </div>
      <button onClick={save} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save</button>
    </CardBody></Card>
  );
}

function ChipEditor({ label, values, setValues, placeholder }: { label: string; values: string[]; setValues: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  const add = () => { const v = input.trim(); if (v && !values.includes(v)) setValues([...values, v]); setInput(""); };
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">{v}<button onClick={() => setValues(values.filter((x) => x !== v))}><X className="size-3" /></button></span>
        ))}
        {values.length === 0 && <span className="text-xs text-ink-3">None yet.</span>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} className={inp} />
        <button onClick={add} className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90"><Plus className="size-4" /></button>
      </div>
    </div>
  );
}

// ── Availability ──────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 33 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
function AvailabilityTab({ t, onSaved }: { t: TeacherManagement; onSaved: () => void }) {
  const [av, setAv] = useState<TeacherAvailability>(() => t.availability || {});
  const [busy, setBusy] = useState(false);
  const addRange = (day: string) => setAv((a) => ({ ...a, [day]: [...(a[day] || []), { from: "09:00", to: "13:00" }] }));
  const removeRange = (day: string, i: number) => setAv((a) => ({ ...a, [day]: (a[day] || []).filter((_, x) => x !== i) }));
  const setField = (day: string, i: number, k: "from" | "to", v: string) => setAv((a) => ({ ...a, [day]: (a[day] || []).map((r, x) => x === i ? { ...r, [k]: v } : r) }));

  const save = async () => {
    setBusy(true);
    try { await setTeacherAvailability(t.id, av); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Availability saved (approved)", showConfirmButton: false, timer: 1600 }); onSaved(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };
  const approve = async (val: boolean) => { await approveTeacherAvailability(t.id, val); onSaved(); Swal.fire({ toast: true, position: "top-end", icon: "success", title: val ? "Approved" : "Unapproved", showConfirmButton: false, timer: 1400 }); };

  return (
    <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">Weekly Availability</h3>
          <p className="text-[11px] text-ink-3">{t.availabilitySubmittedAt ? `Last updated ${new Date(t.availabilitySubmittedAt).toLocaleString()}` : "Not set yet"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={t.availabilityApproved ? "good" : "warning"}>{t.availabilityApproved ? "Approved" : "Pending approval"}</Badge>
          <button onClick={() => approve(!t.availabilityApproved)} className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] font-bold text-ink-2 hover:bg-surface-2">{t.availabilityApproved ? "Unapprove" : "Approve"}</button>
        </div>
      </div>
      <div className="space-y-2">
        {DAYS.map((day) => (
          <div key={day} className="flex flex-wrap items-start gap-2 rounded-xl border border-hairline bg-surface-2/30 p-3">
            <span className="w-24 pt-1.5 text-xs font-bold text-ink">{day}</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {(av[day] || []).map((r, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2 py-1">
                  <select value={r.from} onChange={(e) => setField(day, i, "from", e.target.value)} className="bg-transparent text-[11px] font-bold text-ink focus:outline-none">{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
                  <span className="text-ink-3">–</span>
                  <select value={r.to} onChange={(e) => setField(day, i, "to", e.target.value)} className="bg-transparent text-[11px] font-bold text-ink focus:outline-none">{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
                  <button onClick={() => removeRange(day, i)} className="text-ink-3 hover:text-rose-500"><X className="size-3.5" /></button>
                </div>
              ))}
              <button onClick={() => addRange(day)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-hairline px-2.5 py-1 text-[11px] font-bold text-ink-3 hover:text-accent"><Plus className="size-3.5" /> Slot</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={busy} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save Availability</button>
    </CardBody></Card>
  );
}

// ── Students + transfer ───────────────────────────────────────────────────────
function StudentsTab({ teacherId }: { teacherId: string }) {
  const [rows, setRows] = useState<TeacherStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const load = () => { setLoading(true); fetchManagedTeacherStudents(teacherId).then(setRows).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); fetchStudentsTeachers().then((r) => setTeachers(r.map((x) => ({ id: x.id, name: `${x.user.firstName} ${x.user.lastName}` })))).catch(() => undefined); /* eslint-disable-next-line */ }, [teacherId]);

  const toggle = (eid: string) => setSel((s) => { const n = new Set(s); n.has(eid) ? n.delete(eid) : n.add(eid); return n; });

  const transfer = async () => {
    if (!sel.size) { Swal.fire({ title: "Select students first", icon: "info", background: swalBg() }); return; }
    const others = teachers.filter((x) => x.id !== teacherId);
    const { value, isConfirmed } = await Swal.fire({
      title: `Transfer ${sel.size} student(s)`,
      html: `<select id="tt" class="swal2-input">${others.map((o) => `<option value="${o.id}">${o.name}</option>`).join("")}</select><input id="tr" class="swal2-input" placeholder="Reason (optional)"/>`,
      background: swalBg(), showCancelButton: true, confirmButtonText: "Transfer",
      preConfirm: () => ({ to: (document.getElementById("tt") as HTMLSelectElement)?.value, reason: (document.getElementById("tr") as HTMLInputElement)?.value }),
    });
    if (!isConfirmed || !value) return;
    const v = value as { to: string; reason: string };
    try { const r = await transferTeacherStudents(teacherId, [...sel], v.to, v.reason || undefined); Swal.fire({ icon: "success", title: `${r.transferred} transferred to ${r.toTeacher}`, background: swalBg() }); setSel(new Set()); load(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  const remove = async (enrollmentId: string, name: string) => {
    const ok = await Swal.fire({ title: `Remove ${name}?`, text: "The student will be unassigned from this teacher.", icon: "warning", showCancelButton: true, confirmButtonText: "Remove", confirmButtonColor: "#e11d48", background: swalBg() });
    if (!ok.isConfirmed) return;
    try { await removeTeacherStudent(teacherId, enrollmentId); load(); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Removed", showConfirmButton: false, timer: 1400 }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  const assign = async () => {
    const pool = await fetchAssignableStudents().catch(() => []);
    if (!pool.length) { Swal.fire({ title: "No unassigned students", text: "All enrollments already have a teacher.", icon: "info", background: swalBg() }); return; }
    const opts = pool.map((p) => `<option value="${p.enrollmentId}">${p.name} · ${p.course}</option>`).join("");
    const { value, isConfirmed } = await Swal.fire({
      title: "Assign students",
      html: `<select id="asel" multiple size="8" class="swal2-input" style="height:auto">${opts}</select><p style="font-size:12px;color:#888">Ctrl/Cmd-click to select multiple</p>`,
      background: swalBg(), showCancelButton: true, confirmButtonText: "Assign",
      preConfirm: () => Array.from((document.getElementById("asel") as HTMLSelectElement)?.selectedOptions || []).map((o) => o.value),
    });
    if (!isConfirmed || !value || !(value as string[]).length) return;
    try { const r = await assignTeacherStudents(teacherId, value as string[]); load(); Swal.fire({ icon: "success", title: `${r.assigned} assigned`, background: swalBg() }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  if (loading) return <Loading />;
  return (
    <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-4">
        <h3 className="text-sm font-bold text-ink">Assigned Students ({rows.length})</h3>
        <div className="flex gap-2">
          <button onClick={assign} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2"><Plus className="size-4 text-accent" /> Assign</button>
          <button onClick={transfer} disabled={!sel.size} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"><Wand2 className="size-4" /> Transfer ({sel.size})</button>
        </div>
      </div>
      {rows.length === 0 ? <p className="py-12 text-center text-xs text-ink-3">No students assigned. Use “Assign” to add.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3"><th className="px-4 py-3"></th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <tr key={r.enrollmentId} className="hover:bg-surface-2/20">
                <td className="px-4 py-3"><input type="checkbox" checked={sel.has(r.enrollmentId)} onChange={() => toggle(r.enrollmentId)} /></td>
                <td className="px-4 py-3"><p className="font-bold text-ink">{r.name}</p><p className="text-[10px] text-ink-3">{r.studentCode}</p></td>
                <td className="px-4 py-3 text-ink-2">{r.course}</td>
                <td className="px-4 py-3"><Badge tone={r.status === "ACTIVE" ? "good" : "neutral"}>{r.status}</Badge></td>
                <td className="px-4 py-3 text-right"><button onClick={() => remove(r.enrollmentId, r.name)} className="text-ink-3 hover:text-rose-500"><X className="size-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Card>
  );
}

// ── Batches ───────────────────────────────────────────────────────────────────
function BatchesTab({ teacherId }: { teacherId: string }) {
  const [data, setData] = useState<TeacherBatches | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); fetchTeacherBatches(teacherId).then(setData).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teacherId]);

  const assign = async () => {
    if (!data?.available.length) { Swal.fire({ title: "No batches available", icon: "info", background: swalBg() }); return; }
    const opts = data.available.map((b) => `<option value="${b.id}">${b.name} (${b.code})${b.course ? ` · ${b.course}` : ""}</option>`).join("");
    const { value, isConfirmed } = await Swal.fire({
      title: "Assign batches",
      html: `<select id="bsel" multiple size="8" class="swal2-input" style="height:auto">${opts}</select><p style="font-size:12px;color:#888">Ctrl/Cmd-click to select multiple</p>`,
      background: swalBg(), showCancelButton: true, confirmButtonText: "Assign",
      preConfirm: () => Array.from((document.getElementById("bsel") as HTMLSelectElement)?.selectedOptions || []).map((o) => o.value),
    });
    if (!isConfirmed || !value || !(value as string[]).length) return;
    try { const r = await assignTeacherBatches(teacherId, value as string[]); load(); Swal.fire({ icon: "success", title: `${r.assigned} batch(es) assigned`, background: swalBg() }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };
  const unassign = async (batchId: string, name: string) => {
    const ok = await Swal.fire({ title: `Unassign ${name}?`, icon: "warning", showCancelButton: true, confirmButtonText: "Unassign", confirmButtonColor: "#e11d48", background: swalBg() });
    if (!ok.isConfirmed) return;
    try { await unassignTeacherBatch(teacherId, batchId); load(); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Unassigned", showConfirmButton: false, timer: 1400 }); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Assigned Batches ({data?.assigned.length ?? 0})</h3>
        <button onClick={assign} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90"><Plus className="size-4" /> Assign Batch</button>
      </div>
      {(data?.assigned.length ?? 0) === 0 ? (
        <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="py-12 text-center text-xs text-ink-3">No batches assigned yet.</CardBody></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data!.assigned.map((b) => (
            <Card key={b.id} className="border border-hairline bg-surface shadow-sm"><CardBody className="p-4">
              <div className="flex items-start justify-between">
                <div><span className="font-mono text-[11px] font-bold text-accent">{b.code}</span><p className="text-sm font-black text-ink">{b.name}</p><p className="text-[11px] text-ink-3">{b.course || "—"}</p></div>
                <button onClick={() => unassign(b.id, b.name)} className="text-ink-3 hover:text-rose-500"><X className="size-4" /></button>
              </div>
              <div className="mt-2 flex gap-3 text-[11px] font-semibold text-ink-3"><span>{b.students} students</span><span>{b.classes} classes</span><Badge tone={b.status === "ACTIVE" ? "good" : "neutral"}>{b.status}</Badge></div>
            </CardBody></Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Schedule ──────────────────────────────────────────────────────────────────
function ScheduleTab({ teacherId }: { teacherId: string }) {
  const [data, setData] = useState<TeacherScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchTeacherSchedule(teacherId).then(setData).catch(() => undefined).finally(() => setLoading(false)); }, [teacherId]);
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {DAYS.map((day) => (
        <Card key={day} className="border border-hairline bg-surface shadow-sm"><CardBody className="p-4">
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink-3">{day}</h4>
          {(data.byDay[day] || []).length === 0 ? <p className="text-[11px] text-ink-3">No classes</p> : (
            <div className="space-y-1.5">
              {data.byDay[day].map((c) => (
                <div key={c.id} className="rounded-lg border border-hairline bg-surface-2/30 px-2.5 py-1.5">
                  <p className="text-xs font-bold text-ink">{new Date(c.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {c.course || c.title}</p>
                  <p className="text-[10px] text-ink-3">{c.batch || ""} · {c.students} students · {c.status}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody></Card>
      ))}
    </div>
  );
}

// ── Performance + analytics ───────────────────────────────────────────────────
const BAR_COLORS = ["#386FA4", "#133C55", "#59A5D8", "#84D2F6", "#0EA5E9", "#2563EB"];
function PerformanceTab({ teacherId }: { teacherId: string }) {
  const [p, setP] = useState<TeacherPerformance | null>(null);
  const [an, setAn] = useState<TeacherAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fetchTeacherPerformance(teacherId).then(setP), fetchTeacherAnalytics(teacherId).then(setAn)]).catch(() => undefined).finally(() => setLoading(false));
  }, [teacherId]);
  if (loading) return <Loading />;
  if (!p) return null;
  const metrics = [
    { label: "Total Classes", value: p.totalClasses }, { label: "Completed", value: p.completedClasses },
    { label: "Cancelled", value: p.cancelledClasses }, { label: "Completion %", value: `${p.completionRate}%` },
    { label: "Attendance %", value: `${p.attendanceRate}%` }, { label: "On-time Start %", value: `${p.onTimeStartPct}%` },
    { label: "Trials", value: p.trialsTotal }, { label: "Trial Conversion %", value: `${p.trialConversion}%` },
    { label: "Parent Rating", value: `${p.parentRating}★` }, { label: "Teacher Feedback", value: `${p.teacherFeedbackRating}★` },
  ];
  return (
    <div className="space-y-5">
      <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">System Rating</h3>
          <div className="flex items-center gap-2"><Stars value={p.rating} /><span className="text-lg font-black text-accent">{p.rating}</span></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {p.ratingBreakdown.map((b) => (
            <div key={b.label} className="rounded-xl border border-hairline bg-surface-2/30 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{b.label}</p>
              <p className="mt-1 text-sm font-black text-ink">{b.score}<span className="text-ink-3 font-medium">/5</span></p>
            </div>
          ))}
        </div>
      </CardBody></Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {metrics.map((m) => (
          <Card key={m.label} className="border border-hairline bg-surface shadow-sm"><CardBody className="p-4"><p className="text-xl font-black text-ink leading-none">{m.value}</p><p className="mt-1 text-[11px] font-semibold text-ink-3">{m.label}</p></CardBody></Card>
        ))}
      </div>

      {an && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
            <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">Monthly Teaching Hours</h3>
            <MiniBars data={an.monthlyHours.map((m) => ({ name: m.month.slice(5), val: m.hours }))} />
          </CardBody></Card>
          <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
            <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink-3">Subject Distribution</h3>
            <MiniBars data={an.subjectDistribution.map((s) => ({ name: s.name, val: s.count }))} />
          </CardBody></Card>
        </div>
      )}
    </div>
  );
}
function MiniBars({ data }: { data: { name: string; val: number }[] }) {
  if (!data.length) return <div className="grid h-40 place-items-center text-xs text-ink-3">No data yet</div>;
  return (<div className="h-40 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
    <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
    <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Bar dataKey="val" radius={[6, 6, 0, 0]}>{data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}</Bar>
  </BarChart></ResponsiveContainer></div>);
}

// ── Documents ─────────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
function DocumentsTab({ teacherId }: { teacherId: string }) {
  const [d, setD] = useState<TeacherDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchTeacherDocuments(teacherId).then(setD).catch(() => undefined).finally(() => setLoading(false)); }, [teacherId]);
  if (loading) return <Loading />;
  if (!d) return null;
  const items: { label: string; url: string | null }[] = [
    { label: "Resume", url: d.resume }, { label: "Degree", url: d.degree }, { label: "Certificates", url: d.certificates },
    { label: "Government ID", url: d.govId }, { label: "Photo", url: d.photo }, { label: "Experience Letter", url: d.experienceLetter }, { label: "Police Verification", url: d.policeVerification },
  ];
  const full = (u: string) => u.startsWith("http") ? u : `${API_BASE}${u}`;
  return (
    <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-between rounded-xl border border-hairline bg-surface-2/30 p-3">
            <div className="flex items-center gap-2"><FileText className="size-4 text-ink-3" /><span className="text-xs font-bold text-ink">{it.label}</span></div>
            {it.url ? <a href={full(it.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"><Download className="size-3.5" /> Open</a> : <span className="text-[11px] text-ink-3">Not uploaded</span>}
          </div>
        ))}
      </div>
    </CardBody></Card>
  );
}

// ── Communication ─────────────────────────────────────────────────────────────
function CommunicationTab({ teacherId }: { teacherId: string }) {
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => { setLoading(true); fetchTeacherCommunication(teacherId).then(setRows).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teacherId]);
  const send = async () => {
    if (!title || !body) { Swal.fire({ title: "Title + message required", icon: "info", background: swalBg() }); return; }
    setBusy(true);
    try { await sendTeacherMessage(teacherId, { title, body }); setTitle(""); setBody(""); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Message sent", showConfirmButton: false, timer: 1500 }); load(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
        <h3 className="mb-3 text-sm font-bold text-ink">Send Message / Announcement</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Subject" className={inp + " mb-2"} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Message…" className={inp + " h-auto py-2"} />
        <button onClick={send} disabled={busy} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send (email + in-app)</button>
      </CardBody></Card>
      <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
        <h3 className="mb-3 text-sm font-bold text-ink">Communication History</h3>
        {loading ? <Loading /> : rows.length === 0 ? <p className="py-6 text-center text-xs text-ink-3">No messages yet.</p> : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {rows.map((n) => (
              <div key={n.id} className="rounded-lg border border-hairline bg-surface-2/30 p-3">
                <p className="text-xs font-bold text-ink">{n.title}</p>
                {n.body && <p className="mt-0.5 text-[11px] text-ink-3">{n.body}</p>}
                <p className="mt-1 text-[10px] text-ink-3">{n.type.replace(/_/g, " ")} · {new Date(n.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </CardBody></Card>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────
function Stars({ value }: { value: number | null }) {
  const v = value || 0;
  return <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-3.5 ${n <= Math.round(v) ? "fill-amber-400 text-amber-400" : "text-ink-3/30"}`} />)}</span>;
}
function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warning" | "critical" }) {
  const c = tone === "critical" ? "text-rose-600" : tone === "warning" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-ink";
  return <span className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface-2/40 px-2.5 py-1 text-[11px] font-bold text-ink-3"><span className={c}>{value}</span> {label}</span>;
}
function Loading() { return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>; }
