"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  X,
  AlertCircle,
  MoreVertical,
  Download,
  Eye,
  FileText,
  CreditCard,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { fetchStudentFinance, createPaymentIntent } from "@/lib/api";
import { money } from "@/lib/currency";

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

  // Stripe States
  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [stripeInstance, setStripeInstance] = useState<any>(null);
  const [elementsInstance, setElementsInstance] = useState<any>(null);
  const [autoPayEnabled, setAutoPayEnabled] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const loadInvoices = () => {
    setLoading(true);
    fetchStudentFinance()
      .then((res) => setData(res))
      .catch((err) => console.error("Failed to load student finance", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();

    // Check for redirection param
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_success") === "true") {
      Swal.fire({
        title: "Payment Succeeded!",
        text: "Your invoice has been paid successfully.",
        icon: "success",
        confirmButtonColor: "#386FA4",
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadStripeScript = (): Promise<void> => {
    return new Promise((resolve) => {
      if ((window as any).Stripe) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  };

  const handlePayClick = async (invoice: any) => {
    setActiveInvoice(invoice);
    setStripeLoading(true);
    setStripeError("");
    try {
      const res = await createPaymentIntent(invoice.id);
      await loadStripeScript();
      
      if (!(window as any).Stripe) {
        throw new Error("Failed to load Stripe payment gateway.");
      }

      const stripe = (window as any).Stripe(res.publishableKey);
      setStripeInstance(stripe);

      const elements = stripe.elements({
        clientSecret: res.clientSecret,
        appearance: {
          theme: document.documentElement.classList.contains("dark") ? "night" : "flat",
          variables: {
            colorPrimary: "#386FA4",
          }
        }
      });
      setElementsInstance(elements);

      setTimeout(() => {
        const paymentElement = elements.create("payment");
        paymentElement.mount("#payment-element-mount-fees");
        setStripeLoading(false);
      }, 300);

    } catch (err: any) {
      console.error("Payment initialization failed", err);
      setStripeError(err?.message || "Could not initialize payment. Please try again.");
      setStripeLoading(false);
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripeInstance || !elementsInstance) return;

    setPaying(true);
    setStripeError("");

    try {
      const { error } = await stripeInstance.confirmPayment({
        elements: elementsInstance,
        confirmParams: {
          return_url: `${window.location.origin}/student/fees?payment_success=true`,
        },
      });

      if (error) {
        setStripeError(error.message || "Payment failed.");
      }
    } catch (err: any) {
      setStripeError(err?.message || "An unexpected error occurred.");
    } finally {
      setPaying(false);
    }
  };

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
        <Topbar title="Invoices and Payments" subtitle="Check your fee status" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading fee profile...</p>
          </div>
        </div>
      </>
    );
  }

  const invoices = data?.invoices ?? [];
  const paymentHistory = data?.paymentHistory ?? [];
  const receipts = data?.receipts ?? [];
  const studentName = data?.profile?.name ?? "";

  // Filter pending/unpaid invoices
  const pendingInvoices = invoices.filter(
    (inv) =>
      inv.status === "SENT" ||
      inv.status === "OVERDUE" ||
      inv.status === "PARTIALLY_PAID" ||
      inv.balance > 0
  );

  // Filter paid/void/cancelled invoices for Payment History
  const historyInvoices = invoices.filter(
    (inv) =>
      inv.status === "PAID" ||
      inv.status === "VOID" ||
      inv.status === "CANCELLED" ||
      inv.balance === 0
  );

  return (
    <>
      <Topbar title="Invoices and Payments" subtitle="Manage your pending dues and payment history" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Pending Invoices Container */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline bg-surface-2/10">
            <FileText className="size-4.5 text-accent" />
            <h3 className="font-extrabold text-sm text-ink">Pending Invoices</h3>
          </div>

          {pendingInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6">Invoice Number</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4 pr-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {pendingInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-2/5 transition">
                      <td className="p-4 pl-6 font-mono font-bold text-ink whitespace-nowrap">{inv.number}</td>
                      <td className="p-4 text-ink-3 whitespace-nowrap">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                      <td className="p-4 text-ink-3 whitespace-nowrap">
                        {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "Upon Receipt"}
                      </td>
                      <td className="p-4 font-extrabold text-accent">{fmt(inv.balance, inv.currency)}</td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => handlePayClick(inv)}
                          className="px-4 py-1.5 bg-accent text-white font-bold rounded-xl text-xs hover:bg-accent-active cursor-pointer active:scale-98 transition shadow-sm"
                        >
                          PAY
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-ink-3 font-semibold text-sm">
              There is no Pending Invoices
            </div>
          )}
        </Card>

        {/* Payment History Container */}
        <Card className="border border-hairline bg-surface rounded-3xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline bg-surface-2/10">
            <CreditCard className="size-4.5 text-accent" />
            <h3 className="font-extrabold text-sm text-ink">Payment History</h3>
          </div>

          {historyInvoices.length > 0 ? (
            <div className="overflow-x-auto min-h-[180px]">
              <table className="w-full border-collapse text-left text-xs font-semibold text-ink-2">
                <thead>
                  <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                    <th className="p-4 pl-6">Invoice Date</th>
                    <th className="p-4">Number</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Payment Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 pr-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {historyInvoices.map((inv) => {
                    const paymentRecord = paymentHistory.find((p) => p.invoice === inv.number);
                    const paymentDate = paymentRecord && paymentRecord.paidAt 
                      ? new Date(paymentRecord.paidAt).toLocaleDateString() 
                      : "—";
                    const receiptRecord = receipts.find((r) => r.invoice === inv.number);

                    return (
                      <tr key={inv.id} className="hover:bg-surface-2/5 transition">
                        <td className="p-4 pl-6 text-ink-3 whitespace-nowrap">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                        <td className="p-4 font-mono font-bold text-ink whitespace-nowrap">{inv.number}</td>
                        <td className="p-4 font-bold text-ink whitespace-nowrap">{fmt(inv.amount, inv.currency)}</td>
                        <td className="p-4 text-ink-3 whitespace-nowrap">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "Upon Receipt"}
                        </td>
                        <td className="p-4 text-ink-3 whitespace-nowrap">{paymentDate}</td>
                        <td className="p-4 whitespace-nowrap">
                          <Badge tone={invoiceStatusTone[inv.status] || "neutral"}>
                            {invoiceStatusLabel[inv.status] || inv.status}
                          </Badge>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === inv.id ? null : inv.id);
                              }}
                              className="size-8 rounded-lg hover:bg-surface-3 flex items-center justify-center text-ink-2 cursor-pointer transition-colors"
                            >
                              <MoreVertical className="size-4" />
                            </button>
                            {activeMenuId === inv.id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => setActiveMenuId(null)}
                                />
                                <div className="absolute right-0 mt-1.5 w-36 rounded-xl border border-hairline bg-surface shadow-pop py-1 z-20 text-left">
                                  {receiptRecord ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handlePrintReceipt(receiptRecord, studentName);
                                        }}
                                        className="w-full px-3 py-2 text-left text-xs font-bold text-ink-2 hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
                                      >
                                        <Eye className="size-3.5 text-ink-3" />
                                        View
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handlePrintReceipt(receiptRecord, studentName);
                                        }}
                                        className="w-full px-3 py-2 text-left text-xs font-bold text-ink-2 hover:bg-surface-2 flex items-center gap-2 cursor-pointer"
                                      >
                                        <Download className="size-3.5 text-ink-3" />
                                        Download
                                      </button>
                                    </>
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-ink-3">
                                      No Receipt
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-ink-3 font-semibold text-sm">
              No payments recorded yet.
            </div>
          )}
        </Card>
      </main>

      {/* Pay Invoice Stripe Elements Modal */}
      {activeInvoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <form 
            onSubmit={handleConfirmPayment}
            className="bg-surface border border-hairline rounded-3xl w-full max-w-md max-h-[90vh] shadow-pop overflow-hidden flex flex-col animate-fade-up"
          >
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <div>
                <h2 className="font-extrabold text-base text-ink">Pay Invoice</h2>
                <p className="text-xs text-ink-3 mt-0.5">Settle {activeInvoice.number} securely via Stripe Card</p>
              </div>
              <button 
                type="button"
                onClick={() => setActiveInvoice(null)} 
                className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 [scrollbar-width:thin] min-h-0">
              {/* Error alerts */}
              {stripeError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{stripeError}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Payment Element Mount Container */}
                <div className="min-h-[180px] relative flex flex-col justify-center">
                  {stripeLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80 z-10 gap-2">
                      <Loader2 className="size-7 animate-spin text-accent" />
                      <p className="text-xs text-ink-3 font-semibold">Setting up secure form...</p>
                    </div>
                  )}
                  <div id="payment-element-mount-fees" className="w-full" />
                </div>

                {/* Auto-Pay Option */}
                {!stripeLoading && (
                  <div className="p-4 rounded-2xl border border-accent/30 bg-accent/5 flex items-start gap-3 transition-all duration-200 shadow-sm shadow-accent/5 hover:border-accent/40">
                    <input 
                      type="checkbox" 
                      id="auto-pay-checkbox-fees" 
                      checked={autoPayEnabled}
                      onChange={(e) => setAutoPayEnabled(e.target.checked)}
                      className="mt-0.5 rounded border-hairline text-accent size-4.5 cursor-pointer focus:ring-0"
                    />
                    <label htmlFor="auto-pay-checkbox-fees" className="min-w-0 flex-1 cursor-pointer select-none">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink">Enable Auto-Pay (Recommended)</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-accent text-white rounded-md font-extrabold uppercase tracking-wide">Enabled</span>
                      </div>
                      <p className="text-[10px] text-ink-3 mt-1 leading-normal">
                        Saves your card to auto-debit future monthly invoices. Cancel anytime.
                      </p>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons (Sticky Footer) */}
            {!stripeLoading && (
              <div className="flex justify-end gap-3 p-6 border-t border-hairline bg-surface-2/50">
                <button 
                  type="button" 
                  onClick={() => setActiveInvoice(null)} 
                  disabled={paying}
                  className="h-10 px-5 rounded-xl border border-hairline bg-surface hover:bg-surface-2 text-xs font-bold text-ink-2 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={paying || !stripeInstance}
                  className="h-10 px-6 rounded-xl bg-accent text-xs font-bold text-white flex items-center gap-1.5 justify-center hover:bg-accent-active cursor-pointer transition-all active:scale-98 disabled:opacity-50"
                >
                  {paying ? <Loader2 className="size-4 animate-spin" /> : null}
                  Confirm &amp; Pay {money(Number(activeInvoice.amount) - Number(activeInvoice.paidAmount ?? 0), activeInvoice.currency)}
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </>
  );
}
