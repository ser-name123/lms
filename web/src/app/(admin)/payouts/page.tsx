"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  X, 
  Users, 
  Edit2, 
  Trash2, 
  Info,
  Calendar,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Sparkles,
  DollarSign,
  Briefcase,
  Wallet,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  Printer,
  ChevronDown,
  RefreshCw,
  Clock,
  Layers,
  ArrowRight,
  Loader2
} from "lucide-react";
import Swal from "sweetalert2";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchPayouts,
  fetchPayoutStats,
  bulkGeneratePayouts,
  updatePayout,
  processPayoutPayment,
  deletePayout,
  type Payout,
  type PayoutStats,
  type PayoutStatus,
  type PayoutMethod
} from "@/lib/api";
import { useSettingsStore } from "@/store/settings";

const DESIGNATIONS = ["All", "Supervisor", "Academic Coach", "Teacher"] as const;
const STATUSES = ["All", "Pending", "Processing", "Paid", "Failed"] as const;
const METHODS = ["All", "Bank Transfer", "Wise", "PayPal", "Cash", "Stripe"] as const;

const statusBadgeTone: Record<PayoutStatus, Tone> = {
  PENDING: "warning",
  PROCESSING: "accent",
  PAID: "good",
  FAILED: "critical"
};

const statusLabel: Record<PayoutStatus, string> = {
  PENDING: "Pending Approval",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed"
};

const methodLabel: Record<PayoutMethod, string> = {
  BANK_TRANSFER: "Bank Transfer",
  WISE: "Wise Transfer",
  PAYPAL: "PayPal Account",
  CASH: "Cash Payment",
  STRIPE: "Stripe Gateway"
};

