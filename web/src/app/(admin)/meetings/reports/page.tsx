"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BarChart3, CalendarCheck, FileText, GraduationCap, ListChecks, Loader2, UserX, Users,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ActionStatusBadge, MEETING_TYPE_LABELS, MinutesBadge, PriorityBadge, Stat, fmtDateTime, fmtDay, fmtDuration,
} from "@/components/meetings/shared";
import {
  fetchActionItemReport, fetchMeetingAttendanceReport, fetchMinutesReport,
  fetchMissedMeetingsReport, fetchStaffAttendanceReport, fetchTrainingReport,
  type ActionItemReport, type MeetingAttendanceReportRow, type MinutesReport,
  type MissedMeetingsReport, type StaffAttendanceRow, type TrainingReport,
} from "@/lib/api";

const input =
  "h-9 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

type Tab = "attendance" | "staff" | "missed" | "minutes" | "actions" | "training";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "attendance", label: "Meeting attendance", icon: CalendarCheck },
  { key: "staff", label: "Staff attendance %", icon: Users },
  { key: "missed", label: "Missed meetings", icon: UserX },
  { key: "minutes", label: "Minutes", icon: FileText },
  { key: "actions", label: "Action items", icon: ListChecks },
  { key: "training", label: "Training", icon: GraduationCap },
];

