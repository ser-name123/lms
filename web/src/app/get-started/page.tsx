"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  User,
  Users,
  BookOpen,
  MessageSquare,
  ShieldCheck,
  Check,
  Loader2,
  CircleAlert,
  PartyPopper,
  LogIn,
  LifeBuoy,
  MailCheck,
} from "lucide-react";

import { ApiError, createLead, verifyLeadOtp, checkLeadDuplicate, type OtpChallenge } from "@/lib/api";

type Form = Record<string, string>;

const GENDERS = ["Male", "Female", "Other"];
const RELATIONS = ["Father", "Mother", "Guardian", "Other"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const TEACHER_GENDERS = ["Any", "Male", "Female"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["Morning", "Afternoon", "Evening"];
// Half-hourly clock for the preferred-time picker (06:00 → 22:00).
const HOURS = Array.from({ length: 33 }, (_, i) => {
  const h = 6 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

function detectTracking(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  const browser = /edg/i.test(ua) ? "Edge" : /chrome/i.test(ua) ? "Chrome" : /firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Other";
  const device = /mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Desktop";
  const qs = new URLSearchParams(window.location.search);
  return {
    browser,
    device,
    referralUrl: document.referrer || "",
    utmSource: qs.get("utm_source") || "",
    utmCampaign: qs.get("utm_campaign") || "",
    utmMedium: qs.get("utm_medium") || "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  };
}

export default function GetStartedPage() {
  const [form, setForm] = useState<Form>({ preferredTeacherGender: "Any", currentLevel: "Beginner" });
  const [days, setDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotTimes, setSlotTimes] = useState<Record<string, { from: string; to: string }>>({});
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [notRobot, setNotRobot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ leadNumber: string } | null>(null);
  const [dupe, setDupe] = useState<{ leadNumber: string } | null>(null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [verifying, setVerifying] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (list: string[], setList: (v: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const toggleSlot = (v: string) => {
    const on = slots.includes(v);
    setSlots((cur) => (on ? cur.filter((x) => x !== v) : [...cur, v]));
    setSlotTimes((t) => {
      const n = { ...t };
      if (on) delete n[v];
      else n[v] = { from: "", to: "" };
      return n;
    });
  };
  const setSlotTime = (slot: string, field: "from" | "to", value: string) =>
    setSlotTimes((t) => ({ ...t, [slot]: { ...(t[slot] || { from: "", to: "" }), [field]: value } }));

  useEffect(() => setTracking(detectTracking()), []);

  const buildPayload = () => {
    const payload: Record<string, unknown> = { ...tracking };
    Object.entries(form).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== "") payload[k] = v;
    });
    if (days.length) payload.preferredDays = days;
    if (slots.length) {
      // Encode the chosen time onto the slot, e.g. "Morning (07:00–09:00)".
      payload.preferredTimeSlots = slots.map((s) => {
        const t = slotTimes[s];
        return t?.from && t?.to ? `${s} (${t.from}–${t.to})` : t?.from ? `${s} (from ${t.from})` : s;
      });
    }
    payload.acceptPrivacy = acceptPrivacy;
    payload.acceptTerms = acceptTerms;
    return payload;
  };

  // Step 1: submit → receive an email OTP challenge (lead not yet created).
  const doSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createLead(buildPayload());
      setChallenge(res);
      setOtpInput(res.otp || ""); // dev: prefill the code shown in the response
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Step 2: verify the OTP → the lead is created.
  const verify = async () => {
    if (!challenge) return;
    if (otpInput.trim().length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await verifyLeadOtp(challenge.email, otpInput.trim());
      setDone({ leadNumber: res.leadNumber });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createLead(buildPayload());
      setChallenge(res);
      setOtpInput(res.otp || "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  };

  // Which required field is missing (specific, actionable message).
  const firstMissing = () => {
    if (!form.studentFirstName?.trim() || !form.studentLastName?.trim())
      return "Please enter the student's first and last name (Student Details).";
    if (!/^\S+@\S+\.\S+$/.test(form.email || ""))
      return "Please enter a valid email address (Parent Details).";
    if ((form.mobile || "").trim().length < 7)
      return "Please enter a valid mobile number (Parent Details).";
    if (!notRobot) return "Please confirm you're not a robot (Security & Consent).";
    if (!acceptPrivacy || !acceptTerms)
      return "Please accept the Privacy Policy and Terms & Conditions.";
    return null;
  };

  const onSubmit = async () => {
    const missing = firstMissing();
    if (missing) {
      setError(missing);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Step 2 — duplicate email/mobile guard.
      const dup = await checkLeadDuplicate(form.email, form.mobile);
      if (dup.exists && dup.lead) {
        setDupe({ leadNumber: dup.lead.leadNumber });
        setBusy(false);
        return;
      }
      await doSubmit();
    } catch {
      // If the duplicate check itself fails, fall through to a normal submit.
      await doSubmit();
    }
  };

  // OTP verification screen (after submit, before the success screen).
  if (challenge && !done) {
    return (
      <div className="min-h-screen grid place-items-center bg-page p-4">
        <div className="w-full max-w-md rounded-3xl border border-hairline bg-surface p-8 shadow-xl">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent">
            <MailCheck className="size-8" />
          </div>
          <h1 className="text-center text-xl font-black text-ink">Verify your email</h1>
          <p className="mt-2 text-center text-sm text-ink-3">
            We sent a 6-digit code to <span className="font-semibold text-ink-2">{challenge.email}</span>. Enter it to confirm your trial request.
          </p>

          {challenge.otp && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold text-amber-600">
              Dev mode — your code is <span className="font-black tracking-widest">{challenge.otp}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-500">
              <CircleAlert className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <input
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="——————"
            className="mt-4 h-14 w-full rounded-xl border border-hairline bg-surface text-center text-2xl font-black tracking-[0.4em] text-ink focus:outline-none focus:border-accent"
          />

          <button
            type="button"
            onClick={verify}
            disabled={verifying}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {verifying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Verify &amp; Submit
          </button>

          <div className="mt-3 flex items-center justify-between text-xs">
            <button type="button" onClick={() => { setChallenge(null); setError(null); }} className="font-bold text-ink-3 hover:text-ink">
              ← Edit details
            </button>
            <button type="button" onClick={resend} disabled={busy} className="font-bold text-accent hover:underline disabled:opacity-50">
              Resend code
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-page p-4">
        <div className="w-full max-w-md rounded-3xl border border-hairline bg-surface p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <PartyPopper className="size-8" />
          </div>
          <h1 className="text-xl font-black text-ink">Trial Request Received!</h1>
          <p className="mt-2 text-sm text-ink-3">
            Thank you{form.parentName ? `, ${form.parentName}` : ""}. Our Academic Coach will contact you shortly to
            schedule an evaluation.
          </p>
          <p className="mt-3 text-xs font-bold text-ink-2">
            Reference: <span className="text-accent">{done.leadNumber}</span>
          </p>
          <Link
            href="/signin"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-bold text-white hover:opacity-90"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-ink leading-none">Book a Free Trial Class</h1>
            <p className="text-xs text-ink-3 mt-1">Tell us about the student — our coach will reach out</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-500">
            <CircleAlert className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-5">
          {/* Section 1 — Student */}
          <Section icon={User} title="Student Details">
            <Field label="First Name" required value={form.studentFirstName} onChange={(v) => set("studentFirstName", v)} />
            <Field label="Last Name" required value={form.studentLastName} onChange={(v) => set("studentLastName", v)} />
            <Select label="Gender" value={form.gender} onChange={(v) => set("gender", v)} options={GENDERS} />
            <Field label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} />
            <Field label="Current Grade" value={form.currentGrade} onChange={(v) => set("currentGrade", v)} placeholder="e.g. Grade 5" />
            <Field label="Current School" value={form.currentSchool} onChange={(v) => set("currentSchool", v)} />
            <Field label="Country" value={form.country} onChange={(v) => set("country", v)} />
            <Field label="Time Zone" value={form.timeZone || tracking.timeZone} onChange={(v) => set("timeZone", v)} placeholder="auto-detected" />
          </Section>

          {/* Section 2 — Parent */}
          <Section icon={Users} title="Parent / Guardian Details">
            <Field label="Parent Name" value={form.parentName} onChange={(v) => set("parentName", v)} />
            <Select label="Relationship" value={form.relationship} onChange={(v) => set("relationship", v)} options={RELATIONS} />
            <Field label="Email" required type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="you@example.com" />
            <Field label="Mobile Number" required value={form.mobile} onChange={(v) => set("mobile", v)} placeholder="+91 98765 43210" />
            <Field label="WhatsApp Number" value={form.whatsappNumber} onChange={(v) => set("whatsappNumber", v)} placeholder="+91 …" />
          </Section>

          {/* Section 3 — Learning requirements */}
          <Section icon={BookOpen} title="Learning Requirements">
            <Field label="Interested Subject" value={form.interestedSubject} onChange={(v) => set("interestedSubject", v)} placeholder="e.g. Quran, Arabic" />
            <Select label="Current Level" value={form.currentLevel} onChange={(v) => set("currentLevel", v)} options={LEVELS} />
            <Field label="Preferred Language" value={form.preferredLanguage} onChange={(v) => set("preferredLanguage", v)} placeholder="e.g. English / Urdu" />
            <Select label="Preferred Teacher Gender" value={form.preferredTeacherGender} onChange={(v) => set("preferredTeacherGender", v)} options={TEACHER_GENDERS} />
            <ChipRow label="Preferred Days" options={DAYS} selected={days} onToggle={(v) => toggle(days, setDays, v)} />
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Preferred Time Slots</label>
              <div className="space-y-2">
                {SLOTS.map((s) => {
                  const on = slots.includes(s);
                  const t = slotTimes[s] || { from: "", to: "" };
                  return (
                    <div key={s} className={`rounded-xl border p-2.5 transition-colors ${on ? "border-accent/40 bg-accent/5" : "border-hairline bg-surface"}`}>
                      <button type="button" onClick={() => toggleSlot(s)} className="inline-flex items-center gap-2 text-xs font-bold text-ink">
                        <span className={`grid size-4.5 place-items-center rounded-md border transition-colors ${on ? "border-accent bg-accent text-white" : "border-hairline text-transparent"}`}>
                          <Check className="size-3" />
                        </span>
                        {s}
                      </button>
                      {on && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-6">
                          <span className="w-9 text-[11px] font-semibold text-ink-3">From</span>
                          <select value={t.from} onChange={(e) => setSlotTime(s, "from", e.target.value)}
                            className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-semibold text-ink focus:outline-none focus:border-accent">
                            <option value="">—</option>
                            {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <span className="text-[11px] font-semibold text-ink-3">to</span>
                          <select value={t.to} onChange={(e) => setSlotTime(s, "to", e.target.value)} disabled={!t.from}
                            className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-semibold text-ink focus:outline-none focus:border-accent disabled:opacity-40">
                            <option value="">—</option>
                            {HOURS.filter((h) => !t.from || h > t.from).map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-ink-3">Pick a slot, then choose your preferred time range (optional).</p>
            </div>
          </Section>

          {/* Section 4 — Additional */}
          <Section icon={MessageSquare} title="Additional Questions">
            <Field label="Learning Goal" value={form.learningGoal} onChange={(v) => set("learningGoal", v)} placeholder="What do you want to achieve?" className="sm:col-span-2" />
            <Select label="Previous Coaching?" value={form.previousCoaching} onChange={(v) => set("previousCoaching", v)} options={["No", "Yes"]} />
            <Field label="Special Requirements" value={form.specialRequirements} onChange={(v) => set("specialRequirements", v)} />
            <Field label="Medical / Learning Disability" value={form.medicalDisability} onChange={(v) => set("medicalDisability", v)} placeholder="(optional)" className="sm:col-span-2" />
          </Section>

          {/* Section 5 — Security / consent */}
          <Section icon={ShieldCheck} title="Security & Consent">
            <div className="sm:col-span-2 space-y-2.5">
              <label className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3.5 py-3 cursor-pointer">
                <input type="checkbox" checked={notRobot} onChange={(e) => setNotRobot(e.target.checked)} className="size-4 accent-[var(--accent,#386FA4)]" />
                <span className="text-xs font-semibold text-ink-2">I&apos;m not a robot <span className="text-ink-3">(reCAPTCHA)</span></span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} className="size-4 accent-[var(--accent,#386FA4)]" />
                <span className="text-xs font-semibold text-ink-2">I accept the Privacy Policy</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="size-4 accent-[var(--accent,#386FA4)]" />
                <span className="text-xs font-semibold text-ink-2">I accept the Terms &amp; Conditions</span>
              </label>
            </div>
          </Section>

          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Request Free Trial
          </button>

          <p className="text-center text-xs text-ink-3 pb-6">
            Already registered?{" "}
            <Link href="/signin" className="font-bold text-accent hover:underline">Sign in</Link>
          </p>
        </div>
      </div>

      {/* Duplicate popup */}
      {dupe && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl border border-hairline bg-surface p-7 text-center shadow-2xl">
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-500">
              <CircleAlert className="size-7" />
            </div>
            <h3 className="text-base font-black text-ink">You already have a trial request</h3>
            <p className="mt-1.5 text-xs text-ink-3">
              A request already exists ({dupe.leadNumber}) for this email/mobile. Would you like to continue?
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Link href="/signin" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent text-xs font-bold text-white hover:opacity-90">
                <LogIn className="size-4" /> Login
              </Link>
              <a href="mailto:support@alfurqan.academy" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-hairline text-xs font-bold text-ink-2 hover:bg-surface-2">
                <LifeBuoy className="size-4" /> Contact Support
              </a>
            </div>
            <button
              type="button"
              onClick={() => { setDupe(null); doSubmit(); }}
              className="mt-3 text-[11px] font-bold text-ink-3 hover:text-ink hover:underline"
            >
              No, submit a new request anyway
            </button>
            <button
              type="button"
              onClick={() => setDupe(null)}
              className="mt-1 block w-full text-[11px] font-semibold text-ink-3 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-hairline bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 border-b border-hairline pb-3">
        <Icon className="size-5 text-accent" />
        <h2 className="text-sm font-bold text-ink">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", required = false, className = "",
}: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
      >
        <option value="">Select</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ChipRow({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="sm:col-span-2">
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all ${
                on ? "border-accent bg-accent/5 text-accent ring-1 ring-accent" : "border-hairline bg-surface text-ink-2 hover:border-accent/40"
              }`}
            >
              {on && <Check className="size-3.5" />}{o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
