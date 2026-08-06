"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText, Trophy } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportCard, StatusBadge, fmtDay, gradeTone, pct } from "@/components/monthly-assessments/shared";
import {
  fetchStudentMonthlyAssessments, fetchStudentRankingHistory,
  type MonthlyAssessmentRecord, type StudentRankingHistory,
} from "@/lib/api";

/**
 * The Monthly Assessment tab of the student hub.
 *
 * Staff-facing, so the workflow trail is shown — a coach fielding "why is my
 * child's report late?" needs to see whether it is still a draft with the
 * teacher (or, where the academy runs an approval step, sitting in review)
 * rather than simply missing.
 */
export function MonthlyAssessmentTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<MonthlyAssessmentRecord[]>([]);
  const [ranking, setRanking] = useState<StudentRankingHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchStudentMonthlyAssessments(studentId).catch(() => []),
      fetchStudentRankingHistory(studentId).catch(() => null),
    ])
      .then(([a, r]) => {
        setRows(a);
        setRanking(r);
        setOpenId(a[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-ink-3" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ranking?.badges.length ? (
        <Card className="border border-hairline bg-surface">
          <CardBody className="p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Badges earned</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ranking.badges.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-2/60 px-2 py-1 text-[11px] font-semibold text-ink-2"
                  title={`${b.courseTitle ?? ""} · ${b.monthLabel}`}
                >
                  <span className="text-base leading-none">{b.icon}</span>
                  {b.label}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {ranking?.rankings.length ? (
        <Card className="border border-hairline bg-surface">
          <CardBody className="p-0">
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
              <Trophy className="size-4 text-ink-3" />
              <p className="text-sm font-black text-ink">Ranking history</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/50 text-left">
                    {["Period", "Course", "Rank", "Score", "Movement"].map((h) => (
                      <th key={h} className="px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.rankings.map((r) => (
                    <tr key={`${r.course.id}-${r.cycleStart}`} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-2 text-xs text-ink-2">{r.monthLabel}</td>
                      <td className="px-4 py-2 text-xs text-ink-2">{r.course.title}</td>
                      <td className="px-4 py-2 font-black text-ink">
                        #{r.rank}
                        <span className="ml-1 text-[10px] font-semibold text-ink-3">of {r.totalStudents}</span>
                      </td>
                      <td className="px-4 py-2 font-bold text-ink">{r.totalScore.toFixed(2)}</td>
                      <td className="px-4 py-2 text-xs text-ink-2">
                        {r.movement == null ? "—" : r.movement > 0 ? `▲ ${r.movement}` : r.movement < 0 ? `▼ ${Math.abs(r.movement)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Card className="border border-hairline bg-surface">
          <CardBody className="p-12 text-center">
            <FileText className="mx-auto size-8 text-ink-3" />
            <p className="mt-3 text-sm font-bold text-ink">No monthly assessments yet</p>
            <p className="mt-1 text-xs text-ink-3">
              The assigned teacher raises one at the end of each billing cycle.
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
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-surface-2/30"
                >
                  <div>
                    <p className="text-sm font-black text-ink">
                      {a.monthLabel} · {a.course?.title ?? "Course"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {fmtDay(a.cycleStart)} – {fmtDay(a.cycleEnd)}
                      {a.feedbackCount ? ` · ${a.feedbackCount} family feedback` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={gradeTone(a.percentage)}>
                      {a.totalMarks}/{a.maxMarks} · {a.grade ?? pct(a.percentage)}
                    </Badge>
                    <StatusBadge status={a.status} />
                  </div>
                </button>
                {open ? (
                  <div className="border-t border-hairline p-5">
                    <ReportCard a={a} showInternal />
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
