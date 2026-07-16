"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  Search,
  BookOpen,
  User,
  Check,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchStudentClasses, attendStudentClass } from "@/lib/api";

export default function StudentClasses() {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  const loadClasses = () => {
    setLoading(true);
    fetchStudentClasses()
      .then((res) => {
        setClasses(res);
      })
      .catch((err) => {
        console.error("Failed to load student classes", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleJoinClass = async (classId: string, meetLink: string | null) => {
    try {
      await attendStudentClass(classId);
    } catch (e) {
      console.warn("Failed to mark attendance logs", e);
    }

    if (meetLink) {
      window.open(meetLink, "_blank", "noopener,noreferrer");
    } else {
      Swal.fire({
        title: "No Link Added",
        text: "Your instructor has not configured a video meeting link for this classroom yet.",
        icon: "info",
        confirmButtonColor: "#386FA4",
      });
    }
    loadClasses();
  };

  if (loading) {
    return (
      <>
        <Topbar title="My Schedule" subtitle="Check your class sessions" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading class schedules...</p>
          </div>
        </div>
      </>
    );
  }

  const now = new Date();
  const upcomingList = classes.filter((c) => {
    const end = new Date(c.timeEnd);
    return end >= now && c.status !== "Completed";
  });

  const pastList = classes.filter((c) => {
    const end = new Date(c.timeEnd);
    return end < now || c.status === "Completed";
  });

  const currentList = activeTab === "upcoming" ? upcomingList : pastList;

  return (
    <>
      <Topbar title="My Schedule" subtitle="Stay updated with your live online classes" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        {/* Navigation Tabs */}
        <div className="flex border-b border-hairline select-none">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-5 py-3 text-xs font-bold transition-all relative cursor-pointer ${
              activeTab === "upcoming"
                ? "text-accent font-extrabold"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            Upcoming Sessions
            {activeTab === "upcoming" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`px-5 py-3 text-xs font-bold transition-all relative cursor-pointer ${
              activeTab === "past"
                ? "text-accent font-extrabold"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            Past Classes & Attendance
            {activeTab === "past" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        </div>

        {/* Display classes */}
        {currentList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-up">
            {currentList.map((item) => {
              const start = new Date(item.timeStart);
              const end = new Date(item.timeEnd);
              const isPast = end < now || item.status === "Completed";

              return (
                <Card
                  key={item.id}
                  className={`border bg-surface rounded-3xl p-5 hover:shadow-lg transition-all duration-200 relative ${
                    item.attended ? "border-good/30 bg-good-soft/5" : "border-hairline"
                  }`}
                >
                  <div className="flex flex-col justify-between h-full space-y-4">
                    <div className="space-y-3">
                      {/* Topic & badges */}
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-extrabold text-xs text-ink leading-relaxed">
                          {item.topic}
                        </h3>
                        {item.attended ? (
                          <Badge tone="good" className="font-black text-[9px] uppercase tracking-wider px-2 py-0.5 flex items-center gap-0.5">
                            <Check className="size-3" />
                            Attended
                          </Badge>
                        ) : isPast ? (
                          <Badge tone="critical" className="font-black text-[9px] uppercase tracking-wider px-2 py-0.5">
                            Absent
                          </Badge>
                        ) : (
                          <Badge tone="accent" className="font-black text-[9px] uppercase tracking-wider px-2 py-0.5">
                            Scheduled
                          </Badge>
                        )}
                      </div>

                      {/* Course details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-3 font-semibold border-b border-hairline/80 pb-3">
                        <span className="flex items-center gap-1">
                          <BookOpen className="size-3.5" />
                          {item.courseTitle}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="size-3.5" />
                          Teacher: {item.teacher}
                        </span>
                      </div>

                      {/* Date details */}
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-ink-2 flex items-center gap-1.5">
                          <Calendar className="size-4 text-accent" />
                          {start.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-[11px] text-ink-3 font-bold flex items-center gap-1.5 pl-5.5">
                          <Clock className="size-3.5" />
                          {start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>

                    {/* Join button */}
                    {!isPast && (
                      <div className="pt-2">
                        <Button
                          onClick={() => handleJoinClass(item.id, item.link)}
                          className="bg-accent hover:bg-accent-hover text-white text-xs font-extrabold h-9 px-4.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm shadow-accent/10"
                        >
                          <ExternalLink className="size-3.5" />
                          Join Classroom
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm max-w-md mx-auto space-y-4">
            <Calendar className="size-10 text-ink-3/40 mx-auto" />
            <h3 className="font-extrabold text-sm text-ink">No Classes Found</h3>
            <p className="text-xs text-ink-3 leading-relaxed px-6">
              {activeTab === "upcoming"
                ? "You do not have any upcoming class sessions scheduled. If you signed up recently, please wait for your instructor to add classes."
                : "No past class logs exist for your active enrollments."}
            </p>
          </div>
        )}
      </main>
    </>
  );
}
