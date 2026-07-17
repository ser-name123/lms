"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Loader2,
  Receipt,
  Wallet,
  CalendarClock,
  FileText,
  ChevronDown,
  ChevronRight,
  Printer,
  Award,
  CreditCard,
  AlertCircle,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchStudentFinance } from "@/lib/api";

type InvoiceItem = { type: string; label: string; amount: number };
type Invoice = {
  id: string;
  number: string;
  periodLabel: string | null;
  currency: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
  issuedAt: string;
  dueAt: string | null;
  items: InvoiceItem[];
};
type PaymentHistory = {
  invoice: string;
  amount: number;
  method: string;
  status: string;
  paidAt: string;
};
type ReceiptRow = {
  id: string;
  number: string;
  invoice: string;
  amount: number;
  currency: string;
  method: string;
  issuedAt: string;
};
type Scholarship = { name: string; type: string; value: number; status: string };

type StudentFinance = {
  profile: { name: string; lastPaymentDate: string | null };
  cards: {
    outstanding: number;
    totalPaid: number;
    nextDueDate: string | null;
    nextDueAmount: number;
    openInvoices: number;
  };
  invoices: Invoice[];
  paymentHistory: PaymentHistory[];
  receipts: ReceiptRow[];
  scholarships: Scholarship[];
};

