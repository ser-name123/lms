"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  X,
  Edit2,
  Filter,
  Loader2,
  ClipboardList,
  RefreshCw,
  Tag,
  Ban,
  Percent,
  DollarSign
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchDiscounts,
  createDiscount,
  updateDiscount,
  deleteDiscount
} from "@/lib/api";

type DiscountType = "PERCENTAGE" | "FIXED";
type DiscountReason = "SCHOLARSHIP" | "SIBLING" | "PROMOTIONAL" | "STAFF" | "MANUAL";

interface Discount {
  id: string;
  code: string | null;
  name: string;
  type: DiscountType;
  value: number;
  reason: DiscountReason;
  description: string | null;
  active: boolean;
  createdAt: string;
}

const ACTIVE_FILTERS = ["All", "Active", "Inactive"] as const;

const REASONS: DiscountReason[] = ["SCHOLARSHIP", "SIBLING", "PROMOTIONAL", "STAFF", "MANUAL"];

const reasonLabel: Record<DiscountReason, string> = {
  SCHOLARSHIP: "Scholarship",
  SIBLING: "Sibling",
  PROMOTIONAL: "Promotional",
  STAFF: "Staff",
  MANUAL: "Manual"
};

const reasonTone: Record<DiscountReason, Tone> = {
  SCHOLARSHIP: "accent",
  SIBLING: "good",
  PROMOTIONAL: "warning",
  STAFF: "neutral",
  MANUAL: "neutral"
};

