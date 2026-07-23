"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  X,
  Trash2,
  Info,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Send,
  Ban,
  DollarSign,
  Receipt,
  FileText,
  CreditCard,
  Printer,
  Clock,
  CheckCircle2,
  Wallet,
  Tag,
  AlertCircle
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { amountIn, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";
import {
  fetchFinanceInvoices,
  fetchFinanceInvoice,
  generateInvoice,
  recordInvoicePayment,
  sendInvoice,
  cancelInvoice,
  deleteFinanceInvoice,
  fetchFeePlans,
  fetchStudents,
  fetchDiscounts,
  fetchLmsPackages,
  createPaymentIntent,
  type FinanceInvoice,
  type FinanceInvoiceStatus,
  type FeePlan,
  type FeeComponentType,
  ApiError
} from "@/lib/api";

// ─── Enum options / labels ──────────────────────────────────────────────────
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "All", label: "All Status" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "PENDING", label: "Pending" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "VOID", label: "Void" }
];

const statusTone: Record<FinanceInvoiceStatus, Tone> = {
  DRAFT: "neutral",
  SENT: "accent",
  PENDING: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "good",
  OVERDUE: "critical",
  CANCELLED: "neutral",
  VOID: "neutral"
};

const statusLabel: Record<FinanceInvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
  VOID: "Void"
};

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "RAZORPAY", label: "Razorpay" },
  { value: "STRIPE", label: "Stripe" },
  { value: "CASH", label: "Cash" }
];

const COMPONENT_TYPES: FeeComponentType[] = [
  "ADMISSION", "COURSE", "REGISTRATION", "MATERIAL", "EXAMINATION", "CERTIFICATE", "OTHER"
];

