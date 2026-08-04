"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt, CheckCircle2, Clock, AlertCircle } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { fetchMySalaries, type MySalaryRow } from "@/lib/api";

const money = (n: number, c = "USD") => `${c} ${n.toFixed(2)}`;
const fmtDay = (v: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const statusTone: Record<string, Tone> = {
  CALCULATED: "neutral",
  UNDER_REVIEW: "accent",
  ADJUSTMENT_APPLIED: "warning",
  APPROVED: "good",
  PAID: "good",
  FAILED: "critical",
};
const statusLabel: Record<string, string> = {
  CALCULATED: "Calculated",
  UNDER_REVIEW: "Under review",
  ADJUSTMENT_APPLIED: "Adjustment applied",
  APPROVED: "Approved",
  PAID: "Paid",
  FAILED: "Payment failed",
};

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-ink-3">{k}</span>
      <span className={strong ? "text-sm font-black text-ink" : "text-xs font-semibold text-ink-2"}>{v}</span>
    </div>
  );
}

function SalaryCard({ s }: { s: MySalaryRow }) {
  const c = s.currency || "USD";
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-ink">{s.monthLabel}</p>
            <p className="mt-0.5 text-[11px] text-ink-3">
              {s.totalClasses} class{s.totalClasses === 1 ? "" : "es"} · {fmtDay(s.periodStart)} – {fmtDay(s.periodEnd)}
            </p>
          </div>
          <Badge tone={statusTone[s.status] ?? "neutral"}>{statusLabel[s.status] ?? s.status}</Badge>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Breakdown</p>
            <Row k="Regular classes" v={money(s.regularEarnings, c)} />
            <Row k="Trial earnings" v={money(s.trialEarnings, c)} />
            {s.bonusEarnings > 0 && <Row k="Bonus" v={money(s.bonusEarnings, c)} />}
            <Row k="Gross" v={money(s.grossAmount, c)} />
            {s.adjustmentsTotal !== 0 && (
              <Row k="Adjustments" v={`${s.adjustmentsTotal > 0 ? "+" : ""}${money(s.adjustmentsTotal, c)}`} />
            )}
            <div className="mt-1 border-t border-hairline pt-1">
              <Row k="Net pay" v={money(s.netAmount, c)} strong />
            </div>
          </div>

          <div className="space-y-3">
            {/* Payment state — the point of this page for a teacher. */}
            <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Payment</p>
              {s.status === "PAID" ? (
                <div className="flex items-start gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Paid on {fmtDay(s.paidAt)}
                    {s.wiseReference && <><br /><span className="font-mono text-[11px] text-ink-3">Ref: {s.wiseReference}</span></>}
                  </span>
                </div>
              ) : s.status === "FAILED" ? (
                <div className="flex items-start gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>Payment failed. Our team is on it.{s.failureReason && <><br /><span className="text-ink-3">{s.failureReason}</span></>}</span>
                </div>
              ) : s.status === "APPROVED" ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                  <Clock className="size-4 shrink-0 text-amber-500" /> Approved — queued for payment.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-ink-3">
                  <Clock className="size-4 shrink-0" /> Awaiting admin approval.
                </div>
              )}
            </div>

            {/* Adjustments with reasons — so a deduction is never a surprise. */}
            {s.adjustments.length > 0 && (
              <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Adjustments</p>
                <div className="space-y-1.5">
                  {s.adjustments.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-ink-2">
                        <span className={a.type === "DEDUCTION" ? "text-red-500" : "text-emerald-500"}>
                          {a.type === "DEDUCTION" ? "Deduction" : "Extra pay"}
                        </span>
                        <span className="text-ink-3"> — {a.reason}</span>
                      </span>
                      <span className="whitespace-nowrap font-semibold text-ink-2">
                        {a.type === "DEDUCTION" ? "−" : "+"}{money(a.amount, c)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function TeacherSalaryPage() {
  const [rows, setRows] = useState<MySalaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMySalaries()
      .then(setRows)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="My Salary" subtitle="Your monthly salary, adjustments and payment status" />
      <div className="animate-fade-up space-y-4 p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !rows.length ? (
          <Card className="border border-hairline bg-surface shadow-sm">
            <CardBody className="p-0">
              <div className="flex flex-col items-center gap-2 py-16 text-center text-xs text-ink-3">
                <Receipt className="size-6 text-ink-3/60" />
                No salary has been calculated for you yet. It appears here once the admin runs the monthly salary.
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {rows.map((s) => (
              <SalaryCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
