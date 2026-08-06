"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import {
  Loader2, CheckCircle2, Send, Undo2, Eye, Settings, MessageSquare, AlertTriangle, Search, X,
} from "lucide-react";

import { useAuth } from "@/store/auth";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportCard, StatusBadge, fmtDay, pct } from "@/components/monthly-assessments/shared";
import {
  fetchMonthlyAssessments, fetchMonthlyAssessment, fetchMonthlyAssessmentAdminDashboard,
  reviewMonthlyAssessment, approveMonthlyAssessment, returnMonthlyAssessment,
  publishMonthlyAssessment, publishMonthlyAssessmentBatch, reopenMonthlyAssessment,
  fetchPendingAssessmentFeedback, reviewAssessmentFeedback, fetchMonthlyAssessmentMeta,
  type MonthlyAssessmentListRow, type MonthlyAssessmentRecord, type MonthlyAssessmentAdminDashboard,
  type MonthlyAssessmentStatus, type PendingFeedbackRow, type AssessmentConfigMeta,
  fetchAssessmentConfig,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Action failed",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const STATUSES: (MonthlyAssessmentStatus | "")[] = ["", "DRAFT", "SUBMITTED", "RETURNED", "APPROVED", "PUBLISHED"];
// Without an approval step nothing ever sits in SUBMITTED or APPROVED, so
// offering them as filters just gives two options that always return nothing.
const DIRECT_STATUSES: (MonthlyAssessmentStatus | "")[] = ["", "DRAFT", "RETURNED", "PUBLISHED"];
const input =
  "h-9 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
        <p className={`mt-1 text-2xl font-black ${tone ?? "text-ink"}`}>{value}</p>
      </CardBody>
    </Card>
  );
}