const money = (amount: number | null | undefined, currency: string) =>
  `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type LineItem = { type: FeeComponentType; label: string; amount: string };
type Discount = { id: string; name?: string; label?: string; code?: string };
const discountName = (d: Discount) => d.name || d.label || d.code || "Discount";
const fullName = (inv: FinanceInvoice) =>
  inv.student?.user ? `${inv.student.user.firstName} ${inv.student.user.lastName}` : "Custom Recipient";

export default function FinanceInvoicesPage() {
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const settings = useSettingsStore(s => s.settings);
  const brandName = settings?.websiteName || "Al Furqan Academy";

  // Filters + pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Dropdown data
  const [students, setStudents] = useState<{ id: string; name: string; email: string; code: string }[]>([]);
  const [feePlans, setFeePlans] = useState<FeePlan[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  // ─── Generate invoice modal ────────────────────────────────────────────────
  const [showGenModal, setShowGenModal] = useState(false);
  const [recipientOption, setRecipientOption] = useState<"student" | "custom">("student");
  const [genStudentId, setGenStudentId] = useState("");
  const [genCustomName, setGenCustomName] = useState("");
  const [genCustomEmail, setGenCustomEmail] = useState("");
  const [genPackageId, setGenPackageId] = useState("");
  const [genDiscountId, setGenDiscountId] = useState("");
  const [genTaxPct, setGenTaxPct] = useState("");
  // One of the three the academy sells in (it was a free-text box defaulting
  // to a currency nothing else in the system uses), and the fee plan below is
  // read in whichever is picked.
  const [genCurrency, setGenCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [genPeriodLabel, setGenPeriodLabel] = useState("");
  const [genDueDate, setGenDueDate] = useState("");
  const [genNotes, setGenNotes] = useState("");

  // ─── Detail modal ──────────────────────────────────────────────────────────
  const [showDetail, setShowDetail] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<FinanceInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ─── Record payment modal ──────────────────────────────────────────────────
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("UPI");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // Stripe payment test states
  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [stripeInstance, setStripeInstance] = useState<any>(null);
  const [elementsInstance, setElementsInstance] = useState<any>(null);

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

  const handleAdminStripePay = async (invoice: any) => {
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
        paymentElement.mount("#payment-element-mount-admin");
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
          return_url: `${window.location.origin}/finance/invoices?payment_success=true`,
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

  // ─── Loaders ───────────────────────────────────────────────────────────────
  const loadInvoices = () => {
    setLoading(true);
    fetchFinanceInvoices({
      page: currentPage,
      limit: pageSize,
      search: searchQuery || undefined,
      status: statusFilter === "All" ? undefined : statusFilter,
      sortBy
    })
      .then(res => {
        setInvoices(res.items);
        setTotalItems(res.meta.total);
        setTotalPages(res.meta.totalPages);
      })
      .catch(err => console.error("Failed to load invoices", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
  }, [currentPage, pageSize, searchQuery, statusFilter, sortBy]);

  useEffect(() => {
    // Check for redirection param
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_success") === "true") {
      Swal.fire({
        title: "Test Payment Succeeded!",
        text: "The invoice has been paid successfully using Stripe.",
        icon: "success",
        confirmButtonColor: "#386FA4",
      });
      window.history.replaceState({}, document.title, window.location.pathname);
      loadInvoices();
    }

    fetchStudents({ page: 1, limit: 200 })
      .then(res => {
        const mapped = (res.items || []).map(s => ({
          id: s.id,
          name: s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : "Unknown User",
          email: s.user?.email || "",
          code: s.studentCode || "ST-00000"
        }));
        setStudents(mapped);
      })
      .catch(err => console.warn("Failed to load students", err));

    fetchFeePlans({ page: 1, limit: 200, active: "true" })
      .then(res => setFeePlans(res.items || []))
      .catch(err => console.warn("Failed to load fee plans", err));

    fetchDiscounts(undefined, "true")
      .then(res => setDiscounts(res.items || []))
      .catch(err => console.warn("Failed to load discounts", err));

    fetchLmsPackages()
      .then(res => setPackages(res.filter(p => p.status === "Active")))
      .catch(err => console.warn("Failed to load packages", err));
  }, []);

  // ─── Stats strip computed from current list ────────────────────────────────
  const stats = {
    total: invoices.length,
    paid: invoices.filter(i => i.status === "PAID").length,
    pending: invoices.filter(i => ["SENT", "PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)).length,
    overdue: invoices.filter(i => i.status === "OVERDUE").length,
    outstanding: invoices.reduce((sum, i) => sum + Number(i.balance || 0), 0)
  };
  const listCurrency = invoices[0]?.currency || "INR";

  const packagePriceIn = (pkg: any, currency: Currency) => {
    if (currency === "AED" && pkg.priceAED != null) return Number(pkg.priceAED);
    if (currency === "GBP" && pkg.priceGBP != null) return Number(pkg.priceGBP);
    return Number(pkg.priceUSD || 0);
  };

  const selectedPackage = packages.find(p => p.id === genPackageId);
  const selectedFeePlan = selectedPackage?.feePlanId ? feePlans.find(fp => fp.id === selectedPackage.feePlanId) : null;

  const genSubtotal = selectedPackage
    ? (selectedFeePlan
        ? (selectedFeePlan.components.reduce((s, c) => s + Number(amountIn(c, genCurrency) ?? 0), 0) || 0)
        : packagePriceIn(selectedPackage, genCurrency))
    : 0;
  const genTaxAmount = genSubtotal * (Number(genTaxPct) || 0) / 100;
  const genEstTotal = genSubtotal + genTaxAmount;
  const openGenModal = () => {
    // Reload dropdown lists to ensure they are up to date
    fetchStudents({ page: 1, limit: 200 })
      .then(res => {
        const mapped = (res.items || []).map(s => ({
          id: s.id,
          name: s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : "Unknown User",
          email: s.user?.email || "",
          code: s.studentCode || "ST-00000"
        }));
        setStudents(mapped);
        if (mapped.length > 0) {
          setGenStudentId(mapped[0].id);
        }
      })
      .catch(err => console.warn("Failed to load students", err));

    fetchFeePlans({ page: 1, limit: 200, active: "true" })
      .then(res => {
        setFeePlans(res.items || []);
      })
      .catch(err => console.warn("Failed to load fee plans", err));

    fetchDiscounts(undefined, "true")
      .then(res => setDiscounts(res.items || []))
      .catch(err => console.warn("Failed to load discounts", err));

    fetchLmsPackages()
      .then(res => {
        const activePkgs = res.filter(p => p.status === "Active");
        setPackages(activePkgs);
        if (activePkgs.length > 0) {
          setGenPackageId(activePkgs[0].id);
        }
      })
      .catch(err => console.warn("Failed to load packages", err));

    setRecipientOption("student");
    setGenCustomName("");
    setGenCustomEmail("");
    setGenDiscountId("");
    setGenTaxPct("");
    setGenCurrency(DEFAULT_CURRENCY);
    setGenPeriodLabel("");
    setGenDueDate(new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0]);
    setGenNotes("");
    setShowGenModal(true);
  };

  // A fee plan no longer carries a currency to sync from — it prices in all
  // three, and whoever raises the invoice picks which one.

  const handleGenerate = (statusToSave: "DRAFT" | "SENT") => {
    if (recipientOption === "student" && !genStudentId) {
      Swal.fire({ title: "Student Required", text: "Please select a student recipient.", icon: "error" });
      return;
    }
    if (recipientOption === "custom" && (!genCustomName.trim() || !genCustomEmail.trim())) {
      Swal.fire({ title: "Recipient Required", text: "Please enter the recipient's name and email.", icon: "error" });
      return;
    }

    const selectedPackage = packages.find(p => p.id === genPackageId);
    if (!selectedPackage) {
      Swal.fire({ title: "Package Required", text: "Please choose a package.", icon: "error" });
      return;
    }

    const selectedFeePlan = selectedPackage.feePlanId ? feePlans.find(fp => fp.id === selectedPackage.feePlanId) : null;

    const dto: Record<string, any> = {
      currency: genCurrency,
      discountId: genDiscountId || undefined,
      taxPct: genTaxPct ? Number(genTaxPct) : undefined,
      periodLabel: genPeriodLabel.trim() || undefined,
      dueAt: genDueDate ? new Date(genDueDate).toISOString() : undefined,
      notes: genNotes.trim() || undefined,
      status: statusToSave
    };
    if (recipientOption === "student") dto.studentId = genStudentId;
    else { dto.customName = genCustomName.trim(); dto.customEmail = genCustomEmail.trim(); }

    if (selectedFeePlan) {
      dto.feePlanId = selectedFeePlan.id;
    } else {
      dto.items = [{
        type: "COURSE" as FeeComponentType,
        label: `${selectedPackage.title} - ${selectedPackage.billing}`,
        amount: packagePriceIn(selectedPackage, genCurrency)
      }];
    }

    setActionLoading(true);
    generateInvoice(dto)
      .then(inv => {
        setShowGenModal(false);
        Swal.fire({
          title: statusToSave === "SENT" ? "Invoice Sent" : "Draft Saved",
          text: `Invoice ${inv.number} ${statusToSave === "SENT" ? "generated and sent" : "saved as draft"} successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
        loadInvoices();
      })
      .catch(err => Swal.fire({ title: "Generate Failed", text: err instanceof ApiError ? err.message : "Failed to generate invoice.", icon: "error" }))
      .finally(() => setActionLoading(false));
  };

  // ─── Detail drawer ─────────────────────────────────────────────────────────
  const openDetail = (inv: FinanceInvoice) => {
    setDetailInvoice(inv);
    setShowDetail(true);
    setDetailLoading(true);
    fetchFinanceInvoice(inv.id)
      .then(full => setDetailInvoice(full))
      .catch(err => console.error("Failed to load invoice detail", err))
      .finally(() => setDetailLoading(false));
  };

  const refreshDetail = (id: string) => {
    fetchFinanceInvoice(id).then(setDetailInvoice).catch(() => {});
  };

  // ─── Record payment ────────────────────────────────────────────────────────
  const openPayModal = (inv?: FinanceInvoice) => {
    const target = inv || detailInvoice;
    if (!target) return;
    if (inv) setDetailInvoice(inv);
    setPayAmount(String(target.balance ?? 0));
    setPayMethod("UPI");
    setPayReference(`TXN-${Math.floor(100000 + Math.random() * 900000)}`);
    setPayNotes("");
    setShowPayModal(true);
  };

  const showReceiptPrint = (invoice: FinanceInvoice, receipt: any, amount: number, method: string) => {
    const currency = invoice.currency;
    const recNo = receipt?.number || receipt?.id || `RCPT-${Math.floor(100000 + Math.random() * 900000)}`;
    const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    Swal.fire({
      title: `<span class="text-sm font-bold tracking-wider uppercase">Payment Receipt</span>`,
      html: `
        <div id="receipt-print-area" class="text-left bg-white text-zinc-950 p-6 rounded-xl border border-zinc-200 mt-3 font-sans">
          <div class="flex justify-between items-start border-b pb-4 border-zinc-200 mb-4">
            <div>
              <h2 class="text-lg font-bold text-emerald-700" style="margin:0;">${brandName}</h2>
              <p class="text-[11px] text-zinc-500 mt-1">Official Payment Receipt</p>
            </div>
            <div class="text-right">
              <span class="inline-block text-[10px] font-bold px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 uppercase tracking-widest">PAID</span>
              <p class="text-xs text-zinc-500 mt-2">${dateStr}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-6 text-xs mb-4">
            <div>
              <p class="font-bold text-zinc-400 uppercase text-[10px] mb-1">Receipt No.</p>
              <p class="font-mono font-bold text-zinc-800">${recNo}</p>
            </div>
            <div>
              <p class="font-bold text-zinc-400 uppercase text-[10px] mb-1">Invoice No.</p>
              <p class="font-mono font-bold text-zinc-800">${invoice.number}</p>
            </div>
            <div>
              <p class="font-bold text-zinc-400 uppercase text-[10px] mb-1">Received From</p>
              <p class="font-bold text-zinc-800">${fullName(invoice)}</p>
            </div>
            <div>
              <p class="font-bold text-zinc-400 uppercase text-[10px] mb-1">Payment Method</p>
              <p class="font-bold text-zinc-800">${method}</p>
            </div>
          </div>
          <div class="flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mt-4">
            <span class="text-sm font-bold text-zinc-700">Amount Received</span>
            <span class="text-lg font-extrabold text-emerald-700">${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <p class="text-[10px] text-zinc-400 mt-4 leading-relaxed">This is a computer-generated receipt acknowledging the payment above against invoice ${invoice.number}. Thank you.</p>
        </div>
        <div class="flex justify-end gap-2 mt-4 text-xs font-semibold">
          <button id="btn-print-receipt" class="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5">Print Receipt</button>
        </div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      width: "560px",
      background: document.documentElement.classList.contains("dark") ? "#1f1f23" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e",
      didOpen: () => {
        document.getElementById("btn-print-receipt")?.addEventListener("click", () => {
          const content = document.getElementById("receipt-print-area")?.innerHTML;
          const w = window.open("", "_blank");
          if (w) {
            w.document.write(`<html><head><title>Receipt ${recNo}</title><style>body{font-family:sans-serif;padding:40px;background:#fff;color:#000;}</style></head><body>${content}<script>window.onload=function(){window.print();window.close();}<\/script></body></html>`);
            w.document.close();
          }
        });
      }
    });
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailInvoice) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      Swal.fire({ title: "Invalid Amount", text: "Please enter a valid payment amount.", icon: "error" });
      return;
    }
    if (amount > Number(detailInvoice.balance || 0) + 0.001) {
      Swal.fire({ title: "Amount Too High", text: `Payment cannot exceed the outstanding balance of ${money(detailInvoice.balance, detailInvoice.currency)}.`, icon: "error" });
      return;
    }

    const methodLbl = PAYMENT_METHODS.find(m => m.value === payMethod)?.label || payMethod;
    setActionLoading(true);
    recordInvoicePayment(detailInvoice.id, {
      amount,
      method: payMethod,
      reference: payReference.trim() || undefined,
      paidAt: new Date().toISOString(),
      notes: payNotes.trim() || undefined
    })
      .then(res => {
        setShowPayModal(false);
        const invoiceSnapshot = detailInvoice;
        refreshDetail(detailInvoice.id);
        loadInvoices();
        // Show printable receipt (res may include receipt info).
        showReceiptPrint(invoiceSnapshot, res?.receipt || res, amount, methodLbl);
      })
      .catch(err => Swal.fire({ title: "Payment Failed", text: err instanceof ApiError ? err.message : "Failed to record payment.", icon: "error" }))
      .finally(() => setActionLoading(false));
  };

  // ─── Invoice actions ───────────────────────────────────────────────────────
  const handleSend = (inv: FinanceInvoice) => {
    Swal.fire({
      title: "Send Invoice?",
      text: `Mark invoice ${inv.number} as sent to ${fullName(inv)}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Send",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#386FA4",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        sendInvoice(inv.id)
          .then(() => {
            Swal.fire({ title: "Sent", text: `Invoice ${inv.number} marked as sent.`, icon: "success", background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff" });
            loadInvoices();
            if (detailInvoice?.id === inv.id) refreshDetail(inv.id);
          })
          .catch(err => Swal.fire({ title: "Send Failed", text: err instanceof ApiError ? err.message : "Failed to send invoice.", icon: "error" }))
          .finally(() => setActionLoading(false));
      }
    });
  };

  const handleCancel = (inv: FinanceInvoice) => {
    Swal.fire({
      title: "Cancel Invoice?",
      text: `Cancel invoice ${inv.number}? This marks it as cancelled and stops collection.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel Invoice",
      cancelButtonText: "Keep",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        cancelInvoice(inv.id)
          .then(() => {
            Swal.fire({ title: "Cancelled", text: `Invoice ${inv.number} cancelled.`, icon: "success", background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff" });
            loadInvoices();
            if (detailInvoice?.id === inv.id) refreshDetail(inv.id);
          })
          .catch(err => Swal.fire({ title: "Cancel Failed", text: err instanceof ApiError ? err.message : "Failed to cancel invoice.", icon: "error" }))
          .finally(() => setActionLoading(false));
      }
    });
  };

  const handleDelete = (inv: FinanceInvoice) => {
    Swal.fire({
      title: "Delete Invoice?",
      text: `Permanently delete invoice ${inv.number}? This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        deleteFinanceInvoice(inv.id)
          .then(() => {
            Swal.fire({ title: "Deleted", text: "Invoice removed successfully.", icon: "success", background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff" });
            if (detailInvoice?.id === inv.id) setShowDetail(false);
            loadInvoices();
          })
          .catch(err => Swal.fire({ title: "Delete Failed", text: err instanceof ApiError ? err.message : "Failed to delete invoice.", icon: "error" }))
          .finally(() => setActionLoading(false));
      }
    });
  };

  return (
    <>
      <Topbar title="Invoices" subtitle="Generate, send, and collect payments on student fee invoices" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-violet-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500"><FileText className="size-6" /></span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{stats.total}</p>
                <p className="text-xs font-semibold text-ink-3">Invoices (this page)</p>
              </div>
            </CardBody>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500"><CheckCircle2 className="size-6" /></span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{stats.paid}</p>
                <p className="text-xs font-semibold text-ink-3">Fully Paid</p>
              </div>
            </CardBody>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500"><Clock className="size-6" /></span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{stats.pending}</p>
                <p className="text-xs font-semibold text-ink-3">Awaiting Payment</p>
              </div>
            </CardBody>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-rose-500/10 text-rose-500"><Wallet className="size-6" /></span>
              <div>
                <p className="text-xl font-bold tracking-tight text-ink">{money(stats.outstanding, listCurrency)}</p>
                <p className="text-xs font-semibold text-ink-3">Outstanding Balance</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filters + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input
              type="text"
              placeholder="Search invoice #, student, code..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3 text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-ink-3">
              <Filter className="size-3" /><span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-ink-3">
              <ArrowUpDown className="size-3" /><span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="amount_desc">Amount (High→Low)</option>
                <option value="amount_asc">Amount (Low→High)</option>
              </select>
            </div>
            <Button
              variant="primary"
              onClick={openGenModal}
              className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
            >
              <Plus className="size-4" /> Generate Invoice
            </Button>
          </div>
        </div>

        {/* Invoice table */}
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto min-h-[300px]">
            {loading ? (
              <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                <Loader2 className="size-5 animate-spin mr-2 text-accent" /> Loading invoices...
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                <Receipt className="size-8 text-ink-3/40" />
                <p className="font-bold text-sm">No invoices found.</p>
                <p className="text-xs">Generate an invoice to start billing students.</p>
                <Button variant="primary" onClick={openGenModal} className="mt-3 rounded-xl text-xs">
                  <Plus className="size-4 mr-1.5" /> Generate Invoice
                </Button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                    <th className="px-6 py-4">Invoice #</th>
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4">Period</th>
                    <th className="px-6 py-4 text-right">Total</th>
                    <th className="px-6 py-4 text-right">Paid</th>
                    <th className="px-6 py-4 text-right">Balance</th>
                    <th className="px-6 py-4">Due</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {invoices.map(inv => {
                    const canSend = inv.status === "DRAFT";
                    const canPay = ["SENT", "PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);
                    const canCancel = !["PAID", "CANCELLED", "VOID"].includes(inv.status);
                    return (
                      <tr key={inv.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-xs text-ink">{inv.number}</td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-ink text-xs">{fullName(inv)}</div>
                          <div className="text-[10px] text-ink-3 mt-0.5">{inv.student?.user?.email || ""}</div>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-ink-3">{inv.periodLabel || "—"}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-ink text-xs">{money(inv.amount, inv.currency)}</td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{money(inv.paidAmount, inv.currency)}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-xs text-ink">{money(inv.balance, inv.currency)}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-ink-3">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-6 py-4"><Badge tone={statusTone[inv.status]}>{statusLabel[inv.status]}</Badge></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="ghost" size="icon" onClick={() => openDetail(inv)} className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8" title="View details">
                              <Info className="size-4.5" />
                            </Button>
                            {canPay && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleAdminStripePay(inv)} className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8" title="Pay with Stripe (Test)">
                                  <CreditCard className="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => openPayModal(inv)} className="rounded-lg text-ink-3 hover:text-emerald-500 hover:bg-surface-3 size-8" title="Record payment manually">
                                  <DollarSign className="size-4" />
                                </Button>
                              </>
                            )}
                            {canSend && (
                              <Button variant="ghost" size="icon" onClick={() => handleSend(inv)} className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8" title="Send invoice">
                                <Send className="size-4" />
                              </Button>
                            )}
                            {canCancel && (
                              <Button variant="ghost" size="icon" onClick={() => handleCancel(inv)} className="rounded-lg text-ink-3 hover:text-amber-500 hover:bg-surface-3 size-8" title="Cancel invoice">
                                <Ban className="size-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(inv)} className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8" title="Delete invoice">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {invoices.length > 0 && (
            <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 flex-wrap gap-4 select-none">
              <div className="flex items-center gap-4 flex-wrap">
                <p className="text-xs text-ink-3 font-medium">
                  Showing <span className="font-bold text-ink-2">{invoices.length}</span> of{" "}
                  <span className="font-bold text-ink-2">{totalItems}</span> invoices
                </p>
                <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                  <span>Show:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="h-7 rounded-lg border border-hairline bg-surface px-1.5 text-xs font-bold text-ink-2 focus:outline-none cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 rounded-lg text-ink-2 hover:bg-surface-3 px-3 py-1 font-bold text-xs">
                  <ChevronLeft className="size-3.5 mr-1" /> Previous
                </Button>
                <span className="text-xs font-extrabold text-ink-2 px-3 py-1 bg-surface-3 rounded-lg">{currentPage} / {totalPages}</span>
                <Button variant="ghost" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 rounded-lg text-ink-2 hover:bg-surface-3 px-3 py-1 font-bold text-xs">
                  Next <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ─── MODAL: Generate Invoice ────────────────────────────────────────── */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-scale-up max-h-[95vh] overflow-y-auto">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30 sticky top-0 z-10">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2"><Receipt className="size-4.5 text-accent" /> Generate New Invoice</h3>
              <button onClick={() => setShowGenModal(false)} className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"><X className="size-4" /></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleGenerate("SENT"); }} className="p-6 space-y-4">
              {/* Recipient */}
              <div className="border border-hairline rounded-2xl p-4 space-y-3 bg-surface-2/30">
                <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Recipient</span>
                <div className="flex gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="rec" checked={recipientOption === "student"} onChange={() => setRecipientOption("student")} className="text-accent border-hairline size-3.5" />
                    <span>Registered Student</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="rec" checked={recipientOption === "custom"} onChange={() => setRecipientOption("custom")} className="text-accent border-hairline size-3.5" />
                    <span>Custom Recipient</span>
                  </label>
                </div>
                {recipientOption === "student" ? (
                  <select
                    value={genStudentId}
                    onChange={(e) => setGenStudentId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {students.length === 0 && <option value="">No students available</option>}
                    {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Recipient name" value={genCustomName} onChange={(e) => setGenCustomName(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
                    <input type="email" placeholder="Recipient email" value={genCustomEmail} onChange={(e) => setGenCustomEmail(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="border border-hairline rounded-2xl p-4 space-y-3 bg-surface-2/30">
                <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Package</span>
                <select
                  value={genPackageId}
                  onChange={(e) => setGenPackageId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                >
                  {packages.length === 0 && <option value="">No packages available</option>}
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.billing} · {genCurrency} {packagePriceIn(p, genCurrency).toLocaleString()})
                    </option>
                  ))}
                </select>

                {selectedPackage && (
                  <div className="space-y-1.5 pt-2 border-t border-hairline border-dashed">
                    <span className="text-[9px] font-extrabold text-ink-3 uppercase tracking-wider block mb-1">Estimated Line Items</span>
                    {selectedFeePlan ? (
                      selectedFeePlan.components.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-xs text-ink-3">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-surface-3 border border-hairline">
                              {c.type}
                            </span>
                            {c.label}
                          </span>
                          <span className="font-bold text-ink">{money(amountIn(c, genCurrency), genCurrency)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between text-xs text-ink-3">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-surface-3 border border-hairline">
                            COURSE
                          </span>
                          {selectedPackage.title} ({selectedPackage.billing})
                        </span>
                        <span className="font-bold text-ink">{money(packagePriceIn(selectedPackage, genCurrency), genCurrency)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1 flex items-center gap-1"><Tag className="size-3" /> Discount</label>
                  <select value={genDiscountId} onChange={(e) => setGenDiscountId(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer">
                    <option value="">No discount</option>
                    {discounts.map(d => <option key={d.id} value={d.id}>{discountName(d)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Tax (%)</label>
                  <input type="number" min="0" step="0.01" placeholder="e.g. 18" value={genTaxPct} onChange={(e) => setGenTaxPct(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Currency</label>
                  <select value={genCurrency} onChange={(e) => setGenCurrency(e.target.value as Currency)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">{SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Due Date</label>
                  <input type="date" value={genDueDate} onChange={(e) => setGenDueDate(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Period Label (Optional)</label>
                  <input type="text" placeholder="e.g. July 2026" value={genPeriodLabel} onChange={(e) => setGenPeriodLabel(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Notes (Optional)</label>
                  <textarea value={genNotes} onChange={(e) => setGenNotes(e.target.value)} rows={2} placeholder="Any invoice notes..." className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none" />
                </div>
              </div>

              {/* Estimated total */}
              <div className="bg-surface-2 border border-hairline rounded-2xl p-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-ink-3"><span>Subtotal</span><span className="font-semibold text-ink">{money(genSubtotal, genCurrency)}</span></div>
                {Number(genTaxPct) > 0 && <div className="flex justify-between text-ink-3"><span>Tax ({genTaxPct}%)</span><span className="font-semibold text-ink">+{money(genTaxAmount, genCurrency)}</span></div>}
                {genDiscountId && <div className="flex justify-between text-ink-3"><span>Discount</span><span className="font-semibold text-amber-600">applied</span></div>}
                <div className="flex justify-between border-t border-hairline pt-2 mt-1 text-sm font-bold text-ink"><span>Estimated Total</span><span className="text-emerald-600 dark:text-emerald-400">{money(genEstTotal, genCurrency)}</span></div>
                {genDiscountId && <p className="text-[10px] text-ink-3 pt-1">Final total reflects the selected discount after generation.</p>}
              </div>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button type="button" onClick={() => setShowGenModal(false)} className="h-10 text-xs font-bold text-ink-2 bg-surface-2 hover:bg-surface-3 px-5 py-2.5 rounded-xl cursor-pointer">Cancel</button>
                <button type="button" disabled={actionLoading} onClick={() => handleGenerate("DRAFT")} className="h-10 text-xs font-bold text-ink-2 bg-surface-3 hover:bg-surface-4 px-5 py-2.5 rounded-xl flex items-center justify-center cursor-pointer">
                  {actionLoading ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : null} Save as Draft
                </button>
                <button type="submit" disabled={actionLoading} className="h-10 text-xs font-bold text-white bg-accent hover:opacity-90 hover:shadow-lg px-5 py-2.5 rounded-xl flex items-center justify-center cursor-pointer">
                  {actionLoading ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Send className="size-3.5 mr-1.5" />} Generate & Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DRAWER: Invoice Detail ─────────────────────────────────────────── */}
      {showDetail && detailInvoice && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs select-none flex justify-end">
          <div className="absolute inset-0" onClick={() => setShowDetail(false)} />
          <div className="relative bg-surface border-l border-hairline w-full max-w-lg h-full flex flex-col shadow-2xl animate-slide-left z-10">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div>
                <h3 className="font-bold text-ink text-sm flex items-center gap-2"><Receipt className="size-4 text-accent" /> {detailInvoice.number}</h3>
                <p className="text-[10px] text-ink-3 mt-0.5">{fullName(detailInvoice)} · {detailInvoice.student?.user?.email || detailInvoice.student?.studentCode || "custom recipient"}</p>
              </div>
              <button onClick={() => setShowDetail(false)} className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"><X className="size-4.5" /></button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              <div className="flex items-center justify-between">
                <Badge tone={statusTone[detailInvoice.status]}>{statusLabel[detailInvoice.status]}</Badge>
                <span className="text-[10px] text-ink-3 font-semibold">
                  Issued {new Date(detailInvoice.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {detailInvoice.dueAt ? ` · Due ${new Date(detailInvoice.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </span>
              </div>

              {detailLoading ? (
                <div className="flex justify-center items-center py-10 text-xs font-bold text-ink-3">
                  <Loader2 className="size-4 animate-spin mr-2 text-accent" /> Loading details...
                </div>
              ) : (
                <>
                  {/* Line items */}
                  <div className="border border-hairline rounded-2xl overflow-hidden">
                    <div className="bg-surface-2/40 px-4 py-2.5 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Line Items</div>
                    <div className="divide-y divide-hairline">
                      {(detailInvoice.items || []).length === 0 ? (
                        <div className="px-4 py-3 text-xs text-ink-3">No line items.</div>
                      ) : detailInvoice.items!.map((it, i) => (
                        <div key={it.id || i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                          <span className="text-ink-2 flex items-center gap-1.5"><span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-surface-3 border border-hairline text-ink-3">{it.type}</span> {it.label}</span>
                          <span className="font-bold text-ink">{money(it.amount, detailInvoice.currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-surface-2 border border-hairline rounded-2xl p-4 space-y-1.5 text-xs">
                    <div className="flex justify-between text-ink-3"><span>Subtotal</span><span className="font-semibold text-ink">{money(detailInvoice.subtotal ?? detailInvoice.amount, detailInvoice.currency)}</span></div>
                    {Number(detailInvoice.discountAmount) > 0 && <div className="flex justify-between text-ink-3"><span>Discount</span><span className="font-semibold text-amber-600">-{money(detailInvoice.discountAmount, detailInvoice.currency)}</span></div>}
                    {Number(detailInvoice.taxAmount) > 0 && <div className="flex justify-between text-ink-3"><span>Tax</span><span className="font-semibold text-ink">+{money(detailInvoice.taxAmount, detailInvoice.currency)}</span></div>}
                    <div className="flex justify-between border-t border-hairline pt-2 text-sm font-bold text-ink"><span>Total</span><span>{money(detailInvoice.amount, detailInvoice.currency)}</span></div>
                    <div className="flex justify-between text-ink-3"><span>Paid</span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{money(detailInvoice.paidAmount, detailInvoice.currency)}</span></div>
                    <div className="flex justify-between text-sm font-bold text-ink"><span>Balance Due</span><span className={cn(Number(detailInvoice.balance) > 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>{money(detailInvoice.balance, detailInvoice.currency)}</span></div>
                  </div>

                  {/* Payment history */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Payment History</span>
                    {(detailInvoice.payments || []).length === 0 ? (
                      <p className="text-xs text-ink-3">No payments recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detailInvoice.payments!.map((p: any, i: number) => (
                          <div key={p.id || i} className="flex items-center justify-between border border-hairline rounded-xl px-3.5 py-2.5 text-xs bg-surface-2/40">
                            <div className="flex items-center gap-2">
                              <CreditCard className="size-3.5 text-accent" />
                              <div>
                                <div className="font-bold text-ink">{money(p.amount, detailInvoice.currency)}</div>
                                <div className="text-[10px] text-ink-3">{p.method || p.paymentMethod || "—"}{p.reference ? ` · ${p.reference}` : ""}</div>
                              </div>
                            </div>
                            <span className="text-[10px] text-ink-3 font-semibold">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Receipts */}
                  {(detailInvoice.receipts || []).length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Receipts</span>
                      <div className="space-y-2">
                        {detailInvoice.receipts!.map((r: any, i: number) => (
                          <div key={r.id || i} className="flex items-center justify-between border border-hairline rounded-xl px-3.5 py-2.5 text-xs bg-surface-2/40">
                            <span className="font-mono font-bold text-ink flex items-center gap-1.5"><FileText className="size-3.5 text-accent" /> {r.number || r.id}</span>
                            <button
                              onClick={() => showReceiptPrint(detailInvoice, r, Number(r.amount || 0), r.method || r.paymentMethod || "—")}
                              className="text-[10px] text-accent font-extrabold hover:underline uppercase flex items-center gap-0.5"
                            >
                              <Printer className="size-3" /> Print
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailInvoice.notes && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Notes</span>
                      <p className="text-xs text-ink-3 italic bg-surface-2 p-3 rounded-xl border border-hairline">{detailInvoice.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-hairline p-4 flex items-center gap-2 flex-wrap">
              <Button onClick={() => handleDelete(detailInvoice)} className="bg-surface-3 hover:bg-surface-4 text-critical font-bold text-xs h-10 px-4 rounded-xl flex items-center gap-1 mr-auto cursor-pointer">
                <Trash2 className="size-4" /> Delete
              </Button>
              {detailInvoice.status === "DRAFT" && (
                <Button onClick={() => handleSend(detailInvoice)} className="bg-surface border border-hairline text-accent font-bold text-xs h-10 px-4 rounded-xl cursor-pointer flex items-center gap-1">
                  <Send className="size-3.5" /> Send
                </Button>
              )}
              {!["PAID", "CANCELLED", "VOID"].includes(detailInvoice.status) && (
                <Button onClick={() => handleCancel(detailInvoice)} className="bg-surface border border-hairline text-amber-600 font-bold text-xs h-10 px-4 rounded-xl cursor-pointer flex items-center gap-1">
                  <Ban className="size-3.5" /> Cancel
                </Button>
              )}
              {["SENT", "PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(detailInvoice.status) && (
                <Button onClick={() => openPayModal()} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-10 px-4 rounded-xl cursor-pointer flex items-center gap-1">
                  <DollarSign className="size-3.5" /> Record Payment
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Record Payment ──────────────────────────────────────────── */}
      {showPayModal && detailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <h3 className="font-bold text-ink text-sm">Record Payment · {detailInvoice.number}</h3>
              <button onClick={() => setShowPayModal(false)} className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"><X className="size-4" /></button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl flex items-center justify-between text-xs font-bold">
                <span className="text-ink-2">Outstanding Balance</span>
                <span className="text-emerald-500 text-sm font-extrabold">{money(detailInvoice.balance, detailInvoice.currency)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Amount ({detailInvoice.currency})</label>
                  <input type="number" min="0" step="0.01" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-semibold" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Method</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer">
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Reference / Transaction ID</label>
                <input type="text" value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="e.g. TXN-123456" className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-mono" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Notes (Optional)</label>
                <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} placeholder="Payment reference notes..." className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none" />
              </div>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button type="button" onClick={() => setShowPayModal(false)} className="h-10 text-xs font-bold text-ink-2 bg-surface-2 hover:bg-surface-3 px-5 py-2.5 rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={actionLoading} className="h-10 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 hover:shadow-lg px-5 py-2.5 rounded-xl flex items-center justify-center cursor-pointer">
                  {actionLoading ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : null} Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stripe elements test modal */}
      {activeInvoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in text-left">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md shadow-pop overflow-hidden p-6 space-y-6 animate-fade-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h2 className="font-extrabold text-base text-ink">Test Stripe Payment</h2>
                <p className="text-xs text-ink-3 mt-0.5">Settle {activeInvoice.number} securely via Stripe Card (Test)</p>
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
                <div id="payment-element-mount-admin" className="w-full" />
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
                    Confirm &amp; Pay {money(Number(activeInvoice.balance || 0), activeInvoice.currency)}
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
