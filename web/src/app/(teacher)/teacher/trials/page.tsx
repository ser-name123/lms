"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarClock,
  ClipboardList,
  Video,
  Loader2,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  BookOpen,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { TrialReportPanel } from "@/components/leads/trial-report";
import { isTrialClosed } from "@/components/leads/lead-meta";
import { fetchMyTrials, setTrialStatus, type LeadTrial } from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

const SCOPES = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
] as const;

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: "text-accent bg-accent/10 border-accent/20",
  RESCHEDULED: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  COMPLETED: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  NO_SHOW: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  CANCELLED: "text-ink-3 bg-surface-2 border-hairline",
};

/*
 * useSearchParams opts the tree below it out of prerendering, so the page
 * shell stays static and only the list waits on the query string.
 */
export default function TeacherTrialsPage() {
  return (
    <Suspense
      fallback={
        <>
          <Topbar title="Trial Classes" subtitle="Your scheduled demo classes with prospective students" />
          <div className="flex items-center gap-2 p-6 text-sm font-bold text-ink-3">
            <Loader2 className="size-5 animate-spin text-accent" /> Loading trials…
          </div>
        </>
      }
    >
      <TrialsList />
    </Suspense>
  );
}

function TrialsList() {
  /*
   * The dashboard's "File Trial Reports" task links here with ?scope=all,
   * because an unwritten report is by definition in the past and the default
   * "upcoming" view would show the teacher an empty page.
   */
  const initialScope = useSearchParams().get("scope");
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>(
    SCOPES.some((s) => s.key === initialScope)
      ? (initialScope as (typeof SCOPES)[number]["key"])
      : "upcoming",
  );
  const [trials, setTrials] = useState<LeadTrial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchMyTrials(scope).then(setTrials).catch(() => undefined).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);

  const todayCount = trials.filter((t) => {
    const d = new Date(t.scheduledAt); const n = new Date();
    return d.toDateString() === n.toDateString();
  }).length;

  return (
    <>
      <Topbar title="Trial Classes" subtitle="Your scheduled demo classes with prospective students" />

      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1">
            {SCOPES.map((s) => (
              <button key={s.key} onClick={() => setScope(s.key)}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${scope === s.key ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}>
                {s.label}
              </button>
            ))}
          </div>
          {scope !== "all" && (
            <p className="text-xs font-bold text-ink-3">{todayCount} today · {trials.length} shown</p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-20 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading trials…</div>
        ) : trials.length === 0 ? (
          <Card className="border border-hairline bg-surface shadow-sm">
            <CardBody className="flex flex-col items-center justify-center gap-2 py-20 text-center text-ink-3">
              <CalendarClock className="size-9 text-ink-3/40" />
              <p className="text-sm font-bold text-ink">No trial classes {scope === "today" ? "today" : scope === "upcoming" ? "coming up" : "yet"}</p>
              <p className="max-w-sm text-xs">When a coach schedules a trial with you, it appears here with the join link and attendance controls.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {trials.map((t) => <TeacherTrialCard key={t.id} trial={t} onChange={load} />)}
          </div>
        )}
      </div>
    </>
  );
}

function TeacherTrialCard({ trial, onChange }: { trial: LeadTrial; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const done = isTrialClosed(trial);
  const hasReport = Boolean(trial.reportSubmittedAt || trial.assessedLevel);
  const [reportOpen, setReportOpen] = useState(done || hasReport);
  const studentName = trial.lead ? `${trial.lead.studentFirstName} ${trial.lead.studentLastName}` : "Student";

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); Swal.fire({ toast: true, position: "top-end", icon: "success", title: ok, showConfirmButton: false, timer: 1800 }); onChange(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-accent/10 text-accent font-black">
              {studentName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-ink">{studentName}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[trial.status] || ""}`}>{trial.status.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1 font-bold text-ink-2"><CalendarClock className="size-3.5" /> {new Date(trial.scheduledAt).toLocaleString()}</span>
                <span>· {trial.durationMins} mins</span>
                {trial.lead?.interestedSubject && <span className="inline-flex items-center gap-1"><BookOpen className="size-3.5" /> {trial.lead.interestedSubject}</span>}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-3">
                {trial.lead?.email && <span className="inline-flex items-center gap-1"><Mail className="size-3" /> {trial.lead.email}</span>}
                {trial.lead?.mobile && <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {trial.lead.mobile}</span>}
              </p>
              {trial.meetingLink && (
                <a href={trial.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
                  <Video className="size-3.5" /> Join {trial.meetingProvider || "meeting"}
                </a>
              )}
            </div>
          </div>

          {/*
            * Closing the trial out. Attendance and status are the same fact,
            * so one control sets both — a trial sitting COMPLETED with nobody
            * marked present is a contradiction the teacher shouldn't be able
            * to create. Reschedule and cancel are the coach's, not shown here.
            */}
          {trial.status !== "CANCELLED" && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => act(() => setTrialStatus(trial.id, "COMPLETED"), "Marked completed")} disabled={busy}
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold disabled:opacity-50 ${
                  trial.status === "COMPLETED"
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-600"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                }`}>
                <CheckCircle2 className="size-3.5" /> Completed
              </button>
              <button onClick={() => act(() => setTrialStatus(trial.id, "NO_SHOW"), "Marked no-show")} disabled={busy || Boolean(trial.reportSubmittedAt)}
                title={trial.reportSubmittedAt ? "A report has been filed for this trial" : undefined}
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold disabled:opacity-50 ${
                  trial.status === "NO_SHOW"
                    ? "border-rose-500/50 bg-rose-500/20 text-rose-600"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                }`}>
                <XCircle className="size-3.5" /> No-show
              </button>
            </div>
          )}
        </div>

        {/*
          * The report is the teacher's side of the trial: what they covered,
          * what the family told them, and the level they assessed. It opens by
          * itself once the class is over or has anything recorded, but stays
          * reachable before then — notes get taken during the session, not
          * only after it.
          */}
        {trial.status !== "CANCELLED" &&
          (reportOpen ? (
            <TrialReportPanel trial={trial} onChange={onChange} />
          ) : (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[11px] font-bold text-ink-3 hover:border-accent hover:text-accent"
            >
              <ClipboardList className="size-3.5" /> Open trial report
            </button>
          ))}
      </CardBody>
    </Card>
  );
}
