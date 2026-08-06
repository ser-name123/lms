"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  ExternalLink,
  Loader2,
  Video,
  User,
  Search,
  Filter,
  CheckCircle,
  PlayCircle,
  VideoIcon,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchTeacherMeetings } from "@/lib/api";

export default function TeacherMeetings() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UPCOMING" | "COMPLETED">("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  useEffect(() => {
    fetchTeacherMeetings()
      .then((res) => {
        setMeetings(res);
      })
      .catch((err) => {
        console.error("Failed to load teacher meetings", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleJoin = (link: string | null) => {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      Swal.fire({
        title: "No Link Provided",
        text: "The organizer has not configured a video URL link for this meeting yet.",
        icon: "info",
        confirmButtonColor: "#386FA4",
      });
    }
  };

  // Compute unique meeting types
  const uniqueTypes = Array.from(new Set(meetings.map((m) => m.type))).filter(Boolean);

  const filtered = meetings.filter((m) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      m.topic?.toLowerCase().includes(q) ||
      m.host?.toLowerCase().includes(q) ||
      (m.agenda && m.agenda.toLowerCase().includes(q));

    const isUpcoming = m.status === "Upcoming" || m.status === "Live" || m.status === "SCHEDULED";
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "UPCOMING" && isUpcoming) ||
      (statusFilter === "COMPLETED" && !isUpcoming);

    const matchesType = typeFilter === "ALL" || m.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  if (loading) {
    return (
      <>
        <Topbar title="Live Meetings" subtitle="Interactive webinars" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading academy webinars...</p>
          </div>
        </div>
      </>
    );
  }

  // Quick stats
  const totalCount = meetings.length;
  const upcomingCount = meetings.filter((m) => m.status === "Upcoming" || m.status === "Live" || m.status === "SCHEDULED").length;
  const completedCount = totalCount - upcomingCount;

  return (
    <>
      <Topbar title="Live Meetings" subtitle="Join interactive school webinars, announcements, and teacher workshops" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Futuristic Roster Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <Video className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Invitations</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{totalCount} Assemblies</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
              <PlayCircle className="size-6 animate-pulse" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Upcoming Webinars</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{upcomingCount} Scheduled</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
              <CheckCircle className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Completed Sessions</span>
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
                All Meetings ({totalCount})
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
              
              {/* Type Selector Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-9.5 pl-9 pr-8 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none min-w-[150px]"
                >
                  <option value="ALL">All Meeting Types</option>
                  {uniqueTypes.map((t: any) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Topic search */}
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search topic or host..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

            </div>

          </div>
        </Card>

        {/* Meetings Cards Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map((item) => {
              const start = new Date(item.timeStart);
              const end = new Date(item.timeEnd);
              const isUpcoming = item.status === "Upcoming" || item.status === "Live" || item.status === "SCHEDULED";
              
              return (
                <Card
                  key={item.id}
                  className="border border-hairline bg-surface rounded-3xl p-6 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-extrabold text-sm text-ink leading-relaxed">
                        {item.topic}
                      </h3>
                      <Badge tone={item.status === "Upcoming" ? "accent" : item.status === "Live" ? "good" : "neutral"} className="font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5">
                        {item.status}
                      </Badge>
                    </div>

                    {item.agenda && (
                      <p className="text-xs text-ink-3 leading-relaxed">
                        {item.agenda}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-3 font-semibold border-b border-hairline/80 pb-3.5">
                      <span className="flex items-center gap-1.5">
                        <User className="size-4 text-accent" />
                        Hosted by: {item.host}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <VideoIcon className="size-4 text-accent" />
                        Type: {item.type}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-1">
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
                        onClick={() => handleJoin(item.link)}
                        className="bg-accent hover:bg-accent-hover text-white text-xs font-extrabold h-9.5 px-5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <ExternalLink className="size-3.5" />
                        Launch Webinar
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm max-w-lg mx-auto space-y-4">
            <Video className="size-12 text-ink-3/40 mx-auto" />
            <h3 className="font-extrabold text-sm text-ink">No meetings found matching filters</h3>
            <p className="text-xs text-ink-3 leading-relaxed px-8">
              Adjust your status filter tabs or query keyword searches to lookup other webinars scheduled in the system.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