export default function AdminMonthlyAssessmentsPage() {
  const { user } = useAuth();
  const canDecide = user?.role === "ADMIN" || user?.role === "SUPERVISOR";

  const [rows, setRows] = useState<MonthlyAssessmentListRow[]>([]);
  const [dash, setDash] = useState<MonthlyAssessmentAdminDashboard | null>(null);
  const [meta, setMeta] = useState<AssessmentConfigMeta | null>(null);
  const [feedback, setFeedback] = useState<PendingFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  /*
   * Whether the academy runs an approval step. Off by default, matching the
   * API — the review queue, its filters and its counters are only shown when
   * there is actually a queue to work.
   */
  const [needsApproval, setNeedsApproval] = useState(false);
  useEffect(() => {
    fetchAssessmentConfig()
      .then((c) => setNeedsApproval(!!c.requireSupervisorApproval))
      .catch(() => undefined);
  }, []);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MonthlyAssessmentStatus | "">("");
  const [courseId, setCourseId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<MonthlyAssessmentRecord | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMonthlyAssessments({ search: search || undefined, status: status || undefined, courseId: courseId || undefined }).catch(() => []),
      fetchMonthlyAssessmentAdminDashboard().catch(() => null),
      fetchPendingAssessmentFeedback().catch(() => []),
    ])
      .then(([r, d, f]) => {
        setRows(r);
        setDash(d);
        setFeedback(f);
      })
      .finally(() => setLoading(false));
  }, [search, status, courseId]);

  useEffect(() => {
    fetchMonthlyAssessmentMeta().then(setMeta).catch(() => setMeta(null));
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const approvedIds = useMemo(() => rows.filter((r) => r.status === "APPROVED").map((r) => r.id), [rows]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) await Swal.fire({ title: done, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      setDetail(null);
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doReturn = async (id: string) => {
    const r = await Swal.fire({
      title: "Return for revision",
      input: "textarea",
      inputLabel: "What needs changing? The teacher sees this.",
      inputValidator: (v) => (!v || v.trim().length < 3 ? "A reason is required." : undefined),
      showCancelButton: true,
      background: swalBg(),
      confirmButtonColor: "#f59e0b",
    });
    if (!r.isConfirmed) return;
    act(() => returnMonthlyAssessment(id, String(r.value).trim()), "Returned to the teacher");
  };

  const doReopen = async (id: string) => {
    const r = await Swal.fire({
      title: "Reopen published assessment?",
      text: "The family has already seen this report. Reopening hides it until it is published again.",
      input: "text",
      inputLabel: "Reason (optional)",
      showCancelButton: true,
      background: swalBg(),
      confirmButtonColor: "#f59e0b",
    });
    if (!r.isConfirmed) return;
    act(() => reopenMonthlyAssessment(id, r.value ? String(r.value) : undefined), "Reopened");
  };

  const publishAll = async () => {
    if (!approvedIds.length) return;
    const c = await Swal.fire({
      title: `Publish ${approvedIds.length} assessment(s)?`,
      text: "Students and their families will be notified, and the reports become read-only.",
      icon: "question",
      showCancelButton: true,
      background: swalBg(),
      confirmButtonColor: "#10b981",
    });
    if (!c.isConfirmed) return;
    act(async () => {
      const res = await publishMonthlyAssessmentBatch(approvedIds);
      const failed = res.results.filter((x) => !x.published);
      if (failed.length) {
        await Swal.fire({
          title: `Published ${res.published}, skipped ${failed.length}`,
          html: failed.map((f) => `<p style="font-size:12px">${f.reason ?? "failed"}</p>`).join(""),
          icon: "warning",
          background: swalBg(),
        });
      }
    }, approvedIds.length ? undefined : "Published");
  };

  const openDetail = (id: string) => fetchMonthlyAssessment(id).then(setDetail).catch(fail);

  return (
    <>
      <Topbar
        title="Monthly Assessments"
        subtitle={
          needsApproval
            ? "Review, approve and publish student assessments"
            : "Reports publish when the teacher submits — read them here"
        }
      />

      <div className="space-y-5 p-4 lg:p-6">
        {dash ? (
          /*
           * Submitted and Approved are review-queue counts. With direct publish
           * they are permanently zero, and a row of zeroes reads as "nothing is
           * happening" rather than "this step does not exist here" — so they are
           * dropped and the space goes to figures that still mean something.
           */
          <div className={`grid gap-3 sm:grid-cols-3 ${needsApproval ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}>
            {needsApproval ? (
              <>
                <Stat label="Submitted" value={dash.submitted} tone="text-accent" />
                <Stat label="Approved" value={dash.approved} />
              </>
            ) : null}
            <Stat label="Published" value={dash.published} tone="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Overdue" value={dash.overdue} tone={dash.overdue ? "text-red-600 dark:text-red-400" : undefined} />
            <Stat label="Average" value={dash.published ? pct(dash.averagePercentage) : "—"} />
            <Stat label="Pass rate" value={dash.published ? `${dash.passRate}%` : "—"} />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              className={`${input} w-56 pl-8`}
              placeholder="Student, code or course…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as MonthlyAssessmentStatus | "")}>
            {(needsApproval ? STATUSES : DIRECT_STATUSES).map((s) => (
              <option key={s} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
          <select className={input} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">All courses</option>
            {meta?.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <div className="ml-auto flex gap-2">
            {feedback.length ? (
              <Button size="sm" variant="outline" onClick={() => setShowFeedback(true)}>
                <MessageSquare className="size-3.5" /> {feedback.length} new feedback
              </Button>
            ) : null}
            {canDecide && approvedIds.length ? (
              <Button size="sm" variant="primary" onClick={publishAll} disabled={busy}>
                <Send className="size-3.5" /> Publish {approvedIds.length} approved
              </Button>
            ) : null}
            <Link href="/monthly-assessments/settings">
              <Button size="sm" variant="outline">
                <Settings className="size-3.5" /> Setup
              </Button>
            </Link>
          </div>
        </div>

        <Card className="border border-hairline bg-surface">
          <CardBody className="p-0">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-ink-3" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <AlertTriangle className="mx-auto size-8 text-ink-3" />
                <p className="mt-3 text-sm font-bold text-ink">No assessments match</p>
                <p className="mt-1 text-xs text-ink-3">
                  Teachers raise these at the end of each billing cycle. Nothing here yet means no cycle has closed.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/50 text-left">
                      {["Student", "Course", "Period", "Teacher", "Result", "Status", "Due", ""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/30">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-ink">{r.student.name}</p>
                          <p className="text-[10px] text-ink-3">{r.student.code}</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-ink-2">{r.course?.title ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-ink-2">{r.monthLabel}</td>
                        <td className="px-4 py-2.5 text-xs text-ink-2">{r.teacherName ?? "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-black text-ink">
                            {r.totalMarks}/{r.maxMarks}
                          </span>
                          {r.grade ? <span className="ml-1.5 text-xs font-bold text-ink-2">{r.grade}</span> : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={r.status} />
                          {r.feedbackCount ? (
                            <Badge tone="accent" className="ml-1">
                              {r.feedbackCount} feedback
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-ink-3">{fmtDay(r.dueAt)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openDetail(r.id)}>
                              <Eye className="size-3.5" />
                            </Button>
                            {canDecide && r.status === "SUBMITTED" ? (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => act(() => approveMonthlyAssessment(r.id), "Approved")}>
                                  <CheckCircle2 className="size-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => doReturn(r.id)}>
                                  <Undo2 className="size-3.5" />
                                </Button>
                              </>
                            ) : null}
                            {canDecide && r.status === "APPROVED" ? (
                              <Button size="sm" variant="ghost" onClick={() => act(() => publishMonthlyAssessment(r.id), "Published")}>
                                <Send className="size-3.5" />
                              </Button>
                            ) : null}
                            {canDecide && r.status === "PUBLISHED" ? (
                              <Button size="sm" variant="ghost" onClick={() => doReopen(r.id)}>
                                <Undo2 className="size-3.5" />
                              </Button>
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
      </div>

      {/* ── Detail drawer ── */}
      {detail ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <Card className="my-8 w-full max-w-3xl border border-hairline bg-surface shadow-xl">
            <CardBody className="p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-black text-ink">Monthly assessment</h2>
                  <p className="text-xs text-ink-3">{detail.monthLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={detail.status} />
                  <Button variant="ghost" size="icon" onClick={() => setDetail(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>

              <ReportCard a={detail} showInternal />

              {detail.feedback?.length ? (
                <div className="mt-5 space-y-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Family feedback</p>
                  {detail.feedback.map((f) => (
                    <div key={f.id} className="rounded-xl border border-hairline bg-surface-2/40 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-ink">
                          {f.by ?? "Family"} {f.rating ? `· ${f.rating}/5` : ""}
                        </p>
                        <span className="text-[10px] text-ink-3">{fmtDay(f.at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-2">{f.comment}</p>
                      {f.reviewedAt ? (
                        <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                          Reviewed by {f.reviewedByName} {f.reviewNote ? `— ${f.reviewNote}` : ""}
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => act(() => reviewAssessmentFeedback(f.id), "Marked reviewed")}
                        >
                          Mark reviewed
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {canDecide ? (
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  {detail.status === "SUBMITTED" ? (
                    <>
                      <Button variant="outline" onClick={() => act(() => reviewMonthlyAssessment(detail.id))} disabled={busy}>
                        Claim for review
                      </Button>
                      <Button variant="outline" onClick={() => doReturn(detail.id)} disabled={busy}>
                        <Undo2 className="size-4" /> Return
                      </Button>
                      <Button variant="primary" onClick={() => act(() => approveMonthlyAssessment(detail.id), "Approved")} disabled={busy}>
                        <CheckCircle2 className="size-4" /> Approve
                      </Button>
                    </>
                  ) : null}
                  {detail.status === "APPROVED" ? (
                    <Button variant="primary" onClick={() => act(() => publishMonthlyAssessment(detail.id), "Published")} disabled={busy}>
                      <Send className="size-4" /> Publish to family
                    </Button>
                  ) : null}
                  {detail.status === "PUBLISHED" ? (
                    <Button variant="outline" onClick={() => doReopen(detail.id)} disabled={busy}>
                      <Undo2 className="size-4" /> Reopen
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* ── Pending feedback drawer ── */}
      {showFeedback ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <Card className="my-8 w-full max-w-2xl border border-hairline bg-surface shadow-xl">
            <CardBody className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-ink">Family feedback awaiting review</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowFeedback(false)}>
                  <X className="size-4" />
                </Button>
              </div>
              {feedback.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-3">Nothing waiting.</p>
              ) : (
                <div className="space-y-2">
                  {feedback.map((f) => (
                    <div key={f.id} className="rounded-xl border border-hairline bg-surface-2/40 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-ink">
                          {f.student.name} · {f.courseTitle} · {f.monthLabel}
                        </p>
                        <span className="text-[10px] text-ink-3">{fmtDay(f.at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-2">
                        {f.rating ? `${f.rating}/5 — ` : ""}
                        {f.comment}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(f.assessmentId)}>
                          Open report
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            reviewAssessmentFeedback(f.id)
                              .then(() => {
                                setFeedback((fs) => fs.filter((x) => x.id !== f.id));
                              })
                              .catch(fail)
                          }
                        >
                          Mark reviewed
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  );
}
