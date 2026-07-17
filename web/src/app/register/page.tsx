"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  User,
  Phone,
  BookOpen,
  Users,
  KeyRound,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CircleAlert,
  Eye,
  EyeOff,
  PartyPopper,
} from "lucide-react";

import { ApiError, createRegistration, fetchLmsCourses } from "@/lib/api";

type Form = Record<string, string>;

const STEPS = [
  { key: "type", title: "Get Started", icon: GraduationCap },
  { key: "basic", title: "Basic Details", icon: User },
  { key: "contact", title: "Contact", icon: Phone },
  { key: "education", title: "Education", icon: BookOpen },
  { key: "course", title: "Course", icon: BookOpen },
  { key: "guardian", title: "Guardian", icon: Users },
  { key: "account", title: "Account", icon: KeyRound },
] as const;

const BATCHES = ["Morning", "Evening", "Weekend"];
const MODES = ["ONLINE", "OFFLINE", "HYBRID"];
const GENDERS = ["Male", "Female", "Other"];

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({ registrantType: "STUDENT", learningMode: "ONLINE" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [courses, setCourses] = useState<{ code: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetchLmsCourses()
      .then((list) => setCourses(list.map((c) => ({ code: c.code, title: c.title }))))
      .catch(() => setCourses([]));
  }, []);

  const stepValid = useMemo(() => {
    switch (STEPS[step].key) {
      case "type":
        return !!form.registrantType;
      case "basic":
        return !!form.firstName?.trim() && !!form.lastName?.trim();
      case "contact":
        return /^\S+@\S+\.\S+$/.test(form.studentEmail || "");
      case "account":
        return (form.password || "").length >= 8 && form.password === confirmPassword;
      default:
        return true;
    }
  }, [step, form, confirmPassword]);

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
    setStep((s) => Math.max(0, s - 1));
  };

  const errorFor = (key: string) => {
    if (key === "basic") return "First and last name are required.";
    if (key === "contact") return "A valid student email is required.";
    if (key === "account")
      return (form.password || "").length < 8
        ? "Password must be at least 8 characters."
        : "Passwords do not match.";
    return "Please complete the required fields.";
  };

  const submit = async () => {
    if (!stepValid) {
      setError(errorFor("account"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Only send non-empty fields; attach the selected course's title too.
      const payload: Record<string, string> = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") payload[k] = v;
      });
      if (payload.courseCode) {
        const c = courses.find((x) => x.code === payload.courseCode);
        if (c) payload.courseTitle = c.title;
      }
      await createRegistration(payload);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit your application. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-page p-4">
        <div className="w-full max-w-md rounded-3xl border border-hairline bg-surface p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <PartyPopper className="size-8" />
          </div>
          <h1 className="text-xl font-black text-ink">Application Submitted!</h1>
          <p className="mt-2 text-sm text-ink-3">
            Thank you, {form.firstName}. Your registration is now{" "}
            <span className="font-bold text-amber-500">Pending Approval</span>. Our team will review it and
            email you at <span className="font-semibold text-ink-2">{form.studentEmail}</span> once your
            admission is approved.
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
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-ink leading-none">Student Registration</h1>
            <p className="text-xs text-ink-3 mt-1">Create your admission application</p>
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

          {/* Step 1: Type */}
          {STEPS[step].key === "type" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink-3">I am registering as</p>
              <div className="grid grid-cols-2 gap-3">
                {["STUDENT", "PARENT"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("registrantType", t)}
                    className={`rounded-2xl border p-5 text-left transition-all ${
                      form.registrantType === t
                        ? "border-accent bg-accent/5 ring-1 ring-accent"
                        : "border-hairline bg-surface hover:border-accent/40"
                    }`}
                  >
                    <div className="mb-1 font-bold text-ink capitalize">{t.toLowerCase()}</div>
                    <div className="text-[11px] text-ink-3">
                      {t === "STUDENT" ? "I am the student enrolling." : "I am registering my child."}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Basic */}
          {STEPS[step].key === "basic" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          {/* Step 3: Contact */}
          {STEPS[step].key === "contact" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Student Email" required type="email" value={form.studentEmail} onChange={(v) => set("studentEmail", v)} placeholder="you@example.com" />
              <Field label="Student Mobile" value={form.studentMobile} onChange={(v) => set("studentMobile", v)} placeholder="+91 98765 43210" />
              <Field label="Parent Email" type="email" value={form.parentEmail} onChange={(v) => set("parentEmail", v)} placeholder="parent@example.com" />
              <Field label="Parent Mobile" value={form.parentMobile} onChange={(v) => set("parentMobile", v)} placeholder="+91 …" />
              <Field label="Emergency Contact" value={form.emergencyContact} onChange={(v) => set("emergencyContact", v)} placeholder="+91 …" />
              <Field label="WhatsApp Number" value={form.whatsappNumber} onChange={(v) => set("whatsappNumber", v)} placeholder="+91 …" />
            </div>
          )}

          {/* Step 4: Education */}
          {STEPS[step].key === "education" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Current School" value={form.currentSchool} onChange={(v) => set("currentSchool", v)} placeholder="School name" />
              <Field label="Board" value={form.board} onChange={(v) => set("board", v)} placeholder="e.g. CBSE / State" />
              <Field label="Class" value={form.className} onChange={(v) => set("className", v)} placeholder="e.g. 8th" />
              <Field label="Grade" value={form.grade} onChange={(v) => set("grade", v)} placeholder="e.g. A" />
              <Field label="Subjects" value={form.subjects} onChange={(v) => set("subjects", v)} placeholder="e.g. Quran, Arabic" className="sm:col-span-2" />
              <Field label="Preferred Language" value={form.language} onChange={(v) => set("language", v)} placeholder="e.g. English / Urdu" className="sm:col-span-2" />
            </div>
          )}

          {/* Step 5: Course + mode */}
          {STEPS[step].key === "course" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Select Course</label>
                <select
                  value={form.courseCode || ""}
                  onChange={(e) => set("courseCode", e.target.value)}
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                >
                  <option value="">— Choose a course —</option>
                  {courses.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.title} ({c.code})
                    </option>
                  ))}
                </select>
                {courses.length === 0 && (
                  <p className="mt-1 text-[11px] text-ink-3">No courses available yet — you can leave this blank.</p>
                )}
              </div>
              <Select label="Batch" value={form.batch} onChange={(v) => set("batch", v)} options={BATCHES} placeholder="Select batch" />
              <Field label="Preferred Timing" value={form.preferredTiming} onChange={(v) => set("preferredTiming", v)} placeholder="e.g. 6–7 PM" />
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Learning Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set("learningMode", m)}
                      className={`h-11 rounded-xl border text-xs font-bold capitalize transition-all ${
                        form.learningMode === m
                          ? "border-accent bg-accent/5 text-accent ring-1 ring-accent"
                          : "border-hairline bg-surface text-ink-2 hover:border-accent/40"
                      }`}
                    >
                      {m.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Guardian */}
          {STEPS[step].key === "guardian" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Father Name" value={form.fatherName} onChange={(v) => set("fatherName", v)} placeholder="Father's full name" />
              <Field label="Mother Name" value={form.motherName} onChange={(v) => set("motherName", v)} placeholder="Mother's full name" />
              <Field label="Occupation" value={form.occupation} onChange={(v) => set("occupation", v)} placeholder="Guardian occupation" />
              <Field label="Guardian Relation" value={form.guardianRelation} onChange={(v) => set("guardianRelation", v)} placeholder="e.g. Father" />
              <Field label="Guardian Email" type="email" value={form.guardianEmail} onChange={(v) => set("guardianEmail", v)} placeholder="guardian@example.com" />
              <Field label="Guardian Phone" value={form.guardianPhone} onChange={(v) => set("guardianPhone", v)} placeholder="+91 …" />
              <Field label="Guardian Address" value={form.guardianAddress} onChange={(v) => set("guardianAddress", v)} placeholder="Address" className="sm:col-span-2" />
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
                After submitting, your application will be reviewed by the admin. Once approved you can sign in
                with this email and password.
              </p>
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4">
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
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
          Already have an account?{" "}
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
