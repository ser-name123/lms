"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Users,
  GraduationCap,
  ClipboardList,
  Wallet,
  ArrowRight,
  Video,
  Clock,
  Loader2,
  TrendingUp,
  Award,
  BookOpen,
  MessageSquare,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchTeacherDashboard, fetchTeacherStudents } from "@/lib/api";

const performanceData = [
  { month: "Jan", classes: 12, hours: 24, graded: 18 },
  { month: "Feb", classes: 16, hours: 32, graded: 25 },
  { month: "Mar", classes: 18, hours: 36, graded: 30 },
  { month: "Apr", classes: 14, hours: 28, graded: 22 },
  { month: "May", classes: 20, hours: 40, graded: 35 },
  { month: "Jun", classes: 24, hours: 48, graded: 42 },
];

export default function TeacherDashboard() {
  const [data, setData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchTeacherDashboard(), fetchTeacherStudents()])
      .then(([dashboardRes, studentsRes]) => {
        setData(dashboardRes);
        setStudents(studentsRes.slice(0, 5)); // Take top 5
      })
      .catch((err) => {
        console.error("Failed to fetch teacher dashboard details", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Welcome to Al Furqan Instructor Room" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading teacher dashboard...</p>
          </div>
        </div>
      </>
    );
  }

  const metrics = data?.metrics || {
    totalClasses: 0,
    totalStudents: 0,
    pendingGrades: 0,
    lastPayoutAmount: 0,
    courseName: "No Assigned Subject",
    courseCode: "—",
  };

  const upcomingClasses = data?.upcomingClasses || [];

  return (
    <>
      <Topbar title="Dashboard" subtitle="Welcome back, Teacher! Here is your academic center overview." />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Top welcome banner */}
        <div className="rounded-3xl bg-gradient-to-r from-accent via-[#3F88C5] to-[#59A5D8] p-6 sm:p-8 text-white relative overflow-hidden shadow-lg border border-accent/10">
          <div className="absolute right-0 bottom-0 opacity-15 translate-y-1/4 translate-x-1/4 pointer-events-none select-none">
            <GraduationCap className="size-96" />
          </div>
          <div className="relative space-y-3.5 max-w-2xl">
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md">
              Teaching Assignment
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              {metrics.courseName}
            </h2>
            <p className="text-xs text-white/80 font-bold tracking-wider uppercase flex items-center gap-1.5">
              <span>Course Code: {metrics.courseCode}</span>
              &bull;
              <span>Status: Active Academic Instructor</span>
            </p>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <Card className="border border-hairline bg-surface rounded-3xl p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
            <div className="size-14 rounded-2xl bg-accent-soft/25 text-accent flex items-center justify-center shadow-inner">
              <CalendarDays className="size-7" />
            </div>
            <div className="space-y-0.5">
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Class Logs</span>
              <h4 className="text-2xl font-black text-ink leading-none">{metrics.totalClasses}</h4>
              <span className="block text-[9px] text-good font-bold flex items-center gap-0.5 mt-1">
                <TrendingUp className="size-3" /> +4 this week
              </span>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
            <div className="size-14 rounded-2xl bg-good-soft/25 text-good flex items-center justify-center shadow-inner">
              <Users className="size-7" />
            </div>
            <div className="space-y-0.5">
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Active Students</span>
              <h4 className="text-2xl font-black text-ink leading-none">{metrics.totalStudents}</h4>
              <span className="block text-[9px] text-ink-3 font-semibold mt-1">
                Assigned to your subject
              </span>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
            <div className="size-14 rounded-2xl bg-critical-soft/25 text-critical flex items-center justify-center shadow-inner">
              <ClipboardList className="size-7" />
            </div>
            <div className="space-y-0.5">
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Pending Evaluation</span>
              <h4 className="text-2xl font-black text-ink leading-none">{metrics.pendingGrades}</h4>
              {metrics.pendingGrades > 0 ? (
                <span className="block text-[9px] text-critical font-bold mt-1 animate-pulse">
                  Requires action soon
                </span>
              ) : (
                <span className="block text-[9px] text-good font-bold mt-1">
                  All work graded!
                </span>
              )}
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
            <div className="size-14 rounded-2xl bg-warning-soft/25 text-warning flex items-center justify-center shadow-inner">
              <Wallet className="size-7" />
            </div>
            <div className="space-y-0.5">
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Latest Monthly Payout</span>
              <h4 className="text-2xl font-black text-ink leading-none">
                ${metrics.lastPayoutAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h4>
              <span className="block text-[9px] text-ink-3 font-semibold mt-1">
                Settled to Bank Transfer
              </span>
            </div>
          </Card>

        </div>

        {/* Analytics Charts & Panels */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Chart Card */}
          <Card className="border border-hairline bg-surface rounded-3xl p-6 xl:col-span-2 space-y-4 shadow-sm">
            <div>
              <h3 className="font-extrabold text-sm text-ink">Academic Performance Trend</h3>
              <p className="text-[10px] text-ink-3 font-semibold">Monthly overview of completed hours and graded submissions</p>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#386FA4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#386FA4" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold", fill: "#999" }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold", fill: "#999" }} />
                  <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "12px", border: "1px solid #EAEAEA", fontWeight: "bold" }} />
                  <Area type="monotone" name="Teaching Hours" dataKey="hours" stroke="#386FA4" strokeWidth={2.5} fillOpacity={1} fill="url(#hoursGrad)" />
                  <Area type="monotone" name="Graded Submissions" dataKey="graded" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#gradedGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Quick Actions Panel */}
          <Card className="border border-hairline bg-surface rounded-3xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h3 className="font-extrabold text-sm text-ink">Instructor Shortcuts</h3>
                <p className="text-[10px] text-ink-3 font-semibold">Immediate access to your main teaching duties</p>
              </div>

              <div className="space-y-2.5">
                <Link href="/teacher/classes" className="w-full p-3.5 rounded-2xl border border-hairline hover:border-accent/40 hover:bg-accent-soft/10 flex items-center justify-between transition duration-200 group">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
                      <Video className="size-4.5" />
                    </div>
                    <div className="text-left">
                      <span className="block text-xs font-bold text-ink">Launch Class Schedule</span>
                      <span className="block text-[9px] text-ink-3">Access class meeting links</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-ink-3 group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link href="/teacher/assignments" className="w-full p-3.5 rounded-2xl border border-hairline hover:border-good/40 hover:bg-good-soft/10 flex items-center justify-between transition duration-200 group">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
                      <Award className="size-4.5" />
                    </div>
                    <div className="text-left">
                      <span className="block text-xs font-bold text-ink">Grade Submissions</span>
                      <span className="block text-[9px] text-ink-3">Evaluate homework tasks</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-ink-3 group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link href="/teacher/chat" className="w-full p-3.5 rounded-2xl border border-hairline hover:border-warning/40 hover:bg-warning-soft/10 flex items-center justify-between transition duration-200 group">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
                      <MessageSquare className="size-4.5" />
                    </div>
                    <div className="text-left">
                      <span className="block text-xs font-bold text-ink">Support Chat Desk</span>
                      <span className="block text-[9px] text-ink-3">Resolve student help tickets</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-ink-3 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </Card>

        </div>

        {/* Lower Row: Schedule Timeline & Student List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Upcoming Class Schedule */}
          <Card className="border border-hairline bg-surface rounded-3xl p-6 lg:col-span-2 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
                <Video className="size-4.5 text-accent" />
                Live Webinar Calendar
              </h3>
              <Link href="/teacher/classes">
                <Button variant="ghost" className="h-7 text-[10px] font-bold text-accent px-2 flex items-center gap-0.5">
                  See Full List
                  <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>

            {upcomingClasses.length > 0 ? (
              <div className="space-y-3.5">
                {upcomingClasses.map((cls: any) => {
                  const starts = new Date(cls.timeStart);
                  return (
                    <div key={cls.id} className="border border-hairline rounded-2xl p-4 bg-surface flex items-start gap-4 hover:border-accent/30 transition duration-200">
                      <div className="size-11 rounded-xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0 shadow-inner">
                        <CalendarDays className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <span className="inline-block rounded-full bg-accent-soft/30 text-[8px] font-black text-accent px-2 py-0.5 uppercase tracking-wider">
                          {cls.courseCode}
                        </span>
                        <h4 className="font-bold text-xs text-ink truncate">{cls.topic}</h4>
                        <p className="text-[10px] text-ink-3 font-semibold flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {starts.toLocaleDateString()} at {starts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {cls.meetingUrl && (
                        <a href={cls.meetingUrl} target="_blank" rel="noopener noreferrer">
                          <Button className="h-8.5 px-3 bg-accent text-white font-bold text-[10px] rounded-lg shrink-0 flex items-center gap-1 cursor-pointer">
                            Launch Room
                          </Button>
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 space-y-2">
                <CalendarDays className="size-10 text-ink-3/30 mx-auto" />
                <h5 className="font-extrabold text-xs text-ink">No upcoming live schedules</h5>
                <p className="text-[10px] text-ink-3 max-w-[240px] mx-auto leading-relaxed">
                  When administrators schedule a new live webinar or lesson session, it will show up here.
                </p>
              </div>
            )}
          </Card>

          {/* Active Students Quick Cards */}
          <Card className="border border-hairline bg-surface rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
                <UserCheck className="size-4.5 text-accent" />
                Enrolled Students
              </h3>
              <Link href="/teacher/students">
                <Button variant="ghost" className="h-7 text-[10px] font-bold text-accent px-2 flex items-center gap-0.5">
                  View Roster
                  <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>

            {students.length > 0 ? (
              <div className="divide-y divide-hairline space-y-3.5">
                {students.map((student, i) => (
                  <div key={student.id} className={`flex items-center gap-3 ${i > 0 ? "pt-3.5" : ""}`}>
                    <div className="size-9 rounded-xl overflow-hidden bg-accent-soft/20 text-accent flex items-center justify-center font-extrabold text-xs border border-hairline shrink-0">
                      {student.avatarUrl ? (
                        <img src={student.avatarUrl} alt={student.firstName} className="size-full object-cover" />
                      ) : (
                        <span>
                          {student.firstName.substring(0, 1).toUpperCase()}
                          {student.lastName.substring(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block font-bold text-xs text-ink truncate leading-tight">
                        {student.firstName} {student.lastName}
                      </span>
                      <span className="block text-[8px] text-ink-3 font-extrabold uppercase mt-0.5">
                        Code: {student.studentCode}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 space-y-2">
                <Users className="size-10 text-ink-3/30 mx-auto" />
                <h5 className="font-extrabold text-xs text-ink">No active students</h5>
                <p className="text-[10px] text-ink-3 max-w-[200px] mx-auto leading-relaxed">
                  There are no student accounts enrolled in your subject courses today.
                </p>
              </div>
            )}
          </Card>

        </div>

      </main>
    </>
  );
}
