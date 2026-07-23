"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Receipt,
  X,
  AlertCircle,
} from "lucide-react";
import Swal from "sweetalert2";

import { cn } from "@/lib/utils";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { fetchStudentInvoices, createPaymentIntent } from "@/lib/api";
import { money, type Currency } from "@/lib/currency";

export default function StudentInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Stripe States
  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [stripeInstance, setStripeInstance] = useState<any>(null);
  const [elementsInstance, setElementsInstance] = useState<any>(null);

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
        paymentElement.mount("#payment-element-mount");
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
          return_url: `${window.location.origin}/student/invoices?payment_success=true`,
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
                    <th className="px-6 py-4">Amount</th>
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
                          {isPaid ? (
                            <span className="text-xs text-good font-bold flex items-center justify-end gap-1 select-none">
                              <CheckCircle2 className="size-4" />
                              Paid on {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : ""}
                            </span>
                          ) : (
                            <button
                              onClick={() => handlePayClick(inv)}
                              className="h-8 px-4 rounded-lg bg-accent text-[11px] font-bold text-white hover:bg-accent/90 active:scale-95 transition-all cursor-pointer"
                            >
                              Pay Invoice
                            </button>
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

      {/* Pay Invoice Stripe Elements Modal */}
      {activeInvoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md shadow-pop overflow-hidden p-6 space-y-6 animate-fade-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h2 className="font-extrabold text-base text-ink">Pay Invoice</h2>
                <p className="text-xs text-ink-3 mt-0.5">Settle {activeInvoice.number} securely via Stripe Card</p>
              </div>
              <button 
                onClick={() => setActiveInvoice(null)} 
                className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Error alerts */}
            {stripeError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{stripeError}</span>
              </div>
            )}

            {/* Main Form */}
            <form onSubmit={handleConfirmPayment} className="space-y-4">
              
              {/* Payment Element Mount Container */}
              <div className="min-h-[180px] relative flex flex-col justify-center">
                {stripeLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80 z-10 gap-2">
                    <Loader2 className="size-7 animate-spin text-accent" />
                    <p className="text-xs text-ink-3 font-semibold">Setting up secure form...</p>
                  </div>
                )}
                <div id="payment-element-mount" className="w-full" />
              </div>

              {/* Action Buttons */}
              {!stripeLoading && (
                <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
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
        </div>
      )}
    </>
  );
}
