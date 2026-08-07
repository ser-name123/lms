"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import {
  BarChart3, CalendarClock, CheckCircle2, FileText, History, Loader2, MessageCircleQuestion,
  Search, SlidersHorizontal, Users, X,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/store/auth";
import {
  CATEGORY_LABELS, EmptyLeaves, LEAVE_TYPE_LABELS, LeaveStatusBadge, PaidBadge, Stat,
  fmtDay, fmtWindow, toDateInput,
} from "@/components/leaves/shared";
import {
  approveLeave, cancelLeave, fetchLeaveAudit, fetchLeaveConfig, fetchLeaveImpacts, fetchLeaveStats,
  fetchLeaves, leaveDocumentUrl, rejectLeave, requestLeaveInfo,
  type LeaveConfig, type LeaveRequest, type LeaveStats,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Action failed",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const input =
  "h-9 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

const STATUSES = ["", "PENDING", "INFO_REQUESTED", "APPROVED", "DECLINED", "CANCELLED"];
const PAGE_SIZE = 20;

/**
 * §9.2 — the admin's decision queue.
 *
 * Approve carries the §9.3 paid/unpaid call and can approve a DIFFERENT window
 * from the one asked for; reject needs a reason; "ask a question" hands it back
 * to the requester without deciding either way.
 */
export default function LeavesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [stats, setStats] = useState<LeaveStats | null>(null);
  const [cfg, setCfg] = useState<LeaveConfig | null>(null);
  const [openImpacts, setOpenImpacts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [category, setCategory] = useState("");
  const [role, setRole] = useState("");
  const [paid, setPaid] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchLeaves({
        page, limit: PAGE_SIZE,
        search: search.trim() || undefined,
        status: status || undefined,
        category: category || undefined,
        role: role || undefined,
        paid: paid || undefined,
        sortBy: "date_desc",
      }).catch(() => null),
      fetchLeaveStats().catch(() => null),
      fetchLeaveConfig().catch(() => null),
      fetchLeaveImpacts("OPEN").catch(() => []),
    ])
      .then(([list, s, c, impacts]) => {
        setRows(list?.items ?? []);
        setPages(list?.meta.pages ?? 1);
        setTotal(list?.meta.total ?? 0);
        setStats(s);
        setCfg(c);
        setOpenImpacts(impacts.length);
      })
      .finally(() => setLoading(false));
  }, [page, search, status, category, role, paid]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Any filter change restarts at page one; staying on page 4 of a two-page
  // result shows an empty screen.
  useEffect(() => setPage(1), [search, status, category, role, paid]);

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      load();
      await Swal.fire({ title: message, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** §9.2 + §9.3 — approve, optionally over modified dates, paid or unpaid. */
  const doApprove = async (row: LeaveRequest) => {
    const defaultPaid = cfg ? cfg.paidByDefault.includes(row.leaveType) && row.leaveType !== "UNPAID" : true;
    const r = await Swal.fire({
      title: "Approve this request",
      html:
        `<p style="font-size:12px;text-align:left;margin-bottom:8px">${LEAVE_TYPE_LABELS[row.leaveType] ?? row.leaveType} · asked for ${row.totalDays} day(s)</p>` +
        `<label style="display:block;font-size:11px;text-align:left">From</label>` +
        `<input id="sw-from" type="date" class="swal2-input" value="${toDateInput(row.startDate)}">` +
        `<label style="display:block;font-size:11px;text-align:left">To</label>` +
        `<input id="sw-to" type="date" class="swal2-input" value="${toDateInput(row.endDate)}">` +
        `<label style="display:block;font-size:11px;text-align:left">Paid?</label>` +
        `<select id="sw-paid" class="swal2-input">` +
        `<option value="yes"${defaultPaid ? " selected" : ""}>Paid leave</option>` +
        `<option value="no"${defaultPaid ? "" : " selected"}>Unpaid — deduct from salary</option>` +
        `</select>` +
        `<input id="sw-notes" class="swal2-input" placeholder="Note (optional)">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Approve",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: () => {
        const from = (document.getElementById("sw-from") as HTMLInputElement)?.value;
        const to = (document.getElementById("sw-to") as HTMLInputElement)?.value;
        if (!from || !to) {
          Swal.showValidationMessage("Both dates are needed");
          return false;
        }
        if (to < from) {
          Swal.showValidationMessage("The end date cannot be before the start");
          return false;
        }
        return {
          isPaid: (document.getElementById("sw-paid") as HTMLSelectElement)?.value === "yes",
          // Sent only when actually changed, so an untouched approval does not
          // record a spurious "dates modified" against the admin.
          startDate: from === toDateInput(row.startDate) ? undefined : new Date(`${from}T00:00:00Z`).toISOString(),
          endDate: to === toDateInput(row.endDate) ? undefined : new Date(`${to}T00:00:00Z`).toISOString(),
          adminNotes: (document.getElementById("sw-notes") as HTMLInputElement)?.value || undefined,
        };
      },
    });
    if (!r.isConfirmed || !r.value) return;
    const isTeacher = row.user.role === "TEACHER";
    await act(
      () => approveLeave(row.id, r.value as never),
      isTeacher ? "Approved — the affected students are now in the coach's queue" : "Approved",
    );
  };

  const doReject = async (row: LeaveRequest) => {
    const r = await Swal.fire({
      title: "Reject this request",
      input: "textarea",
      inputPlaceholder: "Why? The requester will see this.",
      showCancelButton: true,
      confirmButtonText: "Reject",
      background: swalBg(),
      confirmButtonColor: "#ef4444",
      preConfirm: (v: string) => {
        if (!v?.trim()) {
          Swal.showValidationMessage("A reason is required");
          return false;
        }
        return v.trim();
      },
    });
    if (!r.isConfirmed || !r.value) return;
    await act(() => rejectLeave(row.id, String(r.value)), "Rejected");
  };

  const doAskInfo = async (row: LeaveRequest) => {
    const r = await Swal.fire({
      title: "Ask for more information",
      input: "textarea",
      inputPlaceholder: "What do you need to know?",
      showCancelButton: true,
      confirmButtonText: "Send",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: (v: string) => {
        if (!v?.trim()) {
          Swal.showValidationMessage("Write a question");
          return false;
        }
        return v.trim();
      },
    });
    if (!r.isConfirmed || !r.value) return;
    await act(() => requestLeaveInfo(row.id, String(r.value)), "Question sent");
  };

  const doCancel = async (row: LeaveRequest) => {
    const r = await Swal.fire({
      title: "Cancel this approved leave?",
      text: "The teacher becomes available again, paused classes resume and any salary deduction is reversed.",
      icon: "warning",
      input: "text",
      inputPlaceholder: "Reason (optional)",
      showCancelButton: true,
      confirmButtonText: "Cancel the leave",
      background: swalBg(),
      confirmButtonColor: "#ef4444",
    });
    if (!r.isConfirmed) return;
    await act(() => cancelLeave(row.id, String(r.value ?? "").trim() || undefined), "Leave cancelled");
  };

  const showAudit = async (row: LeaveRequest) => {
    try {
      const trail = await fetchLeaveAudit(row.id);
      await Swal.fire({
        title: "History",
        width: 640,
        background: swalBg(),
        html: trail.length
          ? `<div style="text-align:left;max-height:60vh;overflow:auto">${trail
              .map(
                (t) =>
                  `<div style="padding:6px 0;border-bottom:1px solid rgba(128,128,128,.2)">
                     <b style="font-size:12px">${t.action.replace(/_/g, " ")}</b>
                     <div style="font-size:11px;opacity:.8">${(t.description ?? "").replace(/</g, "&lt;")}</div>
                     <div style="font-size:10px;opacity:.6">${t.actorName ?? "System"} · ${new Date(t.createdAt).toLocaleString()}</div>
                   </div>`,
              )
              .join("")}</div>`
          : "<p style='font-size:12px'>Nothing recorded yet.</p>",
      });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      <Topbar title="Leave & Unavailability" subtitle="Approve staff leave and teacher unavailability" />

      <div className="animate-fade-up space-y-5 p-4 lg:p-6">
        {stats ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Pending" value={stats.pending} tone={stats.pending ? "text-amber-600 dark:text-amber-400" : undefined} />
            <Stat label="Info requested" value={stats.infoRequested} />
            <Stat label="Approved" value={stats.approved} />
            <Stat label="Rejected" value={stats.declined} />
            <Stat label="Unavailability" value={stats.unavailability} />
            <Stat label="Unpaid" value={stats.unpaid} tone={stats.unpaid ? "text-red-600 dark:text-red-400" : undefined} />
          </div>
        ) : null}

        {openImpacts > 0 ? (
          <Link href="/leave-impacts">
            <Card className="border border-amber-500/30 bg-amber-500/5 transition hover:border-amber-500/60">
              <CardBody className="flex items-center gap-3 p-4">
                <Users className="size-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-ink">
                    {openImpacts} student{openImpacts === 1 ? "" : "s"} waiting on a decision
                  </p>
                  <p className="text-[11px] text-ink-3">
                    A teacher is away and their classes still need arranging — wait, a stand-in, or a new time.
                  </p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              className={`${input} w-52 pl-8`}
              placeholder="Name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? s.replace(/_/g, " ") : "All statuses"}
              </option>
            ))}
          </select>
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All kinds</option>
            <option value="STAFF_LEAVE">Staff leave</option>
            <option value="TEACHER_UNAVAILABILITY">Teacher unavailability</option>
          </select>
          <select className={input} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="TEACHER">Teachers</option>
            <option value="ACADEMIC_COACH">Coaches</option>
            <option value="SUPERVISOR">Supervisors</option>
            <option value="ADMIN">Admins</option>
          </select>
          <select className={input} value={paid} onChange={(e) => setPaid(e.target.value)}>
            <option value="">Paid & unpaid</option>
            <option value="true">Paid only</option>
            <option value="false">Unpaid only</option>
          </select>

          <div className="ml-auto flex gap-2">
            <Link href="/leave-impacts">
              <Button variant="outline" size="sm">
                <Users className="size-3.5" /> Affected classes
              </Button>
            </Link>
            <Link href="/leaves/reports">
              <Button variant="outline" size="sm">
                <BarChart3 className="size-3.5" /> Reports
              </Button>
            </Link>
            {isAdmin ? (
              <Link href="/leaves/settings">
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="size-3.5" /> Setup
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !rows.length ? (
          <EmptyLeaves text="No requests match these filters." />
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((row) => (
                <Card key={row.id} className="border border-hairline bg-surface">
                  <CardBody className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-ink">
                            {`${row.user.firstName ?? ""} ${row.user.lastName ?? ""}`.trim() || row.user.email}
                          </p>
                          <Badge tone="neutral">{row.user.role.replace(/_/g, " ")}</Badge>
                          <LeaveStatusBadge status={row.status} />
                          {row.status === "APPROVED" ? <PaidBadge isPaid={row.isPaid} /> : null}
                        </div>
                        <p className="mt-1 text-xs text-ink-3">
                          {CATEGORY_LABELS[row.category]} · {LEAVE_TYPE_LABELS[row.leaveType] ?? row.leaveType} ·{" "}
                          {fmtWindow(row.startDate, row.endDate)} · {row.totalDays} day{row.totalDays === 1 ? "" : "s"}
                        </p>
                        {row.originalStartDate ? (
                          <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                            Originally asked for {fmtWindow(row.originalStartDate, row.originalEndDate)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-ink-2">{row.reason}</p>
                        {row.remarks ? <p className="text-[11px] text-ink-3">{row.remarks}</p> : null}
                        {row.infoResponse ? (
                          <p className="mt-1 rounded-xl border border-hairline bg-surface-2/40 p-2 text-[11px] text-ink-2">
                            <b>Q:</b> {row.infoRequest} <br />
                            <b>A:</b> {row.infoResponse}
                          </p>
                        ) : null}
                        {row.status === "APPROVED" && row.isPaid === false ? (
                          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                            Deduction {row.deductionAmount ?? 0}
                            {row.deductionAppliedAt ? " — applied to payroll" : " — will apply when payroll runs"}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[10px] text-ink-3">
                          Submitted {fmtDay(row.createdAt)}
                          {row.approvedByName ? ` · decided by ${row.approvedByName} ${fmtDay(row.approvedAt)}` : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {row.documentUrl ? (
                          <a href={leaveDocumentUrl(row.id)} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <FileText className="size-3.5" />
                            </Button>
                          </a>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => showAudit(row)}>
                          <History className="size-3.5" />
                        </Button>

                        {isAdmin && (row.status === "PENDING" || row.status === "INFO_REQUESTED") ? (
                          <>
                            <Button variant="primary" size="sm" disabled={busy} onClick={() => doApprove(row)}>
                              <CheckCircle2 className="size-3.5" /> Approve
                            </Button>
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => doAskInfo(row)}>
                              <MessageCircleQuestion className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => doReject(row)}>
                              <X className="size-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {isAdmin && row.status === "APPROVED" ? (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => doCancel(row)}>
                            <CalendarClock className="size-3.5" /> Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-ink-3">
                Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + rows.length} of {total}
              </p>
              {pages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span className="text-[11px] font-bold text-ink-3">Page {page} of {pages}</span>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}
