"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  Package as PackageIcon,
  Users,
  XCircle,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchSubscriptionRequest,
  fetchSubscriptionRequests,
  reviewSubscriptionRequest,
  type StaffSubscriptionRequest,
  type SubscriptionRequestDetail,
  type SubscriptionRequestStatus,
} from "@/lib/api";

const TABS = ["PENDING", "APPROVED", "APPLIED", "REJECTED"] as const;

const statusTone: Record<SubscriptionRequestStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "accent",
  REJECTED: "critical",
  APPLIED: "good",
};

const statusLabel: Record<SubscriptionRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  APPLIED: "Applied",
};

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const money = (n: number) => (n < 0 ? `−${Math.abs(n).toFixed(2)}` : n.toFixed(2));

export default function SubscriptionRequestsPage() {
  const [items, setItems] = useState<StaffSubscriptionRequest[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubscriptionRequestDetail | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchSubscriptionRequests({ status, limit: 100 })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => load(), [load]);

  const open = async (id: string) => {
    try {
      setSelected(await fetchSubscriptionRequest(id));
    } catch (e) {
      Swal.fire({
        title: "Could not open",
        text: e instanceof Error ? e.message : "Failed.",
        icon: "error",
        background: swalBg(),
      });
    }
  };

  return (
    <>
      <Topbar
        title="Subscription Requests"
        subtitle="Package and schedule changes students have asked for"
      />

      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-full sm:w-fit overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatus(t)}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                status === t
                  ? "bg-surface text-accent shadow-sm border border-hairline/80"
                  : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {statusLabel[t]}
            </button>
          ))}
        </div>

        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
                <Loader2 className="size-4 animate-spin text-accent" /> Loading…
              </div>
            ) : !items.length ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-ink-3">
                <ClipboardList className="size-8 text-ink-3/40" />
                <p className="text-sm font-bold text-ink">Nothing here</p>
                <p className="text-xs">No {statusLabel[status as SubscriptionRequestStatus].toLowerCase()} requests.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Change</th>
                      <th className="px-6 py-4">Requested</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {items.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-ink">{r.student?.name}</p>
                          <p className="text-[10px] text-ink-3">{r.student?.code}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-2">
                            {r.type === "PACKAGE_CHANGE" ? (
                              <PackageIcon className="size-3.5 text-accent" />
                            ) : (
                              <Clock className="size-3.5 text-accent" />
                            )}
                            {r.type === "PACKAGE_CHANGE" ? "Package" : "Schedule"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-2">
                          {r.fromLabel} → {r.toLabel}
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-3">{fmtDate(r.createdAt)}</td>
                        <td className="px-6 py-4">
                          <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => open(r.id)}
                            className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-accent hover:bg-accent/10"
                          >
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {selected && (
        <ReviewDrawer
          request={selected}
          onClose={() => setSelected(null)}
          onDecided={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ReviewDrawer({
  request,
  onClose,
  onDecided,
}: {
  request: SubscriptionRequestDetail;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [targetBatchId, setTargetBatchId] = useState("");
  const [busy, setBusy] = useState(false);

  const sched = request.schedule;
  // A shared batch cannot simply be retimed — everyone else in it would move
  // with this student, so a destination is required before approving.
  const needsTarget = !!sched && !sched.canRetimeInPlace;

  const decide = async (approve: boolean) => {
    if (approve && needsTarget && !targetBatchId) return;
    setBusy(true);
    try {
      await reviewSubscriptionRequest(request.id, {
        approve,
        notes: notes.trim() || undefined,
        targetBatchId: approve && needsTarget ? targetBatchId : undefined,
      });
      await Swal.fire({
        title: approve ? "Approved" : "Rejected",
        text: approve
          ? "Saved for the next billing cycle. Nothing changes until then."
          : "The student has been told.",
        icon: "success",
        background: swalBg(),
        confirmButtonColor: "#10b981",
      });
      onDecided();
    } catch (e) {
      Swal.fire({
        title: "Failed",
        text: e instanceof Error ? e.message : "Failed.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline p-5">
          <div>
            <h3 className="text-sm font-black text-ink">{request.student?.name}</h3>
            <p className="text-[11px] text-ink-3">
              {request.student?.code} · {request.type === "PACKAGE_CHANGE" ? "Package change" : "Schedule change"}
            </p>
          </div>
          <Badge tone={statusTone[request.status]}>{statusLabel[request.status]}</Badge>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-hairline bg-surface-2/40 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Requested</p>
            <p className="mt-1 text-sm font-bold text-ink">
              {request.fromLabel} → {request.toLabel}
            </p>
            {request.reason && (
              <p className="mt-2 text-xs text-ink-2">
                <span className="text-ink-3">Reason: </span>
                {request.reason}
              </p>
            )}
            <p className="mt-2 text-[11px] text-ink-3">
              Effective from the next billing cycle
              {request.current.cycle.end ? ` — ${fmtDate(request.current.cycle.end)}` : ""}.
            </p>
          </div>

          {/* ── Module 4: the numbers ────────────────────────────────────── */}
          {request.comparison && (
            <div className="rounded-xl border border-hairline bg-surface p-4">
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                What changes
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Diff
                  label="Price"
                  from={money(request.comparison.priceFrom)}
                  to={money(request.comparison.priceTo)}
                  delta={`${request.comparison.priceDifference >= 0 ? "+" : ""}${money(request.comparison.priceDifference)}`}
                  up={request.comparison.priceDifference > 0}
                />
                <Diff
                  label="Classes / month"
                  from={String(request.comparison.classesFrom)}
                  to={String(request.comparison.classesTo)}
                  delta={`${request.comparison.classesDifference >= 0 ? "+" : ""}${request.comparison.classesDifference}`}
                  up={request.comparison.classesDifference > 0}
                />
              </div>
              {!request.comparison.billingLinked && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  This package has no fee plan behind it, so approving changes the classes
                  but not the invoice. Link a fee plan to it first if the price should move.
                </p>
              )}
            </div>
          )}

          {/* ── Module 6: is it even possible ───────────────────────────── */}
          {sched && (
            <div className="rounded-xl border border-hairline bg-surface p-4">
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                Schedule check
              </p>

              <p className="text-xs text-ink-2">
                <span className="text-ink-3">Batch: </span>
                {sched.batch.name} — {sched.batch.days.join(", ")} {sched.batch.startTime ?? ""}
              </p>

              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
                <Users className="size-3.5 text-ink-3" />
                {sched.otherStudentsInBatch === 0
                  ? "Nobody else is in this batch — it can be retimed in place."
                  : `${sched.otherStudentsInBatch} other student(s) share this batch.`}
              </p>

              {sched.teacher && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-ink">{sched.teacher.name}</p>
                  {!sched.teacher.availabilityApproved && (
                    <p className="text-[11px] text-amber-600">
                      Their availability has not been approved.
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sched.teacher.perDay.map((d) => (
                      <span
                        key={d.day}
                        className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${
                          d.free
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-600"
                        }`}
                      >
                        {d.day.slice(0, 3)} {d.free ? "free" : "not free"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sched.teacherClashes.length > 0 && (
                <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  This teacher already runs {sched.teacherClashes.map((c) => c.name).join(", ")} at
                  that time.
                </p>
              )}

              {needsTarget && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
                    Move this student into
                  </label>
                  <select
                    value={targetBatchId}
                    onChange={(e) => setTargetBatchId(e.target.value)}
                    disabled={busy}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                  >
                    <option value="">— Choose a batch —</option>
                    {sched.alternatives.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.daysOfWeek.join(", ")} {b.startTime ?? ""}
                      </option>
                    ))}
                  </select>
                  {!sched.alternatives.length && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      There is no other batch on this course yet — create one before approving.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {request.status === "PENDING" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
                Notes (shown to the student)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={busy}
                className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {request.status !== "PENDING" && request.reviewNotes && (
            <p className="rounded-xl border border-hairline bg-surface-2/40 p-3 text-xs text-ink-2">
              <span className="text-ink-3">Decision notes: </span>
              {request.reviewNotes}
            </p>
          )}
        </div>

        {request.status === "PENDING" ? (
          <div className="flex gap-2 border-t border-hairline p-4">
            <Button
              onClick={() => decide(false)}
              disabled={busy}
              className="h-11 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-critical hover:bg-critical/5"
            >
              <XCircle className="mr-1 size-4" /> Reject
            </Button>
            <Button
              onClick={() => decide(true)}
              disabled={busy || (needsTarget && !targetBatchId)}
              className="h-11 flex-1 rounded-xl bg-accent text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 size-4" />
              )}
              Approve for next cycle
            </Button>
          </div>
        ) : (
          <div className="border-t border-hairline p-4">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <CalendarClock className="size-3.5" />
              Decided {fmtDate(request.decidedAt)}
              {request.decidedByName ? ` by ${request.decidedByName}` : ""}
              {request.appliedAt ? ` · applied ${fmtDate(request.appliedAt)}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Diff({
  label,
  from,
  to,
  delta,
  up,
}: {
  label: string;
  from: string;
  to: string;
  delta: string;
  up: boolean;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2/40 p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">
        {from} <span className="text-ink-3">→</span> {to}
      </p>
      <p className={`text-[11px] font-bold ${up ? "text-emerald-600" : "text-rose-600"}`}>{delta}</p>
    </div>
  );
}
