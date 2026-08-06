"use client";

import { Badge, type Tone } from "@/components/ui/badge";
import type {
  MonthlyAssessmentRecord,
  MonthlyAssessmentStatus,
  MonthlyAssessmentStats,
  RankingBreakdown,
} from "@/lib/api";

/* Shared presentation for Module 7. The report card is rendered identically in
   the teacher, supervisor, admin and student panels — one component, so a
   family and the staff arguing about a mark are always looking at the same
   thing. */

export const statusTone: Record<MonthlyAssessmentStatus | "NOT_STARTED", Tone> = {
  NOT_STARTED: "neutral",
  DRAFT: "neutral",
  SUBMITTED: "accent",
  RETURNED: "warning",
  APPROVED: "good",
  PUBLISHED: "good",
};

export const statusLabel: Record<MonthlyAssessmentStatus | "NOT_STARTED", string> = {
  NOT_STARTED: "Not started",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  RETURNED: "Returned",
  APPROVED: "Approved",
  PUBLISHED: "Published",
};

export const fmtDay = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** A+ / A / B+ read green→amber→red without relying on colour alone (the text is the grade). */
export function gradeTone(percentage: number): Tone {
  if (percentage >= 80) return "good";
  if (percentage >= 60) return "accent";
  if (percentage >= 50) return "warning";
  return "critical";
}

export function StatusBadge({ status }: { status: MonthlyAssessmentStatus | "NOT_STARTED" }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{statusLabel[status] ?? status}</Badge>;
}

export function GradePill({ grade, percentage }: { grade: string | null; percentage: number }) {
  if (!grade) return <Badge tone="neutral">Ungraded</Badge>;
  return (
    <Badge tone={gradeTone(percentage)}>
      {grade} · {pct(percentage)}
    </Badge>
  );
}

/** A labelled 0–100 bar. Used for both the cycle summary and ranking breakdowns. */
export function Meter({ label, value, suffix = "%" }: { label: string; value: number; suffix?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-ink-3">{label}</span>
        <span className="text-xs font-black text-ink">
          {Math.round(value * 10) / 10}
          {suffix}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function SummaryGrid({ s }: { s: MonthlyAssessmentStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
        <Meter label="Attendance" value={s.attendancePct} />
        <p className="mt-1 text-[10px] text-ink-3">
          {s.attendedClasses} of {s.totalClasses} classes
        </p>
      </div>
      <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
        <Meter label="Assignments" value={s.assignmentPct} />
        <p className="mt-1 text-[10px] text-ink-3">
          {s.assignmentsSubmitted} of {s.assignmentsTotal} submitted
        </p>
      </div>
      <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
        <Meter label="Homework" value={s.homeworkPct} />
        <p className="mt-1 text-[10px] text-ink-3">completion rate</p>
      </div>
      <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
        <p className="text-[11px] font-semibold text-ink-3">Classes held</p>
        <p className="mt-1 text-2xl font-black text-ink">{s.totalClasses}</p>
      </div>
    </div>
  );
}

export function BreakdownGrid({ b }: { b: RankingBreakdown }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Meter label="Assessment" value={b.assessment} />
      <Meter label="Attendance" value={b.attendance} />
      <Meter label="Assignments" value={b.assignment} />
      <Meter label="Homework" value={b.homework} />
      <Meter label="Teacher rating" value={b.teacherRating} />
    </div>
  );
}

/**
 * The printed report. Read-only everywhere it appears.
 */
export function ReportCard({
  a,
  showInternal,
}: {
  a: MonthlyAssessmentRecord;
  /** Staff see the workflow trail; a family sees only the result. */
  showInternal?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-hairline bg-surface-2/40 p-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
            {a.course?.title ?? "Course"} · {a.monthLabel}
          </p>
          <p className="mt-1 text-lg font-black text-ink">
            {a.student?.name ?? "Student"}
            {a.levelName ? <span className="ml-2 text-xs font-semibold text-ink-3">Level {a.levelName}</span> : null}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {fmtDay(a.cycleStart)} – {fmtDay(a.cycleEnd)}
            {a.teacher?.name || a.teacherName ? ` · Teacher: ${a.teacher?.name ?? a.teacherName}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-ink">
            {a.totalMarks}
            <span className="text-base font-bold text-ink-3">/{a.maxMarks}</span>
          </p>
          <div className="mt-1 flex items-center justify-end gap-2">
            <GradePill grade={a.grade} percentage={a.percentage} />
            <Badge tone={a.passed ? "good" : "critical"}>{a.passed ? "Passed" : "Below pass"}</Badge>
          </div>
        </div>
      </div>

      <SummaryGrid s={a.summary} />

      <div className="overflow-x-auto rounded-2xl border border-hairline">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-2/50 text-left">
              <th className="px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Criterion</th>
              <th className="px-4 py-2 text-right text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Marks</th>
              <th className="px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Comment</th>
            </tr>
          </thead>
          <tbody>
            {a.scores.map((s) => (
              <tr key={s.id ?? s.criterionName} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2 font-semibold text-ink">{s.criterionName}</td>
                <td className="px-4 py-2 text-right font-black text-ink whitespace-nowrap">
                  {s.marks}
                  <span className="text-ink-3"> / {s.maxMarks}</span>
                </td>
                <td className="px-4 py-2 text-xs text-ink-2">{s.comment || "—"}</td>
              </tr>
            ))}
            <tr className="bg-surface-2/50">
              <td className="px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">Total</td>
              <td className="px-4 py-2 text-right font-black text-ink">
                {a.totalMarks} / {a.maxMarks}
              </td>
              <td className="px-4 py-2 text-xs font-semibold text-ink-2">
                {pct(a.percentage)} {a.grade ? `· Grade ${a.grade}` : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {a.teacherRemarks ? (
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Teacher comments</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{a.teacherRemarks}</p>
        </div>
      ) : null}
      {a.recommendations ? (
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Recommendations</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{a.recommendations}</p>
        </div>
      ) : null}

      {showInternal ? (
        <div className="grid gap-2 rounded-2xl border border-hairline bg-surface-2/30 p-4 text-[11px] text-ink-3 sm:grid-cols-2">
          <span>Submitted: {fmtDay(a.submittedAt)}</span>
          {/*
            * The review and approval lines are only drawn when they actually
            * happened. A report that published on submission has no approver,
            * and printing "Approved: —" against it reads as a missing signature
            * rather than a step that was never part of the flow.
            */}
          {a.reviewedByName ? <span>Reviewed by: {a.reviewedByName}</span> : null}
          {a.approvedByName ? (
            <span>
              Approved: {a.approvedByName} {a.approvedAt ? `(${fmtDay(a.approvedAt)})` : ""}
            </span>
          ) : null}
          <span>Published: {fmtDay(a.publishedAt)}</span>
          {a.returnedReason ? (
            <span className="sm:col-span-2 text-amber-600 dark:text-amber-400">
              Returned: {a.returnedReason}
            </span>
          ) : null}
          {a.reopenedByName ? (
            <span className="sm:col-span-2">
              Reopened by {a.reopenedByName} on {fmtDay(a.reopenedAt)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
