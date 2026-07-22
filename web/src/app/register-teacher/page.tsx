"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  User,
  Phone,
  MapPin,
  Briefcase,
  CalendarClock,
  Wallet,
  FileText,
  KeyRound,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CircleAlert,
  Eye,
  EyeOff,
  PartyPopper,
  Upload,
  Paperclip,
  Plus,
  X,
  MailCheck,
} from "lucide-react";

import {
  ApiError,
  createTeacherRegistration,
  verifyTeacherRegistrationOtp,
  uploadTeacherDocument,
  type OtpChallenge,
} from "@/lib/api";

type Form = Record<string, string>;

const STEPS = [
  { key: "personal", title: "Personal", icon: User },
  { key: "contact", title: "Contact", icon: Phone },
  { key: "professional", title: "Professional", icon: Briefcase },
  { key: "availability", title: "Availability", icon: CalendarClock },
  { key: "bank", title: "Bank Details", icon: Wallet },
  { key: "documents", title: "Documents", icon: FileText },
  { key: "account", title: "Account", icon: KeyRound },
] as const;

const GENDERS = ["Male", "Female", "Other"];
const MODES = ["ONLINE"]; // this academy teaches online only
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = ["Morning", "Afternoon", "Evening"];
const SKILLS = ["Zoom", "Google Meet"];
// Start-hour options a teacher can pick per selected slot ("available from").
const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`); // 06:00–22:00

const DOCS = [
  { key: "resumeUrl", label: "Resume / CV", required: true },
  { key: "degreeUrl", label: "Degree Certificate", required: true },
  { key: "govIdUrl", label: "Government ID", required: true },
  { key: "photoUrl", label: "Photo", required: true },
  { key: "certificatesUrl", label: "Other Certificates", required: false },
  { key: "experienceLetterUrl", label: "Experience Letter", required: false },
  { key: "policeVerificationUrl", label: "Police Verification", required: false },
] as const;

const REQUIRED_DOCS = DOCS.filter((d) => d.required).map((d) => d.key);

export default function TeacherRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({ teachingMode: "ONLINE" });
  const [days, setDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  // Each selected slot holds one or more { from, to } time ranges.
  const [slotRanges, setSlotRanges] = useState<Record<string, { from: string; to: string }[]>>({});
  const [skills, setSkills] = useState<string[]>([]);
  const [geoDetected, setGeoDetected] = useState(false);
  const [docs, setDocs] = useState<Record<string, { url: string; fileName: string }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [verifying, setVerifying] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (list: string[], setList: (v: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // Auto-detect country / state / city from the visitor's IP. Only fills empty
  // fields, so anything the applicant typed is never overwritten; still editable.
  useEffect(() => {
    let cancelled = false;
    fetch("https://ipwho.is/")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d || d.success === false) return;
        setForm((f) => ({
          ...f,
          country: f.country || d.country || "",
          state: f.state || d.region || "",
          city: f.city || d.city || "",
        }));
        setGeoDetected(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSlot = (v: string) => {
    const isOn = slots.includes(v);
    setSlots((cur) => (isOn ? cur.filter((x) => x !== v) : [...cur, v]));
    setSlotRanges((r) => {
      const n = { ...r };
      if (isOn) delete n[v];
      else n[v] = [{ from: "", to: "" }]; // start with one empty range
      return n;
    });
  };

  const addRange = (slot: string) =>
    setSlotRanges((r) => ({ ...r, [slot]: [...(r[slot] || []), { from: "", to: "" }] }));

  const removeRange = (slot: string, idx: number) =>
    setSlotRanges((r) => ({ ...r, [slot]: (r[slot] || []).filter((_, i) => i !== idx) }));

  const setRangeField = (slot: string, idx: number, field: "from" | "to", value: string) =>
    setSlotRanges((r) => ({
      ...r,
      [slot]: (r[slot] || []).map((rg, i) => {
        if (i !== idx) return rg;
        const next = { ...rg, [field]: value };
        // A new "from" that is >= the current "to" makes the range invalid — reset "to".
        if (field === "from" && next.to && next.to <= value) next.to = "";
        return next;
      }),
    }));

  // Every hour already chosen (any from/to across all slots) — so the same time
  // can never be picked twice. A field always keeps its own current value.
  const usedHours = useMemo(() => {
    const set = new Set<string>();
    Object.values(slotRanges).forEach((ranges) =>
      ranges.forEach(({ from, to }) => {
        if (from) set.add(from);
        if (to) set.add(to);
      }),
    );
    return set;
  }, [slotRanges]);

  const hourOptions = (current: string, opts: { after?: string } = {}) =>
    HOURS.filter(
      (h) => h === current || (!usedHours.has(h) && (!opts.after || h > opts.after)),
    );

  const stepValid = useMemo(() => {
    switch (STEPS[step].key) {
      case "personal":
        return !!form.firstName?.trim() && !!form.lastName?.trim();
      case "contact":
        return /^\S+@\S+\.\S+$/.test(form.email || "");
      case "availability":
        // Each chosen slot needs at least one range with a valid from < to.
        return slots.every((s) => {
          const ranges = slotRanges[s] || [];
          return ranges.length > 0 && ranges.every((r) => r.from && r.to && r.to > r.from);
        });
      case "documents":
        return REQUIRED_DOCS.every((k) => !!docs[k]);
      case "account":
        return (form.password || "").length >= 8 && form.password === confirmPassword;
      default:
        return true;
    }
  }, [step, form, confirmPassword, slots, slotRanges, docs]);

  const errorFor = (key: string) => {
    if (key === "personal") return "First and last name are required.";
    if (key === "contact") return "A valid email address is required.";
    if (key === "availability") return "For each chosen slot, add a valid time range (from earlier than to).";
    if (key === "documents") return "Please upload all required documents (marked with *).";
    if (key === "account")
      return (form.password || "").length < 8
        ? "Password must be at least 8 characters."
        : "Passwords do not match.";
    return "Please complete the required fields.";
  };

  const next = () => {
    setError(null);
    if (!stepValid) {
      setError(errorFor(STEPS[step].key));
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => {
    setError(null);
    if (step === 0) {
      // On the first step, "Back" leaves the form (returns to the chooser).
      if (typeof window !== "undefined" && window.history.length > 1) router.back();
      else router.push("/signup");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const onPickDoc = async (key: string, file: File | undefined) => {
    if (!file) return;
    setUploading(key);
    setError(null);
    try {
      const res = await uploadTeacherDocument(file);
      setDocs((d) => ({ ...d, [key]: res }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== "") payload[k] = v;
    });
    if (days.length) payload.availabilityDays = days;
    if (slots.length) {
      // One entry per range, e.g. "Morning (07:00–09:00)".
      const slotEntries = slots.flatMap((s) =>
        (slotRanges[s] || [])
          .filter((r) => r.from && r.to)
          .map((r) => `${s} (${r.from}–${r.to})`),
      );
      if (slotEntries.length) payload.availabilitySlots = slotEntries;
    }
    if (skills.length) payload.technicalSkills = skills;
    Object.entries(docs).forEach(([k, val]) => {
      payload[k] = val.url;
    });
    return payload;
  };

  // Step 1: submit → receive an email OTP challenge (record not yet created).
  const submit = async () => {
    if (!stepValid) {
      setError(errorFor("account"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createTeacherRegistration(buildPayload());
      setChallenge(res);
      setOtpInput(res.otp || "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit your application. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Step 2: verify the OTP → the application record is created.
  const verify = async () => {
    if (!challenge) return;
    if (otpInput.trim().length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await verifyTeacherRegistrationOtp(challenge.email, otpInput.trim());
      setDone(true);
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
      const res = await createTeacherRegistration(buildPayload());
      setChallenge(res);
      setOtpInput(res.otp || "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not resend the code.");
    } finally {
      setBusy(false);
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
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-ink-2">{challenge.email}</span>. Enter it below to finish.
          </p>

          {challenge.otp && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold text-amber-600">
              Dev mode — your code is{" "}
              <span className="font-black tracking-widest">{challenge.otp}</span>
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
            <button
              type="button"
              onClick={() => { setChallenge(null); setError(null); }}
              className="font-bold text-ink-3 hover:text-ink"
            >
              ← Edit details
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={busy}
              className="font-bold text-accent hover:underline disabled:opacity-50"
            >
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
          <h1 className="text-xl font-black text-ink">Application Submitted!</h1>
          <p className="mt-2 text-sm text-ink-3">
            Thank you, {form.firstName}. Your teaching application has been received and is now in our{" "}
            <span className="font-bold text-accent">hiring pipeline</span>. Our team will guide you through
            screening, interview and a demo class — we will email you at{" "}
            <span className="font-semibold text-ink-2">{form.email}</span> at every step.
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

  const Icon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-page px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        {/* Back */}
        <button
          type="button"
          onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/signup"))}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" /> Back
        </button>

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-ink leading-none">Teacher Registration</h1>
            <p className="text-xs text-ink-3 mt-1">Apply to join our teaching team</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center gap-1.5 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1.5 shrink-0">
              <div
                className={`grid size-7 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                  i < step
                    ? "bg-emerald-500 text-white"
                    : i === step
                      ? "bg-accent text-white"
                      : "bg-surface-3 text-ink-3"
                }`}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-5 rounded-full ${i < step ? "bg-emerald-500" : "bg-hairline"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-hairline bg-surface p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2 border-b border-hairline pb-4">
            <Icon className="size-5 text-accent" />
            <h2 className="text-sm font-bold text-ink">
              Step {step + 1} of {STEPS.length}: {STEPS[step].title}
            </h2>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-500">
              <CircleAlert className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Personal */}
          {STEPS[step].key === "personal" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {geoDetected && (
                <div className="sm:col-span-2 -mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                  <MapPin className="size-3.5" />
                  Country, state &amp; city auto-detected from your location — edit if needed.
                </div>
              )}
              <Field label="First Name" required value={form.firstName} onChange={(v) => set("firstName", v)} placeholder="John" />
              <Field label="Middle Name" value={form.middleName} onChange={(v) => set("middleName", v)} placeholder="(optional)" />
              <Field label="Last Name" required value={form.lastName} onChange={(v) => set("lastName", v)} placeholder="Doe" />
              <Select label="Gender" value={form.gender} onChange={(v) => set("gender", v)} options={GENDERS} placeholder="Select" />
              <Field label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} />
              <Field label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} placeholder="e.g. Indian" />
              <Field label="Country" value={form.country} onChange={(v) => set("country", v)} placeholder="Country" />
              <Field label="State" value={form.state} onChange={(v) => set("state", v)} placeholder="State" />
              <Field label="City" value={form.city} onChange={(v) => set("city", v)} placeholder="City" />
              <Field label="Address" value={form.address} onChange={(v) => set("address", v)} placeholder="Full address" className="sm:col-span-2" />
            </div>
          )}

          {/* Step 2: Contact */}
          {STEPS[step].key === "contact" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Email" required type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="you@example.com" />
              <Field label="Mobile" value={form.mobile} onChange={(v) => set("mobile", v)} placeholder="+91 98765 43210" />
              <Field label="WhatsApp Number" value={form.whatsappNumber} onChange={(v) => set("whatsappNumber", v)} placeholder="+91 …" className="sm:col-span-2" />
            </div>
          )}

          {/* Step 3: Professional */}
          {STEPS[step].key === "professional" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Highest Qualification" value={form.highestQualification} onChange={(v) => set("highestQualification", v)} placeholder="e.g. M.A. Islamic Studies" />
              <Field label="University" value={form.university} onChange={(v) => set("university", v)} placeholder="University name" />
              <Field label="Passing Year" value={form.passingYear} onChange={(v) => set("passingYear", v)} placeholder="e.g. 2019" />
              <Field label="Experience (years)" value={form.experienceYears} onChange={(v) => set("experienceYears", v)} placeholder="e.g. 5" />
              <Field label="Current Employer" value={form.currentEmployer} onChange={(v) => set("currentEmployer", v)} placeholder="(optional)" />
              {/* The academy pays staff in USD wherever they live. Unlabelled,
                  applicants answered in their own currency and "40000" was read
                  as dollars on the admin screen. */}
              <Field label="Expected Salary (USD)" value={form.expectedSalary} onChange={(v) => set("expectedSalary", v)} placeholder="e.g. 800 / month (USD)" />
              <Field label="Subjects" value={form.subjects} onChange={(v) => set("subjects", v)} placeholder="e.g. Quran, Tajweed, Arabic" className="sm:col-span-2" />
              <Field label="Languages" value={form.languages} onChange={(v) => set("languages", v)} placeholder="e.g. English, Urdu, Arabic" className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Teaching Mode</label>
                <div className="grid grid-cols-1 gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set("teachingMode", m)}
                      className={`h-11 rounded-xl border text-xs font-bold capitalize transition-all ${
                        form.teachingMode === m
                          ? "border-accent bg-accent/5 text-accent ring-1 ring-accent"
                          : "border-hairline bg-surface text-ink-2 hover:border-accent/40"
                      }`}
                    >
                      {m.toLowerCase()}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-ink-3">All classes at our academy are conducted online.</p>
              </div>
            </div>
          )}

          {/* Step 4: Availability + tools */}
          {STEPS[step].key === "availability" && (
            <div className="space-y-5">
              <ChipGroup label="Available Days" options={DAYS} selected={days} onToggle={(v) => toggle(days, setDays, v)} />

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Time Slots</label>
                <div className="space-y-2.5">
                  {SLOTS.map((s) => {
                    const on = slots.includes(s);
                    const ranges = slotRanges[s] || [];
                    return (
                      <div
                        key={s}
                        className={`rounded-xl border p-2.5 transition-colors ${
                          on ? "border-accent/40 bg-accent/5" : "border-hairline bg-surface"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSlot(s)}
                          className="inline-flex items-center gap-2 text-xs font-bold text-ink"
                        >
                          <span
                            className={`grid size-4.5 place-items-center rounded-md border transition-colors ${
                              on ? "border-accent bg-accent text-white" : "border-hairline text-transparent"
                            }`}
                          >
                            <Check className="size-3" />
                          </span>
                          {s}
                        </button>

                        {on && (
                          <div className="mt-2.5 space-y-2 pl-6">
                            {ranges.map((r, idx) => (
                              <div key={idx} className="flex flex-wrap items-center gap-1.5">
                                <span className="w-9 text-[11px] font-semibold text-ink-3">From</span>
                                <select
                                  value={r.from}
                                  onChange={(e) => setRangeField(s, idx, "from", e.target.value)}
                                  className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-semibold text-ink focus:outline-none focus:border-accent"
                                >
                                  <option value="">—</option>
                                  {hourOptions(r.from).map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                                <span className="text-[11px] font-semibold text-ink-3">to</span>
                                <select
                                  value={r.to}
                                  onChange={(e) => setRangeField(s, idx, "to", e.target.value)}
                                  disabled={!r.from}
                                  className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs font-semibold text-ink focus:outline-none focus:border-accent disabled:opacity-40"
                                >
                                  <option value="">—</option>
                                  {hourOptions(r.to, { after: r.from }).map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                                {ranges.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeRange(s, idx)}
                                    className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-red-500/10 hover:text-red-500"
                                    title="Remove this time"
                                  >
                                    <X className="size-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addRange(s)}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-hairline px-2.5 text-[11px] font-bold text-accent hover:bg-accent/10"
                            >
                              <Plus className="size-3.5" /> Add time
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-ink-3">
                  Select a slot, then add one or more from–to ranges. Each time can be picked only once.
                </p>
              </div>

              <ChipGroup label="Video Tools" options={SKILLS} selected={skills} onToggle={(v) => toggle(skills, setSkills, v)} />
            </div>
          )}

          {/* Step 5: Bank */}
          {STEPS[step].key === "bank" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Account Number" value={form.accountNumber} onChange={(v) => set("accountNumber", v)} placeholder="Bank account number" />
              <Field label="IFSC / SWIFT" value={form.ifsc} onChange={(v) => set("ifsc", v)} placeholder="IFSC or SWIFT code" />
              <Field label="Bank Name" value={form.bankName} onChange={(v) => set("bankName", v)} placeholder="Bank name" />
              <Field label="UPI ID" value={form.upi} onChange={(v) => set("upi", v)} placeholder="name@bank" />
              <Field label="Tax Number (PAN / TIN)" value={form.taxNumber} onChange={(v) => set("taxNumber", v)} placeholder="(optional)" className="sm:col-span-2" />
              <p className="sm:col-span-2 text-[11px] text-ink-3">
                Bank details are used only for payroll once you are activated. All fields here are optional.
              </p>
            </div>
          )}

          {/* Step 6: Documents */}
          {STEPS[step].key === "documents" && (
            <div className="space-y-3">
              <p className="text-[11px] text-ink-3">
                Upload supporting documents (PDF, DOC or image, up to 15&nbsp;MB each). Fields marked{" "}
                <span className="font-bold text-red-500">*</span> are required.
              </p>
              {DOCS.map((d) => (
                <DocRow
                  key={d.key}
                  label={d.label}
                  required={d.required}
                  doc={docs[d.key]}
                  uploading={uploading === d.key}
                  onPick={(file) => onPickDoc(d.key, file)}
                  onClear={() => setDocs((cur) => { const n = { ...cur }; delete n[d.key]; return n; })}
                />
              ))}
            </div>
          )}

          {/* Step 7: Account */}
          {STEPS[step].key === "account" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Username" value={form.username} onChange={(v) => set("username", v)} placeholder="(optional)" />
              <div />
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={form.password || ""}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="Min 8 characters"
                    className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 pr-10 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                  >
                    {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                />
              </div>
              <p className="sm:col-span-2 text-[11px] text-ink-3">
                After submitting, your application moves through our hiring pipeline (screening → interview →
                demo → approval → training). Once activated you can sign in with this email and password.
              </p>
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4">
            <button
              type="button"
              onClick={back}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-ink-2 hover:bg-surface-2"
            >
              <ChevronLeft className="size-4" /> Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-bold text-white hover:opacity-90"
              >
                Next <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-6 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Submit Application
              </button>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-ink-3">
          Are you a student?{" "}
          <Link href="/register" className="font-bold text-accent hover:underline">
            Student registration
          </Link>{" "}
          ·{" "}
          <Link href="/signin" className="font-bold text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  className = "",
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  className?: string;
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

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
      >
        <option value="">{placeholder || "Select"}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 h-10 text-xs font-bold transition-all ${
                on
                  ? "border-accent bg-accent/5 text-accent ring-1 ring-accent"
                  : "border-hairline bg-surface text-ink-2 hover:border-accent/40"
              }`}
            >
              {on && <Check className="size-3.5" />}
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DocRow({
  label,
  required = false,
  doc,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  required?: boolean;
  doc?: { url: string; fileName: string };
  uploading: boolean;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border bg-surface px-3.5 py-2.5 ${
        required && !doc ? "border-red-500/30" : "border-hairline"
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-bold text-ink">
          {label} {required && <span className="text-red-500">*</span>}
        </div>
        {doc ? (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-500">
            <Paperclip className="size-3" />
            <span className="truncate">{doc.fileName}</span>
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-ink-3">No file chosen</div>
        )}
      </div>
      {doc ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-hairline px-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
        >
          <X className="size-3.5" /> Remove
        </button>
      ) : (
        <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-accent/10 px-3 text-xs font-bold text-accent hover:bg-accent/20">
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {uploading ? "Uploading…" : "Upload"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
