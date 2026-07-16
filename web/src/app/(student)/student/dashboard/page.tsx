"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  AlertCircle,
  Receipt,
  User,
  ClipboardList,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchStudentDashboard, attendStudentClass } from "@/lib/api";

export default function StudentDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    fetchStudentDashboard()
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        console.error("Failed to load student dashboard", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
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
        title: "No Link Provided",
        text: "The instructor has not added a link for this session yet.",
        icon: "info",
        confirmButtonColor: "#386FA4",
      });
    }
    loadData();
  };

  if (loading) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Overview of your learning progress" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading student portal overview...</p>
          </div>
        </div>
      </>
    );
  }

  const stats = data?.stats || {
    activeCoursesCount: 0,
    pendingAssignmentsCount: 0,
    completedAssignmentsCount: 0,
    attendanceRate: 100,
    pendingInvoicesCount: 0,
    overdueInvoicesCount: 0,
    averageProgress: 0,
  };

  const upcomingClasses = data?.upcomingClasses || [];
  const activeEnrollments = data?.activeEnrollments || [];

  return (
    <>
      <Topbar title="Dashboard" subtitle="Overview of your academy activities" />
      
      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto animate-fade-up">
        {/* Top welcome layout */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-accent/10 border border-accent/15 rounded-3xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-500" />
          <div className="space-y-1.5">
            <h2 className="text-2xl font-black text-ink flex items-center gap-2">
              Assalamu Alaikum, Student! 👋
            </h2>
            <p className="text-sm text-ink-3 font-semibold leading-relaxed max-w-xl">
              Welcome back to your Al Furqan learning space. Stay updated with your class timings, review recent course materials, and submit your due coursework.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/student/classes">
              <Button variant="primary" className="rounded-xl h-11 px-5 font-bold text-sm flex items-center gap-1.5 shadow-sm">
                <Calendar className="size-4.5" />
                View Schedule
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="p-5 border border-hairline shadow-sm bg-surface hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-ink-3 uppercase font-extrabold tracking-wider">Active Subjects</span>
                <p className="text-3xl font-black text-ink mt-1.5">{stats.activeCoursesCount}</p>
              </div>
              <div className="size-11 rounded-xl bg-accent/8 text-accent flex items-center justify-center">
                <BookOpen className="size-5.5" />
              </div>
            </div>
            <Link href="/student/courses" className="text-sm font-bold text-accent hover:underline mt-4 block">
              Explore your courses &rarr;
            </Link>
          </Card>

          <Card className="p-5 border border-hairline shadow-sm bg-surface hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-ink-3 uppercase font-extrabold tracking-wider">Due Tasks</span>
                <p className="text-3xl font-black text-ink mt-1.5">{stats.pendingAssignmentsCount}</p>
              </div>
              <div className="size-11 rounded-xl bg-warning/8 text-warning-ink flex items-center justify-center">
                <ClipboardList className="size-5.5" />
              </div>
            </div>
            <Link href="/student/assignments" className="text-sm font-bold text-accent hover:underline mt-4 block">
              Complete pending tasks &rarr;
            </Link>
          </Card>

          <Card className="p-5 border border-hairline shadow-sm bg-surface hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-ink-3 uppercase font-extrabold tracking-wider">Attendance Rate</span>
                <p className="text-3xl font-black text-ink mt-1.5">{stats.attendanceRate}%</p>
              </div>
              <div className="size-11 rounded-xl bg-good/8 text-good flex items-center justify-center">
                <CheckCircle2 className="size-5.5" />
              </div>
            </div>
            <Link href="/student/classes" className="text-sm font-bold text-accent hover:underline mt-4 block">
              Check attendance log &rarr;
            </Link>
          </Card>

          <Card className="p-5 border border-hairline shadow-sm bg-surface hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-ink-3 uppercase font-extrabold tracking-wider">Pending Bills</span>
                <p className="text-3xl font-black text-ink mt-1.5">
                  {stats.pendingInvoicesCount + stats.overdueInvoicesCount}
                </p>
              </div>
              <div className="size-11 rounded-xl bg-critical/8 text-critical flex items-center justify-center">
                <Receipt className="size-5.5" />
              </div>
            </div>
            <Link href="/student/invoices" className="text-sm font-bold text-accent hover:underline mt-4 block">
              Review current billing &rarr;
            </Link>
          </Card>
        </div>

        {/* Dashboard split rows */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1 & 2: Schedules & Active courses */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Upcoming Classes Card */}
            <Card className="border border-hairline rounded-3xl bg-surface shadow-sm overflow-hidden">
              <div className="px-6 py-4.5 border-b border-hairline bg-surface-2/40 flex justify-between items-center">
                <h3 className="font-extrabold text-base text-ink flex items-center gap-2">
                  <Clock className="size-5 text-accent" />
                  Upcoming Live Classes
                </h3>
                <Link href="/student/classes" className="text-xs text-accent hover:underline font-bold">
                  View Full Schedule
                </Link>
              </div>
              <CardBody className="p-6">
                {upcomingClasses.length > 0 ? (
                  <div className="space-y-4">
                    {upcomingClasses.map((item: any) => {
                      const start = new Date(item.timeStart);
                      return (
                        <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 border border-hairline rounded-2xl bg-surface hover:bg-surface-2/30 transition-all duration-150">
                          <div className="space-y-1.5">
                            <h4 className="font-bold text-sm text-ink">{item.topic}</h4>
                            <div className="flex items-center gap-4 text-xs text-ink-3 font-semibold flex-wrap">
                              <span className="flex items-center gap-1.5">
                                <BookOpen className="size-4" />
                                {item.courseTitle} ({item.courseCode})
                              </span>
                              <span className="flex items-center gap-1.5">
                                <User className="size-4" />
                                Teacher: {item.teacher}
                              </span>
                            </div>
                            <p className="text-xs text-ink-2 font-bold flex items-center gap-1.5 pt-1">
                              <Calendar className="size-4 text-accent" />
                              {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at{" "}
                              {start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <div>
                            <Button
                              onClick={() => handleJoinClass(item.id, item.link)}
                              className="bg-accent hover:bg-accent-hover text-white text-xs font-bold h-10 px-4 rounded-xl flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
                            >
                              <ExternalLink className="size-4" />
                              Join Room
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-ink-3 space-y-2.5">
                    <Calendar className="size-9 text-ink-3/40 mx-auto" />
                    <p className="font-bold text-sm">No upcoming classes scheduled.</p>
                    <p className="text-xs">We will notify you as soon as the teacher schedules a new class session.</p>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Active Enrolled Courses */}
            <Card className="border border-hairline rounded-3xl bg-surface shadow-sm overflow-hidden">
              <div className="px-6 py-4.5 border-b border-hairline bg-surface-2/40 flex justify-between items-center">
                <h3 className="font-extrabold text-base text-ink flex items-center gap-2">
                  <GraduationCap className="size-5 text-accent" />
                  Your Active Subject Packages
                </h3>
                <Link href="/student/courses" className="text-xs text-accent hover:underline font-bold">
                  View All
                </Link>
              </div>
              <CardBody className="p-6">
                {activeEnrollments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4.5">
                    {activeEnrollments.map((enr: any) => (
                      <div key={enr.id} className="p-4.5 border border-hairline rounded-2xl bg-surface hover:shadow-md transition duration-200 space-y-4">
                        <div>
                          <Badge tone="accent" className="font-bold text-[10px] uppercase tracking-wider px-2 py-0.5">
                            Level Progress
                          </Badge>
                          <h4 className="font-bold text-sm text-ink mt-2.5 truncate">{enr.course.title}</h4>
                          <p className="text-xs text-ink-3 line-clamp-2 mt-1 leading-relaxed">
                            {enr.course.description || "Course description details are current empty."}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm font-bold text-ink-2">
                            <span>Syllabus completed</span>
                            <span className="tnum text-accent text-sm">{enr.progress}%</span>
                          </div>
                          <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-accent transition-all duration-500 rounded-full" 
                              style={{ width: `${enr.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-ink-3 space-y-2.5">
                    <BookOpen className="size-9 text-ink-3/40 mx-auto" />
                    <p className="font-bold text-sm">No active courses found.</p>
                    <p className="text-xs">Contact management to sign up for classes.</p>
                  </div>
                )}
              </CardBody>
            </Card>

          </div>

          {/* Column 3: Radial Progress and Quick Actions */}
          <div className="space-y-6">
            
            {/* Radial Progress Circle */}
            <Card className="border border-hairline rounded-3xl bg-surface shadow-sm overflow-hidden flex flex-col justify-center">
              <div className="px-6 py-4.5 border-b border-hairline bg-surface-2/40">
                <h3 className="font-extrabold text-base text-ink text-center">
                  Academy Evaluation Profile
                </h3>
              </div>
              <CardBody className="p-6 flex flex-col items-center justify-center space-y-4">
                <div className="relative size-38 flex items-center justify-center">
                  {/* Circle SVG */}
                  <svg className="size-full -rotate-90">
                    <circle 
                      cx="76" 
                      cy="76" 
                      r="64" 
                      stroke="var(--hairline)" 
                      strokeWidth="11" 
                      fill="transparent" 
                      className="stroke-surface-3"
                    />
                    <circle 
                      cx="76" 
                      cy="76" 
                      r="64" 
                      stroke="var(--accent)" 
                      strokeWidth="11" 
                      fill="transparent" 
                      strokeDasharray={2 * Math.PI * 64}
                      strokeDashoffset={2 * Math.PI * 64 * (1 - stats.averageProgress / 100)}
                      className="stroke-accent transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-4xl font-black text-ink tracking-tight">{stats.averageProgress}%</span>
                    <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-widest mt-1">Average</span>
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-bold text-ink">Overall Syllabus Mastery</p>
                  <p className="text-xs text-ink-3 max-w-[210px] leading-relaxed mx-auto">
                    Your average curriculum progression across all enrolled classes.
                  </p>
                </div>
              </CardBody>
            </Card>

            {/* Quick Actions Panel */}
            <Card className="border border-hairline rounded-3xl bg-surface shadow-sm overflow-hidden">
              <div className="px-6 py-4.5 border-b border-hairline bg-surface-2/40">
                <h3 className="font-extrabold text-base text-ink">
                  Academy Quick Actions
                </h3>
              </div>
              <CardBody className="p-4 space-y-2.5">
                <Link href="/student/profile" className="flex items-center gap-3.5 p-3.5 border border-hairline hover:border-accent/40 rounded-xl hover:bg-accent-soft/10 text-base font-bold text-ink-2 hover:text-accent transition duration-150">
                  <span className="grid size-9.5 place-items-center rounded-lg bg-surface-3 text-ink-3">
                    <User className="size-4.5" />
                  </span>
                  Update Personal Profile
                </Link>
                <Link href="/student/invoices" className="flex items-center gap-3.5 p-3.5 border border-hairline hover:border-accent/40 rounded-xl hover:bg-accent-soft/10 text-base font-bold text-ink-2 hover:text-accent transition duration-150">
                  <span className="grid size-9.5 place-items-center rounded-lg bg-surface-3 text-ink-3">
                    <Receipt className="size-4.5" />
                  </span>
                  Pay Fees & Dues
                </Link>
                <Link href="/student/assignments" className="flex items-center gap-3.5 p-3.5 border border-hairline hover:border-accent/40 rounded-xl hover:bg-accent-soft/10 text-base font-bold text-ink-2 hover:text-accent transition duration-150">
                  <span className="grid size-9.5 place-items-center rounded-lg bg-surface-3 text-ink-3">
                    <ClipboardList className="size-4.5" />
                  </span>
                  Submit Pending Homework
                </Link>
              </CardBody>
            </Card>

          </div>

        </div>
      </main>
    </>
  );
}
