"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Search, 
  X, 
  Edit2, 
  Trash2, 
  Info,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
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
  Loader2,
  PieChart as PieIcon,
  TrendingDown,
  FileText,
  Building,
  Upload,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  Tag
} from "lucide-react";
import Swal from "sweetalert2";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip,
  PieChart,
  Pie,
  Cell
} from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchExpenses,
  fetchExpenseStats,
  fetchExpenseCategories,
  createExpenseCategory,
  createExpense,
  updateExpense,
  deleteExpense,
  uploadExpenseReceipt,
  resolveFileUrl,
  type Expense,
  type ExpenseStats,
  type ExpenseStatus,
  type ExpenseCategory,
  type ExpensePaymentMethod
} from "@/lib/api";

const STATUSES = ["All", "Approved", "Pending", "Rejected"] as const;
const METHODS = ["All", "Bank Transfer", "Credit Card", "PayPal", "Cash", "Wise"] as const;

const CHART_COLORS = [
  "#386FA4", // Blue
  "#10b981", // Green
  "#f59e0b", // Amber
  "#f85a6b", // Rose
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#6b7280"  // Gray
];

const statusBadgeTone: Record<ExpenseStatus, Tone> = {
  APPROVED: "good",
  PENDING: "warning",
  REJECTED: "critical"
};

const statusLabel: Record<ExpenseStatus, string> = {
  APPROVED: "Approved",
  PENDING: "Pending",
  REJECTED: "Rejected"
};

const methodLabel: Record<ExpensePaymentMethod, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CREDIT_CARD: "Credit Card",
  PAYPAL: "PayPal",
  CASH: "Cash",
  WISE: "Wise"
};

