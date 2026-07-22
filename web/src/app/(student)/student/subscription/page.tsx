"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  BadgeCheck,
  CalendarClock,
  Clock,
  Loader2,
  Package as PackageIcon,
  Send,
} from "lucide-react";

import { money, type Currency } from "@/lib/currency";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  fetchMyPackageOptions,
  fetchMySubscription,
  fetchMySubscriptionRequests,
  requestPackageChange,
  requestScheduleChange,
  type CurrentSubscription,
  type MySubscriptionRequest,
  type SubscriptionPackage,
  type SubscriptionRequestStatus,
} from "@/lib/api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const statusTone: Record<SubscriptionRequestStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "accent",
  REJECTED: "critical",
  APPLIED: "good",
};

const statusLabel: Record<SubscriptionRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  APPLIED: "Applied",
};

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function StudentSubscriptionPage() {
  const [sub, setSub] = useState<CurrentSubscription | null>(null);
  const [requests, setRequests] = useState<MySubscriptionRequest[]>([]);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<null | "package" | "schedule">(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMySubscription().catch(() => null),
      fetchMySubscriptionRequests().catch(() => []),
      fetchMyPackageOptions().catch(() => []),
    ])
      .then(([s, r, p]) => {
        setSub(s);
        setRequests(r);
        setPackages(p);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  // A paused or ended subscription has nothing to change, and the API refuses
  // anyway — saying so here beats a button that only fails when pressed.
  const canRequest = sub?.status === "ACTIVE";

  return (
    <>
      <Topbar title="My Subscription" subtitle="Your package, schedule and billing cycle" />

      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 py-16 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !sub ? (
          <Card className="border border-hairline bg-surface shadow-sm">
            <CardBody className="py-14 text-center text-sm text-ink-3">
              We could not load your subscription.
            </CardBody>
          </Card>
        ) : (
          <>
            {/* ── Module 1: read-only ─────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InfoTile icon={PackageIcon} label="Current package">
                {sub.package ? (
                  <>
                    <p className="text-sm font-black text-ink">{sub.package.name}</p>
                    <p className="text-[11px] text-ink-3">
                      {sub.package.classesPerMonth} classes / month
                    </p>
                    {/*
                      In this family's own currency, which is fixed on their
                      account — opening the site from another country does not
                      re-quote what they pay.
                    */}
                    <p className="text-[11px] font-bold text-ink-2">
                      {money(sub.package.price, sub.currency, { emptyText: "Price not set" })}
                      {" / "}
                      month
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-3">Not set</p>
                )}
              </InfoTile>

              <InfoTile icon={Clock} label="Current time">
                {sub.schedule.length ? (
                  sub.schedule.map((s) => (
                    <div key={s.batchId} className="mb-1 last:mb-0">
                      <p className="text-sm font-black text-ink">{s.days.join("  ") || "No days set"}</p>
                      <p className="text-[11px] text-ink-3">
                        {s.startTime ?? "—"}
                        {s.endTime ? ` – ${s.endTime}` : ""}
                        {sub.schedule.length > 1 ? ` · ${s.batchName}` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-ink-3">No schedule yet</p>
                )}
              </InfoTile>

              <InfoTile icon={CalendarClock} label="Current cycle">
                <p className="text-sm font-black text-ink">{fmtDate(sub.cycle.start)}</p>
                <p className="text-[11px] text-ink-3">to {fmtDate(sub.cycle.end)}</p>
              </InfoTile>

              <InfoTile icon={BadgeCheck} label="Status">
                <Badge tone={sub.status === "ACTIVE" ? "good" : sub.status === "PAUSED" ? "warning" : "neutral"}>
                  {sub.status === "NONE" ? "No subscription" : sub.status.charAt(0) + sub.status.slice(1).toLowerCase()}
                </Badge>
              </InfoTile>
            </div>

            {/* Something already approved and waiting for the roll. Shown here
                so an approved request does not look like nothing happened. */}
            {sub.nextCycle && (
              <Card className="border border-accent/30 bg-accent/5 shadow-sm">
                <CardBody className="p-5">
                  <p className="text-xs font-bold text-accent">
                    Changing from {fmtDate(sub.cycle.end)}
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-ink-2">
                    {sub.nextCycle.package && (
                      <li>
                        Package → <b>{sub.nextCycle.package.name}</b> ·{" "}
                        {sub.nextCycle.package.classesPerMonth} classes/month · {money(sub.nextCycle.package.price, sub.currency)}
                      </li>
                    )}
                    {(sub.nextCycle.days.length > 0 || sub.nextCycle.time) && (
                      <li>
                        Schedule → <b>{sub.nextCycle.days.join(", ")}</b>{" "}
                        {sub.nextCycle.time ? `at ${sub.nextCycle.time}` : ""}
                      </li>
                    )}
                  </ul>
                </CardBody>
              </Card>
            )}

            {/* ── Module 2: the only two things a student can do ──────────── */}
            <Card className="border border-hairline bg-surface shadow-sm">
              <CardBody className="p-5">
                <h3 className="text-sm font-bold text-ink">Request a change</h3>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  Changes are reviewed by your academic coach and apply from your next
                  billing cycle. Your current classes and price stay as they are until then.
                </p>

                {!canRequest && (
                  <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {sub.status === "PAUSED"
                      ? "Your subscription is paused, so changes cannot be requested right now."
                      : "You do not have an active subscription to change."}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={!canRequest}
                    onClick={() => setForm(form === "package" ? null : "package")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    <PackageIcon className="size-4" /> Request package change
                  </button>
                  <button
                    disabled={!canRequest}
                    onClick={() => setForm(form === "schedule" ? null : "schedule")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-hairline bg-surface px-4 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                  >
                    <Clock className="size-4" /> Request schedule change
                  </button>
                </div>

                {form === "package" && (
                  <PackageForm
                    packages={packages}
                    currency={sub.currency}
                    onDone={() => {
                      setForm(null);
                      load();
                    }}
                  />
                )}
                {form === "schedule" && (
                  <ScheduleForm
                    sub={sub}
                    onDone={() => {
                      setForm(null);
                      load();
                    }}
                  />
                )}
              </CardBody>
            </Card>

            {/* ── Module 8: my requests ───────────────────────────────────── */}
            <Card className="border border-hairline bg-surface shadow-sm">
              <CardBody className="p-0">
                <div className="border-b border-hairline p-5">
                  <h3 className="text-sm font-bold text-ink">My requests</h3>
                </div>
                {!requests.length ? (
                  <p className="p-8 text-center text-xs text-ink-3">
                    You have not requested any changes yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                          <th className="px-5 py-3">Type</th>
                          <th className="px-5 py-3">Change</th>
                          <th className="px-5 py-3">Requested</th>
                          <th className="px-5 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {requests.map((r) => (
                          <tr key={r.id}>
                            <td className="px-5 py-3 text-xs font-bold text-ink">
                              {r.type === "PACKAGE_CHANGE" ? "Package" : "Schedule"}
                            </td>
                            <td className="px-5 py-3 text-xs text-ink-2">
                              {r.fromLabel} → {r.toLabel}
                              {r.reviewNotes && (
                                <p className="mt-0.5 text-[11px] text-ink-3">{r.reviewNotes}</p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-ink-3">{fmtDate(r.createdAt)}</td>
                            <td className="px-5 py-3">
                              <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                              {r.status === "APPROVED" && (
                                <p className="mt-0.5 text-[10px] text-ink-3">from next cycle</p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function InfoTile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon className="size-4 text-accent" />
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function PackageForm({
  packages,
  currency,
  onDone,
}: {
  packages: SubscriptionPackage[];
  // Passed rather than detected here: this family's currency is the one on
  // their account, not the one the browser happens to be sitting in.
  currency: Currency;
  onDone: () => void;
}) {
  const [packageId, setPackageId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!packageId) return;
    setBusy(true);
    try {
      await requestPackageChange({ packageId, reason: reason.trim() || undefined });
      await Swal.fire({
        title: "Request submitted",
        text: "Your coach will review it. If approved it applies from your next billing cycle.",
        icon: "success",
        background: swalBg(),
        confirmButtonColor: "#10b981",
      });
      onDone();
    } catch (e) {
      Swal.fire({
        title: "Could not submit",
        text: e instanceof Error ? e.message : "Please try again.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-surface-2/40 p-4">
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
        Select new package
      </label>
      {!packages.length ? (
        <p className="text-xs text-ink-3">There are no other packages available right now.</p>
      ) : (
        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          disabled={busy}
          className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
        >
          <option value="">— Choose a package —</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.classesPerMonth} classes/month · {money(p.price, currency)}
            </option>
          ))}
        </select>
      )}

      <label className="mb-1.5 mt-3 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
        Reason (optional)
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        disabled={busy}
        className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
      />

      {/* Fixed by design — a student cannot pick when it lands. */}
      <p className="mt-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px] text-ink-3">
        <b className="text-ink-2">Effective from:</b> your next billing cycle. This cannot be changed.
      </p>

      <button
        onClick={submit}
        disabled={busy || !packageId}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit request
      </button>
    </div>
  );
}

function ScheduleForm({ sub, onDone }: { sub: CurrentSubscription; onDone: () => void }) {
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [startDate, setStartDate] = useState("");
  const [batchId, setBatchId] = useState(sub.schedule[0]?.batchId ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = async () => {
    if (!days.length || !time) return;
    setBusy(true);
    try {
      await requestScheduleChange({
        days,
        time,
        startDate: startDate || undefined,
        batchId: sub.schedule.length > 1 ? batchId : undefined,
        reason: reason.trim() || undefined,
      });
      await Swal.fire({
        title: "Request submitted",
        text: "Your coach will check teacher availability. If approved it applies from your next billing cycle.",
        icon: "success",
        background: swalBg(),
        confirmButtonColor: "#10b981",
      });
      onDone();
    } catch (e) {
      Swal.fire({
        title: "Could not submit",
        text: e instanceof Error ? e.message : "Please try again.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-surface-2/40 p-4">
      {sub.schedule.length > 1 && (
        <>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
            Which timetable
          </label>
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            disabled={busy}
            className="mb-3 h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
          >
            {sub.schedule.map((s) => (
              <option key={s.batchId} value={s.batchId}>
                {s.batchName} — {s.days.join(", ")} {s.startTime ?? ""}
              </option>
            ))}
          </select>
        </>
      )}

      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
        Preferred days
      </label>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy}
            onClick={() => toggle(d)}
            className={`h-9 rounded-lg border px-3 text-[11px] font-bold transition-colors ${
              days.includes(d)
                ? "border-accent bg-accent text-white"
                : "border-hairline bg-surface text-ink-2 hover:bg-surface-2"
            }`}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
            Preferred time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
            Preferred start date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <label className="mb-1.5 mt-3 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
        Reason (optional)
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        disabled={busy}
        className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
      />

      <p className="mt-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px] text-ink-3">
        <b className="text-ink-2">Effective from:</b> your next billing cycle. This cannot be changed.
      </p>

      <button
        onClick={submit}
        disabled={busy || !days.length || !time}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit request
      </button>
    </div>
  );
}
