"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BreakdownGrid, fmtDay } from "@/components/monthly-assessments/shared";
import { fetchTeacherLeaderboard, fetchRankingCycles, type Leaderboard, type RankingCycleOption, type RankingRow } from "@/lib/api";

const input =
  "h-9 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

function Movement({ movement }: { movement: number | null }) {
  if (movement == null) return <span className="text-[10px] text-ink-3">new</span>;
  if (movement === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-3">
        <Minus className="size-3" />0
      </span>
    );
  const up = movement > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {Math.abs(movement)}
    </span>
  );
}

function Row({ r }: { r: RankingRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-2/30" onClick={() => setOpen((o) => !o)}>
        <td className="px-4 py-2.5 font-black text-ink">{medal(r.rank) ?? `#${r.rank}`}</td>
        <td className="px-4 py-2.5">
          <p className="font-semibold text-ink">{r.studentName}</p>
          <p className="text-[10px] text-ink-3">{r.studentCode}</p>
        </td>
        <td className="px-4 py-2.5 font-black text-ink">{r.totalScore.toFixed(2)}</td>
        <td className="px-4 py-2.5">
          <Movement movement={r.movement} />
        </td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap gap-1">
            {r.badges.map((b) => (
              <span key={b.rule} title={b.label} className="text-base leading-none">
                {b.icon}
              </span>
            ))}
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-hairline bg-surface-2/30">
          <td colSpan={5} className="px-4 py-3">
            <BreakdownGrid b={r.breakdown} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function TeacherRankingsPage() {
  const [cycles, setCycles] = useState<RankingCycleOption[]>([]);
  const [cycleStart, setCycleStart] = useState("");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRankingCycles().then(setCycles).catch(() => setCycles([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetchTeacherLeaderboard({ cycleStart: cycleStart || undefined })
      .then(setBoard)
      .catch(() => setBoard(null))
      .finally(() => setLoading(false));
  }, [cycleStart]);
  useEffect(() => load(), [load]);

  return (
    <>
      <Topbar title="Student Rankings" subtitle="Monthly leaderboards for the courses you teach" />

      <div className="space-y-5 p-4 lg:p-6">
        <select className={input} value={cycleStart} onChange={(e) => setCycleStart(e.target.value)}>
          <option value="">Latest published cycle</option>
          {cycles.map((c) => (
            <option key={c.cycleStart} value={c.cycleStart}>
              {c.monthLabel} ({fmtDay(c.cycleStart)})
            </option>
          ))}
        </select>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        ) : !board || board.courses.length === 0 ? (
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-12 text-center">
              <Trophy className="mx-auto size-8 text-ink-3" />
              <p className="mt-3 text-sm font-bold text-ink">No rankings published yet</p>
              <p className="mt-1 text-xs text-ink-3">
                These appear once the academy publishes a cycle&apos;s monthly assessments and generates the ranking.
              </p>
            </CardBody>
          </Card>
        ) : (
          board.courses.map((c) => (
            <Card key={c.course.id} className="border border-hairline bg-surface">
              <CardBody className="p-0">
                <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                  <p className="text-sm font-black text-ink">{c.course.title}</p>
                  <Badge tone="neutral">
                    {board.monthLabel} · {c.rows.length} students
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-2/50 text-left">
                        {["Rank", "Student", "Score", "Movement", "Badges"].map((h) => (
                          <th key={h} className="px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((r) => (
                        <Row key={r.studentId} r={r} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
