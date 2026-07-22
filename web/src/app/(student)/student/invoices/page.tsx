"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Receipt,
  DollarSign,
  Calendar,
  Lock,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { fetchStudentInvoices, payStudentInvoice } from "@/lib/api";
import { money, type Currency } from "@/lib/currency";

export default function StudentInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pay drawer/modal state
  const [payingInvoice, setPayingInvoice] = useState<any | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);

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

  const handleOpenPay = (inv: any) => {
    setPayingInvoice(inv);
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cardNumber.replace(/\s/g, "").length < 16) {
      Swal.fire({
        title: "Invalid Card",
        text: "Please enter a valid 16-digit credit card number.",
        icon: "warning",
        confirmButtonColor: "#386FA4",
      });
      return;
    }

    setPaymentBusy(true);
    try {
      await payStudentInvoice(payingInvoice.id);

      Swal.fire({
        title: "Payment Received!",
        text: `Your payment of ${money(Number(payingInvoice.amount), (payingInvoice.currency ?? "USD") as Currency)} was processed successfully. Thank you!`,
        icon: "success",
        confirmButtonColor: "#10b981",
      });

      setPayingInvoice(null);
      loadInvoices();
    } catch (err) {
      Swal.fire({
        title: "Transaction Failed",
        text: "We could not process your transaction. Please try another card.",
        icon: "error",
        confirmButtonColor: "#f85a6b",
      });
    } finally {
      setPaymentBusy(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      return parts.join(" ");
    } else {
      return v;
    }
  };

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
      <Topbar title="Billing & Invoices" subtitle="Manage account fee receipts and make online payments" />

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
                    <th className="px-6 py-4">Net Dues ($)</th>
                    <th className="px-6 py-4">Payment Method</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface font-medium text-ink-2">
                  {invoices.map((inv) => {
                    const isUnpaid = inv.status === "SENT" || inv.status === "OVERDUE" || inv.status === "DRAFT";
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
                          {isPaid ? "Stripe Checkout" : "Online card payment"}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={statusToneMap[inv.status] || "neutral"}>
                            {statusLabelMap[inv.status] || inv.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isUnpaid ? (
                            <Button
                              onClick={() => handleOpenPay(inv)}
                              className="bg-accent hover:bg-accent-hover text-white text-[11px] font-bold h-8.5 px-3.5 rounded-xl flex items-center gap-1 cursor-pointer"
                            >
                              <CreditCard className="size-3.5" />
                              Pay Invoice
                            </Button>
                          ) : isPaid ? (
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

      {/* Payment Checkout Drawer Modal */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in select-none">
          <div className="bg-surface border border-hairline w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4.5 flex items-center justify-between bg-surface-2/30">
              <div>
                <h3 className="font-extrabold text-ink text-sm flex items-center gap-1.5">
                  <CreditCard className="size-4.5 text-accent" />
                  Stripe Checkout
                </h3>
                <p className="text-[10px] text-ink-3 font-semibold mt-0.5">Secure payment processing portal</p>
              </div>
              <button
                onClick={() => setPayingInvoice(null)}
                className="size-8 rounded-full hover:bg-surface-3 grid place-items-center text-ink-3 hover:text-ink cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handlePaySubmit} className="p-6 space-y-4">
              
              {/* Summary */}
              <div className="bg-surface-2 border border-hairline rounded-2xl p-4 space-y-2.5">
                <div className="flex justify-between text-xs font-semibold text-ink-3">
                  <span>Billing Statement:</span>
                  <span>Invoice {payingInvoice.number}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-ink-2">
                  <span>Amount to pay:</span>
                  <span className="text-emerald-600">{money(Number(payingInvoice.amount), (payingInvoice.currency ?? "USD") as Currency)}</span>
                </div>
              </div>

              {/* Card Inputs */}
              <div>
                <label className="block text-xs font-bold text-ink-2 mb-1.5 uppercase tracking-wider">Card Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    maxLength={19}
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="4000 1234 5678 9010"
                    className="h-11 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1.5 uppercase tracking-wider">Expiry Date</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={cardExpiry}
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, "");
                      if (val.length > 2) {
                        val = val.substring(0, 2) + "/" + val.substring(2, 4);
                      }
                      setCardExpiry(val);
                    }}
                    placeholder="MM/YY"
                    className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1.5 uppercase tracking-wider">CVV / Code</label>
                  <input
                    type="password"
                    required
                    maxLength={3}
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ""))}
                    placeholder="•••"
                    className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent text-center"
                  />
                </div>
              </div>

              {/* Secure note */}
              <div className="flex items-center gap-1.5 text-[10px] text-ink-3 font-semibold justify-center py-1 bg-surface-3/40 border border-hairline rounded-xl">
                <Lock className="size-3.5" />
                <span>SSL Encrypted Transaction processing</span>
              </div>

              <div className="flex justify-end gap-2 border-t border-hairline pt-4 bg-surface">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayingInvoice(null)}
                  className="h-10 px-4 text-xs font-bold text-ink-2 border border-hairline hover:bg-surface-2 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={paymentBusy}
                  className="h-10 px-6 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
                >
                  {paymentBusy && <Loader2 className="size-4 animate-spin mr-1" />}
                  Authorize Payment
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}
    </>
  );
}
