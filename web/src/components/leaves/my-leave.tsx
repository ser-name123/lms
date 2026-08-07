"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  CalendarOff, CheckCircle2, FileText, Loader2, MessageCircleQuestion, Plus, Send, Upload, X,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyLeaves, LEAVE_TYPE_LABELS, LeaveStatusBadge, PaidBadge, Stat,
  fmtDay, fmtWindow, toDateInput, totalDaysBetween,
} from "./shared";
import {
  cancelLeave, createLeave, editOwnLeave, fetchLeaveConfig, fetchMyLeaves, leaveDocumentUrl,
  respondLeaveInfo, uploadLeaveDocument,
  type LeaveConfig, type LeaveRequest, type MyLeaves,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Could not save",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const input =
  "h-9 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const textarea =
  "w-full rounded-xl border border-hairline bg-surface p-3 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3";

/**
 * "My Leave" — the same screen for every member of staff.
 *
 * Teacher, academic coach and supervisor all request leave the same way (§9.1);
 * what differs is only the vocabulary, because a teacher's absence is
 * *unavailability* and carries consequences for students. One component rather
 * than three copies, since the copy that drifts is always the one nobody demos.
 */
export function MyLeavePanel({ isTeacher }: { isTeacher: boolean }) {
  const [data, setData] = useState<MyLeaves | null>(null);
  const [cfg, setCfg] = useState<LeaveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveRequest | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchMyLeaves().catch(() => null), fetchLeaveConfig().catch(() => null)])
      .then(([m, c]) => {
        setData(m);
        setCfg(c);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await fn();
      load();
      if (message) {
        await Swal.fire({ title: message, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const answer = async (row: LeaveRequest) => {
    const r = await Swal.fire({
      title: "Answer the admin",
      text: row.infoRequest ?? "",
      input: "textarea",
      inputPlaceholder: "Your answer…",
      showCancelButton: true,
      confirmButtonText: "Send",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: (v: string) => {
        if (!v?.trim()) {
          Swal.showValidationMessage("Write an answer");
          return false;
        }
        return v.trim();
      },
    });
    if (!r.isConfirmed || !r.value) return;
    await act(() => respondLeaveInfo(row.id, String(r.value)), "Answer sent");
  };

  const withdraw = async (row: LeaveRequest) => {
    const r = await Swal.fire({
      title: "Withdraw this request?",
      text: fmtWindow(row.startDate, row.endDate),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Withdraw",
      background: swalBg(),
      confirmButtonColor: "#ef4444",
    });
    if (!r.isConfirmed) return;
    await act(() => cancelLeave(row.id), "Request withdrawn");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
        <Loader2 className="size-4 animate-spin text-accent" /> Loading…
      </div>
    );
  }

  const noun = isTeacher ? "unavailability" : "leave";

  return (
    <div className="animate-fade-up space-y-5 p-4 lg:p-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Awaiting a decision" value={data?.pending ?? 0} tone={data?.pending ? "text-amber-600 dark:text-amber-400" : undefined} />
        <Stat label="Approved days" value={data?.approvedDays ?? 0} />
        <Stat label="Unpaid days" value={data?.unpaidDays ?? 0} tone={data?.unpaidDays ? "text-red-600 dark:text-red-400" : undefined} />
        <Stat
          label="Right now"
          value={data?.currentlyAway ? "Away" : "Working"}
          tone={data?.currentlyAway ? "text-accent" : undefined}
        />
      </div>

      {data?.currentlyAway ? (
        <Card className="border border-accent/30 bg-accent/5">
          <CardBody className="p-4 text-xs text-ink-2">
            You are marked as away today.{" "}
            {isTeacher
              ? "No new classes will be scheduled with you, and your academic coach is arranging cover for the students you already had."
              : "Your leave is recorded."}
          </CardBody>
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-ink">My {noun} requests</p>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-3.5" /> Request {noun}
        </Button>
      </div>

      {!data?.items.length ? (
        <EmptyLeaves text={`You have not requested any ${noun} yet.`} />
      ) : (
        <div className="space-y-2">
          {data.items.map((row) => (
            <Card key={row.id} className="border border-hairline bg-surface">
              <CardBody className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-ink">
                        {LEAVE_TYPE_LABELS[row.leaveType] ?? row.leaveType}
                      </p>
                      <LeaveStatusBadge status={row.status} />
                      {row.status === "APPROVED" ? <PaidBadge isPaid={row.isPaid} /> : null}
                      <Badge tone="neutral">{row.totalDays} day{row.totalDays === 1 ? "" : "s"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-3">
                      {fmtWindow(row.startDate, row.endDate)}
                      {row.originalStartDate ? (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                          (you asked for {fmtWindow(row.originalStartDate, row.originalEndDate)})
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-ink-2">{row.reason}</p>
                    {row.remarks ? <p className="mt-0.5 text-[11px] text-ink-3">{row.remarks}</p> : null}

                    {row.status === "DECLINED" && row.rejectionReason ? (
                      <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-2 text-[11px] text-red-600 dark:text-red-400">
                        {row.rejectionReason}
                      </p>
                    ) : null}
                    {row.status === "INFO_REQUESTED" && row.infoRequest ? (
                      <p className="mt-2 rounded-xl border border-accent/30 bg-accent/5 p-2 text-[11px] text-ink-2">
                        <MessageCircleQuestion className="mr-1 inline size-3" />
                        {row.infoRequest}
                      </p>
                    ) : null}
                    {row.status === "APPROVED" && row.isPaid === false && row.deductionAmount ? (
                      <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                        {row.deductionAmount} will be deducted from your salary
                        {row.deductionAppliedAt ? " (already applied)" : " when payroll runs"}.
                      </p>
                    ) : null}
                    {row.approvedByName ? (
                      <p className="mt-1 text-[10px] text-ink-3">
                        {row.status === "DECLINED" ? "Rejected" : "Decided"} by {row.approvedByName} · {fmtDay(row.approvedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {row.documentUrl ? (
                      <a href={leaveDocumentUrl(row.id)} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <FileText className="size-3.5" /> Document
                        </Button>
                      </a>
                    ) : null}
                    {row.status === "INFO_REQUESTED" ? (
                      <Button variant="primary" size="sm" disabled={busy} onClick={() => answer(row)}>
                        <Send className="size-3.5" /> Answer
                      </Button>
                    ) : null}
                    {row.status === "PENDING" || row.status === "INFO_REQUESTED" ? (
                      <>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(row); setFormOpen(true); }}>
                          Edit
                        </Button>
                        {cfg?.allowSelfCancel ? (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => withdraw(row)}>
                            <X className="size-3.5" />
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {formOpen ? (
        <LeaveRequestForm
          isTeacher={isTeacher}
          cfg={cfg}
          existing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); }}
        />
      ) : null}
    </div>
  );
}

/** §9.1 — the request form, shared by every staff portal. */
function LeaveRequestForm({
  isTeacher, cfg, existing, onClose, onSaved,
}: {
  isTeacher: boolean;
  cfg: LeaveConfig | null;
  existing: LeaveRequest | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const types = useMemo(
    () => (isTeacher ? cfg?.unavailabilityTypes : cfg?.staffTypes) ?? ["ANNUAL", "SICK", "PERSONAL", "OTHER"],
    [cfg, isTeacher],
  );

  const [leaveType, setLeaveType] = useState(existing?.leaveType ?? types[0]);
  const [startDate, setStartDate] = useState(toDateInput(existing?.startDate));
  const [endDate, setEndDate] = useState(toDateInput(existing?.endDate ?? existing?.startDate));
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [doc, setDoc] = useState<{ url: string; name: string } | null>(
    existing?.documentUrl ? { url: existing.documentUrl, name: existing.documentName ?? "Document" } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  // §9.1's auto-calculated Total Days, computed with the server's own rule so
  // the number on screen is the number that will be saved.
  const totalDays = totalDaysBetween(startDate, endDate, cfg?.nonWorkingWeekdays ?? []);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setDoc(await uploadLeaveDocument(file));
    } catch (err) {
      fail(err);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!reason.trim()) return fail(new Error("Say why you need the time off."));
    if (!totalDays) return fail(new Error("Those dates do not cover a working day."));
    if (cfg?.maxConsecutiveDays && totalDays > cfg.maxConsecutiveDays) {
      return fail(new Error(`A single request may not exceed ${cfg.maxConsecutiveDays} days.`));
    }
    setBusy(true);
    try {
      const payload = {
        leaveType,
        startDate: new Date(`${startDate}T00:00:00Z`).toISOString(),
        endDate: new Date(`${endDate}T00:00:00Z`).toISOString(),
        reason: reason.trim(),
        remarks: remarks.trim() || undefined,
        documentUrl: doc?.url,
        documentName: doc?.name,
      };
      if (existing) await editOwnLeave(existing.id, payload);
      else await createLeave(payload);
      onSaved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const noun = isTeacher ? "unavailability" : "leave";
  const notice = cfg?.noticeDaysExpected ?? 0;
  const daysAhead = Math.round(
    (new Date(`${startDate}T00:00:00Z`).getTime() - new Date(toDateInput(new Date()) + "T00:00:00Z").getTime()) / 86_400_000,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <Card className="my-8 w-full max-w-2xl border border-hairline bg-surface shadow-xl">
        <CardBody className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-ink">
                {existing ? `Edit your ${noun} request` : `Request ${noun}`}
              </h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {isTeacher
                  ? "Your academic coach will arrange cover for the students you already have booked."
                  : "Your request goes to the admin for approval."}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>Type</label>
              <select className={input} value={leaveType} onChange={(e) => setLeaveType(e.target.value as never)}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {LEAVE_TYPE_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>From</label>
              <input
                type="date"
                className={input}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  // A one-day request is the common case; keep the end in step
                  // until the user moves it themselves.
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </div>
            <div>
              <label className={label}>To</label>
              <input type="date" className={input} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <Badge tone={totalDays ? "accent" : "critical"}>
                {totalDays} day{totalDays === 1 ? "" : "s"} total
              </Badge>
              {notice > 0 && daysAhead >= 0 && daysAhead < notice ? (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  The academy asks for {notice} days&apos; notice — you can still submit, the admin will see it is short notice.
                </span>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <label className={label}>Reason</label>
              <textarea rows={2} className={textarea} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Remarks (optional)</label>
              <textarea rows={2} className={textarea} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <label className={label}>Supporting document (optional)</label>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 py-1.5 text-xs font-bold text-ink-2 hover:text-ink ${
                    uploading ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {uploading ? "Uploading…" : "Attach a file"}
                  <input type="file" className="hidden" onChange={pickFile} disabled={uploading} />
                </label>
                {doc ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-2">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> {doc.name}
                    <button type="button" onClick={() => setDoc(null)} className="text-ink-3 hover:text-ink">
                      <X className="size-3" />
                    </button>
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[10px] text-ink-3">
                A medical certificate stays private — only you and the admin team can open it.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy || uploading}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarOff className="size-4" />}{" "}
              {existing ? "Save changes" : "Submit request"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
