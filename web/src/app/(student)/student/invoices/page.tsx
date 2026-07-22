"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Receipt,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { fetchStudentInvoices } from "@/lib/api";
import { money, type Currency } from "@/lib/currency";

export default function StudentInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);


  const loadInvoices = () => {
    setLoading(true);
    fetchStudentInvoices()
      .then((res) => {
        setInvoices(res);
      })
      .catch((err) => {
        console.error("Failed to load student invoices", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  if (loading) {
    return (
      <>
        <Topbar title="Billing & Invoices" subtitle="Check fee status" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading billing statement...</p>
          </div>
        </div>
      </>
    );
  }

  const statusToneMap: Record<string, Tone> = {
    PAID: "good",
    SENT: "accent",
    OVERDUE: "critical",
    DRAFT: "neutral",
    VOID: "neutral",
  };

  const statusLabelMap: Record<string, string> = {
    PAID: "Paid",
    SENT: "Unpaid / Due",
    OVERDUE: "Overdue",
    DRAFT: "Draft",
    VOID: "Voided",
  };

  return (
    <>
      <Topbar title="Billing & Invoices" subtitle="Your fee statements and balances" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto min-h-[300px]">
            {invoices.length > 0 ? (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2 text-[10px] font-bold uppercase text-ink-3 tracking-wider select-none">
                    <th className="px-6 py-4">Invoice #</th>
                    <th className="px-6 py-4">Issue Date</th>
                    <th className="px-6 py-4">Due Date</th>
                    {/* Was "Net Dues ($)": the dollar sign is wrong for a family
                        billed in AED or GBP, and money() already names the
                        currency per row. */}
                    <th className="px-6 py-4">Amount</th>
                    {/* Was "Payment Method", hardcoded to "Stripe Checkout" when
                        paid and "Online card payment" when not. This payload
                        carries no method, so the column could only guess. */}
                    <th className="px-6 py-4">Balance</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface font-medium text-ink-2">
                  {invoices.map((inv) => {
                    const isPaid = inv.status === "PAID";
                    
                    return (
                      <tr key={inv.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-xs text-ink">
                          {inv.number}
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-3">
                          {new Date(inv.issuedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-3">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "Upon Receipt"}
                        </td>
                        <td className="px-6 py-4 font-extrabold text-xs text-ink">
                          {money(Number(inv.amount), (inv.currency ?? "USD") as Currency)}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {money(
                            Number(inv.amount) - Number(inv.paidAmount ?? 0),
                            (inv.currency ?? "USD") as Currency,
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={statusToneMap[inv.status] || "neutral"}>
                            {statusLabelMap[inv.status] || inv.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {/* The "Pay Invoice" button opened a card form that
                              looked like Stripe, threw the card details away and
                              called an endpoint that simply marked the invoice
                              paid. It returns when Stripe is actually wired. */}
                          {isPaid ? (
                            <span className="text-xs text-good font-bold flex items-center justify-end gap-1 select-none">
                              <CheckCircle2 className="size-4" />
                              Paid on {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                <Receipt className="size-10 text-ink-3/40" />
                <p className="font-bold text-sm">No invoice statement statements found.</p>
                <p className="text-xs">You have no unpaid fee logs or bills registered at this time.</p>
              </div>
            )}
          </div>
        </Card>
      </main>

    </>
  );
}
