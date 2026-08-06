"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, Trophy, Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";

import { useAuth } from "@/store/auth";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BreakdownGrid, fmtDay } from "@/components/monthly-assessments/shared";
import {
  fetchLeaderboard, fetchRankingCycles, fetchRankingAnalytics, generateRanking,
  fetchMonthlyAssessmentMeta,
  type Leaderboard, type RankingCycleOption, type RankingAnalytics, type AssessmentConfigMeta,
  type RankingRow,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Could not generate",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const input =
  "h-9 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

function Movement({ movement }: { movement: number | null }) {
  if (movement == null) return <span className="text-[10px] text-ink-3">new</span>;
  if (movement === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-3">
        <Minus className="size-3" /> 0
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

function RankRow({ r }: { r: RankingRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-2/30"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 font-black text-ink">
            {medal(r.rank) ?? `#${r.rank}`}
            {medal(r.rank) ? <span className="text-xs text-ink-3">#{r.rank}</span> : null}
          </span>
        </td>
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

export default function RankingsPage() {
  const { user } = useAuth();
  const canGenerate = user?.role === "ADMIN" || user?.role === "SUPERVISOR";

  const [cycles, setCycles] = useState<RankingCycleOption[]>([]);
  const [cycleStart, setCycleStart] = useState("");
  const [courseId, setCourseId] = useState("");
  const [meta, setMeta] = useState<AssessmentConfigMeta | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [analytics, setAnalytics] = useState<RankingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetchRankingCycles().catch(() => []), fetchMonthlyAssessmentMeta().catch(() => null)]).then(
      ([c, m]) => {
        setCycles(c);
        setMeta(m);
      },
    );
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchLeaderboard({ cycleStart: cycleStart || undefined, courseId: courseId || undefined }).catch(() => null),
      fetchRankingAnalytics(courseId || undefined).catch(() => null),
    ])
      .then(([b, a]) => {
        setBoard(b);
        setAnalytics(a);
      })
      .finally(() => setLoading(false));
  }, [cycleStart, courseId]);
  useEffect(() => load(), [load]);

  const generate = async () => {
    const c = await Swal.fire({
      title: "Generate rankings?",
      text: "Only published assessments are counted. Students and staff are notified, and badges are awarded.",
      icon: "question",
      showCancelButton: true,
      background: swalBg(),
      confirmButtonColor: "#10b981",
    });
    if (!c.isConfirmed) return;
    setBusy(true);
    try {
      const res = await generateRanking({
        cycleStart: cycleStart || undefined,
        courseId: courseId || undefined,
        publish: true,
      });
      await Swal.fire({
        title: "Rankings published",
        text: `${res.studentsRanked} student(s) ranked across ${res.courses} course(s); ${res.badgesAwarded} badge(s) awarded for ${res.monthLabel}.`,
        icon: "success",
        background: swalBg(),
        confirmButtonColor: "#10b981",
      });
      fetchRankingCycles().then(setCycles).catch(() => undefined);
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Topbar title="Student Rankings" subtitle="Course-wise monthly leaderboards and achievement badges" />

      <div className="space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <select className={input} value={cycleStart} onChange={(e) => setCycleStart(e.target.value)}>
            <option value="">Latest published cycle</option>
            {cycles.map((c) => (
              <option key={c.cycleStart} value={c.cycleStart}>
                {c.monthLabel} ({fmtDay(c.cycleStart)}){c.published ? "" : " — draft"}
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
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          {canGenerate ? (
            <Button size="sm" variant="primary" className="ml-auto" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Generate &amp; publish
            </Button>
          ) : null}
        </div>

        {analytics && analytics.courses.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {analytics.courses.slice(0, 4).map((c) => (
              <Card key={c.courseId} className="border border-hairline bg-surface">
                <CardBody className="p-4">
                  <p className="truncate text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{c.title}</p>
                  <p className="mt-1 text-2xl font-black text-ink">{c.averageScore.toFixed(1)}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    avg · {c.students} students · top {c.topScore.toFixed(1)}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        ) : !board || board.courses.length === 0 ? (
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-12 text-center">
              <Trophy className="mx-auto size-8 text-ink-3" />
              <p className="mt-3 text-sm font-bold text-ink">No rankings yet</p>
              <p className="mt-1 text-xs text-ink-3">
                Rankings are built from published assessments. Publish a cycle&apos;s assessments, then generate.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-5">
            {board.monthLabel ? (
              <div className="flex items-center gap-2">
                <Badge tone="accent">{board.monthLabel}</Badge>
                {board.published === false ? <Badge tone="warning">Not published</Badge> : null}
              </div>
            ) : null}

            {board.courses.map((c) => (
              <Card key={c.course.id} className="border border-hairline bg-surface">
                <CardBody className="p-0">
                  <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                    <p className="text-sm font-black text-ink">{c.course.title}</p>
                    <Badge tone="neutral">{c.rows.length} students</Badge>
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
                          <RankRow key={r.studentId} r={r} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            ))}

            {analytics?.movers.length ? (
              <Card className="border border-hairline bg-surface">
                <CardBody className="p-5">
                  <p className="text-sm font-black text-ink">Biggest movers</p>
                  <div className="mt-3 space-y-1.5">
                    {analytics.movers.map((m, i) => (
                      <div key={`${m.studentName}-${i}`} className="flex items-center justify-between text-xs">
                        <span className="text-ink-2">
                          {m.studentName} <span className="text-ink-3">· {m.courseTitle}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Movement movement={m.movement} />
                          <span className="font-bold text-ink">#{m.rank}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
