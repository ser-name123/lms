"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  CalendarCheck,
  FileText,
  ClipboardCheck,
  TrendingUp,
  AlertTriangle,
  Award,
  ClipboardList,
  Search,
  Flag,
  MessageSquarePlus,
  Camera,
  Loader2,
  X,
  ListChecks,
  Plus,
  Trash2,
  BarChart3,
  Download,
  History,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  fetchProgressDashboard,
  fetchProgressStudents,
  fetchProgressStudentDetail,
  fetchProgressReport,
  addProgressRemark,
  flagProgressStudent,
  runProgressSnapshot,
  fetchStudentsCourses,
  fetchStudentsTeachers,
  fetchBatches,
  fetchEmployees,
  fetchProgressHistory,
  fetchProgressSkills,
  createProgressSkill,
  deleteProgressSkill,
  type ProgressDashboard,
  type ProgressListRow,
  type ProgressStatus,
} from "@/lib/api";

const COLORS = ["#386FA4", "#059669", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#ec4899"];

const STATUS_TONE: Record<ProgressStatus, Tone> = {
  EXCELLENT: "good",
  GOOD: "accent",
  AVERAGE: "warning",
  NEEDS_ATTENTION: "warning",
  CRITICAL: "critical",
  NO_DATA: "neutral",
};
const STATUS_LABEL: Record<ProgressStatus, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  AVERAGE: "Average",
  NEEDS_ATTENTION: "Needs Attention",
  CRITICAL: "Critical",
  NO_DATA: "No Data",
};
const STATUS_OPTIONS = ["All", "EXCELLENT", "GOOD", "AVERAGE", "NEEDS_ATTENTION", "CRITICAL", "AtRisk"];

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const toast = (title: string, icon: "success" | "error" = "success") =>
  Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 1800, background: swalBg() });
const fail = (e: unknown) =>
  Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Something went wrong", icon: "error", background: swalBg() });

