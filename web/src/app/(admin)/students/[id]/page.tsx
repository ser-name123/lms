"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, User, GraduationCap, Users2, CalendarDays, TrendingUp,
  FileText, MessageSquare, ClipboardList, History, ShieldCheck, StickyNote,
  BookOpen, Snowflake, Play, Send, Plus, Save, Heart, ArrowLeftRight, Award, Upload, Check, X,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchStudentManagement, updateStudentBasic, updateStudentAcademic, updateStudentParent,
  assignStudentCourse, updateStudentEnrollment, changeStudentTeacher, changeStudentBatch,
  setStudentMgmtStatus, freezeStudent, reactivateStudent,
  fetchStudentNotes, addStudentNote, fetchStudentMgmtDocuments, addStudentDocument, archiveStudentDocument,
  fetchStudentCommunication, sendStudentMgmtMessage, logStudentCommunication,
  fetchStudentTimeline, fetchStudentAudit, fetchStudentMgmtAttendance,
  fetchStudentMgmtAssignments, fetchStudentMgmtPerformance, fetchStudentAssessmentAttempts,
  fetchStudentsCourses, fetchStudentsTeachers, fetchBatches,
  fetchCoaches, assignStudentCoach, fetchStudentParentView,
  fetchStudentTransfers, requestStudentTransfer, approveTransfer, rejectTransfer,
  issueStudentCertificate, uploadStudentDocument,
  type StudentManagement, type StudentActivityRow, type StudentTransferRow,
} from "@/lib/api";

const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const inp = "h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent";
const toast = (title: string, icon: "success" | "error" = "success") =>
  Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 1800 });
const fail = (e: unknown) => Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() });
const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtT = (d?: string | null) => d ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

