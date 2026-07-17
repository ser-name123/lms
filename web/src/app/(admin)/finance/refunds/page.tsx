"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  X,
  Filter,
  Loader2,
  ClipboardList,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Undo2,
  CheckCircle2,
  XCircle,
  Clock,
  Banknote,
  Send
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchRefunds,
  createRefund,
  reviewRefund,
  processRefund
} from "@/lib/api";

type RefundStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "PROCESSED";
type RefundMethod = "BANK_TRANSFER" | "UPI" | "CARD" | "CASH";

interface Refund {
  id: string;
  amount: number;
  currency: string;
  reason: string | null;
  method: RefundMethod | null;
  status: RefundStatus;
  requestedByName: string | null;
  approvedByName: string | null;
  reviewNotes: string | null;
  processedAt: string | null;
  createdAt: string;
  invoiceId: string | null;
  paymentId: string | null;
  studentId: string | null;
  student: { name: string; code: string } | null;
}

const STATUSES = ["All", "REQUESTED", "APPROVED", "REJECTED", "PROCESSED"] as const;
const METHODS: RefundMethod[] = ["BANK_TRANSFER", "UPI", "CARD", "CASH"];

const statusLabel: Record<RefundStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PROCESSED: "Processed"
};

const statusTone: Record<RefundStatus, Tone> = {
  REQUESTED: "warning",
  APPROVED: "accent",
  REJECTED: "critical",
  PROCESSED: "good"
};

const methodLabel: Record<RefundMethod, string> = {
  BANK_TRANSFER: "Bank Transfer",
  UPI: "UPI",
  CARD: "Card",
  CASH: "Cash"
};