export default function StudentProgressPage() {
  const router = useRouter();
  const [dash, setDash] = useState<ProgressDashboard | null>(null);
  const [rows, setRows] = useState<ProgressListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [sortBy, setSortBy] = useState("progress_desc");
  const [courseId, setCourseId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [country, setCountry] = useState("");
  const [minAttendance, setMinAttendance] = useState("");

  // Filter option lists (loaded once on mount)
  const [courseOpts, setCourseOpts] = useState<{ id: string; title: string }[]>([]);
  const [teacherOpts, setTeacherOpts] = useState<{ id: string; label: string }[]>([]);
  const [coachOpts, setCoachOpts] = useState<{ id: string; label: string }[]>([]);
  const [batchOpts, setBatchOpts] = useState<{ id: string; label: string }[]>([]);

  const loadList = useCallback(() => {
    setListLoading(true);
    fetchProgressStudents({
      search: search || undefined,
      status,
      sortBy,
      courseId: courseId || undefined,
      teacherId: teacherId || undefined,
      coachId: coachId || undefined,
      batchId: batchId || undefined,
      country: country || undefined,
      minAttendance: minAttendance ? Number(minAttendance) : undefined,
      limit: 100,
    })
      .then((r) => setRows(r.items))
      .catch(() => setRows([]))
      .finally(() => setListLoading(false));
  }, [search, status, sortBy, courseId, teacherId, coachId, batchId, country, minAttendance]);

  useEffect(() => {
    fetchProgressDashboard().then(setDash).catch(() => undefined).finally(() => setLoading(false));
    fetchStudentsCourses().then(setCourseOpts).catch(() => setCourseOpts([]));
    fetchStudentsTeachers()
      .then((ts) =>
        setTeacherOpts(
          ts.map((t) => ({ id: t.id, label: `${t.user.firstName} ${t.user.lastName}`.trim() || t.user.email })),
        ),
      )
      .catch(() => setTeacherOpts([]));
    fetchEmployees({ page: 1, limit: 100, role: "ACADEMIC_COACH" })
      .then((r) => setCoachOpts(r.items.map((e) => ({ id: e.id, label: `${e.firstName} ${e.lastName}`.trim() || e.email }))))
      .catch(() => setCoachOpts([]));
    fetchBatches()
      .then((bs) => setBatchOpts(bs.map((b) => ({ id: b.id, label: b.name }))))
      .catch(() => setBatchOpts([]));
  }, []);
  useEffect(() => {
    const t = setTimeout(loadList, 300);
    return () => clearTimeout(t);
  }, [loadList]);

  const snapshot = async () => {
    try {
      const r = await runProgressSnapshot();
      toast(`Snapshot saved for ${r.written} students (${r.monthLabel})`);
      fetchProgressDashboard().then(setDash).catch(() => undefined);
    } catch (e) {
      fail(e);
    }
  };

  const flag = async (row: ProgressListRow) => {
    const r = await Swal.fire({
      title: `Flag ${row.name}?`,
      input: "textarea",
      inputLabel: "Reason / note",
      inputPlaceholder: "Why is this student at risk?",
      showCancelButton: true,
      confirmButtonText: "Flag at risk",
      background: swalBg(),
    });
    if (!r.isConfirmed) return;
    try {
      await flagProgressStudent(row.studentId, { note: r.value || undefined });
      toast("Student flagged — coach notified");
      loadList();
    } catch (e) {
      fail(e);
    }
  };

  const remark = async (row: ProgressListRow) => {
    const r = await Swal.fire({
      title: `Remark for ${row.name}`,
      input: "textarea",
      inputPlaceholder: "Add a progress remark…",
      showCancelButton: true,
      confirmButtonText: "Save remark",
      background: swalBg(),
      inputValidator: (v) => (!v ? "Remark required" : undefined),
    });
    if (!r.isConfirmed || !r.value) return;
    try {
      await addProgressRemark(row.studentId, r.value);
      toast("Remark saved");
    } catch (e) {
      fail(e);
    }
  };

  const c = dash?.cards;
  return (
    <>
      <Topbar title="Student Progress" subtitle="Academy-wide academic progress monitoring" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/students")}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Back to Students
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/students/progress/analytics")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
            >
              <BarChart3 className="size-3.5" /> Analytics
            </button>
            <button
              onClick={() => setSkillsOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
            >
              <ListChecks className="size-3.5" /> Manage Skills
            </button>
            <button
              onClick={snapshot}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
            >
              <Camera className="size-3.5" /> Capture Snapshot
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
              <Kpi label="Active Students" value={c?.totalActiveStudents ?? 0} icon={Users} color="text-accent bg-accent/10" />
              <Kpi label="Avg Attendance" value={`${c?.averageAttendance ?? 0}%`} icon={CalendarCheck} color="text-emerald-500 bg-emerald-500/10" />
              <Kpi label="Avg Assignment" value={`${c?.averageAssignmentScore ?? 0}%`} icon={FileText} color="text-sky-500 bg-sky-500/10" />
              <Kpi label="Avg Assessment" value={`${c?.averageAssessmentScore ?? 0}%`} icon={ClipboardCheck} color="text-violet-500 bg-violet-500/10" />
              <Kpi label="Improving" value={c?.studentsImproving ?? 0} icon={TrendingUp} color="text-emerald-500 bg-emerald-500/10" />
              <Kpi label="At Risk" value={c?.studentsAtRisk ?? 0} icon={AlertTriangle} color="text-red-500 bg-red-500/10" />
              <Kpi label="Top Performers" value={c?.topPerformers ?? 0} icon={Award} color="text-amber-500 bg-amber-500/10" />
              <Kpi label="Pending Reviews" value={c?.pendingReviews ?? 0} icon={ClipboardList} color="text-ink-2 bg-surface-3" />
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Chart title="Monthly Progress Trend">
                <LineView data={dash?.charts.monthlyProgressTrend.map((d) => ({ name: d.month, value: d.value })) ?? []} />
              </Chart>
              <Chart title="Course-wise Performance">
                <Bars data={dash?.charts.courseWise ?? []} />
              </Chart>
              <Chart title="Teacher-wise Performance">
                <Bars data={dash?.charts.teacherWise ?? []} />
              </Chart>
              <Chart title="Country-wise Performance">
                <Bars data={dash?.charts.countryWise ?? []} />
              </Chart>
              <Chart title="Batch-wise Performance">
                <Bars data={dash?.charts.batchWise ?? []} />
              </Chart>
              <Chart title="Attendance Overview">
                <Bars data={dash?.charts.attendanceTrend ?? []} />
              </Chart>
            </div>

            {/* Filters + list */}
            <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
              <CardBody className="p-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-hairline p-4">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search students…"
                      className="h-9 w-full rounded-lg border border-hairline bg-surface-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/40"
                    />
                  </div>
                  <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-2">
                    <option value="">All Courses</option>
                    {courseOpts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-2">
                    <option value="">All Teachers</option>
                    {teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-2">
                    <option value="">All Coaches</option>
                    {coachOpts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-2">
                    <option value="">All Batches</option>
                    {batchOpts.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                    className="h-9 w-28 rounded-lg border border-hairline bg-surface-2 px-3 text-xs font-semibold text-ink-2 placeholder:text-ink-3 focus:outline-none focus:border-accent/40"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minAttendance}
                    onChange={(e) => setMinAttendance(e.target.value)}
                    placeholder="Min Att %"
                    className="h-9 w-24 rounded-lg border border-hairline bg-surface-2 px-3 text-xs font-semibold text-ink-2 placeholder:text-ink-3 focus:outline-none focus:border-accent/40"
                  />
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-2">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s === "AtRisk" ? "At Risk" : s === "All" ? "All Status" : STATUS_LABEL[s as ProgressStatus]}</option>
                    ))}
                  </select>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-2">
                    <option value="progress_desc">Progress ↓</option>
                    <option value="progress_asc">Progress ↑</option>
                    <option value="attendance_desc">Attendance ↓</option>
                    <option value="name_asc">Name A–Z</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-hairline bg-surface-2/50 text-[11px] uppercase tracking-wider text-ink-3">
                      <tr>
                        <th className="px-4 py-3 font-bold">Student</th>
                        <th className="px-4 py-3 font-bold">Course</th>
                        <th className="px-4 py-3 font-bold">Teacher</th>
                        <th className="px-4 py-3 font-bold">Attendance</th>
                        <th className="px-4 py-3 font-bold">Avg Score</th>
                        <th className="px-4 py-3 font-bold">Progress</th>
                        <th className="px-4 py-3 font-bold">Status</th>
                        <th className="px-4 py-3 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listLoading ? (
                        <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="mx-auto size-5 animate-spin text-accent" /></td></tr>
                      ) : rows.length === 0 ? (
                        <tr><td colSpan={8} className="p-8 text-center text-xs text-ink-3">No students found.</td></tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.studentId} className="border-b border-hairline/60 hover:bg-surface-2/40">
                            <td className="px-4 py-3">
                              <div className="font-bold text-ink">{r.name}</div>
                              <div className="text-[11px] text-ink-3">{r.studentCode}</div>
                            </td>
                            <td className="px-4 py-3 text-ink-2">{r.course ?? "—"}</td>
                            <td className="px-4 py-3 text-ink-2">{r.teacher ?? "—"}</td>
                            <td className="px-4 py-3 text-ink-2">{r.attendance != null ? `${r.attendance}%` : "—"}</td>
                            <td className="px-4 py-3 text-ink-2">{r.avgScore != null ? `${r.avgScore}%` : "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                                  <div className="h-full rounded-full bg-accent" style={{ width: `${r.progress}%` }} />
                                </div>
                                <span className="text-xs font-bold text-ink">{r.progress}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <IconBtn title="View progress" onClick={() => setDetailId(r.studentId)} icon={TrendingUp} />
                                <IconBtn title="Add remark" onClick={() => remark(r)} icon={MessageSquarePlus} />
                                <IconBtn title="Flag at risk" onClick={() => flag(r)} icon={Flag} danger />
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
            {/* Reports */}
            <ReportsCard />
          </>
        )}
      </div>

      {detailId && <DetailDrawer studentId={detailId} onClose={() => setDetailId(null)} />}
      {skillsOpen && <SkillsModal onClose={() => setSkillsOpen(false)} />}
    </>
  );
}

