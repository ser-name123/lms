"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ClipboardList, AlertTriangle, MessageSquare, Eye, X } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportCard, StatusBadge, fmtDay, pct } from "@/components/monthly-assessments/shared";
import {
  fetchMonthlyAssessmentsDue, fetchMonthlyAssessments, fetchMonthlyAssessment,
  fetchMonthlyAssessmentTeacherDashboard, fetchPendingAssessmentFeedback, reviewAssessmentFeedback,
  fetchAssessmentConfig,
  type MonthlyAssessmentDueRow, type MonthlyAssessmentListRow, type MonthlyAssessmentRecord,
  type MonthlyAssessmentTeacherDashboard, type PendingFeedbackRow,
} from "@/lib/api";

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
        <p className={`mt-1 text-2xl font-black ${tone ?? "text-ink"}`}>{value}</p>
      </CardBody>
    </Card>
  );
}

export default function TeacherMonthlyAssessmentsPage() {
  const [due, setDue] = useState<MonthlyAssessmentDueRow[]>([]);
  const [history, setHistory] = useState<MonthlyAssessmentListRow[]>([]);
  const [dash, setDash] = useState<MonthlyAssessmentTeacherDashboard | null>(null);
  const [feedback, setFeedback] = useState<PendingFeedbackRow[]>([]);
  const [detail, setDetail] = useState<MonthlyAssessmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"due" | "history" | "feedback">("due");

  /*
   * With no approval step nothing ever waits in SUBMITTED, so an "Awaiting
   * review" counter would sit at zero for ever and read as a stuck queue.
   * Defaults to the direct-publish shape, matching the API.
   */
  const [needsApproval, setNeedsApproval] = useState(false);
  useEffect(() => {
    fetchAssessmentConfig()
      .then((c) => setNeedsApproval(!!c.requireSupervisorApproval))
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMonthlyAssessmentsDue().catch(() => []),
      fetchMonthlyAssessments().catch(() => []),
      fetchMonthlyAssessmentTeacherDashboard().catch(() => null),
      fetchPendingAssessmentFeedback().catch(() => []),
    ])
      .then(([d, h, s, f]) => {
        setDue(d);
        setHistory(h);
        setDash(s);
        setFeedback(f);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  return (
    <>
      <Topbar
        title="Monthly Assessments"
        subtitle={
          needsApproval
            ? "Evaluate your students at the end of each billing cycle"
            : "Evaluate your students — submitting sends the report to the family"
        }
      />

      <div className="space-y-5 p-4 lg:p-6">
        {dash ? (
          <div className={`grid gap-3 sm:grid-cols-3 ${needsApproval ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <Stat label="Due now" value={dash.due} tone="text-accent" />
            <Stat label="Overdue" value={dash.overdue} tone={dash.overdue ? "text-red-600 dark:text-red-400" : undefined} />
            <Stat label="Drafts" value={dash.draft} />
            {needsApproval ? <Stat label="Awaiting review" value={dash.submitted} /> : null}
            <Stat label="Published" value={dash.published} tone="text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : null}

        <div className="flex gap-2">
          {(
            [
              ["due", `Due (${due.length})`],
              ["history", "My assessments"],
              ["feedback", `Family feedback (${feedback.length})`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                tab === k ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        ) : null}

        {!loading && tab === "due" ? (
          due.length === 0 ? (
            <Card className="border border-hairline bg-surface">
              <CardBody className="p-12 text-center">
                <ClipboardList className="mx-auto size-8 text-ink-3" />
                <p className="mt-3 text-sm font-bold text-ink">Nothing due</p>
                <p className="mt-1 text-xs text-ink-3">
                  A student appears here once their billing cycle closes and they have completed the minimum days.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {due.map((d) => (
                <Card
                  key={`${d.studentId}-${d.courseId}`}
                  className={`border bg-surface ${d.overdue ? "border-red-500/40" : "border-hairline"}`}
                >
                  <CardBody className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-ink">{d.studentName}</p>
                        <p className="mt-0.5 text-[11px] text-ink-3">
                          {d.studentCode} · {d.courseTitle}
                        </p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={d.status} />
                        <p className="mt-1 text-[10px] text-ink-3">{d.monthLabel}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px]">
                      <span className="text-ink-3">
                        Cycle {fmtDay(d.cycleStart)} – {fmtDay(d.cycleEnd)} · {d.enrolledDays} days enrolled
                      </span>
                      <Badge tone={d.overdue ? "critical" : d.daysLeft <= 3 ? "warning" : "neutral"}>
                        {d.overdue ? `${Math.abs(d.daysLeft)}d overdue` : `due in ${d.daysLeft}d`}
                      </Badge>
                    </div>

                    <Link
                      href={`/teacher/monthly-assessments/evaluate?studentId=${d.studentId}&courseId=${d.courseId}&cycleStart=${encodeURIComponent(d.cycleStart)}`}
                    >
                      <Button variant="primary" size="sm" className="mt-3 w-full">
                        {d.status === "NOT_STARTED" ? "Start assessment" : "Continue assessment"}
                      </Button>
                    </Link>
                  </CardBody>
                </Card>
              ))}
            </div>
          )
        ) : null}

        {!loading && tab === "history" ? (
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-0">
              {history.length === 0 ? (
                <p className="py-16 text-center text-sm text-ink-3">No assessments written yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-2/50 text-left">
                        {["Student", "Course", "Period", "Result", "Status", ""].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((r) => (
                        <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/30">
                          <td className="px-4 py-2.5 font-semibold text-ink">{r.student.name}</td>
                          <td className="px-4 py-2.5 text-xs text-ink-2">{r.course?.title ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-ink-2">{r.monthLabel}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-black text-ink">
                            {r.totalMarks}/{r.maxMarks}
                            {r.grade ? <span className="ml-1.5 text-xs text-ink-2">{r.grade}</span> : null}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => fetchMonthlyAssessment(r.id).then(setDetail).catch(() => undefined)}
                              >
                                <Eye className="size-3.5" />
                              </Button>
                              {r.status === "DRAFT" || r.status === "RETURNED" ? (
                                <Link
                                  href={`/teacher/monthly-assessments/evaluate?studentId=${r.student.id}&courseId=${r.course?.id ?? ""}&cycleStart=${encodeURIComponent(r.cycleStart)}`}
                                >
                                  <Button size="sm" variant="outline">
                                    Edit
                                  </Button>
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        ) : null}

        {!loading && tab === "feedback" ? (
          feedback.length === 0 ? (
            <Card className="border border-hairline bg-surface">
              <CardBody className="p-12 text-center">
                <MessageSquare className="mx-auto size-8 text-ink-3" />
                <p className="mt-3 text-sm font-bold text-ink">No new feedback</p>
                <p className="mt-1 text-xs text-ink-3">Families can comment on a report once it is published.</p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-2">
              {feedback.map((f) => (
                <Card key={f.id} className="border border-hairline bg-surface">
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-ink">
                        {f.student.name} · {f.courseTitle} · {f.monthLabel}
                      </p>
                      <span className="text-[10px] text-ink-3">{fmtDay(f.at)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-ink-2">
                      {f.rating ? <Badge tone="accent">{f.rating}/5</Badge> : null} {f.comment}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => fetchMonthlyAssessment(f.assessmentId).then(setDetail).catch(() => undefined)}>
                        Open report
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          reviewAssessmentFeedback(f.id)
                            .then(() => setFeedback((fs) => fs.filter((x) => x.id !== f.id)))
                            .catch(() => undefined)
                        }
                      >
                        Mark reviewed
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )
        ) : null}
      </div>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <Card className="my-8 w-full max-w-3xl border border-hairline bg-surface shadow-xl">
            <CardBody className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-ink">{detail.student?.name}</h2>
                  <p className="text-xs text-ink-3">
                    {detail.monthLabel} · {pct(detail.percentage)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={detail.status} />
                  <Button variant="ghost" size="icon" onClick={() => setDetail(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
              {detail.returnedReason ? (
                <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Returned for revision: {detail.returnedReason}
                  </p>
                </div>
              ) : null}
              <ReportCard a={detail} showInternal />
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  );
}
