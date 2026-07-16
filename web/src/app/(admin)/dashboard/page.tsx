"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowUpRight, CircleAlert, GraduationCap, Receipt, Video, Calendar, Heart, Pencil, Trash, Send, Paperclip, Bold, Italic, Link2, List, ListOrdered, Quote, Table2, FileVideo, Undo2, Redo2, Image as ImageIcon } from "lucide-react";

import { StatTile } from "@/components/dashboard/stat-tile";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { fetchDashboard, type DashboardOverview } from "@/lib/api";
import { cn } from "@/lib/utils";

const RANGES = ["7d", "30d", "90d", "12m"] as const;

const activityIcon = {
  payment: Receipt,
  enroll: GraduationCap,
  class: Video,
  alert: CircleAlert,
};

/** "3 Jul 2026" from an ISO date. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Compact relative time — "6m ago", "2h ago", "3d ago". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchDashboard()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? "Failed to load dashboard");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const kpis = data?.kpis ?? [];
  const newStudentList = data?.newStudentList ?? [];
  const activity = data?.activity ?? [];
  const educationCourses = data?.educationCourses ?? [];

  const handleSendEmail = async () => {
    if (!toEmail) {
      alert("Please enter a recipient email address.");
      return;
    }
    if (!subject) {
      alert("Please enter a subject.");
      return;
    }
    if (!message) {
      alert("Please enter your message.");
      return;
    }

    setSending(true);

    try {
      const formData = new FormData();
      formData.append("to", toEmail);
      formData.append("subject", subject);
      formData.append("message", message);
      if (file) {
        formData.append("attachment", file);
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem("accessToken") : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("http://localhost:5000/api/emails/send", {
        method: "POST",
        headers,
        body: formData,
      });

      if (response.ok) {
        alert("Email sent successfully!");
        setToEmail("");
        setSubject("");
        setMessage("");
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to send email: ${errorData.message || response.statusText}`);
      }
    } catch (error: any) {
      console.error("Error sending email:", error);
      alert(`An error occurred: ${error.message || error}`);
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <Topbar title="Dashboard" subtitle="Tuesday, 14 July 2026" />

      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {error && (
          <div className="rounded-lg border border-critical/20 bg-critical/10 px-4 py-3 text-sm font-medium text-critical">
            {error}
          </div>
        )}

        {/* Filters sit in one row above the charts. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
            {RANGES.map((range) => (
              <button
                key={range}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  range === "12m"
                    ? "bg-surface-2 text-ink shadow-[var(--shadow-card)]"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {range}
              </button>
            ))}
          </div>

          <Button variant="primary" size="sm">
            Export report
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>

        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading && kpis.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl border border-hairline bg-surface-2/40"
                />
              ))
            : kpis.map((kpi) => <StatTile key={kpi.id} kpi={kpi} />)}
        </div>

        {/* New Student List */}
        <Card className="border border-hairline bg-surface">
          <CardHeader title="New Student List" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] font-bold uppercase tracking-wider text-ink-3 bg-surface-2">
                  <th className="px-5 py-3.5">No.</th>
                  <th className="px-5 py-3.5">Name</th>
                  <th className="px-5 py-3.5">Assigned Professor</th>
                  <th className="px-5 py-3.5">Date of Admit</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Subject</th>
                  <th className="px-5 py-3.5">Fees</th>
                  <th className="px-5 py-3.5 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/60">
                {newStudentList.map((student) => (
                  <tr key={student.no} className="hover:bg-surface-2/20 transition-colors">
                    <td className="px-5 py-4 font-semibold text-ink-2">{student.no}</td>
                    <td className="px-5 py-4 font-bold text-ink">{student.name}</td>
                    <td className="px-5 py-4 text-ink-2 font-medium">{student.professor}</td>
                    <td className="px-5 py-4 text-ink-3 font-semibold">{formatDate(student.date)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold",
                          student.status === "Checkin" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                          student.status === "Pending" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                          student.status === "Canceled" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        )}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-medium text-ink-2">{student.subject}</td>
                    <td className="px-5 py-4 font-bold text-ink-2">{student.fees}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-1.5">
                        <button type="button" className="p-1.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white rounded-md transition-colors" aria-label="Edit">
                          <Pencil className="size-3.5" />
                        </button>
                        <button type="button" className="p-1.5 bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white rounded-md transition-colors" aria-label="Delete">
                          <Trash className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && newStudentList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm font-medium text-ink-3">
                      No students yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Quick Compose & Recent Activity row */}
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Quick Compose */}
          <Card className="lg:col-span-5 border border-hairline bg-surface flex flex-col">
            <CardHeader title="Quick Email Compose" />
            <CardBody className="p-5 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center border border-hairline rounded-lg overflow-hidden bg-surface-2/40">
                  <span className="px-3 py-2 text-xs font-bold text-ink-3 border-r border-hairline bg-surface-2">To</span>
                  <input
                    type="text"
                    placeholder="Username"
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none bg-transparent"
                  />
                </div>
                <div className="flex items-center border border-hairline rounded-lg overflow-hidden bg-surface-2/40">
                  <span className="px-3 py-2 text-xs font-bold text-ink-3 border-r border-hairline bg-surface-2">Subject</span>
                  <input
                    type="text"
                    placeholder="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none bg-transparent"
                  />
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-1 border border-hairline rounded-t-lg bg-surface-2/30 p-1.5 border-b-0">
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><Bold className="size-3.5" /></button>
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><Italic className="size-3.5" /></button>
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><Link2 className="size-3.5" /></button>
                  <span className="h-4 w-px bg-hairline mx-1" />
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><List className="size-3.5" /></button>
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><ListOrdered className="size-3.5" /></button>
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><Quote className="size-3.5" /></button>
                  <span className="h-4 w-px bg-hairline mx-1" />
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><Table2 className="size-3.5" /></button>
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><FileVideo className="size-3.5" /></button>
                  <span className="h-4 w-px bg-hairline mx-1" />
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><Undo2 className="size-3.5" /></button>
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><Redo2 className="size-3.5" /></button>
                  <button type="button" className="p-1 hover:bg-surface-3 rounded text-ink-2"><ImageIcon className="size-3.5" /></button>
                </div>
                <textarea
                  rows={6}
                  placeholder="Compose your message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full p-3 border border-hairline rounded-b-lg text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/40 bg-transparent resize-none"
                />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-ink-3 border border-hairline rounded-lg px-3 py-2 bg-surface-2/40 cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <Paperclip className="size-3.5" />
                  <span>Choose file</span>
                  <span className="text-[10px] text-ink-3 ml-2 font-medium truncate max-w-[120px]">
                    {file ? file.name : "No file chosen"}
                  </span>
                </div>
                <Button 
                  variant="primary" 
                  disabled={sending}
                  onClick={handleSendEmail}
                  className="rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 font-bold px-4 py-2 flex items-center gap-1.5 text-white"
                >
                  {sending ? "Sending..." : "Send"}
                  <Send className="size-3.5" />
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Recent activity in its own card */}
          <Card className="lg:col-span-7 border border-hairline bg-surface">
            <CardHeader title="Recent activity" action={<Button size="sm" variant="ghost">View all</Button>} />
            <CardBody className="p-5">
              <ul className="space-y-4.5">
                {activity.map((item) => {
                  const Icon = activityIcon[item.kind];
                  return (
                    <li key={item.id} className="flex gap-3.5 items-start">
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-xl border",
                          item.kind === "alert"
                            ? "bg-critical/10 text-critical border-critical/20"
                            : item.kind === "payment"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-accent-soft text-accent border-accent/20",
                        )}
                      >
                        <Icon className="size-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-ink-2">
                          <span className="font-bold text-ink">{item.who}</span> {item.action}{" "}
                          <span className="font-bold text-ink">{item.target}</span>
                        </p>
                        <p className="mt-1 text-xs font-semibold text-ink-3">{relativeTime(item.at)}</p>
                      </div>
                    </li>
                  );
                })}
                {!loading && activity.length === 0 && (
                  <li className="py-6 text-center text-sm font-medium text-ink-3">No recent activity.</li>
                )}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* Education Courses Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {educationCourses.map((course) => (
            <Card key={course.id} className="overflow-hidden border border-hairline bg-surface hover:shadow-md transition-all duration-300">
              <div className="relative aspect-video w-full overflow-hidden bg-muted">
                <img
                  src={course.cover}
                  alt={course.title}
                  className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                />
              </div>
              <CardBody className="p-4 flex flex-col justify-between min-h-[220px]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-ink-3 font-semibold">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      {formatDate(course.date)}
                    </span>
                    <span className="flex items-center gap-1 text-rose-500">
                      <Heart className="size-3.5 fill-rose-500" />
                      {course.likes}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-bold text-ink leading-snug hover:text-accent transition-colors duration-200">
                    {course.title}
                  </h3>
                </div>

                <div className="space-y-3 mt-4">
                  <div className="border-t border-hairline/60 pt-3 space-y-1.5 text-xs text-ink-2 font-medium">
                    <div className="flex justify-between">
                      <span className="text-ink-3">Duration:</span>
                      <span className="font-bold text-ink">{course.duration}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Professor:</span>
                      <span className="font-bold text-ink">{course.professor}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-hairline/60 pt-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-accent">
                      <GraduationCap className="size-4" />
                      Student
                    </span>
                    <span className="text-xs font-black text-ink">{course.students}</span>
                  </div>

                  <Button variant="primary" size="sm" className="w-full justify-center rounded-xl bg-accent hover:bg-accent-soft hover:text-accent font-bold mt-2">
                    Read More
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