type Skill = { id: string; courseId: string; name: string; order: number };

function SkillsModal({ onClose }: { onClose: () => void }) {
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [courseId, setCourseId] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchStudentsCourses().then(setCourses).catch(() => setCourses([]));
  }, []);

  const loadSkills = useCallback(() => {
    if (!courseId) {
      setSkills([]);
      return;
    }
    setLoading(true);
    fetchProgressSkills(courseId)
      .then(setSkills)
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const add = async () => {
    const n = name.trim();
    if (!courseId || !n) return;
    setAdding(true);
    try {
      await createProgressSkill({ courseId, name: n });
      setName("");
      toast("Skill added");
      loadSkills();
    } catch (e) {
      fail(e);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (s: Skill) => {
    const r = await Swal.fire({
      title: `Archive "${s.name}"?`,
      text: "This skill will no longer be available for new assignments and assessments.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Archive",
      confirmButtonColor: "#ef4444",
      background: swalBg(),
    });
    if (!r.isConfirmed) return;
    try {
      await deleteProgressSkill(s.id);
      toast("Skill archived");
      loadSkills();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-10 w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <h3 className="text-sm font-black text-ink">Manage Skills</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-3">Course</span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:border-accent"
            >
              <option value="">Select a course…</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>

          {!courseId ? (
            <p className="rounded-xl border border-hairline bg-surface-2 p-4 text-center text-xs text-ink-3">Pick a course to view its skills.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {loading ? (
                  <div className="grid h-20 place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
                ) : skills.length === 0 ? (
                  <p className="rounded-xl border border-hairline bg-surface-2 p-4 text-center text-xs text-ink-3">No skills yet for this course.</p>
                ) : (
                  skills.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-hairline bg-surface-2 px-3 py-2">
                      <span className="text-sm font-semibold text-ink-2">{s.name}</span>
                      <button title="Archive skill" onClick={() => remove(s)} className="grid size-8 place-items-center rounded-lg text-red-500 hover:bg-surface-3">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-hairline pt-4">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                  placeholder="New skill name…"
                  className="h-10 flex-1 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                />
                <button
                  onClick={add}
                  disabled={adding || !name.trim()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white disabled:opacity-50"
                >
                  {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add skill
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const REPORT_TYPES = [
  { v: "student", label: "Student Progress" },
  { v: "course", label: "Course Report" },
  { v: "teacher", label: "Teacher Report" },
  { v: "batch", label: "Batch Report" },
  { v: "country", label: "Country Report" },
  { v: "coach", label: "Coach Report" },
  { v: "monthly", label: "Monthly Report" },
  { v: "quarterly", label: "Quarterly Report" },
  { v: "parent", label: "Parent Report" },
  { v: "certificate", label: "Certificate Progress" },
];

function ReportsCard() {
  const [type, setType] = useState("student");
  const [data, setData] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchProgressReport(type)
      .then((d) => setData({ columns: d.columns, rows: d.rows }))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [type]);

  const exportCsv = () => {
    if (!data) return;
    const keys = data.rows.length ? Object.keys(data.rows[0]) : [];
    const head = data.columns.join(",");
    const body = data.rows
      .map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `progress-${type}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!data) return;
    const title = REPORT_TYPES.find((t) => t.v === type)?.label ?? "Progress Report";
    const esc = (s: unknown) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const dataKeys = data.rows.length ? Object.keys(data.rows[0]) : [];
    const thead = data.columns.map((c) => `<th>${esc(c)}</th>`).join("");
    const tbody = data.rows
      .map((r) => `<tr>${dataKeys.map((k) => `<td>${esc(r[k] ?? "—")}</td>`).join("")}</tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:32px;}
  h1{font-size:20px;margin:0 0 4px;}
  .meta{color:#666;font-size:12px;margin-bottom:20px;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
  th{background:#f3f4f6;text-transform:uppercase;font-size:10px;letter-spacing:.04em;}
  tr:nth-child(even) td{background:#fafafa;}
</style></head><body>
  <h1>${esc(title)}</h1>
  <div class="meta">Generated ${new Date().toLocaleString()} · ${data.rows.length} rows</div>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const keys = data?.rows.length ? Object.keys(data.rows[0]) : [];
  return (
    <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
      <CardBody className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline p-4">
          <span className="text-xs font-extrabold uppercase tracking-wider text-ink-3">Reports</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-2">
            {REPORT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={exportCsv} disabled={!data} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50">
              <FileText className="size-3.5" /> Export CSV
            </button>
            <button onClick={downloadPdf} disabled={!data || !data.rows.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-50">
              <Download className="size-3.5" /> Download PDF
            </button>
          </div>
        </div>
        <div className="max-h-96 overflow-auto">
          {loading ? (
            <div className="grid h-32 place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
          ) : !data || !data.rows.length ? (
            <div className="p-8 text-center text-xs text-ink-3">No data.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-hairline bg-surface-2/80 text-[10px] uppercase tracking-wider text-ink-3">
                <tr>{data.columns.map((c) => <th key={c} className="px-3 py-2 font-bold">{c}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-hairline/50">
                    {keys.map((k) => <td key={k} className="px-3 py-2 text-ink-2">{String(r[k] ?? "—")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function DetailDrawer({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    fetchProgressStudentDetail(studentId).then(setD).catch(() => undefined);
  }, [studentId]);

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) {
      setHistoryLoading(true);
      fetchProgressHistory(studentId)
        .then(setHistory)
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-hairline bg-surface p-4">
          <h3 className="text-sm font-bold text-ink">{d?.student?.name ?? "Progress"}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-3"><X className="size-4" /></button>
        </div>
        {!d ? (
          <div className="grid h-64 place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Overall" value={`${d.scores.overall}%`} />
              <Stat label="Status" value={STATUS_LABEL[d.scores.status as ProgressStatus] ?? d.scores.status} />
              <Stat label="Attendance" value={d.scores.attendancePct != null ? `${d.scores.attendancePct}%` : "—"} />
              <Stat label="Assignments" value={d.scores.assignmentPct != null ? `${d.scores.assignmentPct}%` : "—"} />
              <Stat label="Assessments" value={d.scores.assessmentPct != null ? `${d.scores.assessmentPct}%` : "—"} />
              <Stat label="Feedback" value={d.scores.feedbackScore != null ? `${d.scores.feedbackScore}%` : "—"} />
            </div>

            {d.subjects?.length > 0 && (
              <Section title="Subject-wise Progress">
                {d.subjects.map((s: any) => (
                  <Bar2 key={s.subject} label={s.subject} value={s.progress} />
                ))}
              </Section>
            )}
            {d.assessments?.byType?.length > 0 && (
              <Section title="Assessment Performance">
                {d.assessments.byType.map((t: any) => (
                  <Bar2 key={t.type} label={`${t.type} (${t.count})`} value={t.avg} />
                ))}
              </Section>
            )}
            {d.skills?.length > 0 && (
              <Section title="Skills">
                {d.skills.map((s: any) => (
                  <Bar2 key={s.skillId} label={s.name} value={s.percentage} />
                ))}
              </Section>
            )}
            {d.badges?.length > 0 && (
              <Section title="Badges">
                <div className="flex flex-wrap gap-2">
                  {d.badges.map((b: any) => (
                    <span key={b.code} className="rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-[11px] font-bold text-ink-2">{b.name}</span>
                  ))}
                </div>
              </Section>
            )}

            {/* Progress history */}
            <div className="space-y-2 rounded-xl border border-hairline bg-surface p-3">
              <button
                onClick={toggleHistory}
                className="flex w-full items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-ink-3 hover:text-ink"
              >
                <span className="inline-flex items-center gap-1.5"><History className="size-3.5" /> Progress History</span>
                <span className="text-ink-2">{showHistory ? "Hide" : "Show"}</span>
              </button>
              {showHistory && (
                historyLoading ? (
                  <div className="grid h-16 place-items-center"><Loader2 className="size-4 animate-spin text-accent" /></div>
                ) : !history || history.length === 0 ? (
                  <p className="py-3 text-center text-xs text-ink-3">No past snapshots yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-hairline text-[10px] uppercase tracking-wider text-ink-3">
                        <tr>
                          <th className="px-2 py-1.5 font-bold">Month</th>
                          <th className="px-2 py-1.5 font-bold">Overall</th>
                          <th className="px-2 py-1.5 font-bold">Status</th>
                          <th className="px-2 py-1.5 font-bold">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h: any, i: number) => (
                          <tr key={i} className="border-b border-hairline/50">
                            <td className="px-2 py-1.5 text-ink-2">{h.monthLabel ?? "—"}</td>
                            <td className="px-2 py-1.5 font-bold text-ink">{h.overallScore != null ? `${h.overallScore}%` : "—"}</td>
                            <td className="px-2 py-1.5 text-ink-2">{h.statusLabel ?? "—"}</td>
                            <td className="px-2 py-1.5 text-ink-2">{h.rank != null ? `#${h.rank}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="flex items-center gap-3 p-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="size-5" /></span>
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold text-ink">{value}</div>
          <div className="truncate text-[11px] font-semibold text-ink-3">{label}</div>
        </div>
      </CardBody>
    </Card>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-4">
        <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">{title}</h3>
        {children}
      </CardBody>
    </Card>
  );
}

function Bars({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No data yet.</div>;
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3)" }} interval={0} angle={-15} textAnchor="end" height={44} />
          <YAxis tick={{ fontSize: 10, fill: "var(--ink-3)" }} domain={[0, 100]} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LineView({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <div className="grid h-44 place-items-center text-xs text-ink-3">No snapshots yet — capture one to build the trend.</div>;
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--ink-3)" }} domain={[0, 100]} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey="value" stroke="#386FA4" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function IconBtn({ title, onClick, icon: Icon, danger }: { title: string; onClick: () => void; icon: React.ComponentType<{ className?: string }>; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={`grid size-8 place-items-center rounded-lg border border-hairline hover:bg-surface-2 ${danger ? "text-red-500" : "text-ink-2"}`}>
      <Icon className="size-3.5" />
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-2 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-0.5 text-base font-extrabold text-ink">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-surface p-3">
      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">{title}</h4>
      {children}
    </div>
  );
}

function Bar2({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-ink-2">{label}</span>
        <span className="font-bold text-ink">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
