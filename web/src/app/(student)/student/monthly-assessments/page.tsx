"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, FileText, MessageSquarePlus, Star, CheckCircle2 } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportCard, fmtDay, gradeTone, pct } from "@/components/monthly-assessments/shared";
import {
  fetchMyMonthlyAssessments, submitMonthlyAssessmentFeedback,
  type MonthlyAssessmentRecord,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

/**
 * Parent/guardian feedback lives here, in the student panel.
 *
 * This deployment has no separate parent login — the family shares the student
 * account — so the feedback the spec asks the parent for is collected on the
 * report they are both reading.
 */
function FeedbackBox({ a, onSent }: { a: MonthlyAssessmentRecord; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const mine = a.feedback ?? [];

  const send = async () => {
    if (comment.trim().length < 2) return;
    setBusy(true);
    try {
      await submitMonthlyAssessmentFeedback(a.id, { rating: rating || undefined, comment: comment.trim() });
      await Swal.fire({
        title: "Thank you",
        text: "Your feedback has been sent to the teacher and the academy.",
        icon: "success",
        background: swalBg(),
        confirmButtonColor: "#10b981",
      });
      setComment("");
      setRating(0);
      setOpen(false);
      onSent();
    } catch (e) {
      Swal.fire({
        title: "Could not send",
        text: e instanceof Error ? e.message : "Something went wrong",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-hairline bg-surface-2/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Parent / guardian feedback</p>
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <MessageSquarePlus className="size-3.5" /> Leave feedback
          </Button>
        ) : null}
      </div>

      {mine.length ? (
        <div className="mt-3 space-y-2">
          {mine.map((f) => (
            <div key={f.id} className="rounded-xl border border-hairline bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink">
                  {f.rating ? `${f.rating}/5` : "Comment"} · {f.by ?? "You"}
                </span>
                <span className="text-[10px] text-ink-3">{fmtDay(f.at)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-2">{f.comment}</p>
              {f.reviewedAt ? (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" /> Reviewed by {f.reviewedByName}
                  {f.reviewNote ? ` — ${f.reviewNote}` : ""}
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] text-ink-3">Awaiting review by the teacher / supervisor.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star`}>
                <Star
                  className={`size-5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-ink-3"}`}
                />
              </button>
            ))}
            <span className="ml-2 text-[11px] text-ink-3">{rating ? `${rating}/5` : "Rating (optional)"}</span>
          </div>
          <textarea
            rows={3}
            className="mt-2 w-full rounded-xl border border-hairline bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
            placeholder="What did you think of this month's progress?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={send} disabled={busy || comment.trim().length < 2}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Send feedback
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function StudentMonthlyAssessmentsPage() {
  const [rows, setRows] = useState<MonthlyAssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchMyMonthlyAssessments()
      .then((r) => {
        setRows(r);
        setOpenId((cur) => cur ?? r[0]?.id ?? null);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  return (
    <>
      <Topbar title="Monthly Assessments" subtitle="Your published progress reports" />

      <div className="space-y-4 p-4 lg:p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-12 text-center">
              <FileText className="mx-auto size-8 text-ink-3" />
              <p className="mt-3 text-sm font-bold text-ink">No reports yet</p>
              <p className="mt-1 text-xs text-ink-3">
                Your teacher writes a report at the end of each billing cycle. It appears here once it is published.
              </p>
            </CardBody>
          </Card>
        ) : (
          rows.map((a) => {
            const open = openId === a.id;
            return (
              <Card key={a.id} className="border border-hairline bg-surface">
                <CardBody className="p-0">
                  <button
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface-2/30"
                  >
                    <div>
                      <p className="text-sm font-black text-ink">
                        {a.monthLabel} · {a.course?.title ?? "Course"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-3">
                        {fmtDay(a.cycleStart)} – {fmtDay(a.cycleEnd)}
                        {a.teacherName ? ` · ${a.teacherName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={gradeTone(a.percentage)}>
                        {a.totalMarks}/{a.maxMarks} · {a.grade ?? pct(a.percentage)}
                      </Badge>
                      <Badge tone={a.passed ? "good" : "critical"}>{a.passed ? "Passed" : "Below pass"}</Badge>
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t border-hairline p-5">
                      <ReportCard a={a} />
                      <FeedbackBox a={a} onSent={load} />
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
