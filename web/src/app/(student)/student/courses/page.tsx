"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Calendar,
  Loader2,
  User,
  Clock,
  Package,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchStudentEnrollments } from "@/lib/api";
import { initials } from "@/lib/utils";

export default function StudentCourses() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudentEnrollments()
      .then((res) => {
        setEnrollments(res);
      })
      .catch((err) => {
        console.error("Failed to load student enrollments", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <>
        <Topbar title="My Courses" subtitle="Track your enrolled classes" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading your active courses...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="My Courses" subtitle="Manage your active enrollments and syllabuses" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        {enrollments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-up">
            {enrollments.map((enr) => {
              const teacher = enr.teacher;
              const teacherName = teacher
                ? `${teacher.user.firstName} ${teacher.user.lastName}`
                : "Not Assigned Yet";
              const dateStarted = enr.startedAt
                ? new Date(enr.startedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—";

              return (
                <Card
                  key={enr.id}
                  className="border border-hairline bg-surface rounded-3xl hover:shadow-xl hover:border-accent/30 transition-all duration-300 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* Header banner decoration */}
                    <div className="h-16 bg-gradient-to-r from-accent/15 via-[#386FA4]/10 to-[#59A5D8]/5 p-4 flex items-center justify-between border-b border-hairline/80">
                      <Badge tone={enr.status === "ACTIVE" ? "good" : "neutral"} className="font-extrabold text-[9px] tracking-wider uppercase px-2.5">
                        {enr.status}
                      </Badge>
                      <div className="flex items-center gap-1.5 text-[10px] text-ink-3 font-extrabold uppercase">
                        <Clock className="size-3.5" />
                        {enr.course.durationWeeks} Weeks
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {/* Course details */}
                      <div className="space-y-1.5">
                        <h3 className="text-sm font-extrabold text-ink leading-snug">
                          {enr.course.title}
                        </h3>
                        <p className="text-[11px] text-ink-3 font-semibold">
                          Course Code: <span className="text-ink-2 font-bold">{enr.course.slug.toUpperCase()}</span>
                        </p>
                        <p className="text-[11px] text-ink-3 leading-relaxed mt-2.5 font-medium">
                          {enr.course.description || "No description overview added for this course curriculum yet. Contact supervisor for curriculum guides."}
                        </p>
                      </div>

                      {/* Info widgets row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-b border-hairline py-4">
                        {/* Instructor */}
                        <div className="flex items-start gap-3">
                          <div className="grid size-9.5 shrink-0 place-items-center rounded-xl bg-accent-soft/30 text-accent font-bold text-xs">
                            {teacher?.user.avatarUrl ? (
                              <img
                                src={teacher.user.avatarUrl}
                                alt={teacherName}
                                className="size-full object-cover rounded-xl"
                              />
                            ) : (
                              initials(teacherName)
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[10px] text-ink-3 font-extrabold uppercase tracking-wider">Teacher</span>
                            <span className="block text-xs font-bold text-ink-2 truncate mt-0.5">{teacherName}</span>
                            {teacher?.user.email && (
                              <span className="block text-[10px] text-ink-3 truncate leading-none mt-0.5">{teacher.user.email}</span>
                            )}
                          </div>
                        </div>

                        {/* Package */}
                        <div className="flex items-start gap-3">
                          <div className="grid size-9.5 shrink-0 place-items-center rounded-xl bg-surface-3 text-ink-3">
                            <Package className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[10px] text-ink-3 font-extrabold uppercase tracking-wider">Billing Tier</span>
                            <span className="block text-xs font-bold text-ink-2 truncate mt-0.5">
                              {enr.package?.name || "Standard Subscription"}
                            </span>
                            {enr.package?.classesPerMonth && (
                              <span className="block text-[10px] text-ink-3 truncate leading-none mt-0.5">
                                {enr.package.classesPerMonth} Classes / month
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Course progress */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-ink-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3.5 text-accent" />
                            Joined on {dateStarted}
                          </span>
                          <span className="tnum font-extrabold text-accent text-xs">{enr.progress}% Done</span>
                        </div>
                        <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all duration-500 rounded-full"
                            style={{ width: `${enr.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm max-w-md mx-auto space-y-4">
            <BookOpen className="size-10 text-ink-3/40 mx-auto" />
            <h3 className="font-extrabold text-sm text-ink">No Enrolled Courses Found</h3>
            <p className="text-xs text-ink-3 leading-relaxed px-6">
              You are not registered in any active subject packages. Please contact your coordinator or supervisor to assign courses to your profile.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
