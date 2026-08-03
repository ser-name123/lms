"use client";

/*
 * One form for creating and editing a subscription plan, shared by both the
 * "Create" and "Edit" buttons. The two used to be separate 200-line modals that
 * had to be kept in step by hand — every new field was a chance for them to
 * drift, and the reset-on-open bug (Edit's values leaking into Create) came
 * straight out of that duplication. One component, one set of fields.
 *
 * A plan belongs to a subscription model, and the model's pricing mode decides
 * which price the form asks for: a FIXED_MONTHLY model shows a flat monthly
 * price per currency; an HOURLY model shows an hourly rate per currency and
 * leaves the duration / weekly classes to be chosen per student at enrolment.
 */

import { useEffect, useMemo, useState } from "react";
import { PlusCircle, MinusCircle, X } from "lucide-react";
import Swal from "sweetalert2";

import { authHeader, type FeePlan } from "@/lib/api";
import { money, type Currency } from "@/lib/currency";
import { Button } from "@/components/ui/button";

export type SubscriptionModel = {
  id: string;
  key: string;
  name: string;
  pricingMode: "FIXED_MONTHLY" | "HOURLY";
  active: boolean;
  displayOrder: number;
};

// The typed feature toggles that make up a plan's feature matrix. Free-text
// benefit bullets still live alongside these (see `features`); the matrix is the
// structured, comparable set the spec's feature table is built from.
const FEATURE_KEYS: Array<[string, string]> = [
  ["nativeArabicTeacher", "Native Arabic Teacher"],
  ["eCertificate", "E-Certificate"],
  ["eSyllabus", "E-Syllabus"],
  ["directChat", "Direct Chat"],
  ["coachingSessions", "Coaching Sessions"],
  ["progressReport", "Progress Report"],
  ["topRatedTeacher", "Top Rated Teacher"],
  ["videoRecording", "Video Recording"],
];

const CURRENCIES: Currency[] = ["USD", "AED", "GBP"];

type PlanFormModalProps = {
  open: boolean;
  mode: "add" | "edit";
  initial: any | null;
  models: SubscriptionModel[];
  feePlans: FeePlan[];
  courses: any[];
  apiBase: string;
  onClose: () => void;
  onSaved: (pkg: any, mode: "add" | "edit") => void;
};

const str = (v: unknown) => (v == null ? "" : String(v));