const formatValue = (d: Pick<Discount, "type" | "value">) =>
  d.type === "PERCENTAGE" ? `${Number(d.value)}%` : `$${Number(d.value).toLocaleString()}`;

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof ACTIVE_FILTERS)[number]>("All");

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formType, setFormType] = useState<DiscountType>("PERCENTAGE");
  const [formValue, setFormValue] = useState("");
  const [formReason, setFormReason] = useState<DiscountReason>("MANUAL");
  const [formDescription, setFormDescription] = useState("");
  const [formActive, setFormActive] = useState(true);

  const loadData = () => {
    setLoading(true);
    const activeParam =
      activeFilter === "All" ? undefined : activeFilter === "Active" ? "true" : "false";

    fetchDiscounts(searchQuery || undefined, activeParam)
      .then(res => setDiscounts(res.items as Discount[]))
      .catch(err => console.error("Failed to load discounts", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const resetForm = () => {
    setFormName("");
    setFormCode("");
    setFormType("PERCENTAGE");
    setFormValue("");
    setFormReason("MANUAL");
    setFormDescription("");
    setFormActive(true);
    setEditing(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (d: Discount) => {
    setEditing(d);
    setFormName(d.name);
    setFormCode(d.code || "");
    setFormType(d.type);
    setFormValue(String(d.value));
    setFormReason(d.reason);
    setFormDescription(d.description || "");
    setFormActive(d.active);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formValue) return;

    const dto = {
      name: formName,
      code: formCode || undefined,
      type: formType,
      value: Number(formValue),
      reason: formReason,
      description: formDescription || undefined,
      active: formActive
    };

    setActionLoading(true);
    const req = editing ? updateDiscount(editing.id, dto) : createDiscount(dto);
    req
      .then(() => {
        setShowModal(false);
        resetForm();
        Swal.fire({
          title: editing ? "Discount Updated" : "Discount Created",
          text: editing
            ? "The discount has been updated successfully."
            : "A new discount has been created successfully.",
          icon: "success",
          confirmButtonColor: "#386FA4",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
        loadData();
      })
      .catch(err => {
        Swal.fire({ title: "Failed", text: err.message || "Failed to save discount.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  const handleDeactivate = (d: Discount) => {
    Swal.fire({
      title: "Deactivate Discount?",
      text: `Are you sure you want to deactivate the discount "${d.name}"? It will no longer be applicable.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Deactivate",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        deleteDiscount(d.id)
          .then(() => {
            Swal.fire({ title: "Deactivated", text: "Discount deactivated successfully.", icon: "success", confirmButtonColor: "#386FA4" });
            loadData();
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: err.message || "Failed to deactivate discount.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  return (
    <>
      <Topbar title="Discounts" subtitle="Manage reusable discount codes and fee reductions for student billing" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        {/* Empty-state prompt */}
        {discounts.length === 0 && !loading && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-hairline bg-surface shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/10 p-2.5 rounded-xl">
                <Tag className="size-5 text-amber-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink">No Discounts Found</h4>
                <p className="text-xs text-ink-3">Create your first discount to start applying fee reductions on invoices.</p>
              </div>
            </div>
            <Button
              onClick={handleOpenCreate}
              className="bg-accent hover:shadow-lg text-white font-bold px-4 py-2 text-xs rounded-xl"
            >
              <Plus className="size-3.5 mr-1.5" />
              Create Discount
            </Button>
          </div>
        )}

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full relative">
              <Search className="size-4 text-ink-3 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search discount name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3 text-xs text-ink focus:outline-none focus:border-accent"
              />
              <Button type="submit" variant="ghost" className="bg-surface border border-hairline size-10 flex items-center justify-center rounded-xl">
                <Filter className="size-4 text-ink-3" />
              </Button>
            </form>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                onClick={handleOpenCreate}
                className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
              >
                <Plus className="size-4" />
                Create Discount
              </Button>
            </div>
          </div>

          {/* Quick filters */}
          <div className="flex items-center gap-2.5 flex-wrap text-xs font-bold text-ink-3 select-none">
            <div className="flex items-center gap-1.5">
              <span>Status:</span>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as (typeof ACTIVE_FILTERS)[number])}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                {ACTIVE_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <div className="overflow-x-auto min-h-[300px]">
              {loading ? (
                <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                  <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                  Loading discounts...
                </div>
              ) : discounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                  <ClipboardList className="size-8 text-ink-3/40" />
                  <p className="font-bold text-sm">No discounts found.</p>
                  <p className="text-xs">Create a discount to start applying fee reductions.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Code</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Value</th>
                      <th className="px-6 py-4">Reason</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {discounts.map(d => (
                      <tr key={d.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-ink text-xs">
                          {d.name}
                          {d.description && (
                            <p className="text-[10px] font-medium text-ink-3 mt-0.5 max-w-[240px] truncate">{d.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {d.code ? (
                            <span className="px-2 py-0.5 rounded-md bg-surface-3 border border-hairline text-[11px] font-mono font-bold text-accent uppercase">
                              {d.code}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-3 font-semibold">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                          <span className="inline-flex items-center gap-1">
                            {d.type === "PERCENTAGE" ? <Percent className="size-3" /> : <DollarSign className="size-3" />}
                            {d.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-extrabold text-ink-2 text-xs">
                          {formatValue(d)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={reasonTone[d.reason]}>{reasonLabel[d.reason]}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={d.active ? "good" : "neutral"}>{d.active ? "Active" : "Inactive"}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(d)}
                              className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                              title="Edit Discount"
                            >
                              <Edit2 className="size-4" />
                            </Button>
                            {d.active && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeactivate(d)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Deactivate Discount"
                              >
                                <Ban className="size-4" />
                              </Button>
                            )}
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
      </div>

      {/* ─── MODAL: Create / Edit Discount ─────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <h3 className="font-bold text-ink text-sm">{editing ? "Edit Discount" : "Create New Discount"}</h3>
              <button
                onClick={() => setShowModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Discount Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. New Year Promo, Sibling Discount"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. NY2026"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Reason</label>
                  <select
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value as DiscountReason)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {REASONS.map(r => <option key={r} value={r}>{reasonLabel[r]}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Type</label>
                  <div className="flex items-center gap-2 h-10">
                    <button
                      type="button"
                      onClick={() => setFormType("PERCENTAGE")}
                      className={cn(
                        "flex-1 h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors",
                        formType === "PERCENTAGE"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-hairline bg-surface text-ink-3 hover:bg-surface-3"
                      )}
                    >
                      <Percent className="size-3.5" /> Percentage
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType("FIXED")}
                      className={cn(
                        "flex-1 h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors",
                        formType === "FIXED"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-hairline bg-surface text-ink-3 hover:bg-surface-3"
                      )}
                    >
                      <DollarSign className="size-3.5" /> Fixed
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">
                    Value {formType === "PERCENTAGE" ? "(%)" : "($)"}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder={formType === "PERCENTAGE" ? "e.g. 10" : "e.g. 50"}
                      value={formValue}
                      onChange={(e) => setFormValue(e.target.value)}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 pr-9 text-sm text-ink focus:outline-none focus:border-accent font-semibold"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-3 pointer-events-none">
                      {formType === "PERCENTAGE" ? "%" : "USD"}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Description (Optional)</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Internal notes about eligibility, validity, etc..."
                  rows={2}
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                />
                <span className="text-xs font-bold text-ink-2">Active (available for use on invoices)</span>
              </label>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  {editing ? "Save Changes" : "Create Discount"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
