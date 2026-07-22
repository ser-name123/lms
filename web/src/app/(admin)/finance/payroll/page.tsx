"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Users,
  Edit2,
  Trash2,
  X,
  RefreshCw,
  CreditCard,
  Sparkles,
  Info,
  DollarSign,
  Briefcase,
  ClipboardList,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchPayrollConfigs,
  upsertPayrollConfig,
  deletePayrollConfig,
  generatePayroll,
  type PayrollModel,
} from "@/lib/api";

type StaffRow = {
  user: { id: string; firstName: string; lastName: string; email: string; role: string };
  baseSalary: number | null;
  hourlyRate: number | null;
  config: {
    id: string;
    userId: string;
    model: PayrollModel;
    baseSalary: number | null;
    perClassRate: number | null;
    perHourRate: number | null;
    perStudentRate: number | null;
    standardBonus: number | null;
    active: boolean;
  } | null;
};

const MODELS: PayrollModel[] = ["FIXED", "PER_CLASS", "PER_HOUR", "PER_STUDENT", "HYBRID"];

const modelLabel: Record<PayrollModel, string> = {
  FIXED: "Fixed Salary",
  PER_CLASS: "Per Class",
  PER_HOUR: "Per Hour",
  PER_STUDENT: "Per Student",
  HYBRID: "Hybrid",
};

const modelTone: Record<PayrollModel, Tone> = {
  FIXED: "accent",
  PER_CLASS: "good",
  PER_HOUR: "warning",
  PER_STUDENT: "neutral",
  HYBRID: "critical",
};