export function PlanFormModal({
  open,
  mode,
  initial,
  models,
  feePlans,
  courses,
  apiBase,
  onClose,
  onSaved,
}: PlanFormModalProps) {
  const [title, setTitle] = useState("");
  const [modelId, setModelId] = useState("");
  const [tier, setTier] = useState("");
  const [priceUSD, setPriceUSD] = useState("");
  const [priceAED, setPriceAED] = useState("");
  const [priceGBP, setPriceGBP] = useState("");
  const [rateUSD, setRateUSD] = useState("");
  const [rateAED, setRateAED] = useState("");
  const [rateGBP, setRateGBP] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [weeklyClasses, setWeeklyClasses] = useState("2");
  const [rescheduleLimit, setRescheduleLimit] = useState("0");
  const [familyDiscountPct, setFamilyDiscountPct] = useState("0");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [badge, setBadge] = useState("");
  const [billing, setBilling] = useState("Monthly");
  const [level, setLevel] = useState("All");
  const [feePlanId, setFeePlanId] = useState("");
  const [coursesSel, setCoursesSel] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("Active");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Load values when the modal opens (or the row being edited changes). Guarded
  // on `open` so a create never inherits the last-edited plan's numbers.
  useEffect(() => {
    if (!open) return;
    const p = initial ?? {};
    setTitle(str(p.title));
    setModelId(str(p.modelId));
    setTier(str(p.tier));
    setPriceUSD(p.priceUSD == null ? "" : str(p.priceUSD));
    setPriceAED(p.priceAED == null ? "" : str(p.priceAED));
    setPriceGBP(p.priceGBP == null ? "" : str(p.priceGBP));
    setRateUSD(p.hourlyRateUSD == null ? "" : str(p.hourlyRateUSD));
    setRateAED(p.hourlyRateAED == null ? "" : str(p.hourlyRateAED));
    setRateGBP(p.hourlyRateGBP == null ? "" : str(p.hourlyRateGBP));
    setDurationMinutes(p.durationMinutes == null ? "60" : str(p.durationMinutes));
    setWeeklyClasses(p.weeklyClasses == null ? "2" : str(p.weeklyClasses));
    setRescheduleLimit(p.rescheduleLimit == null ? "0" : str(p.rescheduleLimit));
    setFamilyDiscountPct(p.familyDiscountPct == null ? "0" : str(p.familyDiscountPct));
    setDisplayOrder(p.displayOrder == null ? "0" : str(p.displayOrder));
    setBadge(str(p.badge));
    setBilling(str(p.billing) || "Monthly");
    setLevel(str(p.level) || "All");
    setFeePlanId(str(p.feePlanId));
    setCoursesSel(Array.isArray(p.courses) ? p.courses : []);
    setFeatures(Array.isArray(p.features) ? p.features : []);
    setNewFeature("");
    setMatrix(p.featureMatrix && typeof p.featureMatrix === "object" ? { ...p.featureMatrix } : {});
    setStatus(str(p.status) || "Active");
    setDescription(str(p.description));
  }, [open, initial]);

  const model = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const isHourly = model?.pricingMode === "HOURLY";

  const durNum = Number(durationMinutes) || 0;
  const weeklyNum = Number(weeklyClasses) || 0;
  const monthlyHours = durNum > 0 && weeklyNum > 0 ? (durNum / 60) * weeklyNum * 4 : 0;
  const monthlyClasses = weeklyNum > 0 ? weeklyNum * 4 : 0;

  // Per-currency tuition preview. Monthly = the flat price; hourly = rate × hours
  // a month, using the duration/weekly picked here purely as a sample.
  const tuitionPreview = (c: Currency): number | null => {
    if (isHourly) {
      const rate = c === "AED" ? rateAED : c === "GBP" ? rateGBP : rateUSD;
      const r = rate === "" ? null : Number(rate);
      if (r == null || !Number.isFinite(r) || monthlyHours <= 0) return null;
      return Math.round(r * monthlyHours * 100) / 100;
    }
    const price = c === "AED" ? priceAED : c === "GBP" ? priceGBP : priceUSD;
    const v = price === "" ? null : Number(price);
    return v == null || !Number.isFinite(v) ? null : v;
  };

  if (!open) return null;

  const numOrNull = (s: string) => (s === "" ? null : Number(s));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      Swal.fire({ title: "Title required", text: "Please give the plan a title.", icon: "error" });
      return;
    }
    if (isHourly && rateUSD === "" && rateAED === "" && rateGBP === "") {
      Swal.fire({ title: "Rate required", text: "Enter at least one hourly rate.", icon: "error" });
      return;
    }
    if (!isHourly && priceUSD === "") {
      Swal.fire({ title: "Price required", text: "Enter the monthly USD price.", icon: "error" });
      return;
    }

    const payload: any = {
      title: title.trim(),
      modelId: modelId || null,
      tier: tier.trim() || null,
      // Monthly price columns. Hourly plans have no flat price — send 0 so the
      // required column is satisfied; the rate below carries the real figure.
      priceUSD: isHourly ? 0 : Number(priceUSD) || 0,
      priceAED: isHourly ? null : numOrNull(priceAED),
      priceGBP: isHourly ? null : numOrNull(priceGBP),
      hourlyRateUSD: isHourly ? numOrNull(rateUSD) : null,
      hourlyRateAED: isHourly ? numOrNull(rateAED) : null,
      hourlyRateGBP: isHourly ? numOrNull(rateGBP) : null,
      // Fixed structure belongs to monthly plans; hourly leaves it per-student.
      durationMinutes: isHourly ? null : Number(durationMinutes) || null,
      weeklyClasses: isHourly ? null : Number(weeklyClasses) || null,
      classesPerMonth: isHourly ? null : monthlyClasses || null,
      rescheduleLimit: Number(rescheduleLimit) || 0,
      familyDiscountPct: Number(familyDiscountPct) || 0,
      displayOrder: Number(displayOrder) || 0,
      badge: badge.trim() || null,
      featureMatrix: matrix,
      billing,
      level,
      feePlanId: feePlanId || null,
      courses: coursesSel,
      features: features.length ? features : ["General Access"],
      status,
      description: description.trim() || "No description provided.",
    };

    setSaving(true);
    try {
      const url =
        mode === "add"
          ? `${apiBase}/lms-data/packages`
          : `${apiBase}/lms-data/packages/${initial.id}`;
      const res = await fetch(url, {
        method: mode === "add" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) ||
            `Request failed (${res.status})`,
        );
      }
      const saved = await res.json();
      onSaved(saved, mode);
    } catch (err: any) {
      Swal.fire({ title: "Could not save", text: err.message, icon: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleCourse = (code: string) =>
    setCoursesSel((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const addFeature = () => {
    const t = newFeature.trim();
    if (!t || features.includes(t)) return;
    setFeatures([...features, t]);
    setNewFeature("");
  };

  const inputCls =
    "h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent";
  const labelCls = "block text-xs font-bold text-ink-3 uppercase mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <div className="relative w-full max-w-2xl rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
          <h3 className="text-base font-bold text-ink">
            {mode === "add" ? "Create Subscription Plan" : "Edit Subscription Plan"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X className="size-5" />
          </button>
        </header>

        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Model + tier + title */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Plan Title</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Premium" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Subscription Model</label>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)} className={inputCls}>
                <option value="">— none (legacy) —</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.pricingMode === "HOURLY" ? "hourly" : "monthly"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tier</label>
              <input value={tier} onChange={(e) => setTier(e.target.value)} placeholder="Simple / Basic / Premium…" className={inputCls} />
            </div>
          </div>

          {/* Pricing — monthly price OR hourly rate depending on the model */}
          {isHourly ? (
            <div>
              <label className={labelCls}>Hourly rate per currency</label>
              <div className="grid grid-cols-3 gap-3">
                {[["USD", rateUSD, setRateUSD, "$ / hr"], ["AED", rateAED, setRateAED, "AED / hr"], ["GBP", rateGBP, setRateGBP, "£ / hr"]].map(
                  ([c, val, setter, hint]: any) => (
                    <div key={c}>
                      <input type="number" min="0" step="0.01" placeholder={c} value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
                      <p className="mt-1 text-[10px] font-bold text-ink-3">{hint}</p>
                    </div>
                  ),
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-ink-3">
                Monthly tuition is computed per student: rate × (duration ÷ 60) × weekly classes × 4 weeks. Duration and weekly classes are chosen at enrolment.
              </p>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Monthly price per currency</label>
              <div className="grid grid-cols-3 gap-3">
                {[["USD", priceUSD, setPriceUSD, "$ USD"], ["AED", priceAED, setPriceAED, "AED · UAE"], ["GBP", priceGBP, setPriceGBP, "£ GBP · UK"]].map(
                  ([c, val, setter, hint]: any) => (
                    <div key={c}>
                      <input type="number" min="0" step="0.01" required={c === "USD"} placeholder={c} value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
                      <p className="mt-1 text-[10px] font-bold text-ink-3">{hint}</p>
                    </div>
                  ),
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-ink-3">
                Charged as typed — nothing is converted. Leave a currency blank and the plan is simply not offered in it.
              </p>
            </div>
          )}

          {/* Structure: duration + weekly (monthly = fixed; hourly = sample) */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Class duration</label>
              <select value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={inputCls}>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Weekly classes</label>
              <input type="number" min={1} max={7} value={weeklyClasses} onChange={(e) => setWeeklyClasses(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly hours</label>
              <div className="h-10 flex items-center rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm font-semibold text-ink">
                {monthlyHours || "—"} {monthlyHours ? "hrs" : ""}
                <span className="ml-2 text-[10px] font-normal text-ink-3">({monthlyClasses || "—"} classes)</span>
              </div>
            </div>
          </div>
          {isHourly && (
            <p className="-mt-2 text-[10px] text-ink-3">Duration & weekly above are a sample for the estimate below — hourly plans don’t fix them.</p>
          )}

          {/* Tuition preview */}
          <div className="rounded-xl border border-hairline bg-surface-2 p-3">
            <p className="text-xs font-bold text-ink-3 uppercase mb-1.5">Estimated monthly tuition</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
              {CURRENCIES.map((c) => {
                const v = tuitionPreview(c);
                return (
                  <span key={c} className={v == null ? "text-ink-3" : "text-emerald-500"}>
                    {money(v, c)}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Limits / discount / ordering */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Reschedules</label>
              <input type="number" min={0} max={30} value={rescheduleLimit} onChange={(e) => setRescheduleLimit(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Family disc. %</label>
              <input type="number" min={0} max={100} step="0.5" value={familyDiscountPct} onChange={(e) => setFamilyDiscountPct(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Display order</label>
              <input type="number" min={0} value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Badge</label>
              <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="Popular…" className={inputCls} />
            </div>
          </div>

          {/* Feature matrix */}
          <div>
            <label className={labelCls}>Feature matrix</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-hairline bg-surface-2 p-3">
              {FEATURE_KEYS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs font-semibold text-ink-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!matrix[key]}
                    onChange={(e) => setMatrix((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="rounded text-accent focus:ring-accent border-hairline size-3.5"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Billing cycle + level + fee plan + status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Billing cycle</label>
              <select value={billing} onChange={(e) => setBilling(e.target.value)} className={inputCls}>
                <option>Monthly</option>
                <option>Quarterly</option>
                <option>Yearly</option>
                <option value="One-time">One-time</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Target level</label>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
                <option value="All">All Levels</option>
                <option value="Kids">Kids</option>
                <option value="Adults">Adults</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Billed by fee plan</label>
              <select value={feePlanId} onChange={(e) => setFeePlanId(e.target.value)} className={inputCls}>
                <option value="">Not linked to billing</option>
                {feePlans.map((fp) => (
                  <option key={fp.id} value={fp.id}>
                    {fp.name} · {fp.cycle.replace(/_/g, " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option>Active</option>
                <option>Draft</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>

          {/* Linked courses */}
          <div>
            <label className={labelCls}>Linked courses (included)</label>
            <div className="border border-hairline rounded-xl p-3 bg-surface-2 max-h-32 overflow-y-auto grid grid-cols-2 gap-2 text-xs font-semibold">
              {courses.map((course) => (
                <label key={course.code} className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={coursesSel.includes(course.code)} onChange={() => toggleCourse(course.code)} className="rounded text-accent focus:ring-accent border-hairline size-3.5" />
                  <span className="text-ink-2 truncate" title={course.title}>
                    <span className="font-mono bg-surface px-1 rounded mr-1.5 border border-hairline text-[10px]">{course.code}</span>
                    {course.title}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Free-text benefit bullets */}
          <div>
            <label className={labelCls}>Benefit bullets (display)</label>
            <div className="flex gap-2 mb-2">
              <input
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFeature();
                  }
                }}
                placeholder="e.g. 1-on-1 weekly session"
                className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <Button type="button" variant="outline" onClick={addFeature} className="rounded-xl flex items-center gap-1.5 px-3">
                <PlusCircle className="size-4 text-accent" /> Add
              </Button>
            </div>
            <div className="border border-hairline rounded-xl p-3 bg-surface-2 space-y-1.5 max-h-28 overflow-y-auto">
              {features.length ? (
                features.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-ink-2 font-semibold flex items-center gap-1.5">
                      <span className="text-emerald-500 font-bold">✓</span> {f}
                    </span>
                    <button type="button" onClick={() => setFeatures(features.filter((_, j) => j !== i))} className="text-ink-3 hover:text-critical p-0.5">
                      <MinusCircle className="size-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-ink-3 italic text-center py-1">No bullets yet.</p>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none" />
          </div>

          <footer className="flex justify-end gap-2 pt-2 border-t border-hairline">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : mode === "add" ? "Publish Plan" : "Save Changes"}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
