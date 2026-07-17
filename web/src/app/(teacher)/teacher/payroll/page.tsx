"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Wallet,
  DollarSign,
  Receipt,
  CalendarClock,
  Clock,
  BookOpen,
  TrendingUp,
  MinusCircle,
  Printer,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchTeacherFinance } from "@/lib/api";

type Payslip = {
  id: string;
  payslipNo: string;
  period: { start: string; end: string };
  model: string;
  classes: number;
  hours: number;
  students: number;
  gross: number;
  bonus: number;
  deductions: number;
  netAmount: number;
  status: string;
  paymentDate: string | null;
  referenceNumber: string | null;
};

type TeacherFinance = {
  cards: {
    currentMonthSalary: number;
    classesConducted: number;
    hoursTaught: number;
    bonus: number;
    deductions: number;
    netPay: number;
    status: string;
    lifetimePaid: number;
  };
  payrollModel: string | null;
  payslips: Payslip[];
};

const money = (v: number | null | undefined) =>
  `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusTone = (status: string): Tone => {
  const s = (status || "").toUpperCase();
  if (s === "PAID" || s === "SUCCESS") return "good";
  if (s === "FAILED") return "critical";
  if (s === "PROCESSING") return "accent";
  return "warning";
};

export default function TeacherPayroll() {
  const [data, setData] = useState<TeacherFinance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeacherFinance()
      .then((res) => setData(res))
      .catch((err) => console.error("Failed to fetch teacher payroll", err))
      .finally(() => setLoading(false));
  }, []);

  const handlePrintPayslip = (p: Payslip, model: string | null) => {
    const win = window.open("", "_blank", "width=760,height=900");
    if (!win) return;
    const period = `${new Date(p.period.start).toLocaleDateString()} – ${new Date(p.period.end).toLocaleDateString()}`;
    win.document.write(`
      <html>
        <head>
          <title>Payslip ${p.payslipNo}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #18181b; margin: 0; padding: 40px; }
            .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #386FA4; padding-bottom: 16px; margin-bottom: 24px; }
            .head h1 { margin: 0; font-size: 22px; color: #386FA4; }
            .muted { color: #71717a; font-size: 12px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin: 20px 0; }
            .row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #eee; }
            .label { color: #71717a; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
            th, td { text-align: left; padding: 10px; border-bottom: 1px solid #eee; }
            th { background: #f4f4f5; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; color: #71717a; }
            .net { margin-top: 20px; display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 1px solid #10b981; border-radius: 12px; padding: 16px 20px; }
            .net .amt { font-size: 22px; font-weight: 800; color: #059669; }
            .pos { color: #059669; } .neg { color: #e11d48; }
          </style>
        </head>
        <body>
          <div class="head">
            <div>
              <h1>Payslip</h1>
              <div class="muted">Payslip No: ${p.payslipNo}</div>
            </div>
            <div style="text-align:right">
              <div class="muted">Period</div>
              <div style="font-weight:700">${period}</div>
            </div>
          </div>
          <div class="grid">
            <div class="row"><span class="label">Payroll Model</span><span>${model || p.model || "—"}</span></div>
            <div class="row"><span class="label">Status</span><span>${p.status}</span></div>
            <div class="row"><span class="label">Classes Conducted</span><span>${p.classes}</span></div>
            <div class="row"><span class="label">Hours Taught</span><span>${p.hours}</span></div>
            <div class="row"><span class="label">Students</span><span>${p.students}</span></div>
            <div class="row"><span class="label">Reference No.</span><span>${p.referenceNumber || "—"}</span></div>
            <div class="row"><span class="label">Payment Date</span><span>${p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}</span></div>
          </div>
          <table>
            <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>
              <tr><td>Gross Earnings</td><td style="text-align:right">${money(p.gross)}</td></tr>
              <tr><td>Bonus / Incentives</td><td style="text-align:right" class="pos">+${money(p.bonus)}</td></tr>
              <tr><td>Deductions</td><td style="text-align:right" class="neg">-${money(p.deductions)}</td></tr>
            </tbody>
          </table>
          <div class="net">
            <span style="font-weight:700">Net Pay</span>
            <span class="amt">${money(p.netAmount)}</span>
          </div>
          <p class="muted" style="margin-top:32px; text-align:center">This is a computer-generated payslip and does not require a signature.</p>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  if (loading) {
    return (
      <>
        <Topbar title="My Payroll" subtitle="Review your salary and payslips" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading your payroll...</p>
          </div>
        </div>
      </>
    );
  }

  const cards = data?.cards;
  const payslips = data?.payslips ?? [];

  const statCards = [
    { label: "Current Month Salary", value: money(cards?.currentMonthSalary), icon: DollarSign, color: "accent" },
    { label: "Classes Conducted", value: String(cards?.classesConducted ?? 0), icon: BookOpen, color: "good" },
    { label: "Hours Taught", value: String(cards?.hoursTaught ?? 0), icon: Clock, color: "warning" },
    { label: "Bonus", value: money(cards?.bonus), icon: TrendingUp, color: "good" },
    { label: "Deductions", value: money(cards?.deductions), icon: MinusCircle, color: "critical" },
    { label: "Net Pay", value: money(cards?.netPay), icon: Wallet, color: "accent" },
  ] as const;

  const colorClass: Record<string, string> = {
    accent: "bg-accent-soft/20 text-accent",
    good: "bg-good-soft/20 text-good",
    warning: "bg-warning-soft/20 text-warning",
    critical: "bg-critical-soft/20 text-critical",
  };

  return (
    <>
      <Topbar title="My Payroll" subtitle="Track your salary, earnings breakdown, and payslip history" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        {/* Payroll model + status banner */}
        <Card className="border border-hairline bg-surface rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <Wallet className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Payroll Model</span>
              <h4 className="text-sm font-black text-ink mt-0.5">{data?.payrollModel || "Not configured"}</h4>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Lifetime Paid</span>
              <h4 className="text-sm font-black text-ink mt-0.5">{money(cards?.lifetimePaid)}</h4>
            </div>
            {cards?.status && (
              <Badge tone={statusTone(cards.status)} className="uppercase text-[9px] font-black tracking-wider">
                {cards.status}
              </Badge>
            )}
          </div>
        </Card>

        {/* Payroll stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((c) => (
            <Card
              key={c.label}
              className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition"
            >
              <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${colorClass[c.color]}`}>
                <c.icon className="size-6" />
              </div>
              <div>
                <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">{c.label}</span>
                <h4 className="text-xl font-black text-ink leading-none mt-1">{c.value}</h4>
              </div>
            </Card>
          ))}
        </div>

        {/* Payslip history */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline">
            <Receipt className="size-4.5 text-accent" />
            <h3 className="font-extrabold text-sm text-ink">Payslip History ({payslips.length})</h3>
          </div>

          {payslips.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6">Period</th>
                    <th className="p-4">Model</th>
                    <th className="p-4">Classes</th>
                    <th className="p-4">Hours</th>
                    <th className="p-4">Gross</th>
                    <th className="p-4">Bonus (+)</th>
                    <th className="p-4">Deductions (-)</th>
                    <th className="p-4 font-bold text-ink">Net</th>
                    <th className="p-4">Payslip No.</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 pr-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {payslips.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2/10 transition">
                      <td className="p-4 pl-6">
                        <span className="flex items-center gap-1.5 font-extrabold text-ink whitespace-nowrap">
                          <CalendarClock className="size-3.5 text-ink-3" />
                          {new Date(p.period.start).toLocaleDateString()} – {new Date(p.period.end).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="inline-flex items-center bg-surface-2/45 px-2.5 py-1 rounded-lg">{p.model}</span>
                      </td>
                      <td className="p-4 text-ink-2">{p.classes}</td>
                      <td className="p-4 text-ink-2">{p.hours}</td>
                      <td className="p-4 text-ink-2">{money(p.gross)}</td>
                      <td className="p-4 text-good">+{money(p.bonus)}</td>
                      <td className="p-4 text-critical">-{money(p.deductions)}</td>
                      <td className="p-4">
                        <span className="font-extrabold text-ink flex items-center gap-1">
                          <Wallet className="size-3.5 text-accent" />
                          {money(p.netAmount)}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-ink-3 whitespace-nowrap">{p.payslipNo || "—"}</td>
                      <td className="p-4">
                        <Badge
                          tone={statusTone(p.status)}
                          className="text-[9px] font-black tracking-wider uppercase select-none px-2 py-0.5"
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <Button
                          onClick={() => handlePrintPayslip(p, data?.payrollModel ?? null)}
                          className="bg-accent hover:bg-accent-hover text-white text-[11px] font-bold h-8.5 px-3 rounded-xl inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="size-3.5" />
                          View / Print
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 space-y-4">
              <div className="size-16 rounded-full bg-surface-2 flex items-center justify-center mx-auto text-ink-3">
                <Receipt className="size-8 text-ink-3/40" />
              </div>
              <div className="space-y-1">
                <h5 className="font-extrabold text-sm text-ink">No payslips yet</h5>
                <p className="text-[10px] text-ink-3 max-w-[280px] mx-auto leading-relaxed">
                  Your payslips will appear here once payroll runs are generated and issued by the administration.
                </p>
              </div>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