export default function PayoutsDashboard() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<PayoutStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Brand identity (logo + academy name) pulled from admin System Settings
  const settings = useSettingsStore(s => s.settings);
  const brandName = settings?.websiteName || "Al Furqan Academy";
  const brandLogo = settings?.logo || "";

  // Human-readable month-over-month caption from a raw percentage value
  const trendCaption = (pct: number | undefined | null) => {
    if (pct === undefined || pct === null || Number.isNaN(pct)) return "No prior month data";
    if (pct === 0) return "No change vs last month";
    return `${Math.abs(pct)}% ${pct > 0 ? "increase" : "decrease"} vs last month`;
  };

  // Filters, sorting, and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [methodFilter, setMethodFilter] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Checkbox row selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals / Drawer states
  const [showPayrunModal, setShowPayrunModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showPayslipPrint, setShowPayslipPrint] = useState(false);

  // Payrun wizard states
  const [payrunMonth, setPayrunMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Edit / Adjustment form fields
  const [formBaseAmount, setFormBaseAmount] = useState(0);
  const [formDeductions, setFormDeductions] = useState(0);
  const [formBonus, setFormBonus] = useState(0);
  const [formNotes, setFormNotes] = useState("");
  const [formMethod, setFormMethod] = useState<PayoutMethod>("BANK_TRANSFER");

  // Payment simulated transaction states
  const [txnRef, setTxnRef] = useState("");
  const [txnNotes, setTxnNotes] = useState("");
  const [txnMethod, setTxnMethod] = useState<PayoutMethod>("BANK_TRANSFER");

  // Fetch data from backend
  const loadDashboardData = () => {
    setLoading(true);
    const roleParam = roleFilter === "All" ? undefined : roleFilter;
    const statusParam = statusFilter === "All" ? undefined : statusFilter.toUpperCase();
    const methodParam =
      methodFilter === "All"
        ? undefined
        : methodFilter.toUpperCase().replace(/\s+/g, "_");

    fetchPayouts({
      page: currentPage,
      limit: pageSize,
      search: searchQuery || undefined,
      status: statusParam,
      role: roleParam,
      method: methodParam,
      sortBy
    })
      .then(res => {
        setPayouts(res.items);
        setTotalItems(res.meta.total);
        setTotalPages(res.meta.totalPages);
      })
      .catch(err => console.error("Failed to load payouts list", err));

    fetchPayoutStats()
      .then(res => {
        setStats(res);
      })
      .catch(err => console.error("Failed to load payout stats", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentPage, pageSize, roleFilter, statusFilter, methodFilter, sortBy]);

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadDashboardData();
  };

  // Generate payroll run trigger
  const handleGeneratePayrun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payrunMonth) return;

    const [year, month] = payrunMonth.split("-");
    const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString();
    const endDate = new Date(Number(year), Number(month), 0).toISOString();

    setActionLoading(true);
    bulkGeneratePayouts({
      billingPeriodStart: startDate,
      billingPeriodEnd: endDate
    })
      .then(res => {
        setShowPayrunModal(false);
        Swal.fire({
          title: "Payroll Generated",
          text: `Successfully generated ${res.generatedCount} draft payouts for ${new Date(startDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
          confirmButtonColor: "#386FA4"
        });
        setCurrentPage(1);
        loadDashboardData();
      })
      .catch(err => {
        Swal.fire({
          title: "Payrun Error",
          text: err.message || "Could not generate payroll records.",
          icon: "error"
        });
      })
      .finally(() => setActionLoading(false));
  };

  // Open Details Drawer
  const handleOpenDetails = (payout: Payout) => {
    setSelectedPayout(payout);
    setShowDrawer(true);
  };

  // Open Edit Modals
  const handleOpenEdit = (payout: Payout) => {
    setSelectedPayout(payout);
    setFormBaseAmount(payout.amount);
    setFormDeductions(payout.deductions);
    setFormBonus(payout.bonus);
    setFormNotes(payout.notes || "");
    setFormMethod(payout.paymentMethod);
    setShowEditModal(true);
  };

  // Save adjustments
  const handleSaveAdjustments = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayout) return;

    setActionLoading(true);
    updatePayout(selectedPayout.id, {
      amount: formBaseAmount,
      deductions: formDeductions,
      bonus: formBonus,
      notes: formNotes,
      paymentMethod: formMethod
    })
      .then(updated => {
        setShowEditModal(false);
        setPayouts(prev => prev.map(p => p.id === updated.id ? updated : p));
        if (selectedPayout.id === updated.id) {
          setSelectedPayout(updated);
        }
        Swal.fire({ title: "Updated", text: "Earnings adjustments saved.", icon: "success", confirmButtonColor: "#386FA4" });
        loadDashboardData();
      })
      .catch(err => {
        Swal.fire({ title: "Update Failed", text: err.message || "Failed to update payout.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  // Open single payment simulator
  const handleOpenPayModal = (payout: Payout) => {
    setSelectedPayout(payout);
    setTxnRef(`TXN-${Math.floor(100000 + Math.random() * 900000)}`);
    setTxnMethod(payout.paymentMethod);
    setTxnNotes("");
    setShowPaymentModal(true);
  };

  // Process payment simulation
  const handleProcessPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayout) return;

    setActionLoading(true);
    processPayoutPayment(selectedPayout.id, {
      referenceNumber: txnRef,
      paymentMethod: txnMethod,
      notes: txnNotes || undefined
    })
      .then(paidPayout => {
        setShowPaymentModal(false);
        setPayouts(prev => prev.map(p => p.id === paidPayout.id ? paidPayout : p));
        if (selectedPayout.id === paidPayout.id) {
          setSelectedPayout(paidPayout);
        }
        Swal.fire({
          title: "Payment Disbursed!",
          text: `Wage payout of $${paidPayout.netAmount} successfully transferred to ${paidPayout.user.firstName}.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
          confirmButtonColor: "#10b981"
        });
        loadDashboardData();
      })
      .catch(err => {
        Swal.fire({ title: "Transfer Failed", text: err.message || "Payment gateway simulation error.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  // Delete a payout draft record
  const handleDeletePayout = (payout: Payout) => {
    Swal.fire({
      title: "Delete Payout Draft?",
      text: `Are you sure you want to remove the salary payout record for ${payout.user.firstName} ${payout.user.lastName}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        deletePayout(payout.id)
          .then(() => {
            setShowDrawer(false);
            setPayouts(prev => prev.filter(p => p.id !== payout.id));
            Swal.fire({ title: "Deleted", text: "Record removed successfully.", icon: "success", confirmButtonColor: "#386FA4" });
            loadDashboardData();
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: err.message || "Failed to delete record.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  // Bulk Actions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(payouts.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(x => x !== id));
    }
  };

  const handleBulkPay = () => {
    const pendingIds = payouts
      .filter(p => selectedIds.includes(p.id) && p.status !== "PAID")
      .map(p => p.id);

    if (pendingIds.length === 0) {
      Swal.fire({ title: "Information", text: "None of the selected payouts require payment (already Paid or empty).", icon: "info" });
      return;
    }

    Swal.fire({
      title: `Pay ${pendingIds.length} Employees?`,
      text: `This will disburse bank transfers for all selected draft/pending payouts in bulk.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Disburse Payments",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#10b981",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        // Process sequential updates
        const promises = pendingIds.map((id, index) => 
          processPayoutPayment(id, {
            referenceNumber: `BULK-TXN-${100000 + index}-${Math.floor(Math.random() * 9000)}`,
            paymentMethod: "BANK_TRANSFER",
            notes: "Processed via Bulk Payrun Action Manager."
          })
        );

        Promise.all(promises)
          .then(() => {
            setSelectedIds([]);
            Swal.fire({ title: "Paid Successfully", text: `Disbursed ${pendingIds.length} salary transfers.`, icon: "success", confirmButtonColor: "#10b981" });
            loadDashboardData();
          })
          .catch(err => {
            Swal.fire({ title: "Bulk Error", text: "Failed to process some payments.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  const handleBulkDelete = () => {
    const deletableIds = payouts
      .filter(p => selectedIds.includes(p.id) && p.status !== "PAID")
      .map(p => p.id);

    if (deletableIds.length === 0) {
      Swal.fire({ title: "Warning", text: "Only draft/pending payouts can be deleted. Staged/Paid payouts cannot be deleted.", icon: "warning" });
      return;
    }

    Swal.fire({
      title: `Delete ${deletableIds.length} Draft Payouts?`,
      text: "Are you sure? This will remove all selected draft pay periods. This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        const promises = deletableIds.map(id => deletePayout(id));

        Promise.all(promises)
          .then(() => {
            setSelectedIds([]);
            Swal.fire({ title: "Deleted!", text: "Selected payroll draft records removed.", icon: "success", confirmButtonColor: "#386FA4" });
            loadDashboardData();
          })
          .catch(err => {
            Swal.fire({ title: "Bulk Delete Error", text: err.message || "Failed to remove records.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  return (
    <>
      <Topbar title="Salary and Wages" subtitle="Manage employee payroll, hourly teacher wages, and bonuses" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Empty-state prompt: no payroll yet → run the first payrun */}
        {payouts.length === 0 && !loading && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-hairline bg-surface shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/10 p-2.5 rounded-xl">
                <AlertCircle className="size-5 text-amber-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink">No Payroll Transactions Found</h4>
                <p className="text-xs text-ink-3">Run a monthly payrun to generate salary drafts for your active staff.</p>
              </div>
            </div>
            <Button
              onClick={() => setShowPayrunModal(true)}
              className="bg-accent hover:shadow-lg text-white font-bold px-4 py-2 text-xs rounded-xl"
            >
              <Plus className="size-3.5 mr-1.5" />
              Run Monthly Payroll
            </Button>
          </div>
        )}

        {/* Dashboard KPIs Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 select-none">
          {/* Card 1: Total Salary Paid */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
            <CardBody className="p-5 flex flex-col justify-between h-[125px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-500">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Salary Paid</span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5",
                  (stats?.paidIncreasePct ?? 0) < 0 ? "text-rose-500 bg-rose-500/10" : "text-emerald-500 bg-emerald-500/10"
                )}>
                  <TrendingUp className={cn("size-3", (stats?.paidIncreasePct ?? 0) < 0 && "rotate-180")} />
                  {(stats?.paidIncreasePct ?? 0) > 0 ? "+" : ""}{stats?.paidIncreasePct ?? 0}%
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">
                  ${stats ? stats.totalPaid.toLocaleString("en-US", { minimumFractionDigits: 0 }) : "0"}
                </h2>
                <p className="text-[10px] font-medium text-ink-3 mt-1.5">{trendCaption(stats?.paidIncreasePct)}</p>
              </div>
            </CardBody>
          </Card>

          {/* Card 2: Pending Salary */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
            <CardBody className="p-5 flex flex-col justify-between h-[125px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-amber-500/10 p-2 rounded-lg text-amber-500">
                    <Clock className="size-5" />
                  </div>
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Pending Salary</span>
                </div>
                <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  {(stats?.pendingIncreasePct ?? 0) > 0 ? "+" : ""}{stats?.pendingIncreasePct ?? 0}%
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">
                  ${stats ? stats.pendingSalary.toLocaleString("en-US", { minimumFractionDigits: 0 }) : "0"}
                </h2>
                <p className="text-[10px] font-medium text-ink-3 mt-1.5">{trendCaption(stats?.pendingIncreasePct)}</p>
              </div>
            </CardBody>
          </Card>

          {/* Card 3: Available Balance */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
            <CardBody className="p-5 flex flex-col justify-between h-[125px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                    <Wallet className="size-5" />
                  </div>
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Balance</span>
                </div>
                <span className="text-xs font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                  {(stats?.balanceIncreasePct ?? 0) > 0 ? "+" : ""}{stats?.balanceIncreasePct ?? 0}%
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">
                  ${stats ? stats.balance.toLocaleString("en-US", { minimumFractionDigits: 0 }) : "0"}
                </h2>
                <p className="text-[10px] font-medium text-ink-3 mt-1.5">Paid minus outstanding salary</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Charts & Analytical Trends Section (Collapsible details) */}
        {stats && stats.trend && stats.trend.length > 0 && (
          <Card className="border border-hairline bg-surface shadow-sm overflow-hidden select-none">
            <div className="border-b border-hairline px-5 py-4 bg-surface-2/30 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Payroll Trend Analysis</h4>
                <p className="text-[10px] text-ink-3 mt-0.5">Visual representation of Paid vs Pending Salary for the last 6 months</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold text-ink-3">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#10b981]" />
                  <span>Salary Paid</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#f59e0b]" />
                  <span>Pending Salary</span>
                </div>
              </div>
            </div>
            <CardBody className="p-4 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "12px" }}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Area type="monotone" dataKey="paid" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPaid)" name="Salary Paid" />
                  <Area type="monotone" dataKey="pending" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPending)" name="Pending Salary" />
                </AreaChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        {/* Data Filter Actions and Payroll Table */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Filter Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full relative">
              <Search className="size-4 text-ink-3 absolute left-3.5 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Search staff ID, name, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3 text-xs text-ink focus:outline-none focus:border-accent"
              />
              <Button type="submit" variant="ghost" className="bg-surface border border-hairline size-10 flex items-center justify-center rounded-xl">
                <Filter className="size-4 text-ink-3" />
              </Button>
            </form>

            {/* Actions: Run Payroll */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                variant="primary"
                onClick={() => setShowPayrunModal(true)}
                className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
              >
                <Plus className="size-4" />
                Run Monthly Payroll
              </Button>
            </div>
          </div>

          {/* Quick Filters Options */}
          <div className="flex items-center gap-2.5 flex-wrap text-xs font-bold text-ink-3 select-none">
            {/* Filter by Designation */}
            <div className="flex items-center gap-1.5">
              <span>Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Filter by Status */}
            <div className="flex items-center gap-1.5 ml-2">
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Filter by Payment Method */}
            <div className="flex items-center gap-1.5 ml-2">
              <span>Method:</span>
              <select
                value={methodFilter}
                onChange={(e) => { setMethodFilter(e.target.value); setCurrentPage(1); }}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Sort by */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                <option value="date_desc">Latest Generated</option>
                <option value="date_asc">Oldest Generated</option>
                <option value="amount_desc">Highest Net Salary</option>
                <option value="amount_asc">Lowest Net Salary</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
              </select>
            </div>
          </div>

          {/* Bulk Action Bar (Rendered dynamically when rows are selected) */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 select-none animate-fade-in">
              <div className="flex items-center gap-2 text-xs text-ink-2 font-bold">
                <Layers className="size-4.5 text-emerald-500" />
                <span>Selected <span className="tnum font-extrabold text-emerald-600 dark:text-emerald-400">{selectedIds.length}</span> payout records</span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleBulkPay} 
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-8 px-4 rounded-lg flex items-center gap-1"
                >
                  <CheckCircle2 className="size-3.5" />
                  Bulk Pay
                </Button>
                <Button 
                  onClick={handleBulkDelete} 
                  className="bg-surface-3 hover:bg-surface-4 text-critical font-bold text-xs h-8 px-4 rounded-lg flex items-center gap-1"
                >
                  <Trash2 className="size-3.5" />
                  Delete Drafts
                </Button>
                <button 
                  onClick={() => setSelectedIds([])} 
                  className="text-xs font-bold text-ink-3 hover:text-ink hover:underline ml-2"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Payroll Data Table Card */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <div className="overflow-x-auto min-h-[300px]">
              {loading ? (
                <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                  <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                  Loading salary payouts...
                </div>
              ) : payouts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                  <ClipboardList className="size-8 text-ink-3/40" />
                  <p className="font-bold text-sm">No payroll records found.</p>
                  <p className="text-xs">Select billing period and run payroll to generate draft payout slips.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                      <th className="px-6 py-4 w-4">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.length === payouts.length && payouts.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                        />
                      </th>
                      <th className="px-6 py-4">Employee ID</th>
                      <th className="px-6 py-4">Employee Name</th>
                      <th className="px-6 py-4">Designation</th>
                      <th className="px-6 py-4">Salary Amount</th>
                      <th className="px-6 py-4">Deduction</th>
                      <th className="px-6 py-4">Bonus</th>
                      <th className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-bold">Net Balance</th>
                      <th className="px-6 py-4">Payment Method</th>
                      <th className="px-6 py-4">Payment Date</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {payouts.map(pkg => {
                      const isSelected = selectedIds.includes(pkg.id);
                      return (
                        <tr 
                          key={pkg.id} 
                          className={cn(
                            "hover:bg-surface-2/30 transition-colors",
                            isSelected && "bg-accent/5 hover:bg-accent/10"
                          )}
                        >
                          <td className="px-6 py-4">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={(e) => handleSelectRow(pkg.id, e.target.checked)}
                              className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                            />
                          </td>
                          <td className="px-6 py-4 font-mono text-[10px] text-ink-3 uppercase">
                            {pkg.id.slice(0, 8)}...{pkg.id.slice(-4)}
                          </td>
                          <td className="px-6 py-4 font-bold text-ink text-xs">
                            {pkg.user.firstName} {pkg.user.lastName}
                          </td>
                          <td className="px-6 py-4 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                            {pkg.user.role.replace("_", " ")}
                          </td>
                          <td className="px-6 py-4 font-bold text-ink-2 text-xs">
                            ${Number(pkg.amount).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-bold text-rose-500 text-xs">
                            -${Number(pkg.deductions).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-bold text-emerald-500 text-xs">
                            +${Number(pkg.bonus).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">
                            ${Number(pkg.netAmount).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-[11px] font-bold text-ink-2">
                            {methodLabel[pkg.paymentMethod]}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-ink-3">
                            {pkg.paymentDate 
                              ? new Date(pkg.paymentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                              : "—"
                            }
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={statusBadgeTone[pkg.status]}>
                              {statusLabel[pkg.status]}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenDetails(pkg)}
                                className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                                title="View Details Breakdown"
                              >
                                <Info className="size-4.5" />
                              </Button>
                              
                              {pkg.status !== "PAID" && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleOpenPaySummary(pkg)}
                                    className="rounded-lg text-ink-3 hover:text-emerald-500 hover:bg-surface-3 size-8"
                                    title="Disburse Payment"
                                  >
                                    <DollarSign className="size-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleOpenEdit(pkg)}
                                    className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                    title="Adjust Earnings/Bonus"
                                  >
                                    <Edit2 className="size-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeletePayout(pkg)}
                                    className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                    title="Delete Draft"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {payouts.length > 0 && (
              <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 flex-wrap gap-4 select-none">
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="text-xs text-ink-3 font-medium">
                    Showing <span className="tnum font-bold text-ink-2">{payouts.length}</span> of{" "}
                    <span className="tnum font-bold text-ink-2">{totalItems}</span> transactions
                  </p>
                  
                  <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                    <span>Show:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="h-7 rounded-lg border border-hairline bg-surface px-1.5 text-xs font-bold text-ink-2 focus:outline-none cursor-pointer"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="h-8 rounded-lg text-ink-2 hover:bg-surface-3 px-3 py-1 font-bold text-xs"
                  >
                    <ChevronLeft className="size-3.5 mr-1" />
                    Previous
                  </Button>
                  
                  <span className="text-xs font-extrabold text-ink-2 px-3 py-1 bg-surface-3 rounded-lg">
                    {currentPage} / {totalPages}
                  </span>

                  <Button
                    variant="ghost"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 rounded-lg text-ink-2 hover:bg-surface-3 px-3 py-1 font-bold text-xs"
                  >
                    Next
                    <ChevronRight className="size-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

      </div>

      {/* ─── MODAL 1: Run Payroll Wizard ────────────────────────────────────── */}
      {showPayrunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div className="flex items-center gap-2">
                <CreditCard className="size-5 text-accent animate-pulse" />
                <h3 className="font-bold text-ink text-sm">Monthly Payroll Payrun</h3>
              </div>
              <button 
                onClick={() => setShowPayrunModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            
            <form onSubmit={handleGeneratePayrun} className="p-6 space-y-4">
              <div className="p-4 bg-accent/5 border border-accent/15 rounded-2xl flex gap-3 text-xs">
                <Sparkles className="size-5 text-accent shrink-0 mt-0.5" />
                <div className="text-ink-2">
                  <p className="font-bold mb-1">Intelligent Payrun Estimations</p>
                  <p className="leading-relaxed">This payroll generator automatically aggregates standard monthly salaries for Supervisors and Academic Coaches, and counts completed teaching sessions multiplied by hourly rates for Teachers.</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1.5">Select Payrun Period</label>
                <input 
                  type="month"
                  required
                  value={payrunMonth}
                  onChange={(e) => setPayrunMonth(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="border-t border-hairline pt-4 mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPayrunModal(false)}
                  className="h-10 text-xs font-bold text-ink-2 bg-surface-2 hover:bg-surface-3 px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-10 text-xs font-bold text-white bg-accent hover:opacity-90 hover:shadow-lg hover:shadow-accent/15 px-5 py-2.5 rounded-xl flex items-center justify-center transition-all cursor-pointer"
                >
                  {actionLoading ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : null}
                  Calculate & Generate Drafts
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: Adjust Payout / Edit modal ──────────────────────────────── */}
      {showEditModal && selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <h3 className="font-bold text-ink text-sm">Adjust Earnings: {selectedPayout.user.firstName}</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>
            
            <form onSubmit={handleSaveAdjustments} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Base Wages ($)</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    value={formBaseAmount}
                    onChange={(e) => setFormBaseAmount(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Deductions (Leaves/Tax)</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    value={formDeductions}
                    onChange={(e) => setFormDeductions(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent text-rose-500 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Bonuses / Incentives</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    value={formBonus}
                    onChange={(e) => setFormBonus(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent text-emerald-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Payment Method</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as PayoutMethod)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="WISE">Wise Transfer</option>
                    <option value="PAYPAL">PayPal</option>
                    <option value="STRIPE">Stripe</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Adjustments Notes / Explanations</label>
                <textarea 
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. 5% performance bonus added, deducting 1 unpaid sick leave."
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="bg-surface-2 p-3 rounded-2xl border border-hairline flex items-center justify-between text-xs text-ink-3">
                <span>Calculated Net Pay:</span>
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  ${formBaseAmount - formDeductions + formBonus}
                </span>
              </div>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="h-10 text-xs font-bold text-ink-2 bg-surface-2 hover:bg-surface-3 px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-10 text-xs font-bold text-white bg-accent hover:opacity-90 hover:shadow-lg px-5 py-2.5 rounded-xl flex items-center justify-center cursor-pointer"
                >
                  {actionLoading ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : null}
                  Save Adjustments
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: Process Payment Simulator ──────────────────────────────── */}
      {showPaymentModal && selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <h3 className="font-bold text-ink text-sm">Disburse Salary Transfer</h3>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>
            
            <form onSubmit={handleProcessPaymentSubmit} className="p-6 space-y-4">
              <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl flex items-center justify-between text-xs font-bold">
                <span className="text-ink-2">Disbursement Amount:</span>
                {/* The row names its currency (always USD — staff are paid in
                    dollars wherever they live); printing a hardcoded "USD" here
                    meant a differently-stamped row would be mislabelled. */}
                <span className="text-emerald-500 text-sm font-extrabold">${selectedPayout.netAmount} {selectedPayout.currency ?? "USD"}</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Transfer Gateway</label>
                <select
                  value={txnMethod}
                  onChange={(e) => setTxnMethod(e.target.value as PayoutMethod)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="BANK_TRANSFER">Bank Transfer (Direct ACH)</option>
                  <option value="WISE">Wise Remittance</option>
                  <option value="PAYPAL">PayPal MassPay</option>
                  <option value="STRIPE">Stripe Connect</option>
                  <option value="CASH">Cash Disbursements</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Transaction Reference / Hash</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. TXN-1234567"
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Reference Notes (Optional)</label>
                <textarea 
                  value={txnNotes}
                  onChange={(e) => setTxnNotes(e.target.value)}
                  placeholder="Wire receipt details, exchange rates, etc..."
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="h-10 text-xs font-bold text-ink-2 bg-surface-2 hover:bg-surface-3 px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-10 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 hover:shadow-lg hover:shadow-emerald-500/10 px-5 py-2.5 rounded-xl flex items-center justify-center cursor-pointer"
                >
                  {actionLoading ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : null}
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DRAWER: Detailed Payout View ────────────────────────────────────── */}
      {showDrawer && selectedPayout && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs select-none flex justify-end">
          {/* Backdrop click close */}
          <div className="absolute inset-0" onClick={() => setShowDrawer(false)} />
          
          <div className="relative bg-surface border-l border-hairline w-full max-w-md h-full flex flex-col shadow-2xl animate-slide-left z-10">
            {/* Drawer Header */}
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div>
                <h3 className="font-bold text-ink text-sm">Wage Payout Breakdown</h3>
                <p className="text-[10px] text-ink-3 mt-0.5">Reference ID: {selectedPayout.id.toUpperCase()}</p>
              </div>
              <button 
                onClick={() => setShowDrawer(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
              >
                <X className="size-4.5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              {/* Employee card */}
              <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-hairline bg-surface-2/50">
                <div className="size-11 rounded-xl bg-accent/10 flex items-center justify-center font-bold text-accent text-sm select-none">
                  {selectedPayout.user.firstName[0]}{selectedPayout.user.lastName[0]}
                </div>
                <div>
                  <h4 className="font-bold text-ink text-sm">{selectedPayout.user.firstName} {selectedPayout.user.lastName}</h4>
                  <p className="text-xs font-semibold text-ink-3 mt-0.5">{selectedPayout.user.email}</p>
                  <p className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider mt-1">{selectedPayout.user.role.replace("_", " ")}</p>
                </div>
              </div>

              {/* Status and Details */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Payment Status</span>
                  <Badge tone={statusBadgeTone[selectedPayout.status]}>
                    {statusLabel[selectedPayout.status]}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Pay Period Cycle</span>
                  <span className="text-ink font-bold">
                    {new Date(selectedPayout.billingPeriodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {new Date(selectedPayout.billingPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Payment Method</span>
                  <span className="text-ink font-bold">{methodLabel[selectedPayout.paymentMethod]}</span>
                </div>

                {selectedPayout.paymentDate && (
                  <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                    <span className="text-ink-3 font-semibold">Disbursed Date</span>
                    <span className="text-ink font-bold">
                      {new Date(selectedPayout.paymentDate).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}

                {selectedPayout.referenceNumber && (
                  <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                    <span className="text-ink-3 font-semibold">Reference ID / Hash</span>
                    <span className="text-ink font-mono font-bold text-accent">{selectedPayout.referenceNumber}</span>
                  </div>
                )}
              </div>

              {/* Financial calculations breakdown */}
              <div className="space-y-3.5 bg-surface-2/30 p-4 rounded-2xl border border-hairline">
                <h4 className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Salary Breakdown</h4>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-2 font-medium">Base Contract Wages</span>
                  <span className="text-ink font-bold">${Number(selectedPayout.amount).toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-2 font-medium">Bonuses / Incentives</span>
                  <span className="text-emerald-500 font-bold">+${Number(selectedPayout.bonus).toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-2 font-medium">Adjusted Deductions</span>
                  <span className="text-rose-500 font-bold">-${Number(selectedPayout.deductions).toLocaleString()}</span>
                </div>

                <div className="border-t border-hairline pt-3 flex items-center justify-between text-sm font-extrabold">
                  <span className="text-ink">Net Payable Amount</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-black">${Number(selectedPayout.netAmount).toLocaleString()}</span>
                </div>
              </div>

              {/* Audit Timeline */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Audit Timeline</h4>
                <div className="relative pl-5 border-l-2 border-hairline space-y-4 text-xs select-none">
                  {/* Step 1 */}
                  <div className="relative">
                    <div className="absolute size-2.5 rounded-full bg-accent -left-[24.5px] border-2 border-surface" />
                    <p className="font-bold text-ink-2">Payrun Staged & Draft Created</p>
                    <p className="text-[10px] text-ink-3 font-semibold mt-0.5">{new Date(selectedPayout.createdAt).toLocaleDateString()}</p>
                  </div>

                  {/* Step 2 */}
                  {selectedPayout.status !== "PENDING" && (
                    <div className="relative">
                      <div className="absolute size-2.5 rounded-full bg-amber-500 -left-[24.5px] border-2 border-surface" />
                      <p className="font-bold text-ink-2">Approved for Bank Transfer</p>
                    </div>
                  )}

                  {/* Step 3 */}
                  {selectedPayout.status === "PAID" && (
                    <div className="relative">
                      <div className="absolute size-2.5 rounded-full bg-emerald-500 -left-[24.5px] border-2 border-surface" />
                      <p className="font-bold text-ink-2">Disbursed successfully</p>
                      <p className="text-[10px] text-ink-3 font-semibold mt-0.5">{selectedPayout.paymentDate ? new Date(selectedPayout.paymentDate).toLocaleDateString() : ""}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {selectedPayout.notes && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Adjustment Notes</h4>
                  <p className="text-xs text-ink-3 italic bg-surface-2 p-3 rounded-xl border border-hairline">{selectedPayout.notes}</p>
                </div>
              )}

            </div>

            {/* Drawer Footer actions */}
            <div className="border-t border-hairline p-4 flex gap-2">
              <Button 
                onClick={() => { setShowPayslipPrint(true); }}
                className="bg-surface-3 hover:bg-surface-4 text-ink-2 font-bold text-xs h-10 px-4 rounded-xl flex items-center gap-1.5 mr-auto cursor-pointer"
              >
                <Printer className="size-4" />
                Payslip
              </Button>

              {selectedPayout.status !== "PAID" ? (
                <>
                  <Button 
                    onClick={() => { setShowDrawer(false); handleOpenEdit(selectedPayout); }}
                    className="bg-surface border border-hairline text-ink font-bold text-xs h-10 px-4 rounded-xl cursor-pointer"
                  >
                    Adjust
                  </Button>
                  <Button 
                    onClick={() => { setShowDrawer(false); handleOpenPayModal(selectedPayout); }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-10 px-4 rounded-xl cursor-pointer"
                  >
                    Disburse Salary
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-bold bg-emerald-500/5 px-4 py-2 rounded-xl border border-emerald-500/10">
                  <CheckCircle2 className="size-4" />
                  Transferred via {methodLabel[selectedPayout.paymentMethod]}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SUBMODAL: Payslip printable layout ─────────────────────────────── */}
      {showPayslipPrint && selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[90vh] animate-scale-up">
            {/* Header control */}
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <h3 className="font-bold text-ink text-sm">Payslip Invoice Preview</h3>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handlePrintPayslip()}
                  className="bg-accent hover:shadow-lg text-white font-bold text-xs h-9 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="size-4" />
                  Print Payslip
                </Button>
                <button 
                  onClick={() => setShowPayslipPrint(false)}
                  className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Print area */}
            <div id="print-payslip" className="p-8 flex-1 overflow-y-auto bg-white text-zinc-900 space-y-8 select-text">
              {/* Header */}
              <div className="flex items-start justify-between border-b pb-6 border-zinc-200">
                <div>
                  {brandLogo ? (
                    <img
                      src={brandLogo}
                      alt={brandName}
                      style={{ maxHeight: 48, maxWidth: 240, objectFit: "contain" }}
                      className="mb-2"
                    />
                  ) : (
                    <h1 className="text-xl font-black tracking-tight uppercase text-zinc-900">{brandName}</h1>
                  )}
                  <p className="text-xs text-zinc-500 mt-1">Official Payroll Statement</p>
                </div>
                <div className="text-right">
                  <h2 className="text-base font-extrabold text-zinc-900 uppercase">OFFICIAL PAYSLIP</h2>
                  <p className="text-xs text-zinc-500 mt-1">Transaction Ref: <span className="font-mono">{selectedPayout.referenceNumber || "PENDING"}</span></p>
                  <p className="text-xs text-zinc-500">Pay Date: {selectedPayout.paymentDate ? new Date(selectedPayout.paymentDate).toLocaleDateString() : "Pending"}</p>
                </div>
              </div>

              {/* Employee and Period */}
              <div className="grid grid-cols-2 gap-8 text-xs">
                <div>
                  <p className="text-zinc-400 font-bold uppercase tracking-wider text-[10px] mb-1">Employee Details</p>
                  <p className="text-sm font-bold text-zinc-900">{selectedPayout.user.firstName} {selectedPayout.user.lastName}</p>
                  <p className="text-zinc-500">Designation: {selectedPayout.user.role.replace("_", " ")}</p>
                  <p className="text-zinc-500">Email: {selectedPayout.user.email}</p>
                  <p className="text-zinc-500 font-mono">Employee ID: {selectedPayout.userId}</p>
                </div>
                <div className="text-right">
                  <p className="text-zinc-400 font-bold uppercase tracking-wider text-[10px] mb-1">Billing Statement Period</p>
                  <p className="text-sm font-bold text-zinc-900">
                    {new Date(selectedPayout.billingPeriodStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </p>
                  <p className="text-zinc-500">Cycle Start: {new Date(selectedPayout.billingPeriodStart).toLocaleDateString()}</p>
                  <p className="text-zinc-500">Cycle End: {new Date(selectedPayout.billingPeriodEnd).toLocaleDateString()}</p>
                  <p className="text-zinc-500">Payment Status: <span className="font-bold text-emerald-600 uppercase">{selectedPayout.status}</span></p>
                </div>
              </div>

              {/* Table details */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden mt-6">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase">
                      <th className="p-4">Item Earnings Description</th>
                      <th className="p-4 text-right">Earning Rate</th>
                      <th className="p-4 text-right">Adjusted Deduction</th>
                      <th className="p-4 text-right">Adjusted Bonus</th>
                      <th className="p-4 text-right">Total Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-200 text-zinc-800">
                      <td className="p-4">
                        <p className="font-bold">Base Contract Salaries & Wages</p>
                        <p className="text-[10px] text-zinc-400">Regular base compensation of the billing cycle period</p>
                      </td>
                      <td className="p-4 text-right font-semibold">${Number(selectedPayout.amount).toLocaleString()}</td>
                      <td className="p-4 text-right text-zinc-400">—</td>
                      <td className="p-4 text-right text-zinc-400">—</td>
                      <td className="p-4 text-right font-bold">${Number(selectedPayout.amount).toLocaleString()}</td>
                    </tr>
                    
                    {Number(selectedPayout.bonus) > 0 && (
                      <tr className="border-b border-zinc-200 text-zinc-800">
                        <td className="p-4">
                          <p className="font-bold">Performance Bonus / Incentives</p>
                          <p className="text-[10px] text-zinc-400">Overtime or specific academic performance bonus additions</p>
                        </td>
                        <td className="p-4 text-right text-zinc-400">—</td>
                        <td className="p-4 text-right text-zinc-400">—</td>
                        <td className="p-4 text-right text-emerald-600 font-semibold">+${Number(selectedPayout.bonus).toLocaleString()}</td>
                        <td className="p-4 text-right font-bold text-emerald-600">+${Number(selectedPayout.bonus).toLocaleString()}</td>
                      </tr>
                    )}

                    {Number(selectedPayout.deductions) > 0 && (
                      <tr className="border-b border-zinc-200 text-zinc-800">
                        <td className="p-4">
                          <p className="font-bold">Unpaid Leaves / Absence Deductions</p>
                          <p className="text-[10px] text-zinc-400">Deductions calculated for unpaid leaves or absences</p>
                        </td>
                        <td className="p-4 text-right text-zinc-400">—</td>
                        <td className="p-4 text-right text-rose-500 font-semibold">-${Number(selectedPayout.deductions).toLocaleString()}</td>
                        <td className="p-4 text-right text-zinc-400">—</td>
                        <td className="p-4 text-right font-bold text-rose-500">-${Number(selectedPayout.deductions).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total breakdown */}
              <div className="flex justify-end mt-8">
                <div className="w-64 space-y-2 text-xs border-t pt-4 border-zinc-200">
                  <div className="flex items-center justify-between text-zinc-500">
                    <span>Gross Earnings:</span>
                    <span>${Number(selectedPayout.amount) + Number(selectedPayout.bonus)}</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span>Total Deductions:</span>
                    <span>-${Number(selectedPayout.deductions)}</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-900 font-extrabold text-sm border-t pt-2 mt-2">
                    <span>Net Transfer Amount:</span>
                    <span className="text-emerald-700">${Number(selectedPayout.netAmount).toLocaleString()} {selectedPayout.currency ?? "USD"}</span>
                  </div>
                </div>
              </div>

              {/* Bottom stamp / sign */}
              <div className="grid grid-cols-2 gap-8 pt-16 text-xs text-zinc-500 select-none">
                <div>
                  <p className="italic">This is a system-generated salary payslip statement for Al Furqan Academy and does not require a physical signature.</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="border-b border-zinc-300 w-48 h-8" />
                  <p className="font-bold text-zinc-700 mt-2">Authorized payroll manager stamp</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Helper method mapping to open pay summary directly
  function handleOpenPaySummary(pkg: Payout) {
    handleOpenPayModal(pkg);
  }

  // Print only the payslip (isolated window) instead of the whole app chrome
  function handlePrintPayslip() {
    const printContent = document.getElementById("print-payslip")?.innerHTML;
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Payslip${selectedPayout ? " - " + selectedPayout.user.firstName + " " + selectedPayout.user.lastName : ""}</title>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          <style>
            body { font-family: sans-serif; padding: 40px; background: white; color: #18181b; }
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
}
