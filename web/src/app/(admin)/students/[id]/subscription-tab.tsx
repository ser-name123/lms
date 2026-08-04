"use client";

/*
 * The staff view of a student's subscription: the stored record (model, tier,
 * duration, live counters, renewal), an override for the family's billing
 * currency, and a migration to another model/plan that preserves all history.
 * All three read straight off the same APIs the student and coach use, so the
 * numbers here can never disagree with what the family sees.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, Wallet, ArrowLeftRight, Save, CalendarCog, CalendarOff, Send } from "lucide-react";

import { money, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";
import {
  fetchStudentSubscription,
  fetchStudentsTeachers,
  setStudentBillingCurrency,
  migrateSubscription,
  previewModifySchedule,
  modifyStudentSchedule,
  requestBreakForStudent,
  type CurrentSubscription,
  type ModifyScheduleScope,
  type ModifySchedulePreview,
} from "@/lib/api";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type SubModel = { id: string; name: string; pricingMode: "FIXED_MONTHLY" | "HOURLY" };
type Plan = {
  id: string;
  title: string;
  modelId: string | null;
  tier: string | null;
  priceUSD: number;
  priceAED: number | null;
  priceGBP: number | null;
  hourlyRateUSD: number | null;
  hourlyRateAED: number | null;
  hourlyRateGBP: number | null;
  durationMinutes: number | null;
  weeklyClasses: number | null;
  status: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
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

// Pretty subscription status — keeps the admin view in step with the student
// portal, which surfaces the payment-gated PENDING_PAYMENT state explicitly.
const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending payment",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ON_BREAK: "On break",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};
const fmtStatus = (v: string | null | undefined) =>
  v ? (STATUS_LABELS[v] ?? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")) : "—";

export function SubscriptionTab({ studentId }: { studentId: string }) {
  const [sub, setSub] = useState<CurrentSubscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [models, setModels] = useState<SubModel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchStudentSubscription(studentId).catch(() => null),
      fetch(`${apiBase}/lms-data/packages`).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase}/lms-data/subscription-models`).then((r) => r.json()).catch(() => []),
    ])
      .then(([s, p, m]) => {
        setSub(s);
        setPlans(Array.isArray(p) ? p : []);
        setModels(Array.isArray(m) ? m : []);
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => load(), [load]);

  const currency = (sub?.currency ?? "USD") as Currency;
  const modelMode = useMemo(() => {
    const m = new Map<string, "FIXED_MONTHLY" | "HOURLY">();
    models.forEach((x) => m.set(x.id, x.pricingMode));
    return m;
  }, [models]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-xs font-bold text-ink-3">
        <Loader2 className="size-4 animate-spin text-accent" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Record */}
      <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-ink">Current subscription</h3>
        {sub?.record ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Model">{sub.record.pricingMode === "HOURLY" ? "Hourly Subscription" : "Monthly Package"}</Stat>
            <Stat label="Course">{sub.record.course?.title ?? sub.course?.title ?? "—"}</Stat>
            <Stat label="Plan / tier">{(sub.package?.name ?? "—") + (sub.record.tier ? ` · ${sub.record.tier}` : "")}</Stat>
            <Stat label="Currency">{sub.record.currency ?? currency}</Stat>
            <Stat label="Billing cycle">{fmtCycle(sub.record.billingCycle)}</Stat>
            <Stat label={sub.record.pricingMode === "HOURLY" ? "Hourly rate" : "Monthly price"}>
              {sub.record.pricingMode === "HOURLY"
                ? `${money(sub.record.hourlyRate, currency)} / hr`
                : money(sub.record.monthlyPrice, currency, { emptyText: "Not set" })}
            </Stat>
            <Stat label="Est. monthly tuition">{money(sub.record.monthlyPrice, currency, { emptyText: "Not set" })}</Stat>
            <Stat label="Duration">{sub.record.durationMinutes} min</Stat>
            <Stat label="Weekly classes">{sub.record.weeklyClasses}×/week</Stat>
            <Stat label="Monthly hours">{sub.record.monthlyHours} hrs</Stat>
            <Stat label="Remaining / done">{sub.record.remainingClasses} / {sub.record.completedClasses}</Stat>
            <Stat label="Reschedules left">{sub.record.reschedulesLeft} of {sub.record.rescheduleLimit}</Stat>
            <Stat label="Family discount">{sub.record.familyDiscountPct}%</Stat>
            <Stat label="Cycle start">
              {sub.record.actualCycleStartDate
                ? fmtDate(sub.record.actualCycleStartDate)
                : sub.record.status === "PENDING_PAYMENT"
                  ? "After payment"
                  : fmtDate(sub.record.preferredStartDate)}
            </Stat>
            <Stat label="Renews on">{fmtDate(sub.record.renewalDate)}</Stat>
            <Stat label="Status">{fmtStatus(sub.record.status)}</Stat>
          </div>
        ) : (
          <p className="text-sm text-ink-3">
            No stored subscription record yet{sub?.package ? " (legacy — package shown on the Course/Batch tab)" : ""}.
          </p>
        )}
      </div>

      {/* AC power tools — only meaningful once a schedule exists and the sub is live. */}
      {sub?.record && (sub.record.status === "ACTIVE" || sub.record.status === "ON_BREAK") && sub.schedule.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ModifySchedule studentId={studentId} sub={sub} onDone={load} />
          <BreakOnBehalf studentId={studentId} status={sub.record.status} onDone={load} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <CurrencyOverride studentId={studentId} current={currency} onSaved={load} />
        <MigratePlan studentId={studentId} plans={plans} modelMode={modelMode} onDone={load} />
      </div>
    </div>
  );
}

