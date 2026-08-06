"use client";

import { useEffect, useState } from "react";
import { Loader2, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BreakdownGrid, fmtDay } from "@/components/monthly-assessments/shared";
import { fetchMyRanking, type MyRanking } from "@/lib/api";

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

function Movement({ movement }: { movement: number | null }) {
  if (movement == null) return <Badge tone="neutral">First ranking</Badge>;
  if (movement === 0)
    return (
      <Badge tone="neutral">
        <Minus className="mr-1 inline size-3" />
        No change
      </Badge>
    );
  return movement > 0 ? (
    <Badge tone="good">
      <TrendingUp className="mr-1 inline size-3" />
      Up {movement}
    </Badge>
  ) : (
    <Badge tone="warning">
      <TrendingDown className="mr-1 inline size-3" />
      Down {Math.abs(movement)}
    </Badge>
  );
}

export default function StudentRankingPage() {
  const [data, setData] = useState<MyRanking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyRanking()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="My Ranking" subtitle="Your position, score and badges each month" />

      <div className="space-y-5 p-4 lg:p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        ) : !data || data.cycles.length === 0 ? (
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-12 text-center">
              <Trophy className="mx-auto size-8 text-ink-3" />
              <p className="mt-3 text-sm font-bold text-ink">No ranking yet</p>
              <p className="mt-1 text-xs text-ink-3">
                Rankings are published after each cycle&apos;s monthly assessments are released.
              </p>
            </CardBody>
          </Card>
        ) : (
          <>
            {data.badges.length ? (
              <Card className="border border-hairline bg-surface">
                <CardBody className="p-5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Your badges</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.badges.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-2/50 px-3 py-2"
                      >
                        <span className="text-xl leading-none">{b.icon}</span>
                        <div>
                          <p className="text-xs font-black text-ink">{b.label}</p>
                          <p className="text-[10px] text-ink-3">
                            {b.courseTitle ?? ""} · {b.monthLabel}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            ) : null}

            {data.cycles.map((c) => (
              <Card key={`${c.course.id}-${c.cycleStart}`} className="border border-hairline bg-surface">
                <CardBody className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-ink">{c.course.title}</p>
                      <p className="mt-0.5 text-[11px] text-ink-3">
                        {c.monthLabel} · cycle from {fmtDay(c.cycleStart)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-ink">
                        {medal(c.myRank) ?? ""} #{c.myRank}
                        <span className="ml-1 text-sm font-bold text-ink-3">of {c.totalStudents}</span>
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-ink-2">Score {c.myScore.toFixed(2)} / 100</p>
                      <div className="mt-1 flex justify-end">
                        <Movement movement={c.movement} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      How your score was built
                    </p>
                    <BreakdownGrid b={c.breakdown} />
                  </div>

                  {c.leaderboard.length ? (
                    <div className="mt-5">
                      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                        Top {c.leaderboard.length} · {c.course.title}
                      </p>
                      <div className="overflow-hidden rounded-xl border border-hairline">
                        {c.leaderboard.map((l) => (
                          <div
                            key={`${l.rank}-${l.studentName}`}
                            className={`flex items-center justify-between border-b border-hairline px-3 py-2 last:border-0 ${
                              l.isMe ? "bg-accent-soft" : ""
                            }`}
                          >
                            <span className="flex items-center gap-2 text-xs">
                              <span className="w-8 font-black text-ink">{medal(l.rank) ?? `#${l.rank}`}</span>
                              <span className={l.isMe ? "font-black text-ink" : "text-ink-2"}>
                                {l.studentName}
                                {l.isMe ? " (you)" : ""}
                              </span>
                            </span>
                            <span className="text-xs font-bold text-ink-2">{l.score.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </>
        )}
      </div>
    </>
  );
}
