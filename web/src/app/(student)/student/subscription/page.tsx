"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  BadgeCheck,
  CalendarClock,
  CalendarOff,
  Clock,
  Loader2,
  Package as PackageIcon,
  Pause,
  Send,
} from "lucide-react";

import { money, type Currency } from "@/lib/currency";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  fetchMyPackageOptions,
  fetchMyRescheduleSlots,
  fetchMyScheduleAvailability,
  fetchMySubscription,
  fetchMySubscriptionRequests,
  fetchMyUpcomingSessions,
  rescheduleClass,
  type RescheduleSlots,
  requestBreak,
  requestPackageChange,
  requestScheduleChange,
  type CurrentSubscription,
  type MySubscriptionRequest,
  type ScheduleAvailability,
  type SubscriptionPackage,
  type SubscriptionRequestStatus,
  type SubscriptionRequestType,
  type UpcomingSession,
} from "@/lib/api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// "HH:mm" → minutes-from-midnight, or null on anything malformed.
const toMin = (v?: string): number | null => {
  if (!v || !/^\d{1,2}:\d{2}$/.test(v)) return null;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Does the teacher publish ANY window at all? If not, every day/time is open
// (matches the server's permissive rule) and the picker falls back to free entry.
const teacherHasWindows = (w: Record<string, { from?: string; to?: string }[]>) =>
  DAYS.some((d) => (w[d]?.length ?? 0) > 0);

// Start times (15-min grid) whose [t, t+duration] fits inside a window on EVERY
// selected day. A selected day the teacher hasn't published for does not
// constrain (permissive), matching the availability check on the server.
const validStartTimes = (
  days: string[],
  windows: Record<string, { from?: string; to?: string }[]>,
  duration: number,
): string[] => {
  if (!days.length) return [];
  const out: string[] = [];
  for (let m = 0; m + duration <= 24 * 60; m += 15) {
    const start = m;
    const end = m + duration;
    const fits = days.every((d) => {
      const w = windows[d];
      if (!Array.isArray(w) || w.length === 0) return true;
      return w.some((win) => {
        const f = toMin(win.from);
        const to = toMin(win.to);
        return f != null && to != null && start >= f && end <= to;
      });
    });
    if (fits) out.push(toHHMM(start));
  }
  return out;
};

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

const requestTypeLabel: Record<SubscriptionRequestType, string> = {
  PACKAGE_CHANGE: "Package",
  SCHEDULE_CHANGE: "Schedule",
  BREAK_REQUEST: "Break",
};

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const CYCLE_LABELS: Record<string, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};
const fmtCycle = (v: string | null | undefined) => (v ? (CYCLE_LABELS[v] ?? v) : "—");

