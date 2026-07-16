"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchTeacherClasses } from "@/lib/api";

export default function TeacherLiveClasses() {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UPCOMING" | "COMPLETED">("ALL");
  const [courseFilter, setCourseFilter] = useState("ALL");

  useEffect(() => {
    fetchTeacherClasses()
      .then((res) => {
        setClasses(res);
      })
      .catch((err) => {
        console.error("Failed to load classes for live center", err);
      })
      .finally(() => {
        setLoading(false);
      });
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

  // Compute unique course codes
  const uniqueCourses = Array.from(new Set(classes.map((c) => c.courseCode))).filter(Boolean);

  const filtered = classes.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      c.topic?.toLowerCase().includes(q) ||
      c.courseCode?.toLowerCase().includes(q) ||
      (c.agenda && c.agenda.toLowerCase().includes(q));

    const isUpcoming = c.status === "Upcoming" || c.status === "SCHEDULED";
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "UPCOMING" && isUpcoming) ||
      (statusFilter === "COMPLETED" && !isUpcoming);

    const matchesCourse = courseFilter === "ALL" || c.courseCode === courseFilter;

    return matchesSearch && matchesStatus && matchesCourse;
  });

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

  // Quick stats
  const totalCount = classes.length;
  const upcomingCount = classes.filter((c) => c.status === "Upcoming" || c.status === "SCHEDULED").length;
  const completedCount = totalCount - upcomingCount;

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
                  placeholder="Search topic or course code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

            </div>

          </div>
        </Card>

        {/* Classes Cards Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map((cls) => {
              const start = new Date(cls.timeStart);
              const end = new Date(cls.timeEnd);
              const isUpcoming = cls.status === "Upcoming" || cls.status === "SCHEDULED";
              
              return (
                <Card
                  key={cls.id}
                  className="border border-hairline bg-surface rounded-3xl p-6 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-block bg-accent-soft/20 text-accent text-[9px] font-black tracking-wider uppercase px-2.5 py-1 rounded-lg">
                        {cls.courseCode}
                      </span>
                      <Badge tone={isUpcoming ? "accent" : "neutral"} className="font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5">
                        {isUpcoming ? "Upcoming" : "Finished"}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-extrabold text-sm text-ink">{cls.topic}</h4>
                      {cls.agenda && <p className="text-xs text-ink-3 leading-relaxed font-semibold">{cls.agenda}</p>}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-hairline">
                      <p className="text-xs font-bold text-ink-2 flex items-center gap-1.5">
                        <Calendar className="size-4 text-accent" />
                        {start.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-ink-3 font-bold flex items-center gap-1.5 pl-5.5">
                        <Clock className="size-3.5" />
                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                        {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>

                  {isUpcoming && (
                    <div className="pt-5 border-t border-hairline mt-4 flex justify-end">
                      <Button
                        onClick={() => handleStartClass(cls.meetingUrl)}
                        className="bg-accent hover:bg-accent-hover text-white text-xs font-extrabold h-9.5 px-5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <ExternalLink className="size-3.5" />
                        Start Broadcast Class
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="border border-hairline bg-surface rounded-3xl p-12 text-center space-y-4 shadow-sm w-full">
            <Video className="size-12 text-ink-3/40 mx-auto" />
            <h3 className="font-extrabold text-sm text-ink">No Scheduled Broadcasts Found</h3>
            <p className="text-xs text-ink-3 leading-relaxed">
              Adjust your status filter tabs or query keyword searches to lookup other classes scheduled in the system.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
