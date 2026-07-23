"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock,
  Video,
  Search,
  Loader2,
  ExternalLink,
  Filter,
  CheckCircle,
  PlayCircle,
  HelpCircle,
  SlidersHorizontal,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchTeacherClasses, fetchMyTrials } from "@/lib/api";

export default function TeacherClasses() {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UPCOMING" | "COMPLETED">("ALL");
  const [courseFilter, setCourseFilter] = useState<string>("ALL");

  useEffect(() => {
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
        ].sort((a, b) => new Date(b.timeStart).getTime() - new Date(a.timeStart).getTime());

        setClasses(merged);
      })
      .catch((err) => {
        console.error("Failed to load classes or trials", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Compute unique course codes for filtering options
  const uniqueCourses = Array.from(new Set(classes.map((c) => c.courseCode))).filter(Boolean);

  const filtered = classes.filter((c) => {
    // Search match
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      c.topic?.toLowerCase().includes(q) ||
      c.courseCode?.toLowerCase().includes(q) ||
      (c.agenda && c.agenda.toLowerCase().includes(q));

    // Status filter match
    const isUpcoming = c.status === "Upcoming" || c.status === "SCHEDULED";
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "UPCOMING" && isUpcoming) ||
      (statusFilter === "COMPLETED" && !isUpcoming);

    // Course code match
    const matchesCourse = courseFilter === "ALL" || c.courseCode === courseFilter;

    return matchesSearch && matchesStatus && matchesCourse;
  });

  if (loading) {
    return (
      <>
        <Topbar title="My Schedule" subtitle="Review your teaching schedules" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading class schedules...</p>
          </div>
        </div>
      </>
    );
  }

  // Calculate quick stats metrics
  const totalCount = classes.length;
  const upcomingCount = classes.filter((c) => c.status === "Upcoming" || c.status === "SCHEDULED").length;
  const completedCount = totalCount - upcomingCount;

  return (
    <>
      <Topbar title="My Schedule" subtitle="Schedule lists and past webinar history logs" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Futuristic KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <CalendarDays className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Class Logs</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{totalCount}</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
              <PlayCircle className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Upcoming Sessions</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{upcomingCount}</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
              <CheckCircle className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Completed Sessions</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{completedCount}</h4>
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
                <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="h-9.5 pl-9 pr-8 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none min-w-[150px]"
                >
                  <option value="ALL">All Subjects</option>
                  {uniqueCourses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Topic search */}
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search classes by topic..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

            </div>

          </div>
        </Card>

        {/* Classes Table / Grid list */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6">Course</th>
                    <th className="p-4">Topic / Agenda</th>
                    <th className="p-4">Starts At</th>
                    <th className="p-4">Ends At</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 pr-6 text-right">Webinar Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filtered.map((cls) => {
                    const isUpcoming = cls.status === "Upcoming" || cls.status === "SCHEDULED";
                    const starts = new Date(cls.timeStart);
                    const ends = new Date(cls.timeEnd);
                    return (
                      <tr key={cls.id} className="hover:bg-surface-2/10 transition">
                        <td className="p-4 pl-6">
                          <span className="font-extrabold text-ink bg-accent-soft/20 text-accent px-2.5 py-1 rounded-lg">
                            {cls.courseCode}
                          </span>
                        </td>
                        <td className="p-4 min-w-[200px]">
                          <div className="space-y-0.5">
                            <span className="block font-bold text-ink text-xs">{cls.topic}</span>
                            {cls.agenda && <span className="block text-[10px] text-ink-3">{cls.agenda}</span>}
                          </div>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <span className="block text-ink">{starts.toLocaleDateString()}</span>
                            <span className="block text-[10px] text-ink-3">
                              {starts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <span className="block text-ink">{ends.toLocaleDateString()}</span>
                            <span className="block text-[10px] text-ink-3">
                              {ends.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge tone={isUpcoming ? "accent" : "good"} className="text-[9px] font-black tracking-wider uppercase select-none px-2 py-0.5">
                            {cls.status}
                          </Badge>
                        </td>
                        <td className="p-4 pr-6 text-right whitespace-nowrap">
                          {cls.meetingUrl ? (
                            <a href={cls.meetingUrl} target="_blank" rel="noopener noreferrer">
                              <Button className="h-8.5 px-3 bg-accent hover:bg-accent-hover text-white text-[10px] font-bold rounded-lg inline-flex items-center gap-1 shadow-sm cursor-pointer">
                                Join Class
                                <ExternalLink className="size-3" />
                              </Button>
                            </a>
                          ) : (
                            <span className="text-xs text-ink-3 font-bold select-none">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 space-y-4">
              <div className="size-16 rounded-full bg-surface-2 flex items-center justify-center mx-auto text-ink-3">
                <CalendarDays className="size-8 text-ink-3/40" />
              </div>
              <div className="space-y-1">
                <h5 className="font-extrabold text-sm text-ink">No class sessions match your search</h5>
                <p className="text-[10px] text-ink-3 max-w-[300px] mx-auto leading-relaxed">
                  Try adjusting your subject filters, status tabs, or topic keywords to search different webinar dates.
                </p>
              </div>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
