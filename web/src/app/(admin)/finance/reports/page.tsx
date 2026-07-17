"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileBarChart,
  Loader2,
  Settings2,
  RefreshCw,
  ClipboardList,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { fetchFinanceReport, fetchFinanceConfig, updateFinanceConfig } from "@/lib/api";

const REPORT_TYPES: { label: string; type: string }[] = [
  { label: "Collection", type: "collection" },
  { label: "Outstanding", type: "outstanding" },
  { label: "Discounts", type: "discount" },
  { label: "Scholarships", type: "scholarship" },
  { label: "Refunds", type: "refund" },
  { label: "Payroll", type: "payroll" },
  { label: "Expenses", type: "expense" },
  { label: "Profit & Loss", type: "pnl" },
  { label: "Paid Students", type: "paid-students" },
  { label: "Pending Students", type: "pending-students" },
  { label: "Overdue Students", type: "overdue-students" },
  { label: "Top Courses", type: "top-courses" },
  { label: "Country Revenue", type: "country-revenue" },
];

interface FinanceReport {
  type: string;
  columns: string[];
  rows: Record<string, any>[];
  summary: Record<string, any>;
}

interface FinanceConfig {
  currency: string;
  taxEnabled: boolean;
  taxPct: number;
  reminderDaysBefore: number;
  overdueReminders: boolean;
  autoInvoice: boolean;
  salaryDayOfMonth: number;
}

// Heuristics to prettify cell values
const MONEY_KEYS = /(amount|total|revenue|balance|paid|pending|outstanding|profit|expense|fee|fees|refund|discount|net|gross|salary|payroll|value)/i;
const DATE_KEYS = /(date|at|issued|due|created|updated|period)/i;

