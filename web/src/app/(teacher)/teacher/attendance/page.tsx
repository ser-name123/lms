"use client";

import { useEffect, useState } from "react";
import { Loader2, PlayCircle, CalendarClock, ClipboardCheck, TrendingUp, Video, Users } from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchTeacherAttendanceDashboard, startClass,
  type TeacherAttendanceDashboard, type AttendanceClass,
} from "@/lib/api";
import { AttendanceSheet } from "@/components/attendance/classes-panel";
import { CLASS_STATUS_TONE } from "@/components/attendance/meta";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

export default function TeacherAttendancePage() {
  const [data, setData] = useState<TeacherAttendanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => { setLoading(true); fetchTeacherAttendanceDashboard().then(setData).catch(() => undefined).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const start = async (cls: AttendanceClass) => {
    setBusyId(cls.id);
    try { await startClass(cls.id); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Class started", showConfirmButton: false, timer: 1600 }); setOpenId(cls.id); load(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusyId(null); }
  };

  const kpis = data ? [
    { label: "Today's Classes", value: data.todayClasses.length, icon: CalendarClock, color: "text-accent bg-accent/10" },
    { label: "Pending Attendance", value: data.pendingAttendance, icon: ClipboardCheck, color: "text-amber-500 bg-amber-500/10" },
    { label: "Completed", value: data.completedClasses, icon: ClipboardCheck, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Student Attendance %", value: `${data.studentAttendanceRate}%`, icon: TrendingUp, color: "text-violet-500 bg-violet-500/10" },
  ] : [];

  return (
    <>
      <Topbar title="Attendance" subtitle="Start your classes and record attendance" />
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
                <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="flex flex-col items-center gap-2 py-14 text-center text-ink-3"><CalendarClock className="size-8 text-ink-3/40" /><p className="text-sm font-bold text-ink">No classes today</p></CardBody></Card>
              ) : (
                <div className="space-y-3">
                  {data.todayClasses.map((c) => (
                    <Card key={c.id} className="border border-hairline bg-surface shadow-sm">
                      <CardBody className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-ink">{c.title}</p>
                            <Badge tone={CLASS_STATUS_TONE[c.status]}>{c.status}</Badge>
                            {c.attendanceLocked && <span className="text-[10px] font-bold text-ink-3">🔒 Locked</span>}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-3">
                            <span className="inline-flex items-center gap-1 font-bold text-ink-2"><CalendarClock className="size-3.5" /> {new Date(c.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{new Date(c.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {c.studentCount ?? 0} students</span>
                            {c.batchName && <span>· {c.batchName}</span>}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {c.meetingUrl && <a href={c.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"><Video className="size-4 text-accent" /> Meeting</a>}
                          {c.status === "SCHEDULED" && !c.attendanceLocked ? (
                            <button onClick={() => start(c)} disabled={busyId === c.id} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60">
                              {busyId === c.id ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />} Start Class
                            </button>
                          ) : (
                            <button onClick={() => setOpenId(c.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90">
                              <ClipboardCheck className="size-4" /> Attendance
                            </button>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {openId && <AttendanceSheet classId={openId} onClose={() => { setOpenId(null); load(); }} />}
    </>
  );
}

function Loading() { return <div className="flex items-center gap-2 py-16 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>; }
