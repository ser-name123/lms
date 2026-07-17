"use client";

import { useEffect, useState } from "react";
import { Loader2, LogIn, LogOut, TrendingUp, CalendarClock, XCircle, Clock, Video } from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchStudentAttendanceDashboard, joinClass, leaveClass,
  type StudentAttendanceDashboard,
} from "@/lib/api";
import { STUDENT_STATUS_TONE, CLASS_STATUS_TONE } from "@/components/attendance/meta";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

export default function StudentAttendancePage() {
  const [data, setData] = useState<StudentAttendanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => { setLoading(true); fetchStudentAttendanceDashboard().then(setData).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const join = async (classId: string, meetingUrl: string | null) => {
    setBusyId(classId);
    try {
      const res = await joinClass(classId, /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop");
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Joined — attendance recorded", showConfirmButton: false, timer: 1800 });
      load();
      const url = res.meetingUrl || meetingUrl;
      if (url) window.open(url, "_blank");
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusyId(null); }
  };

  const leave = async (classId: string) => {
    setBusyId(classId);
    try { const r = await leaveClass(classId); Swal.fire({ toast: true, position: "top-end", icon: "success", title: `Left · ${r.durationMins}m · ${r.status}`, showConfirmButton: false, timer: 2000 }); load(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusyId(null); }
  };

  const kpis = data ? [
    { label: "Attendance %", value: `${data.attendanceRate}%`, icon: TrendingUp, color: "text-accent bg-accent/10" },
    { label: "Today's Classes", value: data.todayClasses.length, icon: CalendarClock, color: "text-blue-500 bg-blue-500/10" },
    { label: "Missed", value: data.missedCount, icon: XCircle, color: "text-rose-500 bg-rose-500/10" },
    { label: "Late", value: data.lateCount, icon: Clock, color: "text-amber-500 bg-amber-500/10" },
  ] : [];

  return (
    <>
      <Topbar title="My Attendance" subtitle="Join your classes and track your attendance" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {loading ? <Loading /> : !data ? <p className="text-sm text-ink-3">No data.</p> : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {kpis.map((k) => (
                <Card key={k.label} className="border border-hairline bg-surface shadow-sm">
                  <CardBody className="flex items-center gap-3 p-4">
                    <span className={`grid size-10 place-items-center rounded-xl ${k.color}`}><k.icon className="size-5" /></span>
                    <div><p className="text-xl font-black text-ink leading-none">{k.value}</p><p className="text-[11px] font-semibold text-ink-3 mt-1">{k.label}</p></div>
                  </CardBody>
                </Card>
              ))}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold text-ink">Today's Classes</h3>
              {data.todayClasses.length === 0 ? (
                <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="flex flex-col items-center gap-2 py-12 text-center text-ink-3"><CalendarClock className="size-8 text-ink-3/40" /><p className="text-sm font-bold text-ink">No classes today</p></CardBody></Card>
              ) : (
                <div className="space-y-3">
                  {data.todayClasses.map((c) => {
                    const joined = !!c.joinedAt;
                    const canJoin = (c.status === "LIVE" || c.status === "SCHEDULED");
                    return (
                      <Card key={c.classId} className="border border-hairline bg-surface shadow-sm">
                        <CardBody className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black text-ink">{c.title}</p>
                              <Badge tone={CLASS_STATUS_TONE[c.status]}>{c.status}</Badge>
                              {c.myStatus && <Badge tone={STUDENT_STATUS_TONE[c.myStatus]}>{c.myStatus.replace(/_/g, " ")}</Badge>}
                            </div>
                            <p className="mt-1 text-[11px] text-ink-3">
                              {new Date(c.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{new Date(c.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {c.teacher}{c.batch ? ` · ${c.batch}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {!joined && canJoin && (
                              <button onClick={() => join(c.classId, c.meetingUrl)} disabled={busyId === c.classId} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60">
                                {busyId === c.classId ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />} Join Class
                              </button>
                            )}
                            {joined && c.status === "LIVE" && (
                              <button onClick={() => leave(c.classId)} disabled={busyId === c.classId} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-60">
                                {busyId === c.classId ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Leave
                              </button>
                            )}
                            {joined && c.meetingUrl && c.status === "LIVE" && (
                              <a href={c.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"><Video className="size-4 text-accent" /> Reopen</a>
                            )}
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="border border-hairline bg-surface shadow-sm">
                <CardBody className="p-5">
                  <h3 className="mb-3 text-sm font-bold text-ink">Upcoming Classes</h3>
                  {data.upcoming.length === 0 ? <p className="py-4 text-center text-xs text-ink-3">Nothing upcoming.</p> : (
                    <div className="space-y-2">
                      {data.upcoming.map((u) => (
                        <div key={u.id} className="flex items-center justify-between rounded-lg border border-hairline bg-surface-2/30 px-3 py-2">
                          <div><p className="text-xs font-bold text-ink">{u.title}</p><p className="text-[10px] text-ink-3">{u.course}{u.batch ? ` · ${u.batch}` : ""}</p></div>
                          <span className="text-[11px] font-semibold text-ink-3">{new Date(u.startsAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card className="border border-hairline bg-surface shadow-sm">
                <CardBody className="p-5">
                  <MonthCalendar entries={data.calendar} />
                  <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-semibold text-ink-3">
                    <Legend cls="bg-emerald-500/15 text-emerald-600" label="Present" />
                    <Legend cls="bg-amber-500/15 text-amber-600" label="Late" />
                    <Legend cls="bg-rose-500/15 text-rose-600" label="Absent/No-show" />
                  </div>
                </CardBody>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function dotClass(status: string | null) {
  if (status === "PRESENT") return "bg-emerald-500/15 text-emerald-600";
  if (status === "LATE") return "bg-amber-500/15 text-amber-600";
  if (status === "ABSENT" || status === "NO_SHOW") return "bg-rose-500/15 text-rose-600";
  return "bg-surface-3 text-ink-3";
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
function MonthCalendar({ entries }: { entries: { date: string; status: string | null; title: string }[] }) {
  const [offset, setOffset] = useState(0); // 0 = current month, -1 = previous
  const now = new Date();
  const view = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = view.getFullYear(), month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Best status per day (Present > Late > Absent) for this month.
  const byDay: Record<number, string> = {};
  for (const e of entries) {
    const d = new Date(e.date);
    if (d.getFullYear() !== year || d.getMonth() !== month || !e.status) continue;
    const day = d.getDate();
    const rank = (s: string) => (s === "PRESENT" ? 3 : s === "LATE" ? 2 : 1);
    if (!byDay[day] || rank(e.status) > rank(byDay[day])) byDay[day] = e.status;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
        <div className="flex gap-1">
          <button onClick={() => setOffset((o) => o - 1)} className="grid size-7 place-items-center rounded-lg border border-hairline text-ink-3 hover:bg-surface-2 text-xs">‹</button>
          <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} className="grid size-7 place-items-center rounded-lg border border-hairline text-ink-3 hover:bg-surface-2 disabled:opacity-40 text-xs">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => <div key={i} className="pb-1 text-[10px] font-bold text-ink-3">{w}</div>)}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const st = byDay[day];
          const isToday = offset === 0 && day === now.getDate();
          return (
            <div key={day} title={st ? `${day}: ${st.replace(/_/g, " ")}` : String(day)}
              className={`grid aspect-square place-items-center rounded-lg text-[11px] font-bold ${st ? dotClass(st) : "text-ink-3"} ${isToday ? "ring-2 ring-accent" : ""}`}>
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`size-3 rounded ${cls}`} /> {label}</span>;
}
function Loading() { return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>; }