export default function ExpensesDashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters, sorting, and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryIdFilter, setCategoryIdFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [methodFilter, setMethodFilter] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modal / Drawer visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Add Expense form states
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formMethod, setFormMethod] = useState<ExpensePaymentMethod>("BANK_TRANSFER");
  const [formMerchant, setFormMerchant] = useState("");
  const [formReferenceNo, setFormReferenceNo] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formReceiptUrl, setFormReceiptUrl] = useState("");
  const [formReceiptName, setFormReceiptName] = useState("");
  const [formStatus, setFormStatus] = useState<ExpenseStatus>("PENDING");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Real receipt uploader state
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Human-readable month-over-month caption from a real percentage value
  const trendCaption = (pct: number | null | undefined) => {
    if (pct === undefined || pct === null) return "No prior month data";
    if (pct === 0) return "No change vs last month";
    return `${Math.abs(pct)}% ${pct > 0 ? "increase" : "decrease"} vs last month`;
  };

  // Fetch data from backend
  const loadDashboardData = () => {
    setLoading(true);
    
    // Formatting filter queries
    const catParam = categoryIdFilter === "All" ? undefined : categoryIdFilter;
    const statusParam = statusFilter === "All" ? undefined : statusFilter.toUpperCase();
    const methodParam = methodFilter === "All" ? undefined : methodFilter;

    // Load dynamic categories
    fetchExpenseCategories()
      .then(res => {
        setCategories(res);
        // Default select first category in form if none selected
        if (res.length > 0 && !formCategory) {
          setFormCategory(res[0].id);
        }
      })
      .catch(err => console.error("Failed to load categories", err));

    fetchExpenses({
      page: currentPage,
      limit: pageSize,
      search: searchQuery || undefined,
      categoryId: catParam,
      status: statusParam,
      paymentMethod: methodParam,
      sortBy
    })
      .then(res => {
        setExpenses(res.items);
        setTotalItems(res.meta.total);
        setTotalPages(res.meta.totalPages);
      })
      .catch(err => console.error("Failed to load expenses list", err));

    fetchExpenseStats()
      .then(res => {
        setStats(res);
      })
      .catch(err => console.error("Failed to fetch expense KPIs", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentPage, pageSize, categoryIdFilter, statusFilter, methodFilter, sortBy]);

  // Handle Search Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadDashboardData();
  };

  // Create new Category inline
  const handleAddCategory = () => {
    Swal.fire({
      title: "Create Expense Category",
      input: "text",
      inputPlaceholder: "Enter new category name (e.g. Server Hosting)...",
      showCancelButton: true,
      confirmButtonText: "Create",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#386FA4",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      inputValidator: (value) => {
        if (!value || value.trim().length < 2) {
          return "Please enter a valid category name (min 2 characters).";
        }
      }
    }).then(result => {
      if (result.isConfirmed && result.value) {
        setActionLoading(true);
        createExpenseCategory(result.value.trim())
          .then(newCat => {
            setCategories(prev => [...prev, newCat]);
            setFormCategory(newCat.id); // auto-select the newly created category!
            Swal.fire({
              toast: true,
              position: "top-end",
              icon: "success",
              title: `Category "${newCat.name}" created and selected!`,
              showConfirmButton: false,
              timer: 2000
            });
          })
          .catch(err => {
            Swal.fire({ title: "Failed", text: err.message || "Failed to create category.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  // Open single detail drawer
  const handleOpenDetails = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowDrawer(true);
  };

  // Handle create new expense submit
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formAmount || !formCategory) return;

    setActionLoading(true);
    createExpense({
      title: formTitle,
      amount: Number(formAmount),
      categoryId: formCategory,
      paymentMethod: formMethod,
      merchant: formMerchant || undefined,
      referenceNo: formReferenceNo || undefined,
      receiptUrl: formReceiptUrl || undefined,
      notes: formNotes || undefined,
      paymentDate: new Date(formDate).toISOString(),
      status: formStatus
    })
      .then(created => {
        setShowAddModal(false);
        // Reset form fields
        setFormTitle("");
        setFormAmount("");
        setFormMerchant("");
        setFormReferenceNo("");
        setFormNotes("");
        setFormReceiptUrl("");
        setFormReceiptName("");
        setFormStatus("PENDING");
        setFormDate(new Date().toISOString().split("T")[0]);

        Swal.fire({
          title: "Expense Logged",
          text: `Successfully created expense record: ${created.title}`,
          icon: "success",
          confirmButtonColor: "#386FA4"
        });
        loadDashboardData();
      })
      .catch(err => {
        Swal.fire({ title: "Failed to Add", text: err.message || "Check fields validation.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  // Real Receipt Uploader — sends the chosen file to the backend
  const handleReceiptSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReceipt(true);
    uploadExpenseReceipt(file)
      .then(res => {
        setFormReceiptUrl(res.url);
        setFormReceiptName(res.fileName);
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: `Receipt "${res.fileName}" attached!`,
          showConfirmButton: false,
          timer: 1800
        });
      })
      .catch(err => {
        Swal.fire({ title: "Upload Failed", text: err.message || "Could not upload receipt.", icon: "error" });
      })
      .finally(() => {
        setUploadingReceipt(false);
        if (receiptInputRef.current) receiptInputRef.current.value = "";
      });
  };

  // Toggle single expense approval status (Approve / Reject)
  const handleToggleStatus = (id: string, newStatus: ExpenseStatus) => {
    setActionLoading(true);
    updateExpense(id, { status: newStatus })
      .then(updated => {
        setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
        if (selectedExpense?.id === updated.id) {
          setSelectedExpense(updated);
        }
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: `Expense marked as ${newStatus.toLowerCase()}!`,
          showConfirmButton: false,
          timer: 1500
        });
        loadDashboardData();
      })
      .catch(err => {
        Swal.fire({ title: "Action Failed", text: err.message || "Failed to update expense status.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  // Delete single expense
  const handleDeleteExpense = (expense: Expense) => {
    Swal.fire({
      title: "Delete Expense Record?",
      text: `Are you sure you want to remove the expense "${expense.title}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        deleteExpense(expense.id)
          .then(() => {
            setShowDrawer(false);
            setExpenses(prev => prev.filter(e => e.id !== expense.id));
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

  return (
    <>
      <Topbar title="Expenses" subtitle="Log corporate bills, subscriptions, office supplies, and track category-wise cashflow" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        {/* Empty-state prompt: no expenses yet → record the first one */}
        {expenses.length === 0 && !loading && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-hairline bg-surface shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/10 p-2.5 rounded-xl">
                <AlertCircle className="size-5 text-amber-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink">No Expense Entries Found</h4>
                <p className="text-xs text-ink-3">Record your first operational expense to start tracking category-wise cashflow.</p>
              </div>
            </div>
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-accent hover:shadow-lg text-white font-bold px-4 py-2 text-xs rounded-xl"
            >
              <Plus className="size-3.5 mr-1.5" />
              Record New Expense
            </Button>
          </div>
        )}

        {/* Dashboard 4 KPI Stats Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 select-none">
          {/* Tile 1: Total Expense */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
            <CardBody className="p-5 flex flex-col justify-between h-[125px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-rose-500/10 p-2 rounded-lg text-rose-500">
                    <TrendingDown className="size-5" />
                  </div>
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Expense</span>
                </div>
                {stats?.expenseChangePct != null && (
                  <span className="text-xs font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                    {stats.expenseChangePct > 0 ? "+" : ""}{stats.expenseChangePct}%
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">
                  ${stats ? stats.totalExpense.toLocaleString("en-US", { minimumFractionDigits: 0 }) : "0"}
                </h2>
                <p className="text-[10px] font-medium text-ink-3 mt-1.5">{trendCaption(stats?.expenseChangePct)}</p>
              </div>
            </CardBody>
          </Card>

          {/* Tile 2: Pending Expenses */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
            <CardBody className="p-5 flex flex-col justify-between h-[125px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-amber-500/10 p-2 rounded-lg text-amber-500">
                    <Clock className="size-5" />
                  </div>
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Pending</span>
                </div>
                {stats?.pendingChangePct != null && (
                  <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                    {stats.pendingChangePct > 0 ? "+" : ""}{stats.pendingChangePct}%
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">
                  ${stats ? stats.pendingExpense.toLocaleString("en-US", { minimumFractionDigits: 0 }) : "0"}
                </h2>
                <p className="text-[10px] font-medium text-ink-3 mt-1.5">{trendCaption(stats?.pendingChangePct)}</p>
              </div>
            </CardBody>
          </Card>

          {/* Tile 3: Gross Revenue */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
            <CardBody className="p-5 flex flex-col justify-between h-[125px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-500">
                    <TrendingUp className="size-5" />
                  </div>
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Revenue</span>
                </div>
                {stats?.revenueChangePct != null && (
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5",
                    stats.revenueChangePct < 0 ? "text-rose-500 bg-rose-500/10" : "text-emerald-500 bg-emerald-500/10"
                  )}>
                    {stats.revenueChangePct > 0 ? "+" : ""}{stats.revenueChangePct}%
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">
                  ${stats ? stats.revenue.toLocaleString("en-US", { minimumFractionDigits: 0 }) : "0"}
                </h2>
                <p className="text-[10px] font-medium text-ink-3 mt-1.5">{trendCaption(stats?.revenueChangePct)}</p>
              </div>
            </CardBody>
          </Card>

          {/* Tile 4: Balance */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
            <CardBody className="p-5 flex flex-col justify-between h-[125px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                    <Wallet className="size-5" />
                  </div>
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Balance</span>
                </div>
                {stats?.balanceChangePct != null && (
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5",
                    stats.balanceChangePct < 0 ? "text-rose-500 bg-rose-500/10" : "text-blue-500 bg-blue-500/10"
                  )}>
                    {stats.balanceChangePct > 0 ? "+" : ""}{stats.balanceChangePct}%
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">
                  ${stats ? stats.balance.toLocaleString("en-US", { minimumFractionDigits: 0 }) : "0"}
                </h2>
                <p className="text-[10px] font-medium text-ink-3 mt-1.5">Revenue minus total expenses</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Charts Panel: Pie Chart (Category Breakdown) & Area Chart (Revenue vs Expense Trend) */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-none">
            
            {/* Category Breakdown (Pie Chart) */}
            <Card className="border border-hairline bg-surface shadow-sm lg:col-span-1">
              <div className="border-b border-hairline px-5 py-4 bg-surface-2/30 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Category Breakdowns</h4>
                  <p className="text-[10px] text-ink-3 mt-0.5">Distribution of operational expenses</p>
                </div>
                <PieIcon className="size-4.5 text-accent" />
              </div>
              <CardBody className="p-4 flex flex-col items-center justify-center min-h-[250px] relative">
                {stats.categoryBreakdown.length === 0 ? (
                  <div className="text-xs text-ink-3 font-bold py-10">No category breakdown details.</div>
                ) : (
                  <>
                    <div className="w-full h-[180px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.categoryBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {stats.categoryBreakdown.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: any) => [`$${value.toLocaleString()}`, "Total Expense"]}
                            contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "10px" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Styled custom legends list */}
                    <div className="w-full mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold text-ink-3">
                      {stats.categoryBreakdown.slice(0, 6).map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-1.5 truncate">
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span className="truncate">{item.name}:</span>
                          <span className="text-ink font-extrabold">${item.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            {/* Financial comparison over past 6 months */}
            <Card className="border border-hairline bg-surface shadow-sm lg:col-span-2">
              <div className="border-b border-hairline px-5 py-4 bg-surface-2/30 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Revenue vs Expense Comparison</h4>
                  <p className="text-[10px] text-ink-3 mt-0.5">Historical comparison of student billing income against bills</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-ink-3">
                  <div className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-blue-500" />
                    <span>Revenue</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-rose-500" />
                    <span>Expenses</span>
                  </div>
                </div>
              </div>
              <CardBody className="p-4 h-[250px] flex items-center justify-center">
                {stats.trend.length === 0 ? (
                  <div className="text-xs text-ink-3 font-bold">No historical trend data available.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01}/>
                        </linearGradient>
                        <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                      <YAxis tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "12px" }}
                        labelStyle={{ fontWeight: "bold" }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" name="Gross Revenue" />
                      <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2.5} fillOpacity={1} fill="url(#colorExp)" name="Total Expenses" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

          </div>
        )}

        {/* Expenses List section: Controls & Table */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Search filter form */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full relative">
              <Search className="size-4 text-ink-3 absolute left-3.5 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Search merchant, invoice #, type description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3 text-xs text-ink focus:outline-none focus:border-accent"
              />
              <Button type="submit" variant="ghost" className="bg-surface border border-hairline size-10 flex items-center justify-center rounded-xl">
                <Filter className="size-4 text-ink-3" />
              </Button>
            </form>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                onClick={() => setShowAddModal(true)}
                className="bg-accent hover:shadow-lg text-white font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
              >
                <Plus className="size-4" />
                Record New Expense
              </Button>
            </div>
          </div>

          {/* Quick Category / Status filters */}
          <div className="flex items-center gap-2.5 flex-wrap text-xs font-bold text-ink-3 select-none">
            {/* Category selection */}
            <div className="flex items-center gap-1.5">
              <span>Category:</span>
              <select
                value={categoryIdFilter}
                onChange={(e) => { setCategoryIdFilter(e.target.value); setCurrentPage(1); }}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer hover:border-hairline"
              >
                <option value="All">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Status selection */}
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

            {/* Method selection */}
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

            {/* Sorting trigger */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                <option value="date_desc">Latest Date</option>
                <option value="date_asc">Oldest Date</option>
                <option value="amount_desc">Highest Amount</option>
                <option value="amount_asc">Lowest Amount</option>
                <option value="title_asc">Description A-Z</option>
                <option value="title_desc">Description Z-A</option>
              </select>
            </div>
          </div>

          {/* Expenses Data Table Card */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <div className="overflow-x-auto min-h-[300px]">
              {loading ? (
                <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                  <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                  Loading expense logs...
                </div>
              ) : expenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                  <ClipboardList className="size-8 text-ink-3/40" />
                  <p className="font-bold text-sm">No expenses records found.</p>
                  <p className="text-xs">Record an expense or seed demo parameters to test.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                      <th className="px-6 py-4">Payment Date</th>
                      <th className="px-6 py-4">Expense Type</th>
                      <th className="px-6 py-4">Merchant / Vendor</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Payment Method</th>
                      <th className="px-6 py-4">Receipt</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {expenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4 text-xs font-semibold text-ink-3">
                          {new Date(exp.paymentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4 font-bold text-ink text-xs">
                          {exp.title}
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-ink-2">
                          {exp.merchant || "—"}
                        </td>
                        <td className="px-6 py-4 font-extrabold text-ink-2 text-xs">
                          ${Number(exp.amount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                          <span className="px-2 py-0.5 rounded-md bg-surface-3 border border-hairline">
                            {exp.category?.name || "Uncategorized"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-ink-2">
                          {methodLabel[exp.paymentMethod]}
                        </td>
                        <td className="px-6 py-4">
                          {exp.receiptUrl ? (
                            <button
                              onClick={() => { setSelectedExpense(exp); setShowReceiptModal(true); }}
                              className="text-[10px] text-accent font-extrabold hover:underline uppercase flex items-center gap-0.5"
                            >
                              <FileText className="size-3" />
                              View Receipt
                            </button>
                          ) : (
                            <span className="text-xs text-ink-3 font-semibold">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={statusBadgeTone[exp.status]}>
                            {statusLabel[exp.status]}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleOpenDetails(exp)}
                              className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                              title="View Expense Details"
                            >
                              <Info className="size-4.5" />
                            </Button>
                            
                            {exp.status === "PENDING" && (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleToggleStatus(exp.id, "APPROVED")}
                                  className="rounded-lg text-ink-3 hover:text-emerald-500 hover:bg-surface-3 size-8"
                                  title="Approve Reimbursement"
                                >
                                  <ShieldCheck className="size-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleToggleStatus(exp.id, "REJECTED")}
                                  className="rounded-lg text-ink-3 hover:text-rose-500 hover:bg-surface-3 size-8"
                                  title="Reject Expense"
                                >
                                  <ShieldAlert className="size-4" />
                                </Button>
                              </>
                            )}

                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDeleteExpense(exp)}
                              className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                              title="Delete Record"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {expenses.length > 0 && (
              <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 flex-wrap gap-4 select-none">
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="text-xs text-ink-3 font-medium">
                    Showing <span className="tnum font-bold text-ink-2">{expenses.length}</span> of{" "}
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

      {/* ─── MODAL: Record Expense Form ──────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <h3 className="font-bold text-ink text-sm">Log New Expense Record</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Expense Title / Description</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Fiber Internet Bill, Software License"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Amount ($)</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    placeholder="e.g. 150"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Payment Date</label>
                  <input 
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1 flex items-center justify-between">
                    <span>Category</span>
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="text-[10px] text-accent font-extrabold hover:underline uppercase flex items-center gap-0.5"
                    >
                      <Plus className="size-3" />
                      Create Category
                    </button>
                  </label>
                  <select
                    value={formCategory}
                    required
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Payment Method</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as ExpensePaymentMethod)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                    <option value="PAYPAL">PayPal</option>
                    <option value="WISE">Wise Remittance</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Merchant / Vendor</label>
                  <input 
                    type="text"
                    placeholder="e.g. Amazon Web Services"
                    value={formMerchant}
                    onChange={(e) => setFormMerchant(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Invoice / Reference #</label>
                  <input 
                    type="text"
                    placeholder="e.g. INV-9023412"
                    value={formReferenceNo}
                    onChange={(e) => setFormReferenceNo(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-mono"
                  />
                </div>
              </div>

              {/* Receipt Document Uploader (real file upload) */}
              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Receipt Document Attachment</label>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={handleReceiptSelected}
                  className="hidden"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    type="button"
                    onClick={() => receiptInputRef.current?.click()}
                    disabled={uploadingReceipt}
                    className="bg-surface-3 hover:bg-surface-4 text-ink-2 font-bold text-xs h-10 px-4 rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    {uploadingReceipt ? <RefreshCw className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    {formReceiptUrl ? "Replace Receipt" : "Upload Receipt (PDF / Image)"}
                  </Button>

                  {formReceiptUrl && (
                    <span className="text-xs text-emerald-500 font-bold flex items-center gap-1 select-none max-w-[200px] truncate">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      {formReceiptName || "Receipt attached"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Internal Reference Notes</label>
                <textarea 
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Details regarding approval, reimbursement, etc..."
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-10 text-xs font-bold text-ink-2 bg-surface-2 hover:bg-surface-3 px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-10 text-xs font-bold text-white bg-accent hover:shadow-lg px-5 py-2.5 rounded-xl flex items-center justify-center cursor-pointer"
                >
                  {actionLoading ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : null}
                  Record Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DRAWER: Detailed Expense Breakdown ─────────────────────────────── */}
      {showDrawer && selectedExpense && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs select-none flex justify-end">
          {/* Backdrop Click Close */}
          <div className="absolute inset-0" onClick={() => setShowDrawer(false)} />

          <div className="relative bg-surface border-l border-hairline w-full max-w-md h-full flex flex-col shadow-2xl animate-slide-left z-10">
            {/* Drawer Header */}
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div>
                <h3 className="font-bold text-ink text-sm">Expense Invoice Details</h3>
                <p className="text-[10px] text-ink-3 mt-0.5">Reference ID: {selectedExpense.id.toUpperCase()}</p>
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
              
              {/* Expense card */}
              <div className="p-4 rounded-2xl border border-hairline bg-surface-2/50 space-y-1.5">
                <p className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Expense Type</p>
                <h4 className="font-extrabold text-ink text-sm">{selectedExpense.title}</h4>
                <p className="text-xs text-ink-3 font-semibold mt-1">Vendor: {selectedExpense.merchant || "—"}</p>
              </div>

              {/* Status and Details */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Approval Status</span>
                  <Badge tone={statusBadgeTone[selectedExpense.status]}>
                    {statusLabel[selectedExpense.status]}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Transaction Amount</span>
                  <span className="text-ink font-extrabold text-sm text-rose-500">${Number(selectedExpense.amount).toLocaleString()} USD</span>
                </div>

                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Category Classification</span>
                  <span className="text-ink font-bold">{selectedExpense.category?.name || "Uncategorized"}</span>
                </div>

                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Payment Date</span>
                  <span className="text-ink font-bold">
                    {new Date(selectedExpense.paymentDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                  <span className="text-ink-3 font-semibold">Payment Gateway</span>
                  <span className="text-ink font-bold">{methodLabel[selectedExpense.paymentMethod]}</span>
                </div>

                {selectedExpense.referenceNo && (
                  <div className="flex items-center justify-between text-xs border-b border-hairline pb-2.5">
                    <span className="text-ink-3 font-semibold">Invoice/Reference ID</span>
                    <span className="text-ink font-mono font-bold text-accent">{selectedExpense.referenceNo}</span>
                  </div>
                )}
              </div>

              {/* Receipt preview attachment */}
              {selectedExpense.receiptUrl && (
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Receipt Attachment</span>
                  <div 
                    onClick={() => setShowReceiptModal(true)}
                    className="relative rounded-2xl border border-hairline overflow-hidden aspect-video bg-surface-2 group cursor-zoom-in hover:brightness-95 transition-all"
                  >
                    {/^data:application\/pdf|\.pdf($|\?)/i.test(selectedExpense.receiptUrl) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-ink-3">
                        <FileText className="size-8" />
                        <span className="text-[10px] font-bold uppercase">PDF Receipt</span>
                      </div>
                    ) : (
                      <img
                        src={resolveFileUrl(selectedExpense.receiptUrl)}
                        alt="receipt doc preview"
                        className="w-full h-full object-cover select-none"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to expand preview
                    </div>
                  </div>
                </div>
              )}

              {/* Reference notes */}
              {selectedExpense.notes && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Reference Notes</h4>
                  <p className="text-xs text-ink-3 italic bg-surface-2 p-3 rounded-xl border border-hairline">{selectedExpense.notes}</p>
                </div>
              )}

            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-hairline p-4 flex gap-2">
              <Button 
                onClick={() => handleDeleteExpense(selectedExpense)}
                className="bg-surface-3 hover:bg-surface-4 text-critical font-bold text-xs h-10 px-4 rounded-xl flex items-center gap-1 mr-auto cursor-pointer"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>

              {selectedExpense.status === "PENDING" ? (
                <>
                  <Button 
                    onClick={() => handleToggleStatus(selectedExpense.id, "REJECTED")}
                    className="bg-surface border border-hairline text-critical font-bold text-xs h-10 px-4 rounded-xl cursor-pointer"
                  >
                    Reject
                  </Button>
                  <Button 
                    onClick={() => handleToggleStatus(selectedExpense.id, "APPROVED")}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-10 px-4 rounded-xl cursor-pointer"
                  >
                    Approve Log
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink-3">
                  Log status is finalized
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ─── SUBMODAL: Receipt Expanded Preview ─────────────────────────────── */}
      {showReceiptModal && selectedExpense && selectedExpense.receiptUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none"
          onClick={() => setShowReceiptModal(false)}
        >
          <div 
            className="bg-surface border border-hairline rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <h3 className="font-bold text-ink text-sm">Receipt Attachment Preview</h3>
              <button 
                onClick={() => setShowReceiptModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>
            
            <div className="p-4 bg-surface-2 flex items-center justify-center max-h-[70vh]">
              {/^data:application\/pdf|\.pdf($|\?)/i.test(selectedExpense.receiptUrl) ? (
                <iframe
                  src={resolveFileUrl(selectedExpense.receiptUrl)}
                  title="receipt pdf"
                  className="w-full h-[60vh] rounded-xl border border-hairline bg-white"
                />
              ) : (
                <img
                  src={resolveFileUrl(selectedExpense.receiptUrl)}
                  alt="expanded receipt doc"
                  className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-lg border border-hairline select-text"
                />
              )}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