const fmt = (amount: number | null | undefined, currency?: string) => {
  const prefix = currency ? `${currency} ` : "$";
  return `${prefix}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const invoiceStatusTone: Record<string, Tone> = {
  PAID: "good",
  SENT: "accent",
  PENDING: "warning",
  PARTIALLY_PAID: "warning",
  OVERDUE: "critical",
  DRAFT: "neutral",
  CANCELLED: "neutral",
  VOID: "neutral",
};

const invoiceStatusLabel: Record<string, string> = {
  PAID: "Paid",
  SENT: "Unpaid / Due",
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  OVERDUE: "Overdue",
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
  VOID: "Voided",
};

export default function StudentFees() {
  const [data, setData] = useState<StudentFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchStudentFinance()
      .then((res) => setData(res))
      .catch((err) => console.error("Failed to load student finance", err))
      .finally(() => setLoading(false));
  }, []);

  const handlePrintReceipt = (r: ReceiptRow, studentName: string) => {
    const win = window.open("", "_blank", "width=720,height=880");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Receipt ${r.number}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #18181b; margin: 0; padding: 40px; }
            .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #386FA4; padding-bottom: 16px; margin-bottom: 24px; }
            .head h1 { margin: 0; font-size: 22px; color: #386FA4; }
            .muted { color: #71717a; font-size: 12px; }
            .row { display: flex; justify-content: space-between; font-size: 13px; padding: 8px 0; border-bottom: 1px solid #eee; }
            .label { color: #71717a; }
            .paid { margin-top: 22px; display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 1px solid #10b981; border-radius: 12px; padding: 16px 20px; }
            .paid .amt { font-size: 22px; font-weight: 800; color: #059669; }
          </style>
        </head>
        <body>
          <div class="head">
            <div>
              <h1>Payment Receipt</h1>
              <div class="muted">Receipt No: ${r.number}</div>
            </div>
            <div style="text-align:right">
              <div class="muted">Issued</div>
              <div style="font-weight:700">${r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : "—"}</div>
            </div>
          </div>
          <div class="row"><span class="label">Received From</span><span>${studentName || "—"}</span></div>
          <div class="row"><span class="label">Against Invoice</span><span>${r.invoice || "—"}</span></div>
          <div class="row"><span class="label">Payment Method</span><span>${r.method || "—"}</span></div>
          <div class="paid">
            <span style="font-weight:700">Amount Paid</span>
            <span class="amt">${fmt(r.amount, r.currency)}</span>
          </div>
          <p class="muted" style="margin-top:32px; text-align:center">This is a computer-generated receipt and does not require a signature.</p>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  if (loading) {
    return (
      <>
        <Topbar title="My Fees" subtitle="Check your fee status" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading fee profile...</p>
          </div>
        </div>
      </>
    );
  }

  const cards = data?.cards;
  const invoices = data?.invoices ?? [];
  const paymentHistory = data?.paymentHistory ?? [];
  const receipts = data?.receipts ?? [];
  const scholarships = data?.scholarships ?? [];
  const studentName = data?.profile?.name ?? "";

  return (
    <>
      <Topbar title="My Fees" subtitle="Fee status, invoices, receipts, and scholarships" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        {/* Read-only note */}
        <div className="flex items-start gap-2.5 p-3.5 rounded-2xl border border-hairline bg-surface-2/40 text-xs">
          <AlertCircle className="size-4.5 text-accent shrink-0 mt-0.5" />
          <p className="text-ink-3 leading-relaxed">
            This is a read-only view of your fee account. Payments are recorded by the academy office — please contact
            administration to settle any outstanding balance.
          </p>
        </div>

        {/* Fee status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-critical-soft/20 text-critical flex items-center justify-center shrink-0">
              <Wallet className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Outstanding</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{fmt(cards?.outstanding)}</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
              <CalendarClock className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Next Due</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{fmt(cards?.nextDueAmount)}</h4>
              <p className="text-[10px] text-ink-3 mt-1">
                {cards?.nextDueDate ? new Date(cards.nextDueDate).toLocaleDateString() : "No upcoming dues"}
              </p>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
              <CreditCard className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Paid</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{fmt(cards?.totalPaid)}</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <Receipt className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Open Invoices</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{cards?.openInvoices ?? 0}</h4>
            </div>
          </Card>
        </div>

        {/* Invoices */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline">
            <FileText className="size-4.5 text-accent" />
            <h3 className="font-extrabold text-sm text-ink">Invoices ({invoices.length})</h3>
          </div>

          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6 w-6"></th>
                    <th className="p-4">Invoice #</th>
                    <th className="p-4">Period</th>
                    <th className="p-4">Issued</th>
                    <th className="p-4">Due</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Paid</th>
                    <th className="p-4 font-bold text-ink">Balance</th>
                    <th className="p-4 pr-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {invoices.map((inv) => {
                    const isOpen = expanded === inv.id;
                    return (
                      <Fragment key={inv.id}>
                        <tr
                          onClick={() => setExpanded(isOpen ? null : inv.id)}
                          className="hover:bg-surface-2/10 transition cursor-pointer"
                        >
                          <td className="p-4 pl-6 text-ink-3">
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </td>
                          <td className="p-4 font-mono font-bold text-ink whitespace-nowrap">{inv.number}</td>
                          <td className="p-4 text-ink-3">{inv.periodLabel || "—"}</td>
                          <td className="p-4 text-ink-3 whitespace-nowrap">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                          <td className="p-4 text-ink-3 whitespace-nowrap">
                            {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "Upon Receipt"}
                          </td>
                          <td className="p-4 text-ink-2">{fmt(inv.amount, inv.currency)}</td>
                          <td className="p-4 text-good">{fmt(inv.paidAmount, inv.currency)}</td>
                          <td className="p-4 font-extrabold text-ink">{fmt(inv.balance, inv.currency)}</td>
                          <td className="p-4 pr-6 text-right">
                            <Badge tone={invoiceStatusTone[inv.status] || "neutral"}>
                              {invoiceStatusLabel[inv.status] || inv.status}
                            </Badge>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-surface-2/20">
                            <td colSpan={9} className="px-6 py-4">
                              <p className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider mb-2">
                                Line Items
                              </p>
                              {inv.items && inv.items.length > 0 ? (
                                <div className="space-y-1.5 max-w-md">
                                  {inv.items.map((it, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between text-xs py-1.5 border-b border-hairline last:border-0"
                                    >
                                      <span className="text-ink-2">
                                        <span className="text-[9px] font-extrabold text-ink-3 uppercase tracking-wider mr-2">
                                          {it.type}
                                        </span>
                                        {it.label}
                                      </span>
                                      <span className="font-bold text-ink">{fmt(it.amount, inv.currency)}</span>
                                    </div>
                                  ))}
                                  <div className="flex items-center justify-between text-xs pt-2 font-extrabold text-ink">
                                    <span>Total</span>
                                    <span>{fmt(inv.amount, inv.currency)}</span>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-ink-3">No line item breakdown available.</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 space-y-3">
              <div className="size-16 rounded-full bg-surface-2 flex items-center justify-center mx-auto text-ink-3">
                <FileText className="size-8 text-ink-3/40" />
              </div>
              <h5 className="font-extrabold text-sm text-ink">No invoices found</h5>
              <p className="text-[10px] text-ink-3">You have no fee invoices registered at this time.</p>
            </div>
          )}
        </Card>

        {/* Payment history */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline">
            <CreditCard className="size-4.5 text-accent" />
            <h3 className="font-extrabold text-sm text-ink">Payment History ({paymentHistory.length})</h3>
          </div>

          {paymentHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6">Invoice</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Method</th>
                    <th className="p-4">Paid Date</th>
                    <th className="p-4 pr-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {paymentHistory.map((p, i) => (
                    <tr key={i} className="hover:bg-surface-2/10 transition">
                      <td className="p-4 pl-6 font-mono font-bold text-ink whitespace-nowrap">{p.invoice || "—"}</td>
                      <td className="p-4 font-extrabold text-ink">{fmt(p.amount)}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 bg-surface-2/45 px-2.5 py-1 rounded-lg">
                          <CreditCard className="size-3.5 text-ink-3" />
                          {p.method || "—"}
                        </span>
                      </td>
                      <td className="p-4 text-ink-3 whitespace-nowrap">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <Badge
                          tone={p.status === "PAID" || p.status === "SUCCESS" ? "good" : "warning"}
                          className="text-[9px] font-black tracking-wider uppercase select-none px-2 py-0.5"
                        >
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-14 text-ink-3">
              <p className="font-bold text-sm">No payments recorded yet.</p>
            </div>
          )}
        </Card>

        {/* Receipts + Scholarships */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Receipts */}
          <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline">
              <Receipt className="size-4.5 text-accent" />
              <h3 className="font-extrabold text-sm text-ink">Receipts ({receipts.length})</h3>
            </div>
            {receipts.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-xs text-ink truncate">{r.number}</p>
                      <p className="text-[10px] text-ink-3 mt-0.5">
                        {r.invoice ? `Invoice ${r.invoice} · ` : ""}
                        {r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : ""} · {r.method}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-extrabold text-xs text-ink">{fmt(r.amount, r.currency)}</span>
                      <Button
                        onClick={() => handlePrintReceipt(r, studentName)}
                        variant="outline"
                        className="h-8 px-3 text-[11px] font-bold text-ink-2 border border-hairline hover:bg-surface-2 rounded-xl inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="size-3.5" />
                        View / Print
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-14 text-ink-3">
                <p className="font-bold text-sm">No receipts issued yet.</p>
              </div>
            )}
          </Card>

          {/* Scholarships */}
          <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline">
              <Award className="size-4.5 text-accent" />
              <h3 className="font-extrabold text-sm text-ink">Scholarships ({scholarships.length})</h3>
            </div>
            {scholarships.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {scholarships.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-ink truncate">{s.name}</p>
                      <p className="text-[10px] text-ink-3 mt-0.5">
                        {s.type === "PERCENTAGE" ? `${s.value}% discount` : fmt(s.value)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        s.status === "APPROVED" || s.status === "APPLIED"
                          ? "good"
                          : s.status === "REJECTED"
                            ? "critical"
                            : "warning"
                      }
                      className="text-[9px] font-black tracking-wider uppercase select-none px-2 py-0.5"
                    >
                      {s.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-14 text-ink-3">
                <p className="font-bold text-sm">No scholarships on record.</p>
              </div>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
