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
  GraduationCap,
  CheckCircle2,
  XCircle,
  Clock,
  BadgeCheck
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchScholarships,
  createScholarship,
  reviewScholarship,
  fetchStudents,
  type StudentProfile
} from "@/lib/api";

type ScholarshipType = "PERCENTAGE" | "FIXED";
type ScholarshipStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "APPLIED";

interface Scholarship {
  id: string;
  name: string;
  type: ScholarshipType;
  value: number;
  reason: string | null;
  status: ScholarshipStatus;
  requestedByName: string | null;
  reviewNotes: string | null;
  createdAt: string;
  student: {
    studentCode: string;
    parentEmail: string | null;
    user: { firstName: string; lastName: string; email: string };
  } | null;
}

const STATUSES = ["All", "REQUESTED", "APPROVED", "REJECTED", "APPLIED"] as const;

const statusLabel: Record<ScholarshipStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  APPLIED: "Applied"
};

const statusTone: Record<ScholarshipStatus, Tone> = {
  REQUESTED: "warning",
  APPROVED: "good",
  REJECTED: "critical",
  APPLIED: "accent"
};

const formatValue = (s: Pick<Scholarship, "type" | "value">) =>
  s.type === "PERCENTAGE" ? `${Number(s.value)}%` : `$${Number(s.value).toLocaleString()}`;