function isIsoDate(v: any): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(v);
}

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function FinanceReportsPage() {
  const router = useRouter();
  const [reportType, setReportType] = useState<string>("collection");
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings state
  const [config, setConfig] = useState<FinanceConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const currency = config?.currency ?? report?.summary?.currency ?? "$";

  const formatCell = (col: string, value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (isIsoDate(value) || (DATE_KEYS.test(col) && isIsoDate(value))) {
      return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    if (typeof value === "number" && MONEY_KEYS.test(col)) {
      return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }
    if (typeof value === "number") return value.toLocaleString("en-US");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const loadReport = (type: string) => {
    setLoading(true);
    fetchFinanceReport(type)
      .then((res) => setReport(res))
      .catch((err) => {
        console.error("Failed to load finance report", err);
        setReport(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReport(reportType);
  }, [reportType]);

  useEffect(() => {
    fetchFinanceConfig()
      .then((res) => setConfig(res as FinanceConfig))
      .catch((err) => console.error("Failed to load finance config", err))
      .finally(() => setConfigLoading(false));
  }, []);

  const handleExportCsv = () => {
    if (!report || report.rows.length === 0) return;

    const escape = (v: any) => {
      const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      const needsQuote = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuote ? `"${escaped}"` : escaped;
    };

    const header = report.columns.map((c) => escape(humanize(c))).join(",");
    const body = report.rows
      .map((row) => report.columns.map((col) => escape(row[col])).join(","))
      .join("\n");
    const csv = `${header}\n${body}`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `finance-${report.type}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    setSavingConfig(true);
    updateFinanceConfig({
      currency: config.currency,
      taxEnabled: config.taxEnabled,
      taxPct: Number(config.taxPct),
      reminderDaysBefore: Number(config.reminderDaysBefore),
      overdueReminders: config.overdueReminders,
      autoInvoice: config.autoInvoice,
      salaryDayOfMonth: Number(config.salaryDayOfMonth),
    })
      .then((res) => {
        setConfig(res as FinanceConfig);
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Finance settings saved!",
          showConfirmButton: false,
          timer: 2000,
        });
      })
      .catch((err) => {
        Swal.fire({
          title: "Save Failed",
          text: err?.message || "Could not update finance settings.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      })
      .finally(() => setSavingConfig(false));
  };

  const summaryEntries = report?.summary ? Object.entries(report.summary) : [];

  return (
    <>
      <Topbar title="Financial Reports" subtitle="Generate collection, payroll, and profitability reports plus finance settings" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        <button
          onClick={() => router.push("/finance")}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to Finance Dashboard
        </button>

        {/* Report controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-ink-3 select-none">
            <span>Report Type:</span>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink focus:outline-none focus:border-accent cursor-pointer"
            >
              {REPORT_TYPES.map((r) => (
                <option key={r.type} value={r.type}>{r.label}</option>
              ))}
            </select>
          </div>

          <Button
            variant="primary"
            onClick={handleExportCsv}
            disabled={!report || report.rows.length === 0}
            className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary badges */}
        {report && summaryEntries.length > 0 && (
          <div className="flex items-center gap-2.5 flex-wrap select-none">
            {summaryEntries.map(([key, value]) => (
              <div
                key={key}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-hairline bg-surface shadow-sm"
              >
                <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">{humanize(key)}</span>
                <span className="text-xs font-extrabold text-ink">
                  {typeof value === "number" && MONEY_KEYS.test(key)
                    ? `${currency} ${value.toLocaleString("en-US")}`
                    : typeof value === "number"
                      ? value.toLocaleString("en-US")
                      : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Report table */}
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="border-b border-hairline px-5 py-4 bg-surface-2/30 flex items-center gap-2">
            <FileBarChart className="size-4.5 text-accent" />
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
              {REPORT_TYPES.find((r) => r.type === reportType)?.label ?? reportType} Report
            </h4>
          </div>
          <div className="overflow-x-auto min-h-[280px]">
            {loading ? (
              <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                Generating report...
              </div>
            ) : !report || report.columns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                <ClipboardList className="size-8 text-ink-3/40" />
                <p className="font-bold text-sm">No report data available.</p>
                <p className="text-xs">Try selecting a different report type.</p>
              </div>
            ) : report.rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                <ClipboardList className="size-8 text-ink-3/40" />
                <p className="font-bold text-sm">No records for this report.</p>
                <p className="text-xs">There is no data matching this report at the moment.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                    {report.columns.map((col) => (
                      <th key={col} className="px-6 py-4 whitespace-nowrap">{humanize(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {report.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-surface-2/30 transition-colors">
                      {report.columns.map((col) => (
                        <td key={col} className="px-6 py-4 text-xs font-semibold text-ink-2 whitespace-nowrap">
                          {formatCell(col, row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {report && report.rows.length > 0 && (
            <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 select-none">
              <p className="text-xs text-ink-3 font-medium">
                Showing <span className="tnum font-bold text-ink-2">{report.rows.length}</span> records
              </p>
            </div>
          )}
        </Card>

        {/* Finance Settings */}
        <Card className="border border-hairline bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-hairline px-5 py-4 bg-surface-2/30 flex items-center gap-2">
            <Settings2 className="size-4.5 text-accent" />
            <div>
              <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Finance Settings</h4>
              <p className="text-[10px] text-ink-3 mt-0.5">Configure currency, tax, reminders, and payroll defaults</p>
            </div>
          </div>
          <CardBody className="p-6">
            {configLoading ? (
              <div className="flex justify-center items-center py-10 text-sm font-bold text-ink-3">
                <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                Loading settings...
              </div>
            ) : !config ? (
              <p className="text-xs font-bold text-ink-3 py-6 text-center">Finance settings could not be loaded.</p>
            ) : (
              <form onSubmit={handleSaveConfig} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Currency</label>
                    <input
                      type="text"
                      value={config.currency ?? ""}
                      onChange={(e) => setConfig({ ...config, currency: e.target.value })}
                      placeholder="e.g. USD or $"
                      className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Tax Percentage (%)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={config.taxPct ?? 0}
                      onChange={(e) => setConfig({ ...config, taxPct: Number(e.target.value) })}
                      disabled={!config.taxEnabled}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Reminder Days Before Due</label>
                    <input
                      type="number"
                      min="0"
                      value={config.reminderDaysBefore ?? 0}
                      onChange={(e) => setConfig({ ...config, reminderDaysBefore: Number(e.target.value) })}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Salary Day of Month</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={config.salaryDayOfMonth ?? 1}
                      onChange={(e) => setConfig({ ...config, salaryDayOfMonth: Number(e.target.value) })}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ToggleRow
                    label="Enable Tax"
                    description="Apply tax to generated invoices"
                    checked={!!config.taxEnabled}
                    onChange={(v) => setConfig({ ...config, taxEnabled: v })}
                  />
                  <ToggleRow
                    label="Overdue Reminders"
                    description="Auto-send reminders on overdue invoices"
                    checked={!!config.overdueReminders}
                    onChange={(v) => setConfig({ ...config, overdueReminders: v })}
                  />
                  <ToggleRow
                    label="Auto Invoice"
                    description="Generate invoices automatically per cycle"
                    checked={!!config.autoInvoice}
                    onChange={(v) => setConfig({ ...config, autoInvoice: v })}
                  />
                </div>

                <div className="border-t border-hairline pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="h-10 text-xs font-bold text-white bg-accent hover:opacity-90 hover:shadow-lg px-5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {savingConfig ? <RefreshCw className="size-3.5 animate-spin" /> : <Settings2 className="size-3.5" />}
                    Save Settings
                  </button>
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-hairline bg-surface-2/40 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
      />
      <div>
        <p className="text-xs font-bold text-ink">{label}</p>
        <p className="text-[10px] text-ink-3 font-medium mt-0.5">{description}</p>
      </div>
    </label>
  );
}
