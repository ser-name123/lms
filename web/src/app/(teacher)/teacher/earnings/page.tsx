"use client";

import { useEffect, useState } from "react";
import { Loader2, Wallet, TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { fetchMyEarnings, fetchMyEarningsSummary, type EarningRow, type EarningSummary } from "@/lib/api";

const money = (n: number, c = "USD") => `${c} ${n.toFixed(2)}`;
const fmt = (v: string) => new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const outcomeTone: Record<string, Tone> = {
  COMPLETED: "good",
  STUDENT_NO_SHOW: "warning",
  TEACHER_ABSENT: "critical",
  BOTH_NO_SHOW: "critical",
};
const typeLabel: Record<string, string> = { REGULAR: "Class", TRIAL: "Trial", TRIAL_ENROLL_BONUS: "Trial bonus" };

export default function TeacherEarningsPage() {
  const [summary, setSummary] = useState<EarningSummary | null>(null);
  const [rows, setRows] = useState<EarningRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchMyEarningsSummary(), fetchMyEarnings(200)])
      .then(([s, r]) => { setSummary(s); setRows(r); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const c = summary?.currency ?? "USD";
  const cards = [
    { label: "Today", value: summary?.today ?? 0, icon: TrendingUp, tint: "text-accent" },
    { label: "This week", value: summary?.week ?? 0, icon: TrendingUp, tint: "text-accent" },
    { label: "This month", value: summary?.month ?? 0, icon: Wallet, tint: "text-accent" },
    { label: "Pending salary", value: summary?.pending ?? 0, icon: Clock, tint: "text-amber-500" },
    { label: "Paid salary", value: summary?.paid ?? 0, icon: CheckCircle2, tint: "text-emerald-500" },
  ];

  return (
    <>
      <Topbar title="My Earnings" subtitle="Booked from your scheduled class duration on completion" />
      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {cards.map((k) => (
                <Card key={k.label} className="border border-hairline bg-surface shadow-sm">
                  <CardBody className="p-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      <k.icon className={`size-3.5 ${k.tint}`} /> {k.label}
                    </div>
                    <p className="mt-1.5 text-lg font-black text-ink">{money(k.value, c)}</p>
                  </CardBody>
                </Card>
              ))}
            </div>

            {summary && summary.unpaidClasses > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <AlertCircle className="size-4" /> {summary.unpaidClasses} class{summary.unpaidClasses === 1 ? "" : "es"} were not paid (teacher absent).
              </div>
            )}

            <Card className="border border-hairline bg-surface shadow-sm">
              <CardBody className="p-0">
                {!rows.length ? (
                  <div className="py-16 text-center text-xs text-ink-3">No earnings yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Type</th>
                          <th className="px-5 py-3">Student</th>
                          <th className="px-5 py-3">Course</th>
                          <th className="px-5 py-3">Duration</th>
                          <th className="px-5 py-3">Rate</th>
                          <th className="px-5 py-3">Outcome</th>
                          <th className="px-5 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {rows.map((r) => (
                          <tr key={r.id} className="hover:bg-surface-2/30">
                            <td className="px-5 py-3 text-xs text-ink-2">{fmt(r.date)}</td>
                            <td className="px-5 py-3 text-xs text-ink-2">{typeLabel[r.classType] ?? r.classType}</td>
                            <td className="px-5 py-3 text-xs text-ink-2">{r.student ?? "—"}</td>
                            <td className="px-5 py-3 text-xs text-ink-3">{r.course ?? "—"}</td>
                            <td className="px-5 py-3 text-xs text-ink-3">{r.scheduledMinutes} min</td>
                            <td className="px-5 py-3 text-xs text-ink-3">{r.hourlyRate ? money(r.hourlyRate, r.currency) : "—"}</td>
                            <td className="px-5 py-3"><Badge tone={outcomeTone[r.outcome] ?? "neutral"}>{r.outcome.replace(/_/g, " ").toLowerCase()}</Badge></td>
                            <td className="px-5 py-3 text-right text-xs font-bold text-ink">{r.paid ? money(r.amount, r.currency) : <span className="text-ink-3">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