export default function StudentSubscriptionPage() {
  const [sub, setSub] = useState<CurrentSubscription | null>(null);
  const [requests, setRequests] = useState<MySubscriptionRequest[]>([]);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [availability, setAvailability] = useState<ScheduleAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<null | "package" | "schedule" | "break">(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMySubscription().catch(() => null),
      fetchMySubscriptionRequests().catch(() => []),
      fetchMyPackageOptions().catch(() => []),
      fetchMyScheduleAvailability().catch(() => null),
    ])
      .then(([s, r, p, a]) => {
        setSub(s);
        setRequests(r);
        setPackages(p);
        setAvailability(a);
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
                <Badge tone={sub.status === "ACTIVE" ? "good" : sub.status === "ON_BREAK" ? "accent" : sub.status === "PAUSED" ? "warning" : sub.status === "PENDING_PAYMENT" ? "warning" : "neutral"}>
                  {sub.status === "NONE"
                    ? "No subscription"
                    : sub.status === "PENDING_PAYMENT"
                      ? "Pending payment"
                      : sub.status === "ON_BREAK"
                        ? "On break"
                        : sub.status.charAt(0) + sub.status.slice(1).toLowerCase()}
                </Badge>
              </InfoTile>
            </div>

            {/* On break: paused classes, cycle extended, teacher reserved. */}
            {sub.status === "ON_BREAK" && sub.record?.breakEndDate && (
              <Card className="border border-accent/30 bg-accent/5 shadow-sm">
                <CardBody className="p-5">
                  <p className="flex items-center gap-2 text-xs font-bold text-accent">
                    <Pause className="size-4" /> Your subscription is on a break
                  </p>
                  <p className="mt-1 text-xs text-ink-2">
                    Classes are paused until <b>{fmtDate(sub.record.breakEndDate)}</b> and resume
                    automatically with the same teacher. Your billing cycle has been extended by the
                    break — nothing is lost.
                  </p>
                </CardBody>
              </Card>
            )}

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

            {/* ── Full subscription record (model, plan, live counters) ───── */}
            {sub.record && (
              <Card className="border border-hairline bg-surface shadow-sm">
                <CardBody className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink">Subscription details</h3>
                    {sub.record.model && (
                      <Badge tone={sub.record.pricingMode === "HOURLY" ? "accent" : "neutral"}>
                        {sub.record.model.name}
                        {sub.record.tier ? ` · ${sub.record.tier}` : ""}
                      </Badge>
                    )}
                  </div>
                  {sub.record.status === "PENDING_PAYMENT" && (
                    <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                      Awaiting payment — pay your first invoice to activate your subscription. Your
                      classes are scheduled once payment is confirmed; no classes are booked yet.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                    <RecordStat label="Model">
                      {sub.record.pricingMode === "HOURLY" ? "Hourly Subscription" : "Monthly Package"}
                    </RecordStat>
                    <RecordStat label="Course">{sub.record.course?.title ?? sub.course?.title ?? "—"}</RecordStat>
                    <RecordStat label="Currency">{sub.record.currency ?? sub.currency}</RecordStat>
                    <RecordStat label="Billing cycle">{fmtCycle(sub.record.billingCycle)}</RecordStat>
                    <RecordStat label={sub.record.pricingMode === "HOURLY" ? "Hourly rate" : "Monthly price"}>
                      {sub.record.pricingMode === "HOURLY"
                        ? `${money(sub.record.hourlyRate, sub.currency)} / hr`
                        : money(sub.record.monthlyPrice, sub.currency, { emptyText: "Not set" })}
                    </RecordStat>
                    <RecordStat label="Class duration">{sub.record.durationMinutes} min</RecordStat>
                    <RecordStat label="Weekly classes">{sub.record.weeklyClasses}×/week</RecordStat>
                    <RecordStat label="Monthly hours">{sub.record.monthlyHours} hrs</RecordStat>
                    <RecordStat label="Est. monthly tuition">
                      {money(sub.record.monthlyPrice, sub.currency, { emptyText: "Not set" })}
                    </RecordStat>
                    <RecordStat label="Classes remaining">
                      {sub.record.remainingClasses}
                      <span className="text-[11px] font-normal text-ink-3"> · {sub.record.completedClasses} done</span>
                    </RecordStat>
                    <RecordStat label="Reschedules left">
                      <span className={sub.record.reschedulesLeft > 0 ? "text-emerald-500" : "text-ink-3"}>
                        {sub.record.reschedulesLeft}
                      </span>
                      <span className="text-[11px] font-normal text-ink-3"> of {sub.record.rescheduleLimit}</span>
                    </RecordStat>
                    {sub.record.familyDiscountPct > 0 && (
                      <RecordStat label="Family discount">{sub.record.familyDiscountPct}%</RecordStat>
                    )}
                    <RecordStat label="Cycle start">
                      {sub.record.actualCycleStartDate
                        ? fmtDate(sub.record.actualCycleStartDate)
                        : sub.record.status === "PENDING_PAYMENT"
                          ? "After payment"
                          : fmtDate(sub.record.preferredStartDate)}
                    </RecordStat>
                    <RecordStat label="Renews on">{fmtDate(sub.record.renewalDate)}</RecordStat>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* ── Reschedule a class (within the plan's allowance) ────────── */}
            {sub.record && (
              <RescheduleCard limit={sub.record.rescheduleLimit} reschedulesLeft={sub.record.reschedulesLeft} onDone={load} />
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
                    {sub.status === "ON_BREAK"
                      ? "Your subscription is on a break. Changes can be requested once it resumes."
                      : sub.status === "PAUSED"
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
                  <button
                    disabled={!canRequest}
                    onClick={() => setForm(form === "break" ? null : "break")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-hairline bg-surface px-4 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                  >
                    <CalendarOff className="size-4" /> Request a break
                  </button>
                </div>

                {form === "package" && (
                  <PackageForm
                    sub={sub}
                    packages={packages}
                    currency={sub.currency}
                    availability={availability}
                    onDone={() => {
                      setForm(null);
                      load();
                    }}
                  />
                )}
                {form === "schedule" && (
                  <ScheduleForm
                    sub={sub}
                    availability={availability}
                    onDone={() => {
                      setForm(null);
                      load();
                    }}
                  />
                )}
                {form === "break" && (
                  <BreakForm
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
                              {requestTypeLabel[r.type] ?? r.type}
                            </td>
                            <td className="px-5 py-3 text-xs text-ink-2">
                              {r.type === "BREAK_REQUEST" ? r.toLabel : `${r.fromLabel} → ${r.toLabel}`}
                              {r.reviewNotes && (
                                <p className="mt-0.5 text-[11px] text-ink-3">{r.reviewNotes}</p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-ink-3">{fmtDate(r.createdAt)}</td>
                            <td className="px-5 py-3">
                              <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                              {r.status === "APPROVED" && r.type !== "BREAK_REQUEST" && (
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

function RescheduleCard({ limit, reschedulesLeft, onDone }: { limit: number; reschedulesLeft: number; onDone: () => void }) {
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<string>("");
  const [slots, setSlots] = useState<RescheduleSlots | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [dateIdx, setDateIdx] = useState<string>("");
  const [chosen, setChosen] = useState<string>(""); // slot startsAt ISO
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchMyUpcomingSessions()
      .then((rows) => {
        setSessions(rows);
        // Deep-link from the schedule page (?reschedule=<sessionId>): pre-select
        // that class if it is one of the student's real upcoming sessions.
        if (typeof window !== "undefined") {
          const target = new URLSearchParams(window.location.search).get("reschedule");
          if (target && rows.some((s) => s.id === target)) setPick(target);
        }
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  // When a class is picked, pull the available slots for it.
  useEffect(() => {
    setSlots(null); setDateIdx(""); setChosen("");
    if (!pick) return;
    setSlotsLoading(true);
    fetchMyRescheduleSlots(pick)
      .then((s) => { setSlots(s); setDateIdx(s.days[0]?.date ?? ""); })
      .catch(() => setSlots(null))
      .finally(() => setSlotsLoading(false));
  }, [pick]);

  const fmt = (v: string) => new Date(v).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short", timeZone: "UTC" });
  const daySlots = slots?.days.find((d) => d.date === dateIdx)?.slots ?? [];

  const submit = async () => {
    if (!pick || !chosen) return;
    setBusy(true);
    try {
      const res = await rescheduleClass({ sessionId: pick, newStartsAt: chosen });
      await Swal.fire({ title: "Class rescheduled", text: `Done. ${res.reschedulesLeft} reschedule${res.reschedulesLeft === 1 ? "" : "s"} left this cycle.`, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      setPick(""); setChosen("");
      load();
      onDone();
    } catch (e) {
      Swal.fire({ title: "Could not reschedule", text: e instanceof Error ? e.message : "Please try again.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="reschedule" className="border border-hairline bg-surface shadow-sm scroll-mt-24">
      <CardBody className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Reschedule a class</h3>
          {limit > 0 && <span className="text-[11px] font-bold text-ink-3">{reschedulesLeft} / {limit} left this cycle</span>}
        </div>
        <p className="mb-3 text-[11px] text-ink-3">Move one upcoming class. At least 4 hours' notice, on your teacher's available hours, and within your current cycle.</p>
        {limit <= 0 ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
            Your current package does not include class rescheduling. Please upgrade your package to enjoy class rescheduling benefits.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 py-4 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading classes…</div>
        ) : !sessions.length ? (
          <p className="text-xs text-ink-3">You have no upcoming classes to reschedule.</p>
        ) : reschedulesLeft <= 0 ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">You have reached your reschedule limit for the current billing cycle.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Class to move</label>
              <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}
                className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
                <option value="">— Choose a class —</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{fmt(s.startsAt)} · {s.title}{s.teacher ? ` · ${s.teacher}` : ""}</option>
                ))}
              </select>
            </div>

            {pick && (slotsLoading ? (
              <div className="flex items-center gap-2 py-2 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Finding available slots…</div>
            ) : !slots || !slots.days.length ? (
              <p className="rounded-lg border border-hairline bg-surface-2/40 p-3 text-xs text-ink-3">No available slots for this class within your current cycle. Your teacher may be fully booked.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Available date</label>
                  <select value={dateIdx} onChange={(e) => { setDateIdx(e.target.value); setChosen(""); }} disabled={busy}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
                    {slots.days.map((d) => <option key={d.date} value={d.date}>{fmtDay(d.date)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Available time</label>
                  <select value={chosen} onChange={(e) => setChosen(e.target.value)} disabled={busy}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
                    <option value="">— Choose a time —</option>
                    {daySlots.map((s) => <option key={s.startsAt} value={s.startsAt}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            ))}

            <button onClick={submit} disabled={busy || !pick || !chosen}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />} Reschedule
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RecordStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 text-sm font-black text-ink">{children}</p>
    </div>
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
  sub,
  packages,
  currency,
  availability,
  onDone,
}: {
  sub: CurrentSubscription;
  packages: SubscriptionPackage[];
  // Passed rather than detected here: this family's currency is the one on
  // their account, not the one the browser happens to be sitting in.
  currency: Currency;
  availability: ScheduleAvailability | null;
  onDone: () => void;
}) {
  const [packageId, setPackageId] = useState("");
  const [reason, setReason] = useState("");
  // A bigger package may need a new timetable — optional, chosen from the
  // current teacher's availability (validated again server-side).
  const [changeSchedule, setChangeSchedule] = useState(false);
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!packageId) return;
    if (changeSchedule && (!days.length || !time)) return;
    setBusy(true);
    try {
      await requestPackageChange({
        packageId,
        days: changeSchedule ? days : undefined,
        time: changeSchedule ? time : undefined,
        reason: reason.trim() || undefined,
      });
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

      {/* Optional new schedule for the new package. */}
      {sub.schedule.length > 0 && (
        <div className="mt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-2">
            <input
              type="checkbox"
              checked={changeSchedule}
              onChange={(e) => setChangeSchedule(e.target.checked)}
              disabled={busy}
              className="size-4 accent-[var(--accent)]"
            />
            Also pick new days &amp; time for this package
          </label>
          {changeSchedule && (
            <div className="mt-2 rounded-lg border border-hairline bg-surface p-3">
              <p className="mb-2 text-[11px] text-ink-3">
                Choose days and a time that suit the new class count, from your teacher's
                availability. Your coach confirms it before it applies.
              </p>
              <SchedulePicker availability={availability} days={days} setDays={setDays} time={time} setTime={setTime} disabled={busy} />
            </div>
          )}
        </div>
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
        disabled={busy || !packageId || (changeSchedule && (!days.length || !time))}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit request
      </button>
    </div>
  );
}

function BreakForm({ onDone }: { onDone: () => void }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!startDate || !endDate) return;
    setBusy(true);
    try {
      await requestBreak({ startDate, endDate, reason: reason.trim() || undefined });
      await Swal.fire({
        title: "Break request submitted",
        text: "Your coach will review it. Once approved, your classes pause for the window and your billing cycle is extended.",
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
            Break start date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
            Break end date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
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
        During a break your classes and package hours pause, your teacher stays reserved, and your
        billing cycle is extended by the break — nothing is lost.
      </p>

      <button
        onClick={submit}
        disabled={busy || !startDate || !endDate}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit request
      </button>
    </div>
  );
}

/*
 * Days + time chosen from the CURRENT TEACHER's availability — the spec's "time
 * displayed should be only Teacher Availability time and Day". When the teacher
 * has published nothing, every day/time is open and this falls back to free
 * entry, matching the server's permissive rule.
 */
function SchedulePicker({
  availability,
  days,
  setDays,
  time,
  setTime,
  disabled,
}: {
  availability: ScheduleAvailability | null;
  days: string[];
  setDays: React.Dispatch<React.SetStateAction<string[]>>;
  time: string;
  setTime: (t: string) => void;
  disabled?: boolean;
}) {
  const windows = availability?.teacher?.windows ?? {};
  const duration = availability?.durationMinutes ?? 60;
  const constrained = teacherHasWindows(windows);
  const selectableDays = constrained ? DAYS.filter((d) => (windows[d]?.length ?? 0) > 0) : DAYS;
  const times = constrained ? validStartTimes(days, windows, duration) : [];

  // Drop a day that is no longer offered, and a time that no longer fits.
  useEffect(() => {
    if (constrained && time && !validStartTimes(days, windows, duration).includes(time)) setTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const toggle = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <div>
      {availability?.teacher && (
        <p className="mb-1.5 text-[11px] text-ink-3">
          Showing times {availability.teacher.name} is available
          {availability.teacher.timeZone ? ` (${availability.teacher.timeZone})` : ""}.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d) => {
          const ok = selectableDays.includes(d);
          return (
            <button
              key={d}
              type="button"
              disabled={disabled || !ok}
              onClick={() => toggle(d)}
              title={ok ? undefined : "Teacher is not available on this day"}
              className={`h-9 rounded-lg border px-3 text-[11px] font-bold transition-colors ${
                days.includes(d)
                  ? "border-accent bg-accent text-white"
                  : ok
                    ? "border-hairline bg-surface text-ink-2 hover:bg-surface-2"
                    : "cursor-not-allowed border-hairline/60 bg-surface-2/40 text-ink-3/40"
              }`}
            >
              {d.slice(0, 3)}
            </button>
          );
        })}
      </div>

      <div className="mt-2">
        {constrained ? (
          <>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={disabled || !days.length}
              className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="">{days.length ? "— Choose an available time —" : "Pick day(s) first"}</option>
              {times.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {days.length > 0 && times.length === 0 && (
              <p className="mt-1 text-[11px] font-semibold text-amber-600">
                No time fits the teacher's hours on all selected days — try fewer days.
              </p>
            )}
          </>
        ) : (
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
          />
        )}
      </div>
    </div>
  );
}

function ScheduleForm({ sub, availability, onDone }: { sub: CurrentSubscription; availability: ScheduleAvailability | null; onDone: () => void }) {
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState("");
  // Defaults to the next cycle start (this cycle's end), per the spec — the
  // student can still pick a later date.
  const [startDate, setStartDate] = useState(sub.cycle.end ? sub.cycle.end.slice(0, 10) : "");
  const [batchId, setBatchId] = useState(sub.schedule[0]?.batchId ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

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
        Preferred days &amp; time
      </label>
      <SchedulePicker availability={availability} days={days} setDays={setDays} time={time} setTime={setTime} disabled={busy} />

      <div className="mt-3">
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
          Preferred start date <span className="font-normal normal-case text-ink-3/70">(defaults to next cycle start)</span>
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={busy}
          className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
        />
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