async function issueCert(studentId: string, enrollmentId: string) {
  try {
    const c = await issueStudentCertificate(studentId, enrollmentId);
    const w = window.open("", "_blank", "width=900,height=650");
    if (!w) { toast("Allow pop-ups to print the certificate", "error"); return; }
    w.document.write(`<!doctype html><html><head><title>${c.certificateId}</title><style>
      body{font-family:'Georgia',serif;margin:0;background:#f4efe6;color:#1f2937}
      .cert{width:820px;margin:32px auto;padding:56px;background:#fff;border:14px solid #133C55;border-radius:8px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.15)}
      h1{font-size:38px;color:#133C55;letter-spacing:3px;margin:0 0 4px}
      .sub{color:#8a6d3b;letter-spacing:6px;text-transform:uppercase;font-size:13px;margin-bottom:28px}
      .name{font-size:32px;font-weight:bold;margin:18px 0;border-bottom:2px solid #ddd;display:inline-block;padding:0 30px 8px}
      .course{font-size:20px;color:#386FA4;margin:12px 0}
      .meta{margin-top:36px;display:flex;justify-content:space-between;font-size:13px;color:#555;padding:0 30px}
      @media print{body{background:#fff}.cert{box-shadow:none;margin:0}}
    </style></head><body><div class="cert">
      <h1>Certificate</h1><div class="sub">of Completion</div>
      <p>This is proudly presented to</p>
      <div class="name">${c.studentName}</div>
      <p>for successfully completing the course</p>
      <div class="course">${c.course}</div>
      <div class="meta"><span>ID: ${c.certificateId}</span><span>${c.teacher ? "Instructor: " + c.teacher : ""}</span><span>${new Date(c.issuedAt).toLocaleDateString()}</span></div>
    </div><script>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  } catch (e) { fail(e); }
}

const statusTone = (s: string) => s === "ACTIVE" ? "good" : s === "PAUSED" ? "warning" : s === "TRIAL" ? "accent" : s === "PENDING" ? "warning" : "critical";
const STATUS_OPTIONS = ["ACTIVE", "TRIAL", "PAUSED", "PENDING", "INACTIVE"];

const TABS = [
  { key: "overview", label: "Overview", icon: User },
  { key: "profile", label: "Profile", icon: User },
  { key: "academic", label: "Academic", icon: BookOpen },
  { key: "parent", label: "Parent", icon: Users2 },
  { key: "parentview", label: "Parent View", icon: Heart },
  { key: "assignment", label: "Course / Batch / Teacher", icon: GraduationCap },
  { key: "transfers", label: "Transfers", icon: ArrowLeftRight },
  { key: "attendance", label: "Attendance", icon: CalendarDays },
  { key: "assignments", label: "Assignments", icon: ClipboardList },
  { key: "assessments", label: "Assessments", icon: ClipboardList },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "notes", label: "Notes", icon: StickyNote },
  { key: "communication", label: "Communication", icon: MessageSquare },
  { key: "timeline", label: "Timeline", icon: History },
  { key: "audit", label: "Audit Log", icon: ShieldCheck },
] as const;

export default function StudentHubPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<StudentManagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");

  const reload = () => fetchStudentManagement(id).then(setS).catch(() => undefined);
  useEffect(() => { setLoading(true); fetchStudentManagement(id).then(setS).catch(() => undefined).finally(() => setLoading(false)); }, [id]);

  const changeStatus = async (status: string) => {
    try { await setStudentMgmtStatus(id, status); reload(); toast(`Status: ${status}`); } catch (e) { fail(e); }
  };

  const freeze = async () => {
    const r = await Swal.fire({ title: "Freeze (On Hold)?", input: "text", inputLabel: "Reason (required)", inputPlaceholder: "Fee pending / Medical leave / Vacation…", showCancelButton: true, confirmButtonText: "Freeze", background: swalBg(), inputValidator: (v) => !v ? "Reason is required" : undefined });
    if (!r.isConfirmed || !r.value) return;
    try { await freezeStudent(id, r.value); reload(); toast("Student on hold"); } catch (e) { fail(e); }
  };
  const reactivate = async () => {
    try { await reactivateStudent(id); reload(); toast("Reactivated"); } catch (e) { fail(e); }
  };

  if (loading) return (<><Topbar title="Student" subtitle="Loading…" /><div className="flex items-center justify-center py-32 text-sm font-bold text-ink-3"><Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading…</div></>);
  if (!s) return (<><Topbar title="Student" subtitle="Not found" /><div className="p-6"><button onClick={() => router.push("/students")} className="text-sm font-bold text-accent hover:underline">← Back to Students</button></div></>);

  const name = `${s.user.firstName} ${s.user.lastName}`;
  return (
    <>
      <Topbar title={name} subtitle={`${s.studentCode} · Student Management`} />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <button onClick={() => router.push("/students")} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Back to Students</button>

        {/* Header */}
        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-16 place-items-center overflow-hidden rounded-2xl bg-accent/10 text-lg font-black text-accent">
                {s.user.avatarUrl ? <img src={s.user.avatarUrl} alt="" className="size-full object-cover" /> : `${s.user.firstName[0] ?? ""}${s.user.lastName[0] ?? ""}`}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-black text-ink">{name}</h2>
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  {s.onHoldReason && <Badge tone="warning">On hold: {s.onHoldReason}</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-3">{s.user.email} · {s.user.country || "—"} · {s.activeCourse?.title || "No active course"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <MiniStat label="Attendance" value={`${s.cards.attendanceRate}%`} tone={s.cards.attendanceRate >= 75 ? "good" : s.cards.attendanceRate >= 50 ? "warning" : "critical"} />
                  <MiniStat label="Pending HW" value={s.cards.pendingAssignments} />
                  <MiniStat label="Upcoming" value={s.cards.upcomingClasses} />
                  <MiniStat label="Teacher" value={s.activeCourse?.teacher || "—"} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={s.status} onChange={(e) => changeStatus(e.target.value)} className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink focus:outline-none focus:border-accent">
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {s.status === "PAUSED"
                ? <button onClick={reactivate} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"><Play className="size-3.5" /> Reactivate</button>
                : <button onClick={freeze} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"><Snowflake className="size-3.5" /> Freeze</button>}
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

        {tab === "overview" && <OverviewTab s={s} onSaved={reload} />}
        {tab === "profile" && <ProfileTab s={s} onSaved={reload} />}
        {tab === "academic" && <AcademicTab s={s} onSaved={reload} />}
        {tab === "parent" && <ParentTab s={s} onSaved={reload} />}
        {tab === "parentview" && <ParentViewTab studentId={id} />}
        {tab === "assignment" && <AssignmentTab s={s} onSaved={reload} />}
        {tab === "transfers" && <TransfersTab studentId={id} />}
        {tab === "attendance" && <AttendanceTab studentId={id} />}
        {tab === "assignments" && <AssignmentsTab studentId={id} />}
        {tab === "assessments" && <AssessmentsTab studentId={id} />}
        {tab === "performance" && <PerformanceTab studentId={id} />}
        {tab === "documents" && <DocumentsTab studentId={id} />}
        {tab === "notes" && <NotesTab studentId={id} />}
        {tab === "communication" && <CommunicationTab studentId={id} />}
        {tab === "timeline" && <TimelineTab studentId={id} />}
        {tab === "audit" && <AuditTab studentId={id} />}
      </div>
    </>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ s, onSaved }: { s: StudentManagement; onSaved: () => void }) {
  const cards = [
    { label: "Attendance %", value: `${s.cards.attendanceRate}%` },
    { label: "Current Course", value: s.activeCourse?.title || "—" },
    { label: "Upcoming Classes", value: s.cards.upcomingClasses },
    { label: "Pending Assignments", value: s.cards.pendingAssignments },
    { label: "Completed Assignments", value: s.cards.completedAssignments },
    { label: "Fees Due (invoices)", value: s.cards.dueInvoices },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="border border-hairline bg-surface"><CardBody className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">{c.label}</p>
            <p className="mt-1 truncate text-lg font-black text-ink">{c.value}</p>
          </CardBody></Card>
        ))}
      </div>
      <CoachCard s={s} onSaved={onSaved} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Enrollments">
          {s.enrollments.length === 0 ? <Empty /> : (
            <div className="space-y-2">
              {s.enrollments.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-xl border border-hairline px-3 py-2 text-sm">
                  <div><p className="font-bold text-ink">{e.course}</p><p className="text-xs text-ink-3">{e.teacher || "No teacher"} · {e.package || "No package"}</p></div>
                  <div className="text-right"><Badge tone={statusTone(e.status)}>{e.status}</Badge><p className="mt-1 text-xs text-ink-3">{e.progress}%</p></div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Current Batches">
          {s.batches.length === 0 ? <Empty text="Not in any batch" /> : (
            <div className="space-y-2">
              {s.batches.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-hairline px-3 py-2 text-sm">
                  <div><p className="font-bold text-ink">{b.code} · {b.name}</p><p className="text-xs text-ink-3">{b.course} · {b.teacher || "No teacher"} · {b.schedule || "—"}</p></div>
                  <Badge tone="neutral">{b.occupancy}</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────
function ProfileTab({ s, onSaved }: { s: StudentManagement; onSaved: () => void }) {
  const [f, setF] = useState({
    firstName: s.user.firstName ?? "", lastName: s.user.lastName ?? "", gender: s.profile.gender ?? "",
    dateOfBirth: s.profile.dateOfBirth ? s.profile.dateOfBirth.slice(0, 10) : "", nationality: s.profile.nationality ?? "",
    country: s.user.country ?? "", timeZone: s.profile.timeZone ?? "", phone: s.profile.phone ?? "",
    address: s.profile.address ?? "", profession: s.profile.profession ?? "",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await updateStudentBasic(s.id, f); onSaved(); toast("Profile saved"); } catch (e) { fail(e); } finally { setBusy(false); } };
  return (
    <SectionCard title="Basic Information" action={<SaveBtn onClick={save} busy={busy} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FieldIn label="First Name" value={f.firstName} onChange={(v) => setF({ ...f, firstName: v })} />
        <FieldIn label="Last Name" value={f.lastName} onChange={(v) => setF({ ...f, lastName: v })} />
        <FieldSel label="Gender" value={f.gender} onChange={(v) => setF({ ...f, gender: v })} options={["", "Male", "Female", "Other"]} />
        <FieldIn label="Date of Birth" type="date" value={f.dateOfBirth} onChange={(v) => setF({ ...f, dateOfBirth: v })} />
        <FieldIn label="Nationality" value={f.nationality} onChange={(v) => setF({ ...f, nationality: v })} />
        <FieldIn label="Country" value={f.country} onChange={(v) => setF({ ...f, country: v })} />
        <FieldIn label="Time Zone" value={f.timeZone} onChange={(v) => setF({ ...f, timeZone: v })} />
        <FieldIn label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
        <FieldIn label="Profession" value={f.profession} onChange={(v) => setF({ ...f, profession: v })} />
        <div className="sm:col-span-2 lg:col-span-3"><FieldIn label="Address" value={f.address} onChange={(v) => setF({ ...f, address: v })} /></div>
      </div>
      <div className="mt-4 grid gap-2 rounded-xl border border-hairline bg-surface-2 p-3 text-xs text-ink-3 sm:grid-cols-3">
        <span>Student ID: <b className="text-ink">{s.studentCode}</b></span>
        <span>Joined: <b className="text-ink">{fmt(s.profile.joiningDate)}</b></span>
        <span>Last login: <b className="text-ink">{fmtT(s.user.lastLoginAt)}</b></span>
      </div>
    </SectionCard>
  );
}

// ── Academic ──────────────────────────────────────────────────────────────────
function AcademicTab({ s, onSaved }: { s: StudentManagement; onSaved: () => void }) {
  const [f, setF] = useState({
    currentGrade: s.academic.currentGrade ?? "", currentSchool: s.academic.currentSchool ?? "", board: s.academic.board ?? "",
    learningLevel: s.academic.learningLevel ?? "", preferredLanguage: s.academic.preferredLanguage ?? "", learningGoal: s.academic.learningGoal ?? "",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await updateStudentAcademic(s.id, f); onSaved(); toast("Academic info saved"); } catch (e) { fail(e); } finally { setBusy(false); } };
  return (
    <SectionCard title="Academic Information" action={<SaveBtn onClick={save} busy={busy} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FieldIn label="Current Grade" value={f.currentGrade} onChange={(v) => setF({ ...f, currentGrade: v })} />
        <FieldIn label="Current School" value={f.currentSchool} onChange={(v) => setF({ ...f, currentSchool: v })} />
        <FieldIn label="Board" value={f.board} onChange={(v) => setF({ ...f, board: v })} />
        <FieldIn label="Learning Level" value={f.learningLevel} onChange={(v) => setF({ ...f, learningLevel: v })} />
        <FieldIn label="Preferred Language" value={f.preferredLanguage} onChange={(v) => setF({ ...f, preferredLanguage: v })} />
        <FieldSel label="Learning Goal" value={f.learningGoal} onChange={(v) => setF({ ...f, learningGoal: v })} options={["", "Spoken English", "IELTS", "Mathematics", "Coding", "Quran", "Arabic"]} />
      </div>
    </SectionCard>
  );
}

// ── Parent ────────────────────────────────────────────────────────────────────
function ParentTab({ s, onSaved }: { s: StudentManagement; onSaved: () => void }) {
  const [f, setF] = useState({
    parentName: s.parent.parentName ?? s.parent.guardianName ?? "", parentRelationship: s.parent.parentRelationship ?? "",
    parentEmail: s.parent.parentEmail ?? "", parentMobile: s.parent.parentMobile ?? "", parentWhatsapp: s.parent.parentWhatsapp ?? "",
    guardianName: s.parent.guardianName ?? "",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await updateStudentParent(s.id, f); onSaved(); toast("Parent info saved"); } catch (e) { fail(e); } finally { setBusy(false); } };
  return (
    <SectionCard title="Parent / Guardian Information" action={<SaveBtn onClick={save} busy={busy} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FieldIn label="Parent / Guardian Name" value={f.parentName} onChange={(v) => setF({ ...f, parentName: v })} />
        <FieldSel label="Relationship" value={f.parentRelationship} onChange={(v) => setF({ ...f, parentRelationship: v })} options={["", "Father", "Mother", "Guardian", "Sibling", "Other"]} />
        <FieldIn label="Email" type="email" value={f.parentEmail} onChange={(v) => setF({ ...f, parentEmail: v })} />
        <FieldIn label="Mobile" value={f.parentMobile} onChange={(v) => setF({ ...f, parentMobile: v })} />
        <FieldIn label="WhatsApp" value={f.parentWhatsapp} onChange={(v) => setF({ ...f, parentWhatsapp: v })} />
      </div>
      <p className="mt-3 text-xs text-ink-3">Parent has no separate login. They receive email + in-app notifications whenever the student's course, teacher, batch or status changes.</p>
    </SectionCard>
  );
}

// ── Course / Batch / Teacher assignment ───────────────────────────────────────
function AssignmentTab({ s, onSaved }: { s: StudentManagement; onSaved: () => void }) {
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; user: { firstName: string; lastName: string } }[]>([]);
  const [batches, setBatches] = useState<{ id: string; code: string; name: string }[]>([]);
  const [cForm, setCForm] = useState({ courseId: "", teacherId: "", status: "ACTIVE" });
  const [batchId, setBatchId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStudentsCourses().then(setCourses).catch(() => undefined);
    fetchStudentsTeachers().then((t) => setTeachers(t.map((x) => ({ id: x.id, user: x.user })))).catch(() => undefined);
    fetchBatches().then((r) => setBatches(r.map((b) => ({ id: b.id, code: b.code, name: b.name })))).catch(() => undefined);
  }, []);

  const assign = async () => {
    if (!cForm.courseId) return toast("Pick a course", "error");
    setBusy(true);
    try { await assignStudentCourse(s.id, { courseId: cForm.courseId, teacherId: cForm.teacherId || undefined, status: cForm.status }); onSaved(); toast("Course assigned"); setCForm({ courseId: "", teacherId: "", status: "ACTIVE" }); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const moveBatch = async () => {
    if (!batchId) return toast("Pick a batch", "error");
    const r = await Swal.fire({ title: "Change batch?", input: "text", inputLabel: "Reason (optional)", showCancelButton: true, confirmButtonText: "Move", background: swalBg() });
    if (!r.isConfirmed) return;
    try { await changeStudentBatch(s.id, { batchId, reason: r.value || undefined }); onSaved(); toast("Batch changed"); setBatchId(""); } catch (e) { fail(e); }
  };
  const changeTeacher = async (enrollmentId: string) => {
    const opts = teachers.map((t) => `<option value="${t.id}">${t.user.firstName} ${t.user.lastName}</option>`).join("");
    const r = await Swal.fire({
      title: "Transfer Teacher", background: swalBg(), showCancelButton: true, confirmButtonText: "Transfer",
      html: `<select id="tt" class="swal2-input"><option value="">Select teacher…</option>${opts}</select><input id="rr" class="swal2-input" placeholder="Reason (required)"/>`,
      preConfirm: () => {
        const to = (document.getElementById("tt") as HTMLSelectElement)?.value;
        const reason = (document.getElementById("rr") as HTMLInputElement)?.value;
        if (!to) { Swal.showValidationMessage("Pick a teacher"); return; }
        if (!reason || reason.length < 3) { Swal.showValidationMessage("Reason is required"); return; }
        return { to, reason };
      },
    });
    if (!r.isConfirmed || !r.value) return;
    try { await changeStudentTeacher(s.id, { enrollmentId, toTeacherId: r.value.to, reason: r.value.reason }); onSaved(); toast("Teacher transferred"); } catch (e) { fail(e); }
  };
  const setEnrollStatus = async (enrollmentId: string, status: string) => {
    try { await updateStudentEnrollment(s.id, enrollmentId, { status }); onSaved(); toast("Enrollment updated"); } catch (e) { fail(e); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Assign Course + Teacher" action={<button onClick={assign} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50"><Plus className="size-3.5" /> Assign</button>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldSel label="Course" value={cForm.courseId} onChange={(v) => setCForm({ ...cForm, courseId: v })} options={["", ...courses.map((c) => c.id)]} render={(v) => v ? (courses.find((c) => c.id === v)?.title ?? v) : "Select course…"} />
          <FieldSel label="Teacher" value={cForm.teacherId} onChange={(v) => setCForm({ ...cForm, teacherId: v })} options={["", ...teachers.map((t) => t.id)]} render={(v) => v ? (() => { const t = teachers.find((x) => x.id === v); return t ? `${t.user.firstName} ${t.user.lastName}` : v; })() : "Select teacher…"} />
          <FieldSel label="Status" value={cForm.status} onChange={(v) => setCForm({ ...cForm, status: v })} options={["ACTIVE", "TRIAL", "PENDING", "PAUSED", "COMPLETED", "CANCELLED"]} />
        </div>
      </SectionCard>

      <SectionCard title="Enrollments (Course · Teacher · Progress)">
        {s.enrollments.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {s.enrollments.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2 text-sm">
                <div className="min-w-0"><p className="font-bold text-ink">{e.course}</p><p className="truncate text-xs text-ink-3">{e.teacher || "No teacher"} · {e.package || "No package"} · {e.progress}%</p></div>
                <div className="flex items-center gap-2">
                  <select value={e.status} onChange={(ev) => setEnrollStatus(e.id, ev.target.value)} className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink">
                    {["TRIAL", "PENDING", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <button onClick={() => changeTeacher(e.id)} className="h-8 rounded-lg border border-hairline px-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2">Transfer Teacher</button>
                  {e.status === "COMPLETED" && <button onClick={() => issueCert(s.id, e.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-xs font-bold text-accent hover:bg-surface-2"><Award className="size-3.5" /> Certificate</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Batch" action={<button onClick={moveBatch} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2">Change Batch</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldSel label="Move to batch" value={batchId} onChange={setBatchId} options={["", ...batches.map((b) => b.id)]} render={(v) => v ? (() => { const b = batches.find((x) => x.id === v); return b ? `${b.code} · ${b.name}` : v; })() : "Select batch…"} />
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Current</p>
            {s.batches.length === 0 ? <p className="text-sm text-ink-3">Not in any batch</p> : s.batches.map((b) => <Badge key={b.id} tone="neutral">{b.code} · {b.name}</Badge>)}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Attendance ────────────────────────────────────────────────────────────────
function AttendanceTab({ studentId }: { studentId: string }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchStudentMgmtAttendance>> | null>(null);
  useEffect(() => { fetchStudentMgmtAttendance(studentId).then(setD).catch(() => undefined); }, [studentId]);
  if (!d) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Attendance %" value={`${d.summary.rate}%`} /><Kpi label="Present" value={d.summary.present} />
        <Kpi label="Absent" value={d.summary.absent} /><Kpi label="Late" value={d.summary.late} />
      </div>
      <SectionCard title="Attendance Trend">
        {d.trend.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.trend}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="month" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip /><Line type="monotone" dataKey="rate" stroke="#386FA4" strokeWidth={2} /></LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>
      <SectionCard title="Recent Sessions">
        {d.recent.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {d.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm">
                <div><p className="font-semibold text-ink">{r.title}</p><p className="text-xs text-ink-3">{r.course} · {fmtT(r.date)}</p></div>
                <Badge tone={r.status === "PRESENT" ? "good" : r.status === "LATE" ? "warning" : r.status === "EXCUSED" || r.status === "LEAVE_APPROVED" ? "neutral" : "critical"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Assignments ───────────────────────────────────────────────────────────────
function AssignmentsTab({ studentId }: { studentId: string }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchStudentMgmtAssignments>> | null>(null);
  useEffect(() => { fetchStudentMgmtAssignments(studentId).then(setD).catch(() => undefined); }, [studentId]);
  if (!d) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Total" value={d.summary.total} /><Kpi label="Pending" value={d.summary.pending} />
        <Kpi label="Completed" value={d.summary.completed} /><Kpi label="Late" value={d.summary.lateSubmissions} />
        <Kpi label="Avg Mark" value={d.summary.avgMark ?? "—"} />
      </div>
      <SectionCard title="Submissions">
        {d.items.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {d.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm">
                <div><p className="font-semibold text-ink">{it.title}</p><p className="text-xs text-ink-3">{it.course} · due {fmt(it.dueAt)}{it.late && <span className="text-red-500"> · late</span>}</p></div>
                <div className="text-right"><Badge tone={it.status === "EVALUATED" ? "good" : "warning"}>{it.status}</Badge>{it.grade != null && <p className="mt-1 text-xs font-bold text-ink">{it.grade}</p>}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Assessments (online tests — read-only history; parent-visible) ────────────
function AssessmentsTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchStudentAssessmentAttempts>> | null>(null);
  useEffect(() => { fetchStudentAssessmentAttempts(studentId).then(setRows).catch(() => undefined); }, [studentId]);
  if (!rows) return <Loading />;
  const published = rows.filter((r) => r.published);
  const avg = published.length ? Math.round(published.reduce((a, r) => a + r.percentage, 0) / published.length) : null;
  const passed = published.filter((r) => r.passed).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Attempts" value={rows.length} /><Kpi label="Results Out" value={published.length} />
        <Kpi label="Avg %" value={avg != null ? `${avg}%` : "—"} /><Kpi label="Passed" value={`${passed}/${published.length || 0}`} />
      </div>
      <SectionCard title="Assessment History">
        {rows.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm">
                <div><p className="font-semibold text-ink">{r.assessment}</p><p className="text-xs text-ink-3">{r.type}{r.subject ? ` · ${r.subject}` : ""}{r.submittedAt ? ` · ${fmt(r.submittedAt)}` : ""}</p></div>
                <div className="text-right">
                  {r.published ? <Badge tone={r.passed ? "good" : "critical"}>{r.passed ? "Passed" : "Failed"}</Badge> : <Badge tone="warning">{r.status}</Badge>}
                  {r.published && <p className="mt-1 text-xs font-bold text-ink">{Math.round(r.score)}/{r.totalMarks} ({r.percentage}%){r.rank ? ` · #${r.rank}` : ""}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Performance ───────────────────────────────────────────────────────────────
function PerformanceTab({ studentId }: { studentId: string }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchStudentMgmtPerformance>> | null>(null);
  useEffect(() => { fetchStudentMgmtPerformance(studentId).then(setD).catch(() => undefined); }, [studentId]);
  if (!d) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Attendance %" value={`${d.attendanceRate}%`} /><Kpi label="Avg Score" value={d.avgScore ?? "—"} />
        <Kpi label="Highest Score" value={d.highestScore ?? "—"} /><Kpi label="Assessments" value={d.totalAssessments} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Attendance Trend">
          {d.attendanceTrend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}><LineChart data={d.attendanceTrend}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="month" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip /><Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} /></LineChart></ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Assessment Trend">
          {d.assessmentTrend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}><BarChart data={d.assessmentTrend}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="score" fill="#386FA4" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────
function DocumentsTab({ studentId }: { studentId: string }) {
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof fetchStudentMgmtDocuments>>>([]);
  const [form, setForm] = useState({ type: "PASSPORT", label: "", url: "" });
  const load = () => fetchStudentMgmtDocuments(studentId).then(setDocs).catch(() => undefined);
  useEffect(() => { load(); }, [studentId]);
  const [uploading, setUploading] = useState(false);
  const add = async () => {
    if (!form.label || !form.url) return toast("Label + URL required", "error");
    try { await addStudentDocument(studentId, form); setForm({ type: "PASSPORT", label: "", url: "" }); load(); toast("Document added"); } catch (e) { fail(e); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try { await uploadStudentDocument(studentId, file, form.type, form.label || file.name); setForm({ type: "PASSPORT", label: "", url: "" }); load(); toast("Uploaded"); } catch (e) { fail(e); } finally { setUploading(false); }
  };
  const toggle = async (docId: string, archived: boolean) => { try { await archiveStudentDocument(studentId, docId, archived); load(); } catch (e) { fail(e); } };
  const TYPES = ["PASSPORT", "NATIONAL_ID", "BIRTH_CERT", "SCHOOL_REPORT", "MEDICAL", "PHOTO", "OTHER"];
  return (
    <div className="space-y-4">
      <SectionCard title="Add Document" action={<button onClick={add} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white"><Plus className="size-3.5" /> Add by URL</button>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldSel label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={TYPES} />
          <FieldIn label="Label" value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
          <FieldIn label="File URL" value={form.url} onChange={(v) => setForm({ ...form, url: v })} />
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-hairline pt-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2">
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload File
            <input type="file" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <span className="text-xs text-ink-3">Picks the Type above; up to 25 MB.</span>
        </div>
      </SectionCard>
      <SectionCard title="Documents">
        {docs.length === 0 ? <Empty text="No documents" /> : (
          <div className="space-y-1.5">
            {docs.map((d) => (
              <div key={d.id} className={`flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm ${d.archived ? "opacity-50" : ""}`}>
                <div><p className="font-semibold text-ink">{d.label} <span className="text-xs text-ink-3">· {d.type}</span></p><p className="text-xs text-ink-3">{fmt(d.uploadedAt)}</p></div>
                <div className="flex items-center gap-2">
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent hover:underline">Download</a>
                  <button onClick={() => toggle(d.id, !d.archived)} className="text-xs font-bold text-ink-3 hover:text-ink">{d.archived ? "Restore" : "Archive"}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function NotesTab({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<StudentActivityRow[]>([]);
  const [text, setText] = useState("");
  const load = () => fetchStudentNotes(studentId).then(setNotes).catch(() => undefined);
  useEffect(() => { load(); }, [studentId]);
  const add = async () => { if (!text.trim()) return; try { await addStudentNote(studentId, text.trim()); setText(""); load(); toast("Note added"); } catch (e) { fail(e); } };
  return (
    <SectionCard title="Private Notes (Admin + Coach only)">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Needs extra attention in Grammar. Parent prefers evening classes." className={inp} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-bold text-white"><Plus className="size-3.5" /> Add</button>
      </div>
      <div className="mt-3 space-y-2">
        {notes.length === 0 ? <Empty text="No notes yet" /> : notes.map((n) => (
          <div key={n.id} className="rounded-xl border border-hairline bg-surface-2 px-3 py-2">
            <p className="text-sm text-ink">{n.description}</p>
            <p className="mt-1 text-[11px] text-ink-3">{n.actorName || "Staff"} · {fmtT(n.createdAt)}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Communication ─────────────────────────────────────────────────────────────
function CommunicationTab({ studentId }: { studentId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchStudentCommunication>> | null>(null);
  const [msg, setMsg] = useState({ title: "", body: "", channel: "BOTH", audience: "STUDENT" });
  const load = () => fetchStudentCommunication(studentId).then(setData).catch(() => undefined);
  useEffect(() => { load(); }, [studentId]);
  const send = async () => {
    if (!msg.title || !msg.body) return toast("Title + message required", "error");
    try { await sendStudentMgmtMessage(studentId, msg); setMsg({ title: "", body: "", channel: "BOTH", audience: "STUDENT" }); load(); toast("Message sent"); } catch (e) { fail(e); }
  };
  const logCall = async () => {
    const r = await Swal.fire({ title: "Log a call / WhatsApp", background: swalBg(), showCancelButton: true, confirmButtonText: "Log", html: `<select id="ch" class="swal2-input"><option value="CALL">Call</option><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="INTERNAL">Internal</option></select><input id="sm" class="swal2-input" placeholder="Summary"/>`, preConfirm: () => { const channel = (document.getElementById("ch") as HTMLSelectElement)?.value; const summary = (document.getElementById("sm") as HTMLInputElement)?.value; if (!summary) { Swal.showValidationMessage("Summary required"); return; } return { channel, summary }; } });
    if (!r.isConfirmed || !r.value) return;
    try { await logStudentCommunication(studentId, r.value); load(); toast("Logged"); } catch (e) { fail(e); }
  };
  return (
    <div className="space-y-4">
      <SectionCard title="Send Message" action={<button onClick={logCall} className="h-9 rounded-lg border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2">Log Call/WhatsApp</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldIn label="Title" value={msg.title} onChange={(v) => setMsg({ ...msg, title: v })} />
          <div className="grid grid-cols-2 gap-3">
            <FieldSel label="Channel" value={msg.channel} onChange={(v) => setMsg({ ...msg, channel: v })} options={["BOTH", "IN_APP", "EMAIL"]} />
            <FieldSel label="Audience" value={msg.audience} onChange={(v) => setMsg({ ...msg, audience: v })} options={["STUDENT", "PARENT", "BOTH"]} />
          </div>
        </div>
        <textarea value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} rows={3} placeholder="Message…" className="mt-3 w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
        <button onClick={send} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white"><Send className="size-3.5" /> Send</button>
      </SectionCard>
      <SectionCard title="Communication History">
        {(!data || (data.logged.length === 0 && data.notifications.length === 0)) ? <Empty text="No history" /> : (
          <div className="space-y-1.5">
            {data?.logged.map((l) => (
              <div key={l.id} className="rounded-lg border border-hairline px-3 py-2 text-sm">
                <div className="flex items-center gap-2"><Badge tone="accent">{l.channel || l.type}</Badge><p className="font-semibold text-ink">{l.title}</p></div>
                {l.description && <p className="mt-1 text-xs text-ink-3">{l.description}</p>}
                <p className="mt-1 text-[11px] text-ink-3">{l.actorName || "Staff"} · {fmtT(l.createdAt)}</p>
              </div>
            ))}
            {data?.notifications.map((n) => (
              <div key={n.id} className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2 text-sm">
                <div className="flex items-center gap-2"><Badge tone="neutral">NOTIFY</Badge><p className="font-semibold text-ink">{n.title}</p></div>
                {n.body && <p className="mt-1 text-xs text-ink-3">{n.body}</p>}
                <p className="mt-1 text-[11px] text-ink-3">{fmtT(n.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function TimelineTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<StudentActivityRow[]>([]);
  useEffect(() => { fetchStudentTimeline(studentId).then(setRows).catch(() => undefined); }, [studentId]);
  return (
    <SectionCard title="Student Timeline">
      {rows.length === 0 ? <Empty text="No events yet" /> : (
        <div className="relative space-y-4 pl-5">
          <div className="absolute left-1.5 top-1 h-full w-px bg-hairline" />
          {rows.map((r) => (
            <div key={r.id} className="relative">
              <span className="absolute -left-[15px] top-1 size-3 rounded-full border-2 border-accent bg-surface" />
              <p className="text-sm font-bold text-ink">{r.title}</p>
              {r.description && <p className="text-xs text-ink-3">{r.description}</p>}
              <p className="mt-0.5 text-[11px] text-ink-3">{fmtT(r.createdAt)}{r.actorName ? ` · ${r.actorName}` : ""}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────────
function AuditTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<StudentActivityRow[]>([]);
  useEffect(() => { fetchStudentAudit(studentId).then(setRows).catch(() => undefined); }, [studentId]);
  return (
    <SectionCard title="Audit Log — nothing is ever deleted">
      {rows.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-3"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Action</th><th className="py-2 pr-3">Detail</th><th className="py-2">By</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-hairline/60">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-ink-3">{fmtT(r.createdAt)}</td>
                  <td className="py-2 pr-3 font-semibold text-ink">{r.title}</td>
                  <td className="py-2 pr-3 text-xs text-ink-2">{r.description || "—"}</td>
                  <td className="py-2 text-xs text-ink-3">{r.actorName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ── Academic Coach card (Overview) ────────────────────────────────────────────
function CoachCard({ s, onSaved }: { s: StudentManagement; onSaved: () => void }) {
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [coachId, setCoachId] = useState(s.coachId ?? "");
  useEffect(() => { fetchCoaches().then((c) => setCoaches(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => undefined); }, []);
  const save = async () => { try { await assignStudentCoach(s.id, coachId || null); onSaved(); toast("Coach updated"); } catch (e) { fail(e); } };
  return (
    <SectionCard title="Academic Coach" action={<button onClick={save} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white"><Save className="size-3.5" /> Save</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldSel label="Assigned Coach" value={coachId} onChange={setCoachId} options={["", ...coaches.map((c) => c.id)]} render={(v) => v ? (coaches.find((c) => c.id === v)?.name ?? v) : "Unassigned"} />
        <div className="flex items-end"><p className="text-xs text-ink-3">Current: <b className="text-ink">{s.coach || "Unassigned"}</b></p></div>
      </div>
    </SectionCard>
  );
}

// ── Parent View (read-only, what a parent would see) ──────────────────────────
function ParentViewTab({ studentId }: { studentId: string }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchStudentParentView>> | null>(null);
  useEffect(() => { fetchStudentParentView(studentId).then(setD).catch(() => undefined); }, [studentId]);
  if (!d) return <Loading />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">Read-only preview of the parent dashboard (parent receives this via email/notification — no separate login).</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Child Attendance" value={`${d.childAttendance.rate}%`} /><Kpi label="Progress" value={`${d.progress}%`} />
        <Kpi label="Upcoming Classes" value={d.upcomingClasses} /><Kpi label="Fees Due" value={d.feeStatus.dueInvoices} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Course & Team">
          <dl className="space-y-2 text-sm">
            <Row k="Course" v={d.course || "—"} /><Row k="Teacher" v={d.teacher || "—"} /><Row k="Academic Coach" v={d.coach || "—"} />
            <Row k="Next payment" v={fmt(d.feeStatus.nextPaymentDate)} /><Row k="Last payment" v={fmt(d.feeStatus.lastPaymentDate)} />
          </dl>
        </SectionCard>
        <SectionCard title="Homework">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-2xl font-black text-ink">{d.homework.pending}</p><p className="text-xs text-ink-3">Pending</p></div>
            <div><p className="text-2xl font-black text-ink">{d.homework.completed}</p><p className="text-xs text-ink-3">Completed</p></div>
            <div><p className="text-2xl font-black text-ink">{d.homework.avgMark ?? "—"}</p><p className="text-xs text-ink-3">Avg Mark</p></div>
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Recent Classes">
        {d.recentClasses.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {d.recentClasses.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm">
                <div><p className="font-semibold text-ink">{r.title}</p><p className="text-xs text-ink-3">{r.course} · {fmtT(r.date)}</p></div>
                <Badge tone={r.status === "PRESENT" ? "good" : r.status === "LATE" ? "warning" : r.status === "EXCUSED" || r.status === "LEAVE_APPROVED" ? "neutral" : "critical"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Transfers (approval workflow) ─────────────────────────────────────────────
function TransfersTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<StudentTransferRow[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; code: string; name: string }[]>([]);
  const [enrollTeacher, setEnrollTeacher] = useState({ kind: "TEACHER", reason: "" });
  const load = () => fetchStudentTransfers(studentId).then(setRows).catch(() => undefined);
  useEffect(() => {
    load();
    fetchStudentsCourses().then(setCourses).catch(() => undefined);
    fetchStudentsTeachers().then((t) => setTeachers(t.map((x) => ({ id: x.id, name: `${x.user.firstName} ${x.user.lastName}` })))).catch(() => undefined);
    fetchBatches().then((r) => setBatches(r.map((b) => ({ id: b.id, code: b.code, name: b.name })))).catch(() => undefined);
  }, [studentId]);

  const request = async () => {
    const reason = enrollTeacher.reason.trim();
    if (reason.length < 3) return toast("Reason required", "error");
    let payload: Record<string, unknown> = {};
    if (enrollTeacher.kind === "BATCH") {
      const { value: batchId } = await Swal.fire({ title: "Batch", input: "select", inputOptions: Object.fromEntries(batches.map((b) => [b.id, `${b.code} · ${b.name}`])), showCancelButton: true, background: swalBg() });
      if (!batchId) return; payload = { batchId };
    } else if (enrollTeacher.kind === "COURSE") {
      const { value: courseId } = await Swal.fire({ title: "Course", input: "select", inputOptions: Object.fromEntries(courses.map((c) => [c.id, c.title])), showCancelButton: true, background: swalBg() });
      if (!courseId) return; payload = { courseId, status: "ACTIVE" };
    } else {
      const eid = await Swal.fire({ title: "Enrollment ID", input: "text", inputLabel: "Enrollment ID (from Course/Batch/Teacher tab)", showCancelButton: true, background: swalBg() });
      if (!eid.value) return;
      const { value: toTeacherId } = await Swal.fire({ title: "New Teacher", input: "select", inputOptions: Object.fromEntries(teachers.map((t) => [t.id, t.name])), showCancelButton: true, background: swalBg() });
      if (!toTeacherId) return; payload = { enrollmentId: eid.value, toTeacherId };
    }
    try { await requestStudentTransfer(studentId, { kind: enrollTeacher.kind, reason, payload }); setEnrollTeacher({ kind: "TEACHER", reason: "" }); load(); toast("Request submitted for approval"); } catch (e) { fail(e); }
  };
  const decide = async (id: string, approve: boolean) => {
    try { if (approve) await approveTransfer(id); else await rejectTransfer(id); load(); toast(approve ? "Approved & applied" : "Rejected"); } catch (e) { fail(e); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Request a Transfer (needs approval)" action={<button onClick={request} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white"><Plus className="size-3.5" /> Request</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldSel label="Type" value={enrollTeacher.kind} onChange={(v) => setEnrollTeacher({ ...enrollTeacher, kind: v })} options={["TEACHER", "BATCH", "COURSE"]} />
          <FieldIn label="Reason" value={enrollTeacher.reason} onChange={(v) => setEnrollTeacher({ ...enrollTeacher, reason: v })} />
        </div>
        <p className="mt-2 text-xs text-ink-3">Transfer requests go into a pending queue; an admin approves them (then the change applies + parent is notified).</p>
      </SectionCard>
      <SectionCard title="Transfer History & Pending">
        {rows.length === 0 ? <Empty text="No transfer requests" /> : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Badge tone="accent">{r.kind}</Badge><p className="font-bold text-ink">{r.fromLabel || "—"} → {r.toLabel || "—"}</p></div>
                  <p className="text-xs text-ink-3">Reason: {r.reason} · {fmtT(r.createdAt)}{r.decidedByName ? ` · by ${r.decidedByName}` : ""}</p>
                </div>
                {r.status === "PENDING" ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => decide(r.id, true)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-bold text-white"><Check className="size-3.5" /> Approve</button>
                    <button onClick={() => decide(r.id, false)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2"><X className="size-3.5" /> Reject</button>
                  </div>
                ) : <Badge tone={r.status === "APPROVED" ? "good" : "critical"}>{r.status}</Badge>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Row({ k, v }: { k: string; v: string }) { return <div className="flex justify-between gap-3"><dt className="text-ink-3">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>; }
function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-black text-ink">{title}</h3>{action}</div>
      {children}
    </CardBody></Card>
  );
}
function MiniStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warning" | "critical" }) {
  const c = tone === "critical" ? "text-red-500" : tone === "warning" ? "text-amber-500" : tone === "good" ? "text-emerald-500" : "text-ink";
  return <div className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1"><span className="text-[10px] font-bold uppercase text-ink-3">{label}</span> <span className={`text-xs font-black ${c}`}>{value}</span></div>;
}
function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return <Card className="border border-hairline bg-surface"><CardBody className="p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">{label}</p><p className="mt-1 text-xl font-black text-ink">{value}</p></CardBody></Card>;
}
function FieldIn({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-3">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inp} /></label>;
}
function FieldSel({ label, value, onChange, options, render }: { label: string; value: string; onChange: (v: string) => void; options: string[]; render?: (v: string) => string }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-3">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className={inp}>{options.map((o) => <option key={o} value={o}>{render ? render(o) : (o || "—")}</option>)}</select></label>;
}
function SaveBtn({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return <button onClick={onClick} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save</button>;
}
function Empty({ text = "No data" }: { text?: string }) { return <p className="py-6 text-center text-sm text-ink-3">{text}</p>; }
function Loading() { return <div className="flex items-center justify-center py-16 text-sm font-bold text-ink-3"><Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading…</div>; }
