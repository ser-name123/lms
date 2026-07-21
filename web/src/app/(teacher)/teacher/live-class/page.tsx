"use client";

import { useEffect, useState, Fragment } from "react";
import {
  Video,
  Clock,
  ExternalLink,
  Loader2,
  Calendar,
  Search,
  Filter,
  CheckCircle,
  PlayCircle,
  BookOpen,
  CalendarClock,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrialReportPanel } from "@/components/leads/trial-report";
import { isTrialClosed } from "@/components/leads/lead-meta";
import { fetchTeacherClasses, fetchMyTrials, setTrialStatus, type LeadTrial } from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: "text-accent bg-accent/10 border-accent/20",
  RESCHEDULED: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  COMPLETED: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  NO_SHOW: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  CANCELLED: "text-ink-3 bg-surface-2 border-hairline",
};

export default function TeacherLiveClasses() {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UPCOMING" | "COMPLETED">("ALL");
  const [courseFilter, setCourseFilter] = useState("ALL");
  const [expandedTrialId, setExpandedTrialId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetchTeacherClasses().catch(() => []),
      fetchMyTrials("all").catch(() => []),
    ])
      .then(([classesRes, trialsRes]) => {
        const mappedTrials = trialsRes.map((t) => ({
          ...t,
          isTrial: true,
          courseCode: "TRIAL",
          topic: `${t.lead ? `${t.lead.studentFirstName} ${t.lead.studentLastName}` : "Student"} (Trial)`,
          timeStart: t.scheduledAt,
          timeEnd: new Date(new Date(t.scheduledAt).getTime() + (t.durationMins || 30) * 60 * 1000).toISOString(),
          status: t.status,
          meetingUrl: t.meetingLink,
          agenda: t.lead?.interestedSubject ? `Interested in: ${t.lead.interestedSubject}` : undefined,
        }));

        const merged = [
          ...classesRes.map((c) => ({ ...c, isTrial: false })),
          ...mappedTrials,
        ].sort((a, b) => new Date(a.timeStart).getTime() - new Date(b.timeStart).getTime());

        setClasses(merged);
      })
      .catch((err) => {
        console.error("Failed to load classes or trials", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStartClass = (link: string | null) => {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      Swal.fire({
        title: "Meeting Link Missing",
        text: "Please contact administration to bind a Zoom/Google Meet webinar link to this class session.",
        icon: "warning",
        confirmButtonColor: "#386FA4",
      });
    }
  };

  const handleTrialStatus = async (trialId: string, status: "COMPLETED" | "NO_SHOW") => {
    setBusyId(trialId);
    try {
      await setTrialStatus(trialId, status);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: status === "COMPLETED" ? "Marked completed" : "Marked no-show",
        showConfirmButton: false,
        timer: 1800,
      });
      loadData();
    } catch (e) {
      Swal.fire({
        title: "Failed",
        text: e instanceof Error ? e.message : "Failed.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusyId(null);
    }
  };

  // Compute unique course codes
  const uniqueCourses = Array.from(new Set(classes.map((c) => c.courseCode))).filter(Boolean);

  const filtered = classes.filter((c) => {
    const q = searchQuery.toLowerCase();
    
    const matchesSearch = c.isTrial ? (
      c.lead ? (
        `${c.lead.studentFirstName} ${c.lead.studentLastName}`.toLowerCase().includes(q) ||
        c.lead.email?.toLowerCase().includes(q) ||
        c.lead.interestedSubject?.toLowerCase().includes(q)
      ) : false
    ) : (
      c.topic?.toLowerCase().includes(q) ||
      c.courseCode?.toLowerCase().includes(q) ||
      (c.agenda && c.agenda.toLowerCase().includes(q))
    );

    const isUpcoming = c.isTrial 
      ? (c.status === "SCHEDULED" || c.status === "RESCHEDULED")
      : (c.status === "Upcoming" || c.status === "SCHEDULED");

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "UPCOMING" && isUpcoming) ||
      (statusFilter === "COMPLETED" && !isUpcoming);

    const matchesCourse = courseFilter === "ALL" || c.courseCode === courseFilter;

    return matchesSearch && matchesStatus && matchesCourse;
  });

  // Quick stats
  const totalCount = classes.length;
  const upcomingCount = classes.filter((c) => 
    c.isTrial 
      ? (c.status === "SCHEDULED" || c.status === "RESCHEDULED")
      : (c.status === "Upcoming" || c.status === "SCHEDULED")
  ).length;
  const completedCount = totalCount - upcomingCount;

  if (loading) {
    return (
      <>
        <Topbar title="Live Classes" subtitle="Class broadcast control room" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading live classroom...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Live Classes" subtitle="Broadcast console to start and host live virtual classrooms" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Futuristic Roster Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <BookOpen className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Classes</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{totalCount} Sessions</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
              <PlayCircle className="size-6 animate-pulse" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Upcoming Broadcasts</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{upcomingCount} Scheduled</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
              <CheckCircle className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Completed Broadcasts</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{completedCount} Finished</h4>
            </div>
          </Card>
        </div>

        {/* Filters control center bar */}
        <Card className="border border-hairline bg-surface rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
            
            {/* Filter buttons */}
            <div className="flex items-center gap-2 overflow-x-auto w-full xl:w-auto pb-1 xl:pb-0 scrollbar-none select-none">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-accent text-white shadow-sm"
                    : "bg-surface-2/45 border border-hairline text-ink-2 hover:bg-surface-2"
                }`}
              >
                All Classes ({totalCount})
              </button>
              <button
                onClick={() => setStatusFilter("UPCOMING")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  statusFilter === "UPCOMING"
                    ? "bg-accent text-white shadow-sm"
                    : "bg-surface-2/45 border border-hairline text-ink-2 hover:bg-surface-2"
                }`}
              >
                Upcoming ({upcomingCount})
              </button>
              <button
                onClick={() => setStatusFilter("COMPLETED")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  statusFilter === "COMPLETED"
                    ? "bg-accent text-white shadow-sm"
                    : "bg-surface-2/45 border border-hairline text-ink-2 hover:bg-surface-2"
                }`}
              >
                Completed ({completedCount})
              </button>
            </div>

            {/* Dropdowns, Search Inputs */}
            <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto items-stretch sm:items-center">
              
              {/* Course Selector Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="h-9.5 pl-9 pr-8 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none min-w-[150px]"
                >
                  <option value="ALL">All Courses</option>
                  {uniqueCourses.map((c: any) => (
                    <option key={c} value={c}>
                      {c === "TRIAL" ? "Trial Classes" : c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Topic search */}
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search topic or course code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

            </div>

          </div>
        </Card>

        {/* Classes Table List */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6">Course / Type</th>
                    <th className="p-4">Topic / Student Details</th>
                    <th className="p-4">Starts At</th>
                    <th className="p-4">Ends At</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filtered.map((cls) => {
                    const isUpcoming = cls.isTrial
                      ? (cls.status === "SCHEDULED" || cls.status === "RESCHEDULED")
                      : (cls.status === "Upcoming" || cls.status === "SCHEDULED");
                    
                    const start = new Date(cls.timeStart);
                    const end = new Date(cls.timeEnd);
                    const done = cls.isTrial ? isTrialClosed(cls) : !isUpcoming;
                    
                    return (
                      <Fragment key={cls.id}>
                        <tr className="hover:bg-surface-2/10 transition">
                          {/* 1. Course Code / Trial Badge */}
                          <td className="p-4 pl-6 whitespace-nowrap">
                            <span className={`font-extrabold text-[9px] px-2.5 py-1 rounded-lg ${
                              cls.isTrial 
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" 
                                : "bg-accent-soft/20 text-accent"
                            }`}>
                              {cls.courseCode}
                            </span>
                          </td>

                          {/* 2. Topic / Student info */}
                          <td className="p-4 min-w-[240px]">
                            <div className="space-y-0.5">
                              <span className="block font-bold text-ink text-xs">{cls.topic}</span>
                              {cls.isTrial ? (
                                <div className="flex flex-wrap gap-x-2 text-[10px] text-ink-3 font-medium">
                                  {cls.lead?.email && <span className="flex items-center gap-0.5"><Mail className="size-3" /> {cls.lead.email}</span>}
                                  {cls.lead?.mobile && <span className="flex items-center gap-0.5"><Phone className="size-3" /> {cls.lead.mobile}</span>}
                                </div>
                              ) : (
                                cls.agenda && <span className="block text-[10px] text-ink-3 leading-relaxed">{cls.agenda}</span>
                              )}
                            </div>
                          </td>

                          {/* 3. Starts At */}
                          <td className="p-4 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <span className="block text-ink">{start.toLocaleDateString()}</span>
                              <span className="block text-[10px] text-ink-3">
                                {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </td>

                          {/* 4. Ends At */}
                          <td className="p-4 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <span className="block text-ink">{end.toLocaleDateString()}</span>
                              <span className="block text-[10px] text-ink-3">
                                {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </td>

                          {/* 5. Status Badge */}
                          <td className="p-4">
                            <Badge tone={cls.isTrial ? (done ? "neutral" : "accent") : (isUpcoming ? "accent" : "good")} className="text-[9px] font-black tracking-wider uppercase select-none px-2 py-0.5">
                              {cls.isTrial ? cls.status.replace(/_/g, " ") : cls.status}
                            </Badge>
                          </td>

                          {/* 6. Action buttons (merged) */}
                          <td className="p-4 pr-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {/* Meeting room join button */}
                              {cls.meetingUrl && !done && (
                                <Button
                                  onClick={() => handleStartClass(cls.meetingUrl)}
                                  className="h-8.5 px-3 bg-accent hover:bg-accent-hover text-white text-[10px] font-bold rounded-lg inline-flex items-center gap-1 shadow-sm cursor-pointer"
                                >
                                  {cls.isTrial ? "Join Trial" : "Join Class"}
                                  <ExternalLink className="size-3" />
                                </Button>
                              )}

                              {/* Attendance / Report specific actions for Trials */}
                              {cls.isTrial && cls.status !== "CANCELLED" && (
                                <>
                                  {/* Mark Completed/No-show */}
                                  <button
                                    onClick={() => handleTrialStatus(cls.id, "COMPLETED")}
                                    disabled={busyId === cls.id}
                                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-bold disabled:opacity-50 cursor-pointer ${
                                      cls.status === "COMPLETED"
                                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-600"
                                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                    }`}
                                  >
                                    <CheckCircle2 className="size-3.5" /> Completed
                                  </button>
                                  <button
                                    onClick={() => handleTrialStatus(cls.id, "NO_SHOW")}
                                    disabled={busyId === cls.id || Boolean(cls.reportSubmittedAt)}
                                    title={cls.reportSubmittedAt ? "A report has been filed for this trial" : undefined}
                                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-bold disabled:opacity-50 cursor-pointer ${
                                      cls.status === "NO_SHOW"
                                        ? "border-rose-500/50 bg-rose-500/20 text-rose-600"
                                        : "border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                                    }`}
                                  >
                                    <XCircle className="size-3.5" /> No-show
                                  </button>

                                  {/* File Trial Report toggler */}
                                  <button
                                    onClick={() => setExpandedTrialId(expandedTrialId === cls.id ? null : cls.id)}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold cursor-pointer transition ${
                                      expandedTrialId === cls.id
                                        ? "border-accent bg-accent/10 text-accent"
                                        : "border-hairline text-ink-3 hover:border-accent hover:text-accent"
                                    }`}
                                  >
                                    <ClipboardList className="size-3.5" /> 
                                    {expandedTrialId === cls.id ? "Close Report" : "Report"}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible details row for Trial Report Panel */}
                        {cls.isTrial && expandedTrialId === cls.id && (
                          <tr key={`${cls.id}-details`} className="bg-surface-2/45 border-t border-b border-hairline">
                            <td colSpan={6} className="p-6">
                              <div className="bg-surface rounded-3xl border border-hairline p-6 shadow-sm">
                                <h4 className="text-xs font-black text-ink-2 uppercase tracking-wider mb-4">Trial Report: {cls.topic}</h4>
                                <TrialReportPanel trial={cls} onChange={loadData} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center space-y-4 w-full">
              <Video className="size-12 text-ink-3/40 mx-auto" />
              <h3 className="font-extrabold text-sm text-ink">No Scheduled Broadcasts Found</h3>
              <p className="text-xs text-ink-3 leading-relaxed">
                Adjust your status filter tabs or query keyword searches to lookup other classes scheduled in the system.
              </p>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