export default function PayrollConfigPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit payroll modal
  const [editRow, setEditRow] = useState<StaffRow | null>(null);
  const [formModel, setFormModel] = useState<PayrollModel>("FIXED");
  const [formBaseSalary, setFormBaseSalary] = useState(0);
  const [formPerClassRate, setFormPerClassRate] = useState(0);
  const [formPerHourRate, setFormPerHourRate] = useState(0);
  const [formPerStudentRate, setFormPerStudentRate] = useState(0);
  const [formStandardBonus, setFormStandardBonus] = useState(0);
  const [formActive, setFormActive] = useState(true);

  // Generate payroll run modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [runMonth, setRunMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const loadConfigs = () => {
    setLoading(true);
    fetchPayrollConfigs()
      .then((res) => setRows(res.items || []))
      .catch((err) => console.error("Failed to load payroll configs", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleOpenEdit = (row: StaffRow) => {
    setEditRow(row);
    const c = row.config;
    setFormModel(c?.model ?? "FIXED");
    setFormBaseSalary(Number(c?.baseSalary ?? row.baseSalary ?? 0));
    setFormPerClassRate(Number(c?.perClassRate ?? 0));
    setFormPerHourRate(Number(c?.perHourRate ?? row.hourlyRate ?? 0));
    setFormPerStudentRate(Number(c?.perStudentRate ?? 0));
    setFormStandardBonus(Number(c?.standardBonus ?? 0));
    setFormActive(c?.active ?? true);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRow) return;

    const dto: Record<string, any> = {
      userId: editRow.user.id,
      model: formModel,
      standardBonus: formStandardBonus,
      active: formActive,
    };
    if (formModel === "FIXED" || formModel === "HYBRID") dto.baseSalary = formBaseSalary;
    if (formModel === "PER_CLASS" || formModel === "HYBRID") dto.perClassRate = formPerClassRate;
    if (formModel === "PER_HOUR" || formModel === "HYBRID") dto.perHourRate = formPerHourRate;
    if (formModel === "PER_STUDENT" || formModel === "HYBRID") dto.perStudentRate = formPerStudentRate;

    setActionLoading(true);
    upsertPayrollConfig(dto)
      .then(() => {
        setEditRow(null);
        Swal.fire({
          title: "Payroll Configured",
          text: `Payroll model for ${editRow.user.firstName} ${editRow.user.lastName} saved.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
          confirmButtonColor: "#386FA4",
        });
        loadConfigs();
      })
      .catch((err) => {
        Swal.fire({ title: "Save Failed", text: err.message || "Could not save payroll config.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  const handleDeleteConfig = (row: StaffRow) => {
    if (!row.config) return;
    Swal.fire({
      title: "Remove Payroll Config?",
      text: `Reset payroll configuration for ${row.user.firstName} ${row.user.lastName}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Remove",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
    }).then((result) => {
      if (!result.isConfirmed) return;
      setActionLoading(true);
      deletePayrollConfig(row.user.id)
        .then(() => {
          Swal.fire({ title: "Removed", text: "Payroll configuration reset.", icon: "success", confirmButtonColor: "#386FA4" });
          loadConfigs();
        })
        .catch((err) => {
          Swal.fire({ title: "Error", text: err.message || "Failed to remove config.", icon: "error" });
        })
        .finally(() => setActionLoading(false));
    });
  };

  const handleGenerateRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!runMonth) return;

    const [year, month] = runMonth.split("-");
    const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString();
    const endDate = new Date(Number(year), Number(month), 0).toISOString();

    setActionLoading(true);
    generatePayroll({ billingPeriodStart: startDate, billingPeriodEnd: endDate })
      .then((res) => {
        setShowRunModal(false);
        Swal.fire({
          title: "Payroll Run Generated",
          text: `Generated ${res.generatedCount} draft payout${res.generatedCount === 1 ? "" : "s"} for ${new Date(startDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}. Review and issue payslips on the Salary & Wages page.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
          confirmButtonColor: "#386FA4",
        });
      })
      .catch((err) => {
        Swal.fire({ title: "Generation Failed", text: err.message || "Could not generate payroll run.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  const configuredCount = rows.filter((r) => r.config).length;

  return (
    <>
      <Topbar title="Payroll Configuration" subtitle="Define staff salary models, rates, and generate monthly payroll runs" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        {/* Info note */}
        <div className="p-4 bg-accent/5 border border-accent/15 rounded-2xl flex gap-3 text-xs">
          <Info className="size-5 text-accent shrink-0 mt-0.5" />
          <div className="text-ink-2">
            <p className="font-bold mb-1">How payroll runs work</p>
            <p className="leading-relaxed">
              Configure each staff member&apos;s salary model and rates below. When you run a monthly payroll,
              draft payouts are generated and appear on the{" "}
              <span className="font-bold text-ink">Salary &amp; Wages (/payouts)</span> page for approval — where
              you can adjust, approve, disburse payments, and issue payslips.
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 select-none">
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <CardBody className="p-5 flex items-center gap-4">
              <div className="bg-accent/10 p-2.5 rounded-xl text-accent">
                <Users className="size-6" />
              </div>
              <div>
                <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Staff Members</span>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight leading-none mt-1">{rows.length}</h2>
              </div>
            </CardBody>
          </Card>
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <CardBody className="p-5 flex items-center gap-4">
              <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-500">
                <Briefcase className="size-6" />
              </div>
              <div>
                <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Payroll Configured</span>
                <h2 className="text-2xl font-extrabold text-ink tracking-tight leading-none mt-1">{configuredCount}</h2>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-ink">Staff Payroll Models</h3>
            <p className="text-xs text-ink-3 mt-0.5">Set the salary calculation model per employee.</p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowRunModal(true)}
            className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
          >
            <CreditCard className="size-4" />
            Generate Payroll Run
          </Button>
        </div>

        {/* Staff table */}
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto min-h-[300px]">
            {loading ? (
              <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                Loading staff payroll configuration...
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                <ClipboardList className="size-8 text-ink-3/40" />
                <p className="font-bold text-sm">No staff members found.</p>
                <p className="text-xs">Add staff before configuring payroll models.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                    <th className="px-6 py-4">Staff Name</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Base Salary</th>
                    <th className="px-6 py-4">Hourly Rate</th>
                    <th className="px-6 py-4">Payroll Model</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((row) => (
                    <tr key={row.user.id} className="hover:bg-surface-2/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-accent/10 flex items-center justify-center font-bold text-accent text-xs select-none">
                            {row.user.firstName?.[0]}
                            {row.user.lastName?.[0]}
                          </div>
                          <div>
                            <p className="font-bold text-ink text-xs">
                              {row.user.firstName} {row.user.lastName}
                            </p>
                            <p className="text-[10px] text-ink-3">{row.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                        {row.user.role.replace(/_/g, " ")}
                      </td>
                      <td className="px-6 py-4 font-bold text-ink-2 text-xs">
                        {row.baseSalary != null ? `$${Number(row.baseSalary).toLocaleString()}` : "—"}
                      </td>
                      <td className="px-6 py-4 font-bold text-ink-2 text-xs">
                        {row.hourlyRate != null ? `$${Number(row.hourlyRate).toLocaleString()}/hr` : "—"}
                      </td>
                      <td className="px-6 py-4">
                        {row.config ? (
                          <div className="flex items-center gap-2">
                            <Badge tone={modelTone[row.config.model]}>{modelLabel[row.config.model]}</Badge>
                            {!row.config.active && (
                              <span className="text-[10px] font-bold text-ink-3 uppercase">Inactive</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-ink-3">Not configured</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(row)}
                            className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                            title="Edit Payroll"
                          >
                            <Edit2 className="size-4" />
                          </Button>
                          {row.config && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteConfig(row)}
                              className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                              title="Remove Config"
                            >
                              <Trash2 className="size-4" />
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

      {/* ─── MODAL: Edit Payroll ─────────────────────────────────────────────── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div className="flex items-center gap-2">
                <DollarSign className="size-5 text-accent" />
                <h3 className="font-bold text-ink text-sm">
                  Payroll: {editRow.user.firstName} {editRow.user.lastName}
                </h3>
              </div>
              <button
                onClick={() => setEditRow(null)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1.5">Payroll Model</label>
                <select
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value as PayrollModel)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {modelLabel[m]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rate fields — shown only for the relevant model */}
              {(formModel === "FIXED" || formModel === "HYBRID") && (
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Base Salary (USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formBaseSalary}
                    onChange={(e) => setFormBaseSalary(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              {(formModel === "PER_CLASS" || formModel === "HYBRID") && (
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Per Class Rate (USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formPerClassRate}
                    onChange={(e) => setFormPerClassRate(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              {(formModel === "PER_HOUR" || formModel === "HYBRID") && (
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Per Hour Rate (USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formPerHourRate}
                    onChange={(e) => setFormPerHourRate(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              {(formModel === "PER_STUDENT" || formModel === "HYBRID") && (
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Per Student Rate (USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formPerStudentRate}
                    onChange={(e) => setFormPerStudentRate(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Standard Bonus (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formStandardBonus}
                  onChange={(e) => setFormStandardBonus(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent text-emerald-500 font-semibold"
                />
              </div>

              <label className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-hairline bg-surface-2/50 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-ink">Active</span>
                  <p className="text-[10px] text-ink-3">Include this staff member in payroll runs.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                />
              </label>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
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
                  Save Payroll Config
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Generate Payroll Run ─────────────────────────────────────── */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div className="flex items-center gap-2">
                <CreditCard className="size-5 text-accent animate-pulse" />
                <h3 className="font-bold text-ink text-sm">Generate Monthly Payroll Run</h3>
              </div>
              <button
                onClick={() => setShowRunModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateRun} className="p-6 space-y-4">
              <div className="p-4 bg-accent/5 border border-accent/15 rounded-2xl flex gap-3 text-xs">
                <Sparkles className="size-5 text-accent shrink-0 mt-0.5" />
                <div className="text-ink-2">
                  <p className="font-bold mb-1">Draft payouts</p>
                  <p className="leading-relaxed">
                    This aggregates each active staff member&apos;s configured payroll model for the selected month.
                    Generated payouts appear on the <span className="font-bold text-ink">Salary &amp; Wages (/payouts)</span> page
                    for approval, where payslips can be issued.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1.5">Select Payroll Period</label>
                <input
                  type="month"
                  required
                  value={runMonth}
                  onChange={(e) => setRunMonth(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="border-t border-hairline pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
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
                  Generate Drafts
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
