"use client";

/*
 * Public "Book a Free Trial Class" form.
 *
 * Short on purpose. It asks for a name, a way to reach the family, what they
 * want to learn, and a concrete date + slot — nothing else. Grade, school, DOB,
 * level and learning goals are the coach's to collect once there is a real
 * conversation; asking a stranger for them up front costs bookings.
 *
 * The visitor leaves with an actual appointment, not a "we'll be in touch":
 * submitting creates the lead, holds the slot, opens the Zoom room and emails
 * the joining details in one step. There is no OTP — the old one returned its
 * own code in the HTTP response, so it verified nothing while costing every
 * genuine visitor an extra screen.
 *
 * Nothing is kept in browser storage; the slot list is always read live from
 * the server, because a slot someone else just took must not stay bookable.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Check,
  CircleAlert,
  Clock,
  GraduationCap,
  Loader2,
  LogIn,
  PartyPopper,
  Plus,
  User,
  UserPlus,
  Video,
  X,
} from "lucide-react";

import { ApiError, createLead, fetchTrialSlots, type TrialBooking } from "@/lib/api";
import { COUNTRIES, detectCountry, detectTimeZone } from "@/lib/countries";

const LEARN_OPTIONS = ["Quran", "Arabic Language", "Islamic Studies"];
const SESSION_FOR = [
  { value: "MYSELF", label: "Myself" },
  { value: "FAMILY_MEMBER", label: "A Family Member" },
  { value: "SIBLING", label: "A Sibling" },
];
const TEACHER_PREFERENCE = ["Male", "Female", "Either"];
const HOW_FOUND = [
  { value: "FRIEND", label: "Friend" },
  { value: "SOCIAL_MEDIA", label: "Social Media" },
  { value: "EMAIL", label: "Email" },
  { value: "GOOGLE", label: "Google" },
  { value: "OTHER", label: "Others" },
];

/** Booking opens tomorrow and closes 30 days out — mirrored server-side. */
function bookingWindow() {
  const day = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const todayUtc = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return { min: iso(todayUtc + day), max: iso(todayUtc + 30 * day) };
}

function detectTracking(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /chrome/i.test(ua)
      ? "Chrome"
      : /firefox/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : "Other";
  const qs = new URLSearchParams(window.location.search);
  return {
    browser,
    device: /mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Desktop",
    referralUrl: document.referrer || "",
    utmSource: qs.get("utm_source") || "",
    utmCampaign: qs.get("utm_campaign") || "",
    utmMedium: qs.get("utm_medium") || "",
  };
}

interface Sibling {
  firstName: string;
  lastName: string;
}

