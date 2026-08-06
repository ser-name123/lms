"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { Loader2, Save, Send, ArrowLeft, AlertTriangle, Lock } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge, SummaryGrid, fmtDay, gradeTone, pct } from "@/components/monthly-assessments/shared";
import {
  fetchMonthlyAssessmentForm, saveMonthlyAssessmentDraft, submitMonthlyAssessment,
  fetchAssessmentConfig,
  type MonthlyAssessmentFormData,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Could not save",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const textarea =
  "w-full rounded-xl border border-hairline bg-surface p-3 text-sm text-ink outline-none focus:border-accent";

function EvaluateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const studentId = params.get("studentId") ?? "";
  const courseId = params.get("courseId") ?? "";
  const cycleStart = params.get("cycleStart") ?? undefined;

  const [data, setData] = useState<MonthlyAssessmentFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [marks, setMarks] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [recommendations, setRecommendations] = useState("");

  /*
   * Whether submitting queues the report for a supervisor or publishes it
   * outright. It changes what the teacher is committing to, so it is stated on
   * the button and in the confirmation rather than left to be discovered.
   * Defaults to direct publish — the same default the API uses — so a failed
   * config read cannot promise a review step that will not happen.
   */
  const [needsApproval, setNeedsApproval] = useState(false);
  useEffect(() => {
    fetchAssessmentConfig()
      .then((c) => setNeedsApproval(!!c.requireSupervisorApproval))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!studentId || !courseId) {
      setError("Missing student or course.");
      setLoading(false);
      return;
    }
    fetchMonthlyAssessmentForm(studentId, courseId, cycleStart)
      .then((d) => {
        setData(d);
        const m: Record<string, number> = {};
        const c: Record<string, string> = {};
        for (const s of d.assessment?.scores ?? []) {
          if (s.criterionId) {
            m[s.criterionId] = s.marks;
            if (s.comment) c[s.criterionId] = s.comment;
          }
        }
        setMarks(m);
        setComments(c);
        setRemarks(d.assessment?.teacherRemarks ?? "");
        setRecommendations(d.assessment?.recommendations ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the assessment form."))
      .finally(() => setLoading(false));
  }, [studentId, courseId, cycleStart]);

  /* The live total mirrors what the server will compute. It is a convenience
     for the teacher, never the stored figure — the API recalculates it. */
  const totals = useMemo(() => {
    const t = data?.template;
    if (!t) return { total: 0, max: 0, percentage: 0, grade: null as string | null };
    const total = t.criteria.reduce((a, c) => a + (Number(marks[c.id]) || 0), 0);
    const percentage = t.maxMarks ? Math.round((total / t.maxMarks) * 1000) / 10 : 0;
    const band = data?.gradeBands.find((b) => percentage >= b.minPercent && percentage <= b.maxPercent);
    return { total, max: t.maxMarks, percentage, grade: band?.grade ?? null };
  }, [marks, data]);

  const payload = () => ({
    studentId,
    courseId,
    cycleStart: data?.cycle.start,
    scores: (data?.template?.criteria ?? []).map((c) => ({
      criterionId: c.id,
      criterionName: c.name,
      maxMarks: c.maxMarks,
      marks: Number(marks[c.id]) || 0,
      comment: comments[c.id] || undefined,
    })),
    teacherRemarks: remarks || undefined,
    recommendations: recommendations || undefined,
  });

  const save = async (submit: boolean) => {
    // Publishing is not undoable by the teacher — only a supervisor can reopen
    // a report the family has already read — so it is confirmed first.
    if (submit && !needsApproval) {
      const go = await Swal.fire({
        title: "Publish this report?",
        text: "It goes to the student and their parent straight away, and you will not be able to edit it afterwards.",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Publish",
        background: swalBg(),
        confirmButtonColor: "#10b981",
      });
      if (!go.isConfirmed) return;
    }
    setBusy(true);
    try {
      if (submit) await submitMonthlyAssessment(payload());
      else await saveMonthlyAssessmentDraft(payload());
      await Swal.fire({
        title: !submit ? "Draft saved" : needsApproval ? "Submitted for review" : "Report published",
        text: !submit
          ? "You can come back and finish it later."
          : needsApproval
            ? "A supervisor will review and publish it."
            : "The student and their parent can see it now.",
        icon: "success",
        background: swalBg(),
        confirmButtonColor: "#10b981",
      });
      router.push("/teacher/monthly-assessments");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-ink-3" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="m-6 border border-hairline bg-surface">
        <CardBody className="p-10 text-center">
          <AlertTriangle className="mx-auto size-8 text-amber-500" />
          <p className="mt-3 text-sm font-bold text-ink">Cannot open this assessment</p>
          <p className="mt-1 text-xs text-ink-3">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/teacher/monthly-assessments")}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        </CardBody>
      </Card>
    );
  }

  const locked = !data.editable;

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/teacher/monthly-assessments")}>
        <ArrowLeft className="size-4" /> Back to list
      </Button>

      {/* Header — auto-loaded student context */}
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-black text-ink">{data.student.name}</p>
              <p className="mt-0.5 text-xs text-ink-3">
                {data.student.code} · {data.course?.title ?? "Course"}
                {data.student.level ? ` · Level ${data.student.level}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-ink-3">
                {data.cycle.label} · cycle {fmtDay(data.cycle.start)} – {fmtDay(data.cycle.end)} · due {fmtDay(data.cycle.dueAt)}
              </p>
            </div>
            <div className="text-right">
              {data.assessment ? <StatusBadge status={data.assessment.status} /> : <Badge tone="neutral">Not started</Badge>}
              {!data.cycle.fromSubscription ? (
                <p className="mt-1 text-[10px] text-ink-3">calendar month (no active subscription cycle)</p>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      {!data.eligibility.eligible ? (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-300">{data.eligibility.reason}</p>
        </div>
      ) : null}

      {data.assessment?.returnedReason ? (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            <p className="font-bold">Returned for revision</p>
            <p className="mt-0.5">{data.assessment.returnedReason}</p>
          </div>
        </div>
      ) : null}

      {locked ? (
        <div className="flex gap-2 rounded-xl border border-hairline bg-surface-2/50 p-4">
          <Lock className="size-4 shrink-0 text-ink-3" />
          <p className="text-xs text-ink-2">
            This assessment is {data.assessment?.status.toLowerCase()} and is read-only. A supervisor must reopen it before
            it can be changed.
          </p>
        </div>
      ) : null}

      {/* Auto-loaded summary */}
      <div>
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
          Cycle summary (loaded automatically)
        </p>
        <SummaryGrid s={data.summary} />
      </div>

      {!data.template ? (
        <Card className="border border-hairline bg-surface">
          <CardBody className="p-10 text-center">
            <AlertTriangle className="mx-auto size-8 text-amber-500" />
            <p className="mt-3 text-sm font-bold text-ink">No assessment template for this course</p>
            <p className="mt-1 text-xs text-ink-3">
              An admin or supervisor has to create one before this course can be assessed.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Marks */}
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <p className="text-sm font-black text-ink">{data.template.name}</p>
                <Badge tone={gradeTone(totals.percentage)}>
                  {totals.total} / {totals.max} · {pct(totals.percentage)}
                  {totals.grade ? ` · ${totals.grade}` : ""}
                </Badge>
              </div>

              <div className="divide-y divide-hairline">
                {data.template.criteria.map((c) => (
                  <div key={c.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {c.name}
                        {c.isMandatory ? <span className="ml-1 text-red-500">*</span> : null}
                      </p>
                      <input
                        className="mt-1.5 w-full rounded-lg border border-hairline bg-surface px-2 py-1 text-xs text-ink-2 outline-none focus:border-accent"
                        placeholder="Comment (optional)"
                        value={comments[c.id] ?? ""}
                        disabled={locked}
                        onChange={(e) => setComments((s) => ({ ...s, [c.id]: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={c.maxMarks}
                        step="0.5"
                        disabled={locked}
                        className="h-10 w-24 rounded-xl border border-hairline bg-surface px-3 text-right text-lg font-black text-ink outline-none focus:border-accent disabled:opacity-60"
                        value={marks[c.id] ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value === "" ? NaN : Number(e.target.value);
                          setMarks((s) => ({ ...s, [c.id]: Number.isNaN(raw) ? 0 : Math.min(raw, c.maxMarks) }));
                        }}
                      />
                      <span className="w-12 text-sm font-bold text-ink-3">/ {c.maxMarks}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-hairline bg-surface-2/50 px-5 py-3">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">Total</span>
                <span className="text-lg font-black text-ink">
                  {totals.total} / {totals.max}
                  <span className="ml-2 text-sm font-bold text-ink-2">
                    {pct(totals.percentage)}
                    {totals.grade ? ` · Grade ${totals.grade}` : ""}
                  </span>
                </span>
              </div>
            </CardBody>
          </Card>

          {/* Remarks */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                Teacher comments <span className="text-red-500">*</span>
              </p>
              <textarea
                rows={4}
                className={textarea}
                disabled={locked}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="How did the student do this cycle?"
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Recommendations</p>
              <textarea
                rows={4}
                className={textarea}
                disabled={locked}
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                placeholder="What should they focus on next?"
              />
            </div>
          </div>

          {!locked ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => save(false)} disabled={busy || !data.eligibility.eligible}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save draft
              </Button>
              <Button variant="primary" onClick={() => save(true)} disabled={busy || !data.eligibility.eligible}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {needsApproval ? "Submit for review" : "Submit & publish"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function EvaluatePage() {
  return (
    <>
      <Topbar title="Monthly Assessment" subtitle="Enter marks, comments and recommendations" />
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        }
      >
        <EvaluateInner />
      </Suspense>
    </>
  );
}