const formatMoney = (amount: number, currency: string) => {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${Number(amount).toLocaleString()}${symbol ? "" : ` ${currency}`}`;
};

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [formInvoiceId, setFormInvoiceId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formMethod, setFormMethod] = useState<RefundMethod>("BANK_TRANSFER");

  const loadData = () => {
    setLoading(true);
    fetchRefunds({
      page: currentPage,
      limit: pageSize,
      status: statusFilter === "All" ? undefined : statusFilter,
      search: searchQuery || undefined
    })
      .then(res => {
        setRefunds(res.items as Refund[]);
        setTotalItems(res.meta.total);
        setTotalPages(res.meta.totalPages);
      })
      .catch(err => console.error("Failed to load refunds", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadData();
  };

  const counts = refunds.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<RefundStatus, number>
  );

  const handleOpenCreate = () => {
    setFormInvoiceId("");
    setFormAmount("");
    setFormReason("");
    setFormMethod("BANK_TRANSFER");
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAmount || !formReason) return;

    setActionLoading(true);
    createRefund({
      invoiceId: formInvoiceId || undefined,
      amount: Number(formAmount),
      reason: formReason,
      method: formMethod
    })
      .then(() => {
        setShowModal(false);
        Swal.fire({
          title: "Refund Requested",
          text: "The refund request has been created successfully.",
          icon: "success",
          confirmButtonColor: "#386FA4",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
        setCurrentPage(1);
        loadData();
      })
      .catch(err => {
        Swal.fire({ title: "Failed", text: err.message || "Failed to create refund.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  const handleApprove = (r: Refund) => {
    Swal.fire({
      title: "Approve Refund?",
      text: `Approve the refund of ${formatMoney(r.amount, r.currency)}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Approve",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#10b981",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        reviewRefund(r.id, { status: "APPROVED" })
          .then(() => {
            Swal.fire({ title: "Approved", text: "Refund approved successfully.", icon: "success", confirmButtonColor: "#386FA4" });
            loadData();
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: err.message || "Failed to approve refund.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  const handleReject = (r: Refund) => {
    Swal.fire({
      title: "Reject Refund?",
      input: "textarea",
      inputLabel: "Reason for rejection",
      inputPlaceholder: "Explain why this refund request is being rejected...",
      showCancelButton: true,
      confirmButtonText: "Reject Request",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      inputValidator: (value) => {
        if (!value || value.trim().length < 3) {
          return "Please provide a brief reason for the rejection.";
        }
      }
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        reviewRefund(r.id, { status: "REJECTED", reviewNotes: result.value })
          .then(() => {
            Swal.fire({ title: "Rejected", text: "Refund request rejected.", icon: "success", confirmButtonColor: "#386FA4" });
            loadData();
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: err.message || "Failed to reject refund.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  const handleProcess = (r: Refund) => {
    Swal.fire({
      title: "Process Refund?",
      text: `Mark the refund of ${formatMoney(r.amount, r.currency)} as processed and disbursed?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Process Refund",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#10b981",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        processRefund(r.id)
          .then(() => {
            Swal.fire({ title: "Processed", text: "Refund marked as processed.", icon: "success", confirmButtonColor: "#386FA4" });
            loadData();
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: err.message || "Failed to process refund.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  return (
    <>
      <Topbar title="Refunds" subtitle="Review, approve, and process student fee refund requests" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        {/* Status summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 select-none">
          {([
            { key: "REQUESTED" as const, icon: Clock, color: "bg-amber-500/10 text-amber-500" },
            { key: "APPROVED" as const, icon: CheckCircle2, color: "bg-accent/10 text-accent" },
            { key: "REJECTED" as const, icon: XCircle, color: "bg-rose-500/10 text-rose-500" },
            { key: "PROCESSED" as const, icon: Banknote, color: "bg-emerald-500/10 text-emerald-500" }
          ]).map(({ key, icon: Icon, color }) => (
            <Card key={key} className="overflow-hidden border border-hairline bg-surface shadow-sm">
              <CardBody className="p-4 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", color)}>
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-lg font-extrabold text-ink leading-none">{counts[key] || 0}</p>
                  <p className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider mt-1">{statusLabel[key]}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full relative">
              <Search className="size-4 text-ink-3 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search student name, code, or reason..."
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
                New Refund
              </Button>
            </div>
          </div>

          {/* Quick filters */}
          <div className="flex items-center gap-2.5 flex-wrap text-xs font-bold text-ink-3 select-none">
            <div className="flex items-center gap-1.5">
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as (typeof STATUSES)[number]); setCurrentPage(1); }}
                className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none cursor-pointer"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All" : statusLabel[s as RefundStatus]}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <div className="overflow-x-auto min-h-[300px]">
              {loading ? (
                <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                  <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                  Loading refunds...
                </div>
              ) : refunds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                  <ClipboardList className="size-8 text-ink-3/40" />
                  <p className="font-bold text-sm">No refunds found.</p>
                  <p className="text-xs">Create a refund request to get started.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4">Reason</th>
                      <th className="px-6 py-4">Requested By</th>
                      <th className="px-6 py-4">Created</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {refunds.map(r => (
                      <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4">
                          {r.student ? (
                            <>
                              <p className="font-bold text-ink text-xs">{r.student.name}</p>
                              <p className="text-[10px] font-mono font-bold text-ink-3 uppercase mt-0.5">{r.student.code}</p>
                            </>
                          ) : (
                            <span className="text-xs text-ink-3 font-semibold">General</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-extrabold text-ink-2 text-xs">
                          {formatMoney(r.amount, r.currency)}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-ink-2">
                          {r.method ? methodLabel[r.method] : "—"}
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-ink-2 max-w-[220px]">
                          <span className="line-clamp-2">{r.reason || "—"}</span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-ink-2">
                          {r.requestedByName || "—"}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-ink-3">
                          {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {r.status === "REQUESTED" ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleApprove(r)}
                                className="rounded-lg text-ink-3 hover:text-emerald-500 hover:bg-surface-3 size-8"
                                title="Approve Refund"
                              >
                                <CheckCircle2 className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReject(r)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Reject Refund"
                              >
                                <XCircle className="size-4" />
                              </Button>
                            </div>
                          ) : r.status === "APPROVED" ? (
                            <div className="flex justify-end">
                              <Button
                                onClick={() => handleProcess(r)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-8 px-3.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
                              >
                                <Send className="size-3.5" />
                                Process Refund
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">
                              {r.status === "PROCESSED" ? "Completed" : "Reviewed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {refunds.length > 0 && (
              <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 flex-wrap gap-4 select-none">
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="text-xs text-ink-3 font-medium">
                    Showing <span className="tnum font-bold text-ink-2">{refunds.length}</span> of{" "}
                    <span className="tnum font-bold text-ink-2">{totalItems}</span> refunds
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

      {/* ─── MODAL: New Refund ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div className="flex items-center gap-2">
                <Undo2 className="size-5 text-accent" />
                <h3 className="font-bold text-ink text-sm">New Refund Request</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="size-8 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Invoice ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Link to an invoice, or leave blank for a general refund"
                  value={formInvoiceId}
                  onChange={(e) => setFormInvoiceId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Amount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="e.g. 150"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Refund Method</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as RefundMethod)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {METHODS.map(m => <option key={m} value={m}>{methodLabel[m]}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Reason</label>
                <textarea
                  required
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Explain the reason for this refund request..."
                  rows={3}
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:border-accent resize-none"
                />
              </div>

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
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