const SCOPE_OPTIONS: { value: ModifyScheduleScope; label: string; hint: string }[] = [
  { value: "CURRENT_REMAINING", label: "Remaining classes of this cycle", hint: "Next cycle reverts to the current pattern." },
  { value: "CURRENT_AND_NEXT", label: "This cycle and next cycle onwards", hint: "Applies now and becomes the new default." },
  { value: "NEXT_ONLY", label: "Next cycle onwards only", hint: "Current classes are left untouched." },
];

function ModifySchedule({ studentId, sub, onDone }: { studentId: string; sub: CurrentSubscription; onDone: () => void }) {
  const [scope, setScope] = useState<ModifyScheduleScope>("CURRENT_AND_NEXT");
  const [days, setDays] = useState<string[]>(sub.schedule[0]?.days ?? []);
  const [time, setTime] = useState<string>(sub.schedule[0]?.startTime ?? "");
  const [teacherId, setTeacherId] = useState<string>("");
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<ModifySchedulePreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStudentsTeachers()
      .then((rows) => setTeachers(rows.map((t) => ({ id: t.id, name: `${t.user.firstName} ${t.user.lastName}`.trim() }))))
      .catch(() => setTeachers([]));
  }, []);

  const toggle = (d: string) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const runPreview = async () => {
    setBusy(true);
    try {
      const p = await previewModifySchedule(studentId, {
        scope,
        days: days.length ? days : undefined,
        time: time || undefined,
        teacherId: teacherId || undefined,
      });
      setPreview(p);
    } catch (e) {
      Swal.fire({ title: "Could not preview", text: e instanceof Error ? e.message : "Please try again.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    const warn = preview.availabilityWarnings.length
      ? `\n\nWarning: the teacher has no published hours on ${preview.availabilityWarnings.join(", ")}.`
      : "";
    const clash = preview.teacherClashes.length
      ? `\n\nWarning: the teacher already runs ${preview.teacherClashes.map((c) => c.name).join(", ")} at that time.`
      : "";
    const sClash = preview.studentClashes.length
      ? `\n\nWarning: the student already attends ${preview.studentClashes.map((c) => c.name).join(", ")} at that time.`
      : "";
    const r = await Swal.fire({
      title: "Apply this schedule change?",
      text: `${preview.affectedCount} upcoming class(es) will be rescheduled.${warn}${clash}${sClash}`,
      icon: "warning", showCancelButton: true, confirmButtonText: "Apply", confirmButtonColor: "#f59e0b", background: swalBg(),
    });
    if (!r.isConfirmed) return;
    setBusy(true);
    try {
      const res = await modifyStudentSchedule(studentId, {
        scope,
        days: days.length ? days : undefined,
        time: time || undefined,
        teacherId: teacherId || undefined,
      });
      await Swal.fire({ title: "Schedule updated", text: `${res.cancelled} cancelled, ${res.created} rescheduled. ${res.applied.join("; ")}`, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      setPreview(null);
      onDone();
    } catch (e) {
      Swal.fire({ title: "Could not apply", text: e instanceof Error ? e.message : "Please try again.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarCog className="size-4 text-accent" />
        <h3 className="text-sm font-bold text-ink">Modify schedule</h3>
      </div>
      <p className="mb-3 text-[11px] text-ink-3">Change days, time or teacher. Choose how far the change reaches, then preview before applying.</p>

      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Apply to</label>
      <div className="mb-3 space-y-1.5">
        {SCOPE_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-hairline bg-surface-2/40 p-2.5">
            <input type="radio" name="scope" checked={scope === o.value} onChange={() => { setScope(o.value); setPreview(null); }} disabled={busy} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-xs font-bold text-ink">{o.label}</span>
              <span className="block text-[11px] text-ink-3">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Days</label>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d) => (
          <button key={d} type="button" disabled={busy} onClick={() => { toggle(d); setPreview(null); }}
            className={`h-9 rounded-lg border px-3 text-[11px] font-bold transition-colors ${days.includes(d) ? "border-accent bg-accent text-white" : "border-hairline bg-surface text-ink-2 hover:bg-surface-2"}`}>
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Time</label>
          <input type="time" value={time} onChange={(e) => { setTime(e.target.value); setPreview(null); }} disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Teacher (optional)</label>
          <select value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setPreview(null); }} disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent">
            <option value="">— Keep current —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {preview && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-ink-2">
          <p className="font-bold text-accent">{preview.affectedCount} upcoming class(es) affected</p>
          <p className="mt-0.5">New: {preview.newDays.join(", ")} at {preview.newTime}{preview.teacherChanged ? " · teacher changed" : ""}</p>
          {preview.otherStudentsInBatch > 0 && <p className="mt-0.5 text-amber-600">{preview.otherStudentsInBatch} other student(s) share this batch and will move too.</p>}
          {preview.availabilityWarnings.length > 0 && <p className="mt-0.5 text-amber-600">Teacher has no published hours on {preview.availabilityWarnings.join(", ")}.</p>}
          {preview.teacherClashes.length > 0 && <p className="mt-0.5 text-amber-600">Teacher clash: {preview.teacherClashes.map((c) => c.name).join(", ")}.</p>}
          {preview.studentClashes.length > 0 && <p className="mt-0.5 text-rose-600">Student clash: already attends {preview.studentClashes.map((c) => c.name).join(", ")} at that time.</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={runPreview} disabled={busy || (!days.length && !time && !teacherId)}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface px-4 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40">
          {busy && !preview ? <Loader2 className="size-4 animate-spin" /> : null} Preview
        </button>
        <button onClick={apply} disabled={busy || !preview}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
          {busy && preview ? <Loader2 className="size-4 animate-spin" /> : <CalendarCog className="size-4" />} Apply
        </button>
      </div>
    </div>
  );
}

function BreakOnBehalf({ studentId, status, onDone }: { studentId: string; status: string; onDone: () => void }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const onBreak = status === "ON_BREAK";

  const submit = async () => {
    if (!startDate || !endDate) return;
    setBusy(true);
    try {
      await requestBreakForStudent(studentId, { startDate, endDate, reason: reason.trim() || undefined });
      await Swal.fire({ title: "Break requested", text: "Raised on the student's behalf. Approve it in Subscription Requests to schedule it.", icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      setStartDate(""); setEndDate(""); setReason("");
      onDone();
    } catch (e) {
      Swal.fire({ title: "Could not submit", text: e instanceof Error ? e.message : "Please try again.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarOff className="size-4 text-accent" />
        <h3 className="text-sm font-bold text-ink">Request a break (on behalf)</h3>
      </div>
      {onBreak ? (
        <p className="text-xs text-ink-3">This student is currently on a break. It resumes automatically at the end of the window.</p>
      ) : (
        <>
          <p className="mb-3 text-[11px] text-ink-3">Raise a break the family asked for by phone / WhatsApp / chat. It still needs approval in Subscription Requests.</p>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Start</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy}
                className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">End</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={busy}
                className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} disabled={busy} placeholder="Reason (optional)"
            className="mb-3 w-full rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
          <button onClick={submit} disabled={busy || !startDate || !endDate}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit break request
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 text-sm font-black text-ink">{children}</p>
    </div>
  );
}

function CurrencyOverride({ studentId, current, onSaved }: { studentId: string; current: Currency; onSaved: () => void }) {
  const [value, setValue] = useState<Currency>(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [current]);

  const save = async () => {
    if (value === current) return;
    setBusy(true);
    try {
      await setStudentBillingCurrency(studentId, value);
      await Swal.fire({ title: "Currency updated", text: `Future invoices will be billed in ${value}. Invoices already issued keep their own currency.`, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      onSaved();
    } catch (e) {
      Swal.fire({ title: "Could not update", text: e instanceof Error ? e.message : "Please try again.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="size-4 text-accent" />
        <h3 className="text-sm font-bold text-ink">Billing currency</h3>
      </div>
      <p className="mb-3 text-[11px] text-ink-3">Set automatically from the family's country. Override only to correct it.</p>
      <div className="flex items-center gap-2">
        <select value={value} onChange={(e) => setValue(e.target.value as Currency)} disabled={busy}
          className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent">
          {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={save} disabled={busy || value === current}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
        </button>
      </div>
    </div>
  );
}

function MigratePlan({ studentId, plans, modelMode, onDone }: { studentId: string; plans: Plan[]; modelMode: Map<string, "FIXED_MONTHLY" | "HOURLY">; onDone: () => void }) {
  const [planId, setPlanId] = useState("");
  const [duration, setDuration] = useState("60");
  const [weekly, setWeekly] = useState("3");
  const [busy, setBusy] = useState(false);

  const active = plans.filter((p) => p.status === "Active");
  const selected = active.find((p) => p.id === planId);
  const isHourly = selected ? modelMode.get(selected.modelId ?? "") === "HOURLY" : false;

  const migrate = async () => {
    if (!planId) return;
    const r = await Swal.fire({
      title: "Migrate subscription?",
      text: "This ends the current subscription and starts a new one. Past invoices, attendance and classes are kept unchanged.",
      icon: "warning", showCancelButton: true, confirmButtonText: "Migrate", confirmButtonColor: "#f59e0b", background: swalBg(),
    });
    if (!r.isConfirmed) return;
    setBusy(true);
    try {
      const res = await migrateSubscription(studentId, {
        newPackageId: planId,
        ...(isHourly ? { durationMinutes: Number(duration), weeklyClasses: Number(weekly) } : {}),
      });
      await Swal.fire({ title: "Migrated", text: `Now on ${res.pricingMode === "HOURLY" ? "an Hourly" : "a Monthly"} plan${res.monthlyPrice != null ? ` · ${money(res.monthlyPrice)}` : ""}.`, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      setPlanId("");
      onDone();
    } catch (e) {
      Swal.fire({ title: "Could not migrate", text: e instanceof Error ? e.message : "Please try again.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ArrowLeftRight className="size-4 text-accent" />
        <h3 className="text-sm font-bold text-ink">Migrate model / plan</h3>
      </div>
      <p className="mb-3 text-[11px] text-ink-3">Move the student to another plan (e.g. Monthly → Hourly). History is preserved.</p>
      <select value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={busy}
        className="mb-3 h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent">
        <option value="">— Choose target plan —</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}{p.tier ? ` · ${p.tier}` : ""} ({modelMode.get(p.modelId ?? "") === "HOURLY" ? "Hourly" : "Monthly"})
          </option>
        ))}
      </select>
      {isHourly && (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Duration</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="30">30 min</option>
              <option value="60">60 min</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Weekly classes</label>
            <input type="number" min={1} max={7} value={weekly} onChange={(e) => setWeekly(e.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>
      )}
      <button onClick={migrate} disabled={busy || !planId}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />} Migrate
      </button>
    </div>
  );
}