/** The six reports of 8.11, each on its own tab so none of them is a scroll away. */
export default function MeetingReportsPage() {
  const [tab, setTab] = useState<Tab>("attendance");
  const [loading, setLoading] = useState(true);

  // A 90-day default window: long enough to hold a few biweekly cycles, short
  // enough that "attendance" means something current.
  const [from, setFrom] = useState(() => new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [attendance, setAttendance] = useState<MeetingAttendanceReportRow[]>([]);
  const [staff, setStaff] = useState<StaffAttendanceRow[]>([]);
  const [missed, setMissed] = useState<MissedMeetingsReport | null>(null);
  const [minutes, setMinutes] = useState<MinutesReport | null>(null);
  const [actions, setActions] = useState<ActionItemReport | null>(null);
  const [training, setTraining] = useState<TrainingReport | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const f = new Date(from).toISOString();
    const t = new Date(`${to}T23:59:59`).toISOString();
    Promise.all([
      fetchMeetingAttendanceReport(f, t).catch(() => []),
      fetchStaffAttendanceReport(f, t).catch(() => []),
      fetchMissedMeetingsReport(f, t).catch(() => null),
      fetchMinutesReport(f, t).catch(() => null),
      fetchActionItemReport(f, t).catch(() => null),
      fetchTrainingReport(f, t).catch(() => null),
    ])
      .then(([a, s, mi, mn, ac, tr]) => {
        setAttendance(a);
        setStaff(s);
        setMissed(mi);
        setMinutes(mn);
        setActions(ac);
        setTraining(tr);
      })
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => load(), [load]);

  return (
    <>
      <Topbar title="Meeting Reports" subtitle="Attendance, minutes compliance and action items" />

      <div className="animate-fade-up space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/meetings" className="flex items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink">
            <ArrowLeft className="size-3.5" /> Back
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-ink-3">to</span>
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                tab === t.key ? "bg-accent text-accent-ink" : "border border-hairline bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : (
          <>
            {tab === "attendance" ? (
              <Table
                empty="No meetings ran in this window."
                headers={["Meeting", "When", "Invited", "Present", "Late", "Absent", "Excused", "Rate", "Avg time"]}
                rows={attendance.map((r) => [
                  <span key="t">
                    <span className="font-bold text-ink">{r.title}</span>
                    <span className="block text-[10px] text-ink-3">{MEETING_TYPE_LABELS[r.type] ?? r.type}</span>
                  </span>,
                  fmtDateTime(r.startsAt),
                  r.invited,
                  r.present,
                  r.late,
                  r.absent,
                  r.excused,
                  <Badge key="p" tone={r.attendancePct >= 80 ? "good" : r.attendancePct >= 50 ? "warning" : "critical"}>
                    {r.attendancePct}%
                  </Badge>,
                  fmtDuration(r.avgMinutes),
                ])}
              />
            ) : null}

            {tab === "staff" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Staff tracked" value={staff.length} />
                  <Stat
                    label="Average attendance"
                    value={`${staff.length ? Math.round(staff.reduce((a, s) => a + s.attendancePct, 0) / staff.length) : 0}%`}
                  />
                  <Stat label="Below 60%" value={staff.filter((s) => s.expected > 0 && s.attendancePct < 60).length} />
                </div>
                <Table
                  empty="Nobody was invited to a meeting in this window."
                  headers={["Staff", "Role", "Invited", "Present", "Late", "Absent", "Excused", "Attendance", "Punctuality"]}
                  rows={staff.map((s) => [
                    <span key="n" className="font-bold text-ink">{s.name}</span>,
                    s.role,
                    s.invited,
                    s.present,
                    s.late,
                    s.absent,
                    s.excused,
                    <Badge key="a" tone={s.attendancePct >= 80 ? "good" : s.attendancePct >= 50 ? "warning" : "critical"}>
                      {s.attendancePct}%
                    </Badge>,
                    <span key="p" className="text-ink-3">
                      {s.punctualityPct}%{s.avgLateMinutes ? ` · +${s.avgLateMinutes}m avg` : ""}
                    </span>,
                  ])}
                />
              </>
            ) : null}

            {tab === "missed" && missed ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="Absences recorded" value={missed.total} tone={missed.total ? "text-red-600 dark:text-red-400" : undefined} />
                  <Stat label="People affected" value={missed.byUser.length} />
                </div>
                <Table
                  empty="Nobody missed a meeting in this window."
                  headers={["Staff", "Role", "Meetings missed"]}
                  rows={missed.byUser.map((u) => [
                    <span key="n" className="font-bold text-ink">{u.name}</span>,
                    u.role,
                    <Badge key="m" tone={u.missed >= 3 ? "critical" : "warning"}>{u.missed}</Badge>,
                  ])}
                />
              </>
            ) : null}

            {tab === "minutes" && minutes ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Meetings" value={minutes.total} />
                  <Stat label="Published" value={minutes.published} tone="text-emerald-600 dark:text-emerald-400" />
                  <Stat
                    label="Outstanding"
                    value={minutes.outstanding}
                    tone={minutes.outstanding ? "text-red-600 dark:text-red-400" : undefined}
                  />
                  <Stat label="Compliance" value={`${minutes.compliancePct}%`} />
                </div>
                <Table
                  empty="No meetings in this window."
                  headers={["Meeting", "When", "Organiser", "Minutes", "Written by", "Actions"]}
                  rows={minutes.rows.map((r) => [
                    <span key="t">
                      <span className="font-bold text-ink">{r.title}</span>
                      {r.outstanding ? (
                        <span className="ml-1.5 text-[10px] font-extrabold text-red-500">OVERDUE</span>
                      ) : null}
                    </span>,
                    fmtDateTime(r.startsAt),
                    r.organizerName ?? "—",
                    <MinutesBadge key="m" status={r.minutesStatus} />,
                    r.byName ?? "—",
                    r.actionItems,
                  ])}
                />
              </>
            ) : null}

            {tab === "actions" && actions ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Action items" value={actions.total} />
                  <Stat label="Completed" value={actions.byStatus.COMPLETED ?? 0} tone="text-emerald-600 dark:text-emerald-400" />
                  <Stat
                    label="Overdue"
                    value={actions.overdue}
                    tone={actions.overdue ? "text-red-600 dark:text-red-400" : undefined}
                  />
                  <Stat label="Completion" value={`${actions.completionPct}%`} />
                </div>
                <Table
                  empty="No action items came out of these meetings."
                  headers={["Assignee", "Total", "Completed", "Overdue", "Completion"]}
                  rows={actions.byAssignee.map((a) => [
                    <span key="n" className="font-bold text-ink">{a.name}</span>,
                    a.total,
                    a.completed,
                    a.overdue ? <Badge key="o" tone="critical">{a.overdue}</Badge> : 0,
                    <Badge key="c" tone={a.completionPct >= 80 ? "good" : a.completionPct >= 50 ? "warning" : "critical"}>
                      {a.completionPct}%
                    </Badge>,
                  ])}
                />
                <Table
                  empty=""
                  headers={["Action", "Meeting", "Assignee", "Due", "Priority", "Status"]}
                  rows={actions.items.slice(0, 60).map((a) => [
                    <span key="d" className={a.overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-ink"}>
                      {a.description}
                    </span>,
                    a.meeting?.title ?? "—",
                    a.assignedToName ?? "Unassigned",
                    a.dueDate ? fmtDay(a.dueDate) : "—",
                    <PriorityBadge key="p" priority={a.priority} />,
                    <ActionStatusBadge key="s" status={a.status} />,
                  ])}
                />
              </>
            ) : null}

            {tab === "training" && training ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="Training sessions" value={training.totalSessions} />
                  <Stat label="Staff who attended at least one" value={training.staff.filter((s) => s.attended > 0).length} />
                </div>
                <Table
                  empty="No training sessions ran in this window."
                  headers={["Session", "When", "Duration", "Invited", "Attended"]}
                  rows={training.sessions.map((s) => [
                    <span key="t" className="font-bold text-ink">{s.title}</span>,
                    fmtDateTime(s.startsAt),
                    fmtDuration(s.durationMins),
                    s.invited,
                    s.attended,
                  ])}
                />
                <Table
                  empty=""
                  headers={["Staff", "Role", "Sessions attended", "Invited", "Rate", "Hours"]}
                  rows={training.staff.map((s) => [
                    <span key="n" className="font-bold text-ink">{s.name}</span>,
                    s.role,
                    s.attended,
                    s.invited,
                    <Badge key="r" tone={s.attendancePct >= 80 ? "good" : s.attendancePct >= 50 ? "warning" : "critical"}>
                      {s.attendancePct}%
                    </Badge>,
                    `${s.hours}h`,
                  ])}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function Table({
  headers, rows, empty,
}: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) {
    return empty ? (
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-10 text-center">
          <BarChart3 className="mx-auto size-7 text-ink-3" />
          <p className="mt-2 text-xs text-ink-3">{empty}</p>
        </CardBody>
      </Card>
    ) : null;
  }
  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-hairline bg-surface-2/40">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-hairline/60 last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-4 py-2.5 text-ink-2">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