export default function GetStartedPage() {
  const { min, max } = useMemo(bookingWindow, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [dialCode, setDialCode] = useState("");
  const [country, setCountry] = useState("");
  const [learn, setLearn] = useState("");
  const [sessionFor, setSessionFor] = useState("MYSELF");
  const [teacherPref, setTeacherPref] = useState("Either");
  const [howFound, setHowFound] = useState("");
  const [siblings, setSiblings] = useState<Sibling[]>([]);

  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotNote, setSlotNote] = useState("");

  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [timeZone, setTimeZone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<TrialBooking | null>(null);

  // Auto-detect country and dial code. Both stay editable — the detection is
  // a convenience, never a constraint.
  useEffect(() => {
    setTracking(detectTracking());
    setTimeZone(detectTimeZone());
    const guess = detectCountry();
    if (guess) {
      setCountry(guess.name);
      setDialCode(guess.dial);
    }
  }, []);

  const loadSlots = useCallback(async (forDate: string) => {
    setSlotsLoading(true);
    setSlots(null);
    setSlot("");
    setSlotNote("");
    try {
      const res = await fetchTrialSlots(forDate);
      setSlots(res.slots);
      if (!res.slots.length) {
        setSlotNote("Every slot on this date is taken. Please try another day.");
      } else if (res.fallback) {
        // Honest about what the visitor is picking from: these are standard
        // hours, and a coach will confirm the teacher.
        setSlotNote(
          "These are our standard hours — your coach will confirm the teacher for this slot.",
        );
      }
    } catch (e) {
      setSlots([]);
      setSlotNote(e instanceof ApiError ? e.message : "Could not load times. Please try again.");
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date) void loadSlots(date);
  }, [date, loadSlots]);

  const addSibling = () => setSiblings((s) => [...s, { firstName: "", lastName: "" }]);
  const removeSibling = (i: number) => setSiblings((s) => s.filter((_, idx) => idx !== i));
  const setSibling = (i: number, key: keyof Sibling, value: string) =>
    setSiblings((s) => s.map((sib, idx) => (idx === i ? { ...sib, [key]: value } : sib)));

  const submit = async () => {
    setError("");

    if (!firstName.trim() || !lastName.trim()) return setError("Please enter the student's name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError("Please enter a valid email address.");
    if (mobile.replace(/\D/g, "").length < 6) return setError("Please enter a valid phone number.");
    if (!date) return setError("Please choose a date for your trial class.");
    if (!slot) return setError("Please choose a time slot.");

    if ((sessionFor === "FAMILY_MEMBER" || sessionFor === "SIBLING") && siblings.length === 0) {
      return setError(sessionFor === "SIBLING" ? "Please add at least one sibling." : "Please add at least one family member.");
    }

    const named = siblings.filter((s) => s.firstName.trim());
    if (siblings.length !== named.length) {
      return setError(
        sessionFor === "SIBLING"
          ? "Please enter a first name for each sibling, or remove the blank row."
          : "Please enter a first name for each family member, or remove the blank row."
      );
    }

    setBusy(true);
    try {
      const result = await createLead({
        studentFirstName: firstName.trim(),
        studentLastName: lastName.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        countryCode: dialCode || undefined,
        country: country || undefined,
        timeZone: timeZone || undefined,
        interestedSubject: learn || undefined,
        sessionFor,
        preferredTeacherGender: teacherPref,
        howFound: howFound || undefined,
        preferredDate: date,
        preferredSlot: slot,
        siblings: named.map((s) => ({
          firstName: s.firstName.trim(),
          lastName: s.lastName.trim() || undefined,
        })),
        ...tracking,
      });
      setBooked(result);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setError(message);
      // Losing the race for a slot is the one error the visitor can act on
      // immediately, so refresh the list rather than leaving a stale one up.
      if (/slot/i.test(message) && date) void loadSlots(date);
    } finally {
      setBusy(false);
    }
  };

  if (booked) {
    const when = new Date(booked.scheduledAt);
    return (
      <div className="grid min-h-screen place-items-center bg-page px-4 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-hairline bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <PartyPopper className="size-7" />
          </div>
          <h1 className="text-xl font-black text-ink">Your trial class is booked</h1>
          <p className="mt-2 text-sm text-ink-2">
            We have emailed the joining details to <b>{email.trim()}</b>.
          </p>

          <div className="mt-6 space-y-2 rounded-2xl border border-hairline bg-page p-4 text-left text-sm">
            <Row icon={CalendarDays} label="Date" value={when.toUTCString().slice(0, 16)} />
            <Row icon={Clock} label="Time" value={`${when.toISOString().slice(11, 16)} UTC`} />
            <Row icon={User} label="Reference" value={booked.leadNumber} />
          </div>

          <Link
            href="/signin"
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-hairline text-sm font-bold text-ink-2"
          >
            <LogIn className="size-4" />
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
            <h1 className="text-lg font-black leading-none text-ink">Book a Free Trial Class</h1>
            <p className="mt-1 text-xs text-ink-3">
              Pick a time that suits you — it takes less than a minute
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-500">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-5">
          <Section icon={User} title="Your details">
            <Field label="First Name" required value={firstName} onChange={setFirstName} />
            <Field label="Last Name" required value={lastName} onChange={setLastName} />
            <Field
              label="Email Address"
              required
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              className="sm:col-span-2"
            />

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  aria-label="Country dial code"
                  className="h-11 w-32 shrink-0 rounded-xl border border-hairline bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none"
                >
                  <option value="">Code</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.iso2} value={c.dial}>
                      {c.iso2} {c.dial}
                    </option>
                  ))}
                </select>
                <input
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="98765 43210"
                  inputMode="tel"
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
                Country
              </label>
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  const match = COUNTRIES.find((c) => c.name === e.target.value);
                  // Changing country moves the dial code with it — leaving a
                  // mismatched pair behind is worse than overwriting.
                  if (match) setDialCode(match.dial);
                }}
                className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
              >
                <option value="">Select your country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.iso2} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          <Section icon={BookOpen} title="What would you like to learn?">
            <ChoiceRow
              label="Subject"
              options={LEARN_OPTIONS.map((o) => ({ value: o, label: o }))}
              value={learn}
              onChange={setLearn}
            />
            <ChoiceRow
              label="This trial session is for"
              options={SESSION_FOR}
              value={sessionFor}
              onChange={(val) => {
                setSessionFor(val);
                if ((val === "FAMILY_MEMBER" || val === "SIBLING") && siblings.length === 0) {
                  setSiblings([{ firstName: "", lastName: "" }]);
                } else if (val === "MYSELF") {
                  setSiblings([]);
                }
              }}
            />
            <ChoiceRow
              label="Preferred Teacher"
              options={TEACHER_PREFERENCE.map((o) => ({ value: o, label: o }))}
              value={teacherPref}
              onChange={setTeacherPref}
            />
            <ChoiceRow
              label="How did you find us?"
              options={HOW_FOUND}
              value={howFound}
              onChange={setHowFound}
            />
          </Section>

          {sessionFor !== "MYSELF" && (
            <Section
              icon={UserPlus}
              title={
                sessionFor === "FAMILY_MEMBER" ? (
                  <span>
                    Family members <span className="text-red-500">*</span>
                  </span>
                ) : (
                  <span>
                    Siblings <span className="text-red-500">*</span>
                  </span>
                )
              }
            >
              <div className="sm:col-span-2">
                <p className="mb-3 text-xs text-ink-3">
                  {sessionFor === "FAMILY_MEMBER"
                    ? "Please add the details of the family member(s) who will attend the trial class."
                    : "Please add the details of the sibling(s) who will attend the trial class."}
                </p>

                {siblings.map((s, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <input
                      value={s.firstName}
                      onChange={(e) => setSibling(i, "firstName", e.target.value)}
                      placeholder={sessionFor === "SIBLING" ? "Sibling's first name" : "First name"}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
                    />
                    <input
                      value={s.lastName}
                      onChange={(e) => setSibling(i, "lastName", e.target.value)}
                      placeholder={sessionFor === "SIBLING" ? "Sibling's last name" : "Last name"}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeSibling(i)}
                      aria-label={sessionFor === "SIBLING" ? `Remove sibling ${i + 1}` : `Remove family member ${i + 1}`}
                      className="grid size-11 shrink-0 place-items-center rounded-xl border border-hairline text-ink-3 hover:border-red-500/40 hover:text-red-500"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addSibling}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-hairline px-3 text-xs font-bold text-ink-2 hover:border-accent/50 hover:text-accent"
                >
                  <Plus className="size-3.5" />
                  {sessionFor === "SIBLING" ? "Add a sibling" : "Add a family member"}
                </button>
              </div>
            </Section>
          )}

          <Section icon={CalendarDays} title="Pick your trial date & time">
            <div className="sm:col-span-2">
              <label
                htmlFor="trial-date"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3"
              >
                Preferred Date <span className="text-red-500">*</span>
              </label>
              <input
                id="trial-date"
                type="date"
                value={date}
                min={min}
                max={max}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
              />
              <p className="mt-1.5 text-[11px] text-ink-3">
                Trials start from tomorrow and can be booked up to 30 days ahead.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
                Available Times {date && <span className="text-red-500">*</span>}
              </label>

              {!date ? (
                <p className="rounded-xl border border-dashed border-hairline px-3 py-4 text-center text-xs text-ink-3">
                  Choose a date to see the available times.
                </p>
              ) : slotsLoading ? (
                <div className="grid place-items-center py-6">
                  <Loader2 className="size-5 animate-spin text-ink-3" />
                </div>
              ) : (
                <>
                  {slots && slots.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {slots.map((s) => {
                        const on = slot === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSlot(s)}
                            className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition-all ${
                              on
                                ? "border-accent bg-accent/5 text-accent ring-1 ring-accent"
                                : "border-hairline bg-surface text-ink-2 hover:border-accent/40"
                            }`}
                          >
                            {on && <Check className="size-3.5" />}
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {slotNote && <p className="mt-2 text-[11px] font-semibold text-ink-3">{slotNote}</p>}
                  {timeZone && slots && slots.length > 0 && (
                    <p className="mt-2 text-[11px] text-ink-3">
                      Times are shown in UTC. Your device is set to {timeZone}.
                    </p>
                  )}
                </>
              )}
            </div>
          </Section>

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {busy ? "Booking your class…" : "Book My Free Trial"}
          </button>

          <p className="pb-6 text-center text-xs text-ink-3">
            Already have an account?{" "}
            <Link href="/signin" className="ml-0.5 font-bold text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />
      <span className="text-ink-3">{label}</span>
      <span className="ml-auto font-bold text-ink">{value}</span>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
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
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  className = "",
}: {
  label: string;
  value: string;
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
      />
    </div>
  );
}

/** A single-choice chip row — fewer taps than a select on a phone. */
function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition-all ${
                on
                  ? "border-accent bg-accent/5 text-accent ring-1 ring-accent"
                  : "border-hairline bg-surface text-ink-2 hover:border-accent/40"
              }`}
            >
              {on && <Check className="size-3.5" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
