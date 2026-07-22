"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Layers,
  Users,
  CalendarClock,
  Archive,
  ToggleLeft,
  CheckCircle2,
  ReceiptText,
  Tag
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchFeePlans,
  createFeePlan,
  updateFeePlan,
  deleteFeePlan,
  fetchFeeAssignments,
  assignFeePlan,
  updateFeeAssignment,
  deleteFeeAssignment,
  fetchStudents,
  fetchDiscounts,
  type FeePlan,
  type FeePlanCycle,
  type FeeComponentType,
  ApiError
} from "@/lib/api";

// ─── Enum options / labels ──────────────────────────────────────────────────
const CYCLES: { value: FeePlanCycle; label: string }[] = [
  { value: "ONE_TIME", label: "One-Time" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "CUSTOM", label: "Custom" }
];

const COMPONENT_TYPES: FeeComponentType[] = [
  "ADMISSION", "COURSE", "REGISTRATION", "MATERIAL", "EXAMINATION", "CERTIFICATE", "OTHER"
];

const cycleLabel = (c: string) => CYCLES.find(x => x.value === c)?.label || c;

const money = (amount: number, currency: string) =>
  `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One row per component, three amounts each. Held as strings so an empty box
// stays empty rather than becoming 0 — "free" and "not sold here" differ.
type ComponentRow = { type: FeeComponentType; label: string; amountUSD: string; amountAED: string; amountGBP: string };
type Discount = { id: string; name?: string; label?: string; code?: string; type?: string; value?: number; amount?: number };
type Assignment = {
  id: string;
  studentId: string;
  planId: string;
  startDate: string | null;
  nextRunAt: string | null;
  active: boolean;
  autoGenerate: boolean;
  discountId: string | null;
  notes: string | null;
  plan?: { name: string; cycle: string; components?: { type: string; label: string; amount: number }[] } | null;
  student?: { studentCode: string; user: { firstName: string; lastName: string; email: string } | null } | null;
};

const discountName = (d: Discount) => d.name || d.label || d.code || "Discount";

export default function FeePlansPage() {
  const [tab, setTab] = useState<"plans" | "assignments">("plans");

  // ─── Fee plans list state ──────────────────────────────────────────────────
  const [plans, setPlans] = useState<FeePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // ─── Shared dropdown data ──────────────────────────────────────────────────
  const [students, setStudents] = useState<{ id: string; name: string; email: string; code: string }[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);

  // ─── Assignments state ─────────────────────────────────────────────────────
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(true);

  // ─── Create / Edit plan modal ──────────────────────────────────────────────
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<FeePlan | null>(null);
  const [formName, setFormName] = useState("");
  const [formCycle, setFormCycle] = useState<FeePlanCycle>("MONTHLY");
  const [formDescription, setFormDescription] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formComponents, setFormComponents] = useState<ComponentRow[]>([
    { type: "COURSE", label: "Course Fee", amountUSD: "", amountAED: "", amountGBP: "" }
  ]);

  const componentsTotal = formComponents.reduce((sum, c) => sum + (Number(c.amountUSD) || 0), 0);

  // ─── Assign plan modal ─────────────────────────────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [assignDiscountId, setAssignDiscountId] = useState("");
  const [assignAutoGenerate, setAssignAutoGenerate] = useState(true);
  const [assignGenerateNow, setAssignGenerateNow] = useState(false);
  const [assignNotes, setAssignNotes] = useState("");

  // ─── Loaders ───────────────────────────────────────────────────────────────
  const loadPlans = () => {
    setLoading(true);
    fetchFeePlans({
      page: currentPage,
      limit: pageSize,
      search: searchQuery || undefined,
      active: activeFilter === "All" ? undefined : activeFilter === "Active" ? "true" : "false"
    })
      .then(res => {
        setPlans(res.items);
        setTotalItems(res.meta.total);
        setTotalPages(res.meta.totalPages);
      })
      .catch(err => console.error("Failed to load fee plans", err))
      .finally(() => setLoading(false));
  };

  const loadAssignments = () => {
    setAssignLoading(true);
    fetchFeeAssignments()
      .then(res => setAssignments(res.items || []))
      .catch(err => console.error("Failed to load fee assignments", err))
      .finally(() => setAssignLoading(false));
  };

  useEffect(() => {
    loadPlans();
  }, [currentPage, pageSize, searchQuery, activeFilter]);

  useEffect(() => {
    loadAssignments();

    // Dropdown data — students (for assignment) + discounts.
    fetchStudents({ page: 1, limit: 200 })
      .then(res => {
        setStudents(
          (res.items || []).map(s => ({
            id: s.id,
            name: `${s.user.firstName} ${s.user.lastName}`,
            email: s.user.email,
            code: s.studentCode
          }))
        );
      })
      .catch(err => console.warn("Failed to load students for dropdown", err));

    fetchDiscounts(undefined, "true")
      .then(res => setDiscounts(res.items || []))
      .catch(err => console.warn("Failed to load discounts", err));
  }, []);

  // ─── Component row editor helpers ──────────────────────────────────────────
  const addComponentRow = () =>
    setFormComponents(prev => [...prev, { type: "OTHER", label: "", amountUSD: "", amountAED: "", amountGBP: "" }]);

  const removeComponentRow = (idx: number) =>
    setFormComponents(prev => prev.filter((_, i) => i !== idx));

  const updateComponentRow = (idx: number, patch: Partial<ComponentRow>) =>
    setFormComponents(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  // ─── Plan modal open/close ─────────────────────────────────────────────────
  const openCreatePlan = () => {
    setEditingPlan(null);
    setFormName("");
    setFormCycle("MONTHLY");
    setFormDescription("");
    setFormActive(true);
    setFormComponents([{ type: "COURSE", label: "Course Fee", amountUSD: "", amountAED: "", amountGBP: "" }]);
    setShowPlanModal(true);
  };

  const openEditPlan = (plan: FeePlan) => {
    setEditingPlan(plan);
    setFormName(plan.name);
    setFormCycle(plan.cycle);
    setFormDescription(plan.description || "");
    setFormActive(plan.active);
    setFormComponents(
      plan.components.length > 0
        ? plan.components.map(c => ({ type: c.type, label: c.label, amountUSD: String(c.amountUSD),
            amountAED: c.amountAED == null ? "" : String(c.amountAED),
            amountGBP: c.amountGBP == null ? "" : String(c.amountGBP) }))
        : [{ type: "COURSE", label: "Course Fee", amountUSD: "", amountAED: "", amountGBP: "" }]
    );
    setShowPlanModal(true);
  };

  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      Swal.fire({ title: "Name Required", text: "Please enter a fee plan name.", icon: "error" });
      return;
    }
    const cleanComponents = formComponents
      .filter(c => c.label.trim() && Number(c.amountUSD) > 0)
      .map(c => ({
        type: c.type, label: c.label.trim(),
        amountUSD: Number(c.amountUSD),
        amountAED: c.amountAED === "" ? undefined : Number(c.amountAED),
        amountGBP: c.amountGBP === "" ? undefined : Number(c.amountGBP),
      }));
    if (cleanComponents.length === 0) {
      Swal.fire({ title: "No Components", text: "Add at least one fee component with a label and amount.", icon: "error" });
      return;
    }

    const dto = {
      name: formName.trim(),
      cycle: formCycle,
      description: formDescription.trim() || undefined,
      active: formActive,
      components: cleanComponents
    };

    setActionLoading(true);
    const req = editingPlan ? updateFeePlan(editingPlan.id, dto) : createFeePlan(dto);
    req
      .then(() => {
        setShowPlanModal(false);
        Swal.fire({
          title: editingPlan ? "Plan Updated" : "Plan Created",
          text: `Fee plan "${dto.name}" saved successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
        loadPlans();
      })
      .catch(err => {
        Swal.fire({ title: "Save Failed", text: err instanceof ApiError ? err.message : "Failed to save fee plan.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  const handleArchivePlan = (plan: FeePlan) => {
    Swal.fire({
      title: "Archive Fee Plan?",
      text: `Are you sure you want to archive "${plan.name}"? It will no longer be available for new assignments.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Archive",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        deleteFeePlan(plan.id)
          .then(() => {
            Swal.fire({ title: "Archived", text: "Fee plan archived successfully.", icon: "success", background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff" });
            loadPlans();
          })
          .catch(err => Swal.fire({ title: "Error", text: err instanceof ApiError ? err.message : "Failed to archive plan.", icon: "error" }))
          .finally(() => setActionLoading(false));
      }
    });
  };

  // ─── Assign modal open/close ───────────────────────────────────────────────
  const openAssignModal = () => {
    setEditingAssignment(null);
    setAssignStudentId(students[0]?.id || "");
    setAssignPlanId(plans[0]?.id || "");
    setAssignStartDate(new Date().toISOString().split("T")[0]);
    setAssignDiscountId("");
    setAssignAutoGenerate(true);
    setAssignGenerateNow(false);
    setAssignNotes("");
    setShowAssignModal(true);
  };

  const openEditAssignment = (a: Assignment) => {
    setEditingAssignment(a);
    setAssignStudentId(a.studentId);
    setAssignPlanId(a.planId);
    setAssignStartDate(a.startDate ? a.startDate.split("T")[0] : new Date().toISOString().split("T")[0]);
    setAssignDiscountId(a.discountId || "");
    setAssignAutoGenerate(a.autoGenerate);
    setAssignGenerateNow(false);
    setAssignNotes(a.notes || "");
    setShowAssignModal(true);
  };

  const handleSaveAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment && (!assignStudentId || !assignPlanId)) {
      Swal.fire({ title: "Missing Fields", text: "Please select both a student and a fee plan.", icon: "error" });
      return;
    }

    setActionLoading(true);
    if (editingAssignment) {
      updateFeeAssignment(editingAssignment.id, {
        startDate: assignStartDate ? new Date(assignStartDate).toISOString() : undefined,
        autoGenerate: assignAutoGenerate,
        discountId: assignDiscountId || null,
        notes: assignNotes.trim() || undefined
      })
        .then(() => {
          setShowAssignModal(false);
          Swal.fire({ title: "Assignment Updated", text: "Fee plan assignment updated.", icon: "success", background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff" });
          loadAssignments();
        })
        .catch(err => Swal.fire({ title: "Update Failed", text: err instanceof ApiError ? err.message : "Failed to update assignment.", icon: "error" }))
        .finally(() => setActionLoading(false));
    } else {
      assignFeePlan({
        studentId: assignStudentId,
        planId: assignPlanId,
        startDate: assignStartDate ? new Date(assignStartDate).toISOString() : undefined,
        autoGenerate: assignAutoGenerate,
        discountId: assignDiscountId || undefined,
        notes: assignNotes.trim() || undefined,
        generateNow: assignGenerateNow
      })
        .then(() => {
          setShowAssignModal(false);
          Swal.fire({
            title: "Plan Assigned",
            text: assignGenerateNow ? "Fee plan assigned and first invoice generated." : "Fee plan assigned to student.",
            icon: "success",
            background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
          });
          loadAssignments();
        })
        .catch(err => Swal.fire({ title: "Assign Failed", text: err instanceof ApiError ? err.message : "Failed to assign fee plan.", icon: "error" }))
        .finally(() => setActionLoading(false));
    }
  };

  const handleDeleteAssignment = (a: Assignment) => {
    const label = a.student ? `${a.student.user?.firstName} ${a.student.user?.lastName}` : "student";
    Swal.fire({
      title: "Remove Assignment?",
      text: `Remove the "${a.plan?.name || "fee plan"}" assignment for ${label}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Remove",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        deleteFeeAssignment(a.id)
          .then(() => {
            Swal.fire({ title: "Removed", text: "Assignment removed successfully.", icon: "success", background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff" });
            loadAssignments();
          })
          .catch(err => Swal.fire({ title: "Error", text: err instanceof ApiError ? err.message : "Failed to remove assignment.", icon: "error" }))
          .finally(() => setActionLoading(false));
      }
    });
  };

  // Totals are quoted in USD, the one amount every component must carry.
  const planTotal = (plan: FeePlan) =>
    plan.components.reduce((sum, c) => sum + Number(c.amountUSD || 0), 0);

  return (
    <>
      <Topbar title="Fee Plans" subtitle="Design fee structures and assign recurring billing plans to students" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        {/* Tab switcher */}
        <div className="flex items-center gap-2 border-b border-hairline">
          <button
            onClick={() => setTab("plans")}
            className={cn(
              "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors flex items-center gap-2",
              tab === "plans" ? "border-accent text-accent" : "border-transparent text-ink-3 hover:text-ink"
            )}
          >
            <Layers className="size-4" />
            Fee Plans
          </button>
          <button
            onClick={() => setTab("assignments")}
            className={cn(
              "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors flex items-center gap-2",
              tab === "assignments" ? "border-accent text-accent" : "border-transparent text-ink-3 hover:text-ink"
            )}
          >
            <Users className="size-4" />
            Student Assignments
          </button>
        </div>

        {/* ─── PLANS TAB ─────────────────────────────────────────────────────── */}
        {tab === "plans" && (
          <div className="space-y-4">
            {/* Filters + create */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search fee plans by name..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3 text-xs text-ink focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink-3">
                  <Filter className="size-3" />
                  <span>Status:</span>
                  <select
                    value={activeFilter}
                    onChange={(e) => { setActiveFilter(e.target.value); setCurrentPage(1); }}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs font-bold text-ink focus:outline-none cursor-pointer"
                  >
                    <option value="All">All Plans</option>
                    <option value="Active">Active</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
                <Button
                  variant="primary"
                  onClick={openCreatePlan}
                  className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
                >
                  <Plus className="size-4" />
                  Create Fee Plan
                </Button>
              </div>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                Loading fee plans...
              </div>
            ) : plans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2 border border-hairline rounded-2xl bg-surface">
                <ClipboardList className="size-8 text-ink-3/40" />
                <p className="font-bold text-sm">No fee plans found.</p>
                <p className="text-xs">Create your first fee structure to start assigning billing plans.</p>
                <Button variant="primary" onClick={openCreatePlan} className="mt-3 rounded-xl text-xs">
                  <Plus className="size-4 mr-1.5" /> Create Fee Plan
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {plans.map(plan => (
                  <Card key={plan.id} className="border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    <CardBody className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-bold text-ink text-sm truncate">{plan.name}</h3>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                            <CalendarClock className="size-3.5 text-accent" />
                            {cycleLabel(plan.cycle)}
                          </div>
                        </div>
                        <Badge tone={plan.active ? "good" : "neutral"}>
                          {plan.active ? "Active" : "Archived"}
                        </Badge>
                      </div>

                      {plan.description && (
                        <p className="text-xs text-ink-3 line-clamp-2">{plan.description}</p>
                      )}

                      <div className="space-y-1.5 border-t border-hairline pt-3">
                        {plan.components.map((c, i) => (
                          <div key={c.id || i} className="flex items-center justify-between text-xs">
                            <span className="text-ink-3 font-semibold flex items-center gap-1.5">
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-surface-3 border border-hairline text-ink-3">{c.type}</span>
                              {c.label}
                            </span>
                            {/* All three, so a component nobody priced in a
                                currency is visible here rather than only when
                                a family's invoice silently fails to generate. */}
                            <span className="text-ink font-bold">
                              {money(Number(c.amountUSD), "USD")}
                              <span className={c.amountAED == null ? "text-critical" : "text-ink-3"}>
                                {"  ·  "}{c.amountAED == null ? "no AED" : money(Number(c.amountAED), "AED")}
                              </span>
                              <span className={c.amountGBP == null ? "text-critical" : "text-ink-3"}>
                                {"  ·  "}{c.amountGBP == null ? "no GBP" : money(Number(c.amountGBP), "GBP")}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between border-t border-hairline pt-3">
                        <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Plan Total</span>
                        <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{money(planTotal(plan), plan.currency)}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] font-bold text-ink-3 flex items-center gap-1">
                          <Users className="size-3.5" /> {plan._count?.assignments ?? 0} assigned
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditPlan(plan)}
                            className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                            title="Edit plan"
                          >
                            <Edit2 className="size-4" />
                          </Button>
                          {plan.active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchivePlan(plan)}
                              className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                              title="Archive plan"
                            >
                              <Archive className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}

            {/* Pagination */}
            {plans.length > 0 && (
              <div className="flex items-center justify-between border border-hairline rounded-2xl bg-surface px-5 py-3.5 flex-wrap gap-4 select-none">
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="text-xs text-ink-3 font-medium">
                    Showing <span className="font-bold text-ink-2">{plans.length}</span> of{" "}
                    <span className="font-bold text-ink-2">{totalItems}</span> fee plans
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                    <span>Show:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      className="h-7 rounded-lg border border-hairline bg-surface px-1.5 text-xs font-bold text-ink-2 focus:outline-none cursor-pointer"
                    >
                      <option value={12}>12</option>
                      <option value={24}>24</option>
                      <option value={48}>48</option>
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
                    <ChevronLeft className="size-3.5 mr-1" /> Previous
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
                    Next <ChevronRight className="size-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── ASSIGNMENTS TAB ───────────────────────────────────────────────── */}
        {tab === "assignments" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-ink">Student Fee Plan Assignments</h3>
                <p className="text-xs text-ink-3 mt-0.5">Recurring billing plans currently attached to students.</p>
              </div>
              <Button
                variant="primary"
                onClick={openAssignModal}
                className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
              >
                <Plus className="size-4" />
                Assign Plan to Student
              </Button>
            </div>

            <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
              <div className="overflow-x-auto min-h-[300px]">
                {assignLoading ? (
                  <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                    <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                    Loading assignments...
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                    <Users className="size-8 text-ink-3/40" />
                    <p className="font-bold text-sm">No fee plan assignments yet.</p>
                    <p className="text-xs">Assign a fee plan to a student to enable recurring billing.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                        <th className="px-6 py-4">Student</th>
                        <th className="px-6 py-4">Fee Plan</th>
                        <th className="px-6 py-4">Cycle</th>
                        <th className="px-6 py-4">Start Date</th>
                        <th className="px-6 py-4">Next Run</th>
                        <th className="px-6 py-4">Auto</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {assignments.map(a => (
                        <tr key={a.id} className="hover:bg-surface-2/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-ink text-xs">
                              {a.student ? `${a.student.user?.firstName} ${a.student.user?.lastName}` : "—"}
                            </div>
                            <div className="text-[10px] text-ink-3 font-mono mt-0.5">{a.student?.studentCode || ""}</div>
                          </td>
                          <td className="px-6 py-4 font-semibold text-ink text-xs">{a.plan?.name || "—"}</td>
                          <td className="px-6 py-4 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                            {a.plan?.cycle ? cycleLabel(a.plan.cycle) : "—"}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-ink-3">
                            {a.startDate ? new Date(a.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-ink-3">
                            {a.nextRunAt ? new Date(a.nextRunAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </td>
                          <td className="px-6 py-4">
                            {a.autoGenerate
                              ? <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1"><CheckCircle2 className="size-3.5" /> On</span>
                              : <span className="text-[10px] font-extrabold text-ink-3 uppercase flex items-center gap-1"><ToggleLeft className="size-3.5" /> Off</span>}
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={a.active ? "good" : "neutral"}>{a.active ? "Active" : "Inactive"}</Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditAssignment(a)}
                                className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                title="Edit assignment"
                              >
                                <Edit2 className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteAssignment(a)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Remove assignment"
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
            </Card>
          </div>
        )}
      </div>

      {/* ─── MODAL: Create / Edit Fee Plan ──────────────────────────────────── */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-scale-up max-h-[95vh] overflow-y-auto">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30 sticky top-0 z-10">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <ReceiptText className="size-4.5 text-accent" />
                {editingPlan ? "Edit Fee Plan" : "Create New Fee Plan"}
              </h3>
              <button onClick={() => setShowPlanModal(false)} className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Plan Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Standard Monthly Tuition"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Billing Cycle</label>
                  <select
                    value={formCycle}
                    onChange={(e) => setFormCycle(e.target.value as FeePlanCycle)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                {/*
                  The plan no longer names a currency. It prices its components
                  in all three below, and an invoice is raised in the currency
                  the student is billed in — one field here saying otherwise is
                  what made a family's first invoice and every one after it
                  disagree.
                */}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Description (Optional)</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What this fee plan covers..."
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none"
                />
              </div>

              {/* Dynamic components editor */}
              <div className="border border-hairline rounded-2xl p-4 space-y-3 bg-surface-2/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Fee Components</span>
                  <button
                    type="button"
                    onClick={addComponentRow}
                    className="text-[10px] text-accent font-extrabold hover:underline uppercase flex items-center gap-0.5"
                  >
                    <Plus className="size-3" /> Add Component
                  </button>
                </div>

                {formComponents.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={c.type}
                      onChange={(e) => updateComponentRow(idx, { type: e.target.value as FeeComponentType })}
                      className="h-9 w-32 shrink-0 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink focus:outline-none focus:border-accent cursor-pointer"
                    >
                      {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="text"
                      placeholder="Label (e.g. Tuition Fee)"
                      value={c.label}
                      onChange={(e) => updateComponentRow(idx, { label: e.target.value })}
                      className="h-9 flex-1 rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:border-accent"
                    />
                    {/*
                      One box per currency. USD is required — it is what a
                      total is quoted in. Leave AED or GBP blank and families
                      billed in it cannot be invoiced from this plan, which the
                      package form refuses to link and the list flags in red.
                    */}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="USD"
                      required
                      value={c.amountUSD}
                      onChange={(e) => updateComponentRow(idx, { amountUSD: e.target.value })}
                      className="h-9 w-24 rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:border-accent font-semibold"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="AED"
                      value={c.amountAED}
                      onChange={(e) => updateComponentRow(idx, { amountAED: e.target.value })}
                      className="h-9 w-24 rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:border-accent font-semibold"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="GBP"
                      value={c.amountGBP}
                      onChange={(e) => updateComponentRow(idx, { amountGBP: e.target.value })}
                      className="h-9 w-24 rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:border-accent font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => removeComponentRow(idx)}
                      disabled={formComponents.length === 1}
                      className="size-9 shrink-0 flex items-center justify-center rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Remove component"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center justify-between border-t border-hairline pt-3">
                  <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Computed Plan Total</span>
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{money(componentsTotal, "USD")}</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-ink-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                />
                Plan is active and available for assignment
              </label>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
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
                  {editingPlan ? "Save Changes" : "Create Fee Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Assign Plan to Student ──────────────────────────────────── */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up max-h-[95vh] overflow-y-auto">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30 sticky top-0 z-10">
              <h3 className="font-bold text-ink text-sm">{editingAssignment ? "Edit Assignment" : "Assign Plan to Student"}</h3>
              <button onClick={() => setShowAssignModal(false)} className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Student</label>
                <select
                  value={assignStudentId}
                  onChange={(e) => setAssignStudentId(e.target.value)}
                  disabled={!!editingAssignment}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer disabled:opacity-60"
                >
                  {editingAssignment && (
                    <option value={editingAssignment.studentId}>
                      {editingAssignment.student ? `${editingAssignment.student.user?.firstName} ${editingAssignment.student.user?.lastName}` : "Current student"}
                    </option>
                  )}
                  {!editingAssignment && students.length === 0 && <option value="">No students available</option>}
                  {!editingAssignment && students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Fee Plan</label>
                <select
                  value={assignPlanId}
                  onChange={(e) => setAssignPlanId(e.target.value)}
                  disabled={!!editingAssignment}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer disabled:opacity-60"
                >
                  {editingAssignment && <option value={editingAssignment.planId}>{editingAssignment.plan?.name || "Current plan"}</option>}
                  {!editingAssignment && plans.length === 0 && <option value="">No plans available</option>}
                  {!editingAssignment && plans.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({cycleLabel(p.cycle)} — {money(planTotal(p), p.currency)})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={assignStartDate}
                    onChange={(e) => setAssignStartDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1 flex items-center gap-1"><Tag className="size-3" /> Discount</label>
                  <select
                    value={assignDiscountId}
                    onChange={(e) => setAssignDiscountId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="">No discount</option>
                    {discounts.map(d => <option key={d.id} value={d.id}>{discountName(d)}</option>)}
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 text-xs font-bold text-ink-2 cursor-pointer bg-surface-2/50 border border-hairline rounded-xl px-3.5 py-3">
                <span>Auto-generate recurring invoices</span>
                <input
                  type="checkbox"
                  checked={assignAutoGenerate}
                  onChange={(e) => setAssignAutoGenerate(e.target.checked)}
                  className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                />
              </label>

              {!editingAssignment && (
                <label className="flex items-center justify-between gap-2 text-xs font-bold text-ink-2 cursor-pointer bg-surface-2/50 border border-hairline rounded-xl px-3.5 py-3">
                  <span>Generate first invoice now</span>
                  <input
                    type="checkbox"
                    checked={assignGenerateNow}
                    onChange={(e) => setAssignGenerateNow(e.target.checked)}
                    className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                  />
                </label>
              )}

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Notes (Optional)</label>
                <textarea
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Any assignment-specific notes..."
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
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
                  {editingAssignment ? "Save Changes" : "Assign Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
