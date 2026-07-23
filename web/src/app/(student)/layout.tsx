"use client";

import { useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { 
  Lock, 
  LogOut, 
  Loader2, 
  AlertCircle, 
  X 
} from "lucide-react";
import Swal from "sweetalert2";

import { useAuth } from "@/store/auth";
import { AuthGate } from "@/components/auth-gate";
import { StudentShell } from "@/components/layout/student-shell";
import { fetchStudentInvoices, createPaymentIntent, verifyPaymentIntent } from "@/lib/api";
import { money, type Currency } from "@/lib/currency";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <StudentLayoutGuard>{children}</StudentLayoutGuard>
    </AuthGate>
  );
}

function StudentLayoutGuard({ children }: { children: React.ReactNode }) {
  const { user, clear } = useAuth();
  const router = useRouter();

  // Invoices & Billing restriction states
  const [invoices, setInvoices] = useState<any[]>([]);
  const [checking, setChecking] = useState(true);

  // Stripe checkout state
  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [stripeInstance, setStripeInstance] = useState<any>(null);
  const [elementsInstance, setElementsInstance] = useState<any>(null);

  const loadInvoices = () => {
    setChecking(true);
    fetchStudentInvoices()
      .then((res) => {
        setInvoices(res);
      })
      .catch((err) => {
        console.error("Failed to check billing status:", err);
      })
      .finally(() => {
        setChecking(false);
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
        paymentElement.mount("#payment-element-mount-overlay");
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

  const handleLogout = () => {
    clear();
    router.push("/signin");
  };

  useEffect(() => {
    if (user && user.role === "STUDENT") {
      loadInvoices();
    }

    // Check for redirection param
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");
    if (params.get("payment_success") === "true" || params.get("redirect_status") === "succeeded") {
      if (paymentIntentId) {
        setChecking(true);
        verifyPaymentIntent(paymentIntentId)
          .then(() => {
            Swal.fire({
              title: "Payment Succeeded!",
              text: "Your invoice has been paid successfully. Access has been restored.",
              icon: "success",
              confirmButtonColor: "#386FA4",
            });
            window.history.replaceState({}, document.title, window.location.pathname);
            loadInvoices();
          })
          .catch((err) => {
            console.error("Verification failed", err);
            Swal.fire({
              title: "Payment Completed",
              text: "Your payment completed. If access is still restricted, it will restore shortly once verified.",
              icon: "success",
              confirmButtonColor: "#386FA4",
            });
            window.history.replaceState({}, document.title, window.location.pathname);
            loadInvoices();
          });
      } else {
        Swal.fire({
          title: "Payment Succeeded!",
          text: "Your invoice has been paid successfully.",
          icon: "success",
          confirmButtonColor: "#386FA4",
        });
        window.history.replaceState({}, document.title, window.location.pathname);
        loadInvoices();
      }
    }
  }, [user]);

  if (user && user.role !== "STUDENT") {
    notFound();
  }

  // Find any unpaid/due invoices
  const unpaidInvoice = invoices.find(inv => inv.status === "SENT" || inv.status === "OVERDUE");

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-page">
        <div className="text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-accent" />
          <p className="mt-3 text-sm font-bold text-ink-3">Verifying billing status...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <StudentShell>{children}</StudentShell>

      {/* Lockscreen Overlay when unpaid invoice exists */}
      {unpaidInvoice && (
        <div className="fixed inset-0 bg-slate-950/85 z-40 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-6 animate-fade-up">
            
            {/* Warning Icon */}
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-500 animate-bounce">
              <Lock className="size-8" />
            </div>

            {/* Text Details */}
            <div>
              <h2 className="text-xl font-black text-ink">Payment Due</h2>
              <p className="text-xs text-ink-3 mt-2 leading-relaxed">
                Your portal access is restricted due to an unpaid fee invoice. Please settle this due to regain access.
              </p>
            </div>

            {/* Invoice Summary Card */}
            <div className="bg-surface-2 border border-hairline rounded-2xl p-4 text-left space-y-2">
              <div className="flex justify-between text-xs font-semibold text-ink-3">
                <span>Invoice Ref</span>
                <span className="font-mono font-bold text-ink">{unpaidInvoice.number}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-ink-3">
                <span>Issue Date</span>
                <span className="font-bold text-ink">{new Date(unpaidInvoice.issuedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-ink-3">
                <span>Due Date</span>
                <span className="font-bold text-ink">{unpaidInvoice.dueAt ? new Date(unpaidInvoice.dueAt).toLocaleDateString() : "Upon Receipt"}</span>
              </div>
              <div className="border-t border-hairline pt-2 flex justify-between text-sm font-black">
                <span className="text-ink-2">Amount Due</span>
                <span className="text-accent font-extrabold">{money(Number(unpaidInvoice.amount) - Number(unpaidInvoice.paidAmount ?? 0), unpaidInvoice.currency)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => handlePayClick(unpaidInvoice)}
                className="w-full h-11 bg-accent text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:bg-accent-active cursor-pointer active:scale-98 transition-all"
              >
                Pay Invoice
              </button>
              
              <button
                onClick={handleLogout}
                className="w-full h-11 border border-hairline bg-surface hover:bg-surface-2 text-ink-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <LogOut className="size-4" />
                Logout &amp; Exit
              </button>
            </div>

          </div>
        </div>
      )}

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
                <div id="payment-element-mount-overlay" className="w-full" />
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
