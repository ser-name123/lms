"use client";

import { useEffect, useState } from "react";
import {
  Receipt,
  Search,
  Wallet,
  Loader2,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchTeacherPayouts } from "@/lib/api";

export default function TeacherPayouts() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchTeacherPayouts()
      .then((res) => {
        setPayouts(res);
      })
      .catch((err) => {
        console.error("Failed to fetch payouts list", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filtered = payouts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.referenceNumber?.toLowerCase().includes(q) ||
      p.notes?.toLowerCase().includes(q) ||
      p.paymentMethod?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <>
        <Topbar title="Payout History" subtitle="Review your payouts ledger" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading payout ledgers...</p>
          </div>
        </div>
      </>
    );
  }

  // Calculate quick stats metrics
  const cumulativeEarnings = payouts.reduce((sum, p) => sum + Number(p.netAmount || 0), 0);
  const lastPayout = payouts.length > 0 ? Number(payouts[0].netAmount || 0) : 0;
  const totalPayoutCount = payouts.length;

  return (
    <>
      <Topbar title="Payout History" subtitle="Track your wage and salary payments ledger history" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Futuristic Roster Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <DollarSign className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Cumulative Earnings</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">
                ${cumulativeEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
              <Wallet className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Last Paid Amount</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">
                ${lastPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
              <Receipt className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Statements</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{totalPayoutCount} Ledgers</h4>
            </div>
          </Card>
        </div>

        {/* Filters control center bar */}
        <Card className="border border-hairline bg-surface rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
              <Receipt className="size-4.5 text-accent" />
              Payout Logs ({filtered.length})
            </h3>

            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search reference, method..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
              />
            </div>
          </div>
        </Card>

        {/* Payouts Table */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6">Billing Period</th>
                    <th className="p-4">Base Amount</th>
                    <th className="p-4">Bonus (+)</th>
                    <th className="p-4">Deductions (-)</th>
                    <th className="p-4 font-bold text-ink">Net Paid</th>
                    <th className="p-4">Payment Method</th>
                    <th className="p-4">Reference No.</th>
                    <th className="p-4">Paid Date</th>
                    <th className="p-4 pr-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filtered.map((p) => {
                    const isPaid = p.status === "PAID" || p.status === "SUCCESS";
                    const paidDate = p.paymentDate ? new Date(p.paymentDate) : null;
                    const billingStart = new Date(p.billingPeriodStart);
                    const billingEnd = new Date(p.billingPeriodEnd);
                    return (
                      <tr key={p.id} className="hover:bg-surface-2/10 transition">
                        <td className="p-4 pl-6">
                          <span className="block font-extrabold text-ink whitespace-nowrap">
                            {billingStart.toLocaleDateString()} – {billingEnd.toLocaleDateString()}
                          </span>
                        </td>
                        <td className="p-4 text-ink-2">${Number(p.amount).toFixed(2)}</td>
                        <td className="p-4 text-good">+${Number(p.bonus).toFixed(2)}</td>
                        <td className="p-4 text-critical">-${Number(p.deductions).toFixed(2)}</td>
                        <td className="p-4">
                          <span className="font-extrabold text-ink flex items-center gap-1">
                            <Wallet className="size-3.5 text-accent" />
                            ${Number(p.netAmount).toFixed(2)}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 bg-surface-2/45 px-2.5 py-1 rounded-lg">
                            <CreditCard className="size-3.5 text-ink-3" />
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="p-4 text-ink-3">{p.referenceNumber || "—"}</td>
                        <td className="p-4 whitespace-nowrap text-ink-3">
                          {paidDate ? paidDate.toLocaleDateString() : "—"}
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <Badge
                            tone={isPaid ? "good" : "warning"}
                            className="text-[9px] font-black tracking-wider uppercase select-none px-2 py-0.5"
                          >
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 space-y-4">
              <div className="size-16 rounded-full bg-surface-2 flex items-center justify-center mx-auto text-ink-3">
                <Receipt className="size-8 text-ink-3/40" />
              </div>
              <div className="space-y-1">
                <h5 className="font-extrabold text-sm text-ink">No payout records found</h5>
                <p className="text-[10px] text-ink-3 max-w-[280px] mx-auto leading-relaxed">
                  There are no salary payout transactions registered in your ledger statement history.
                </p>
              </div>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