export default function ScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
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
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [formStudentId, setFormStudentId] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<ScholarshipType>("PERCENTAGE");
  const [formValue, setFormValue] = useState("");
  const [formReason, setFormReason] = useState("");

  const loadData = () => {
    setLoading(true);
    fetchScholarships({
      page: currentPage,
      limit: pageSize,
      status: statusFilter === "All" ? undefined : statusFilter,
      search: searchQuery || undefined
    })
      .then(res => {
        setScholarships(res.items as Scholarship[]);
        setTotalItems(res.meta.total);
        setTotalPages(res.meta.totalPages);
      })
      .catch(err => console.error("Failed to load scholarships", err))
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

  // Status counts summary from the currently loaded page
  const counts = scholarships.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    },
    {} as Record<ScholarshipStatus, number>
  );

  const handleOpenCreate = () => {
    setFormStudentId("");
    setFormName("");
    setFormType("PERCENTAGE");
    setFormValue("");
    setFormReason("");
    setShowModal(true);

    if (students.length === 0) {
      setStudentsLoading(true);
      fetchStudents({ page: 1, limit: 100 })
        .then(res => setStudents(res.items))
        .catch(err => console.error("Failed to load students", err))
        .finally(() => setStudentsLoading(false));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStudentId || !formName || !formValue) return;

    setActionLoading(true);
    createScholarship({
      studentId: formStudentId,
      name: formName,
      type: formType,
      value: Number(formValue),
      reason: formReason || undefined
    })
      .then(() => {
        setShowModal(false);
        Swal.fire({
          title: "Scholarship Requested",
          text: "The scholarship request has been created successfully.",
          icon: "success",
          confirmButtonColor: "#386FA4",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
        setCurrentPage(1);
        loadData();
      })
      .catch(err => {
        Swal.fire({ title: "Failed", text: err.message || "Failed to create scholarship.", icon: "error" });
      })
      .finally(() => setActionLoading(false));
  };

  const handleApprove = (s: Scholarship) => {
    Swal.fire({
      title: "Approve Scholarship?",
      text: `Approve the "${s.name}" scholarship (${formatValue(s)})?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Approve",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#10b981",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    }).then(result => {
      if (result.isConfirmed) {
        setActionLoading(true);
        reviewScholarship(s.id, { status: "APPROVED" })
          .then(() => {
            Swal.fire({ title: "Approved", text: "Scholarship approved successfully.", icon: "success", confirmButtonColor: "#386FA4" });
            loadData();
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: err.message || "Failed to approve scholarship.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  const handleReject = (s: Scholarship) => {
    Swal.fire({
      title: "Reject Scholarship?",
      input: "textarea",
      inputLabel: "Reason for rejection",
      inputPlaceholder: "Explain why this scholarship request is being rejected...",
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
        reviewScholarship(s.id, { status: "REJECTED", reviewNotes: result.value })
          .then(() => {
            Swal.fire({ title: "Rejected", text: "Scholarship request rejected.", icon: "success", confirmButtonColor: "#386FA4" });
            loadData();
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: err.message || "Failed to reject scholarship.", icon: "error" });
          })
          .finally(() => setActionLoading(false));
      }
    });
  };

  return (
    <>
      <Topbar title="Scholarships" subtitle="Review and manage student scholarship requests and fee waivers" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        {/* Status summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 select-none">
          {([
            { key: "REQUESTED" as const, icon: Clock, color: "bg-amber-500/10 text-amber-500" },
            { key: "APPROVED" as const, icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-500" },
            { key: "REJECTED" as const, icon: XCircle, color: "bg-rose-500/10 text-rose-500" },
            { key: "APPLIED" as const, icon: BadgeCheck, color: "bg-blue-500/10 text-blue-500" }
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
                placeholder="Search student name, code, or scholarship..."
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
                New Scholarship
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
                {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All" : statusLabel[s as ScholarshipStatus]}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
            <div className="overflow-x-auto min-h-[300px]">
              {loading ? (
                <div className="flex justify-center items-center py-20 text-sm font-bold text-ink-3">
                  <Loader2 className="size-5 animate-spin mr-2 text-accent" />
                  Loading scholarships...
                </div>
              ) : scholarships.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-ink-3 gap-2">
                  <ClipboardList className="size-8 text-ink-3/40" />
                  <p className="font-bold text-sm">No scholarships found.</p>
                  <p className="text-xs">Create a scholarship request to get started.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 select-none text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Scholarship</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Value</th>
                      <th className="px-6 py-4">Requested By</th>
                      <th className="px-6 py-4">Created</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {scholarships.map(s => (
                      <tr key={s.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4">
                          {s.student ? (
                            <>
                              <p className="font-bold text-ink text-xs">
                                {s.student.user.firstName} {s.student.user.lastName}
                              </p>
                              <p className="text-[10px] font-mono font-bold text-ink-3 uppercase mt-0.5">{s.student.studentCode}</p>
                            </>
                          ) : (
                            <span className="text-xs text-ink-3 font-semibold">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-bold text-ink text-xs">
                          {s.name}
                          {s.reason && (
                            <p className="text-[10px] font-medium text-ink-3 mt-0.5 max-w-[200px] truncate">{s.reason}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                          {s.type}
                        </td>
                        <td className="px-6 py-4 font-extrabold text-ink-2 text-xs">
                          {formatValue(s)}
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-ink-2">
                          {s.requestedByName || "—"}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-ink-3">
                          {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {s.status === "REQUESTED" ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleApprove(s)}
                                className="rounded-lg text-ink-3 hover:text-emerald-500 hover:bg-surface-3 size-8"
                                title="Approve Scholarship"
                              >
                                <CheckCircle2 className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReject(s)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Reject Scholarship"
                              >
                                <XCircle className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">Reviewed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {scholarships.length > 0 && (
              <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 flex-wrap gap-4 select-none">
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="text-xs text-ink-3 font-medium">
                    Showing <span className="tnum font-bold text-ink-2">{scholarships.length}</span> of{" "}
                    <span className="tnum font-bold text-ink-2">{totalItems}</span> scholarships
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

      {/* ─── MODAL: New Scholarship ────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div className="flex items-center gap-2">
                <GraduationCap className="size-5 text-accent" />
                <h3 className="font-bold text-ink text-sm">New Scholarship Request</h3>
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
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Student</label>
                <select
                  value={formStudentId}
                  required
                  onChange={(e) => setFormStudentId(e.target.value)}
                  disabled={studentsLoading}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="">{studentsLoading ? "Loading students..." : "Select a student"}</option>
                  {students.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.user.firstName} {st.user.lastName} ({st.studentCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Scholarship Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Merit Scholarship, Financial Aid"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as ScholarshipType)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-sm text-ink focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed</option>
                  </select>
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
                      placeholder={formType === "PERCENTAGE" ? "e.g. 25" : "e.g. 100"}
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
                <label className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Reason (Optional)</label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Justification for this scholarship request..."
                  rows={2}
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
