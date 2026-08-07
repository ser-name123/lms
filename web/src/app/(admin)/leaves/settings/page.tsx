"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LEAVE_TYPE_LABELS } from "@/components/leaves/shared";
import { fetchLeaveConfig, saveLeaveConfig, type LeaveConfig } from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

const input =
  "h-9 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3";

const ALL_STAFF = ["ANNUAL", "SICK", "EMERGENCY", "PERSONAL", "UNPAID", "TRAINING", "CASUAL", "OTHER"];
const ALL_UNAVAIL = [
  "PERSONAL", "MEDICAL", "VACATION", "TRAINING", "FAMILY_EMERGENCY",
  "SCHEDULE_CONFLICT", "RELIGIOUS_HOLIDAY", "OTHER",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Chips({
  options, selected, onToggle, disabled,
}: { options: string[]; selected: string[]; onToggle: (v: string) => void; disabled?: (v: string) => boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const off = disabled?.(o) ?? false;
        return (
          <button
            key={o}
            type="button"
            disabled={off}
            onClick={() => onToggle(o)}
            className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
              off
                ? "cursor-not-allowed border border-hairline bg-surface-2/40 text-ink-3 opacity-60"
                : selected.includes(o)
                  ? "bg-accent text-accent-ink"
                  : "border border-hairline bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            {LEAVE_TYPE_LABELS[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

/** §9.11 — "Leave and unavailability types shall be configurable by the Admin." */
export default function LeaveSettingsPage() {
  const [cfg, setCfg] = useState<LeaveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchLeaveConfig()
      .then(setCfg)
      .catch(() => setCfg(null))
      .finally(() => setLoading(false));
  }, []);

  const patch = (p: Partial<LeaveConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      const saved = await saveLeaveConfig(cfg);
      setCfg(saved);
      await Swal.fire({ title: "Saved", icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
    } catch (e) {
      Swal.fire({
        title: "Could not save",
        text: e instanceof Error ? e.message : "Something went wrong",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading || !cfg) {
    return (
      <>
        <Topbar title="Leave Setup" subtitle="Types, deductions and rules" />
        <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
          <Loader2 className="size-4 animate-spin text-accent" /> Loading…
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Leave Setup" subtitle="Which types are offered, and how unpaid days are deducted" />

      <div className="animate-fade-up max-w-4xl space-y-5 p-4 lg:p-6">
        <Link href="/leaves" className="flex w-fit items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Back to leave requests
        </Link>

        <Card className="border border-hairline bg-surface">
          <CardBody className="space-y-4 p-5">
            <div>
              <p className="text-sm font-black text-ink">Staff leave types</p>
              <p className="mb-2 text-[11px] text-ink-3">Offered to coaches, supervisors and admins.</p>
              <Chips
                options={ALL_STAFF}
                selected={cfg.staffTypes}
                onToggle={(v) => patch({ staffTypes: toggle(cfg.staffTypes, v) })}
              />
            </div>

            <div>
              <p className="text-sm font-black text-ink">Teacher unavailability types</p>
              <p className="mb-2 text-[11px] text-ink-3">Offered to teachers. Their absence affects student classes.</p>
              <Chips
                options={ALL_UNAVAIL}
                selected={cfg.unavailabilityTypes}
                onToggle={(v) => patch({ unavailabilityTypes: toggle(cfg.unavailabilityTypes, v) })}
              />
            </div>

            <div>
              <p className="text-sm font-black text-ink">Paid unless the admin says otherwise</p>
              <p className="mb-2 text-[11px] text-ink-3">
                Only the default on the approval dialog — §9.3 keeps the decision with the admin every time.
                A type named &ldquo;unpaid&rdquo; can never default to paid.
              </p>
              <Chips
                options={[...new Set([...ALL_STAFF, ...ALL_UNAVAIL])]}
                selected={cfg.paidByDefault}
                onToggle={(v) => patch({ paidByDefault: toggle(cfg.paidByDefault, v) })}
                disabled={(v) => v === "UNPAID"}
              />
            </div>
          </CardBody>
        </Card>

        <Card className="border border-hairline bg-surface">
          <CardBody className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-black text-ink">Unpaid leave deduction (§9.3)</p>
              <p className="text-[11px] text-ink-3">
                What one unpaid day costs. The figure is fixed at approval and becomes a salary deduction line.
              </p>
            </div>
            <div>
              <label className={label}>How it is worked out</label>
              <select
                className={input}
                value={cfg.deductionMode}
                onChange={(e) => patch({ deductionMode: e.target.value as LeaveConfig["deductionMode"] })}
              >
                <option value="DAILY_RATE">From the teacher&apos;s own recent pay</option>
                <option value="FIXED">A fixed amount per day</option>
              </select>
            </div>
            {cfg.deductionMode === "FIXED" ? (
              <div>
                <label className={label}>Amount per day</label>
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={cfg.fixedDeductionPerDay}
                  onChange={(e) => patch({ fixedDeductionPerDay: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div>
                <label className={label}>Working days per month</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={input}
                  value={cfg.workingDaysPerMonth}
                  onChange={(e) => patch({ workingDaysPerMonth: Number(e.target.value) })}
                />
                <p className="mt-1 text-[10px] text-ink-3">Divides a month&apos;s pay into a day&apos;s pay.</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="border border-hairline bg-surface">
          <CardBody className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-black text-ink">Rules</p>
            </div>

            <div className="sm:col-span-2">
              <label className={label}>Days the academy does not work</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => patch({ nonWorkingWeekdays: toggle(cfg.nonWorkingWeekdays.map(String), String(i)).map(Number) })}
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
                      cfg.nonWorkingWeekdays.includes(i)
                        ? "bg-accent text-accent-ink"
                        : "border border-hairline bg-surface text-ink-2 hover:text-ink"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-ink-3">
                Skipped when the total days are counted, so a Friday-to-Monday request over a closed weekend is two days,
                not four.
              </p>
            </div>

            <div>
              <label className={label}>Notice expected (days)</label>
              <input
                type="number"
                min={0}
                className={input}
                value={cfg.noticeDaysExpected}
                onChange={(e) => patch({ noticeDaysExpected: Number(e.target.value) })}
              />
              <p className="mt-1 text-[10px] text-ink-3">Advisory — short notice is flagged, never blocked.</p>
            </div>
            <div>
              <label className={label}>Longest single request (days)</label>
              <input
                type="number"
                min={0}
                className={input}
                value={cfg.maxConsecutiveDays}
                onChange={(e) => patch({ maxConsecutiveDays: Number(e.target.value) })}
              />
              <p className="mt-1 text-[10px] text-ink-3">0 removes the limit.</p>
            </div>

            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={cfg.allowSelfCancel}
                onChange={(e) => patch({ allowSelfCancel: e.target.checked })}
              />
              Staff may withdraw their own pending request
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={cfg.autoRestoreOnReturn}
                onChange={(e) => patch({ autoRestoreOnReturn: e.target.checked })}
              />
              Restore availability automatically when the window ends (§9.7)
            </label>
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save setup
          </Button>
        </div>
      </div>
    </>
  );
}
