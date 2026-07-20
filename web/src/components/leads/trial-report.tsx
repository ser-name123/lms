"use client";

/*
 * The teacher's trial report.
 *
 * A trial is a sales call and an assessment at the same time: the teacher walks
 * the family through the academy, checks that what they typed into the booking
 * form is actually right, collects the details enrolment needs, and says what
 * level the student should start at.
 *
 * The whole thing saves as a draft to the server, not to the browser — the
 * teacher may fill it in from a different device than the one they taught on,
 * and a coach chasing a missing report needs to see how far it got.
 *
 * Once submitted it is read-only. The report is what the coach's enrolment
 * decision rests on, so it should not quietly change underneath them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Loader2,
  Lock,
  Save,
  Send,
  Star,
  UserRound,
} from "lucide-react";
import Swal from "sweetalert2";

import {
  fetchTrialOptions,
  saveTrialReport,
  submitTrialReport,
  type LeadTrial,
  type TrialOptions,
  type TrialReportInput,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

/** The session script, in the order a trial actually runs. */
const CHECKLIST = [
  { key: "coveredIntro", label: "Introduced the academy" },
  { key: "coveredPresentation", label: "Showed the presentation / video" },
  { key: "coveredDemoLesson", label: "Demonstrated a sample lesson" },
  { key: "coveredPackages", label: "Explained the packages" },
  { key: "verifiedDetails", label: "Verified the submitted details" },
] as const;

type Draft = TrialReportInput;

const dateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

/** Only send what the teacher actually touched, so blanks never wipe stored answers. */
function toPayload(d: Draft): TrialReportInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === "" || v === undefined || v === null) continue;
    out[k] = v;
  }
  // Booleans are meaningful when false, so they bypass the blank filter.
  for (const c of CHECKLIST) out[c.key] = Boolean(d[c.key]);
  if (d.teacherRecommendsEnroll !== undefined) {
    out.teacherRecommendsEnroll = d.teacherRecommendsEnroll;
  }
  return out as TrialReportInput;
}

export function TrialReportPanel({
  trial,
  onChange,
}: {
  trial: LeadTrial;
  onChange: () => void;
}) {
  const submitted = Boolean(trial.reportSubmittedAt);
  const [options, setOptions] = useState<TrialOptions | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "submit">("");

  const [draft, setDraft] = useState<Draft>({
    coveredIntro: trial.coveredIntro,
    coveredPresentation: trial.coveredPresentation,
    coveredDemoLesson: trial.coveredDemoLesson,
    coveredPackages: trial.coveredPackages,
    verifiedDetails: trial.verifiedDetails,
    studentAge: trial.studentAge ?? undefined,
    studentDob: dateInput(trial.studentDob) || undefined,
    guardianName: trial.guardianName ?? undefined,
    guardianRelation: trial.guardianRelation ?? undefined,
    guardianPhone: trial.guardianPhone ?? undefined,
    guardianEmail: trial.guardianEmail ?? undefined,
    preferredPackage: trial.preferredPackage ?? undefined,
    preferredDays: trial.preferredDays ?? [],
    preferredTime: trial.preferredTime ?? undefined,
    preferredStartDate: dateInput(trial.preferredStartDate) || undefined,
    assessedLevel: trial.assessedLevel ?? undefined,
    recommendedCourseId: trial.recommendedCourseId ?? undefined,
    teacherRating: trial.teacherRating ?? undefined,
    teacherFeedback: trial.teacherFeedback ?? undefined,
    teacherRecommendsEnroll: trial.teacherRecommendsEnroll ?? undefined,
    reportNotes: trial.reportNotes ?? undefined,
  });

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  useEffect(() => {
    if (submitted) return;
    fetchTrialOptions().then(setOptions).catch(() => undefined);
  }, [submitted]);

  const covered = CHECKLIST.filter((c) => draft[c.key]).length;
  const lead = trial.lead;

  const run = async (kind: "save" | "submit") => {
    setBusy(kind);
    try {
      const payload = toPayload(draft);
      if (kind === "save") {
        await saveTrialReport(trial.id, payload);
        Swal.fire({
          toast: true, position: "top-end", icon: "success",
          title: "Draft saved", showConfirmButton: false, timer: 1600,
        });
      } else {
        await submitTrialReport(trial.id, payload);
        Swal.fire({
          title: "Report submitted",
          text: "The academic coach has been notified and can now decide on enrolment.",
          icon: "success",
          background: swalBg(),
        });
      }
      onChange();
    } catch (e) {
      Swal.fire({
        title: kind === "save" ? "Could not save" : "Could not submit",
        text: e instanceof Error ? e.message : "Something went wrong.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy("");
    }
  };

  if (submitted) return <SubmittedReport trial={trial} />;

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-hairline bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="size-4 text-accent" aria-hidden />
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink-2">Trial report</h4>
        <span className="ml-auto text-[11px] font-bold text-ink-3">{covered}/5 covered</span>
      </div>

      {/* ── 1. What you covered ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {CHECKLIST.map((c) => {
          const on = Boolean(draft[c.key]);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => set(c.key, !on)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${
                on
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                  : "border-hairline text-ink-3 hover:text-ink-2"
              }`}
            >
              <BadgeCheck className={`size-3.5 ${on ? "" : "opacity-40"}`} aria-hidden />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* ── 2. What the family submitted, to check against ──────────────── */}
      {lead && <SubmittedDetails lead={lead} />}

      {/* ── 3. What you collected ───────────────────────────────────────── */}
      <Section icon={<UserRound className="size-3.5" aria-hidden />} title="Details collected">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Date of birth">
            <input
              type="date"
              value={draft.studentDob ?? ""}
              onChange={(e) => set("studentDob", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
          <Field
            label="Age"
            hint={draft.studentDob ? "Calculated from the date of birth" : undefined}
          >
            <input
              type="number"
              min={3}
              max={99}
              disabled={Boolean(draft.studentDob)}
              value={draft.studentAge ?? ""}
              onChange={(e) =>
                set("studentAge", e.target.value ? Number(e.target.value) : undefined)
              }
              className={`${inputCls} disabled:opacity-50`}
            />
          </Field>
          <Field label="Guardian name">
            <input
              value={draft.guardianName ?? ""}
              onChange={(e) => set("guardianName", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
          <Field label="Relationship">
            <input
              placeholder="Father / Mother / Guardian"
              value={draft.guardianRelation ?? ""}
              onChange={(e) => set("guardianRelation", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
          <Field label="Guardian phone">
            <input
              value={draft.guardianPhone ?? ""}
              onChange={(e) => set("guardianPhone", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
          <Field label="Guardian email">
            <input
              type="email"
              value={draft.guardianEmail ?? ""}
              onChange={(e) => set("guardianEmail", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* ── 4. What they want to enrol into ─────────────────────────────── */}
      <Section icon={<CalendarDays className="size-3.5" aria-hidden />} title="Preferences">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Preferred package">
            <select
              value={draft.preferredPackage ?? ""}
              onChange={(e) => set("preferredPackage", e.target.value || undefined)}
              className={inputCls}
            >
              <option value="">Not decided</option>
              {options?.packages.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} — {p.classesPerMonth} classes/month
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preferred time">
            <input
              type="time"
              value={draft.preferredTime ?? ""}
              onChange={(e) => set("preferredTime", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
          <Field label="Preferred start date" className="sm:col-span-2">
            <input
              type="date"
              value={draft.preferredStartDate ?? ""}
              onChange={(e) => set("preferredStartDate", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
        </div>

        <p className="mb-1.5 mt-2.5 text-[11px] font-bold text-ink-3">Preferred days</p>
        <div className="flex flex-wrap gap-1.5">
          {(options?.weekdays ?? []).map((d) => {
            const on = (draft.preferredDays ?? []).includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  set(
                    "preferredDays",
                    on
                      ? (draft.preferredDays ?? []).filter((x) => x !== d)
                      : [...(draft.preferredDays ?? []), d],
                  )
                }
                className={`h-7 rounded-lg border px-2.5 text-[11px] font-bold ${
                  on ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3"
                }`}
              >
                {d.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── 5. Your assessment ──────────────────────────────────────────── */}
      <Section icon={<GraduationCap className="size-3.5" aria-hidden />} title="Assessment">
        <p className="mb-1.5 text-[11px] font-bold text-ink-3">
          Level <span className="text-rose-500">*</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(options?.levels ?? []).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => set("assessedLevel", l)}
              className={`h-8 rounded-lg border px-3 text-[11px] font-bold ${
                draft.assessedLevel === l
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-hairline text-ink-3"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Field label="Recommended course">
            <select
              value={draft.recommendedCourseId ?? ""}
              onChange={(e) => set("recommendedCourseId", e.target.value || undefined)}
              className={inputCls}
            >
              <option value="">No specific course</option>
              {options?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.level ? ` · ${c.level}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How did the class go?">
            <div className="flex h-9 items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => set("teacherRating", n)}>
                  <Star
                    className={`size-5 ${
                      n <= (draft.teacherRating ?? 0)
                        ? "fill-amber-400 text-amber-400"
                        : "text-ink-3/40"
                    }`}
                  />
                </button>
              ))}
            </div>
          </Field>
        </div>

        <textarea
          rows={2}
          placeholder="Strengths, gaps, what to start with…"
          value={draft.teacherFeedback ?? ""}
          onChange={(e) => set("teacherFeedback", e.target.value || undefined)}
          className={`mt-2.5 ${inputCls} h-auto py-2`}
        />

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-ink-3">Recommend enrolment?</span>
          <button
            type="button"
            onClick={() => set("teacherRecommendsEnroll", true)}
            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${
              draft.teacherRecommendsEnroll === true
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                : "border-hairline text-ink-3"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => set("teacherRecommendsEnroll", false)}
            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${
              draft.teacherRecommendsEnroll === false
                ? "border-rose-500/40 bg-rose-500/10 text-rose-600"
                : "border-hairline text-ink-3"
            }`}
          >
            No
          </button>
        </div>
      </Section>

      <textarea
        rows={2}
        placeholder="Anything else the coach should know before calling the family…"
        value={draft.reportNotes ?? ""}
        onChange={(e) => set("reportNotes", e.target.value || undefined)}
        className={`${inputCls} h-auto py-2`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run("save")}
          disabled={busy !== ""}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3.5 text-[11px] font-bold text-ink-2 hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save draft
        </button>
        <button
          type="button"
          onClick={() => run("submit")}
          disabled={busy !== "" || !draft.assessedLevel}
          title={draft.assessedLevel ? undefined : "Pick the level you assessed the student at"}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy === "submit" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Submit report
        </button>
        <p className="text-[11px] text-ink-3">
          Submitting completes the trial and hands it to the academic coach. It cannot be edited afterwards.
        </p>
      </div>
    </div>
  );
}

/* ── The booking, so the teacher can check it against what they are told ──── */
function SubmittedDetails({ lead }: { lead: NonNullable<LeadTrial["lead"]> }) {
  const rows = useMemo(
    () =>
      [
        ["Booked as", lead.sessionFor === "FAMILY_MEMBER" ? "For a family member" : "For themselves"],
        ["Subject", lead.interestedSubject],
        ["Stated level", lead.currentLevel],
        ["Date of birth", lead.dateOfBirth ? new Date(lead.dateOfBirth).toLocaleDateString() : null],
        ["Grade", lead.currentGrade],
        ["Country", lead.country],
        ["Parent", lead.parentName],
        ["Relationship", lead.relationship],
        ["Phone", lead.mobile],
        ["Email", lead.email],
        ["Goal", lead.learningGoal],
        ["Special requirements", lead.specialRequirements],
        ["Medical / disability", lead.medicalDisability],
        [
          "Siblings on this booking",
          lead.siblings?.length
            ? lead.siblings.map((s) => `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim()).join(", ")
            : null,
        ],
      ].filter(([, v]) => v) as [string, string][],
    [lead],
  );

  return (
    <Section icon={<ClipboardList className="size-3.5" aria-hidden />} title="What they submitted">
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11px]">
            <dt className="min-w-28 shrink-0 font-semibold text-ink-3">{k}</dt>
            <dd className="font-bold text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* ── Read-only view, for a submitted report and for the coach ─────────────── */
export function SubmittedReport({ trial }: { trial: LeadTrial }) {
  const covered = CHECKLIST.filter((c) => trial[c.key]).length;
  const rows = [
    ["Level assessed", trial.assessedLevel],
    ["Recommended course", trial.recommendedCourse],
    ["Recommends enrolment", trial.teacherRecommendsEnroll == null ? null : trial.teacherRecommendsEnroll ? "Yes" : "No"],
    ["Rating", trial.teacherRating ? `${trial.teacherRating}/5` : null],
    ["Age", trial.studentAge != null ? String(trial.studentAge) : null],
    ["Date of birth", trial.studentDob ? new Date(trial.studentDob).toLocaleDateString() : null],
    ["Guardian", [trial.guardianName, trial.guardianRelation].filter(Boolean).join(" · ")],
    ["Guardian contact", [trial.guardianPhone, trial.guardianEmail].filter(Boolean).join(" · ")],
    ["Preferred package", trial.preferredPackage],
    ["Preferred days", trial.preferredDays?.join(", ")],
    ["Preferred time", trial.preferredTime],
    [
      "Preferred start",
      trial.preferredStartDate ? new Date(trial.preferredStartDate).toLocaleDateString() : null,
    ],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-surface-2/40 p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Lock className="size-3.5 text-ink-3" aria-hidden />
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink-2">Trial report</h4>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
          Submitted
        </span>
        <span className="ml-auto text-[11px] text-ink-3">
          {covered}/5 covered
          {trial.reportSubmittedAt
            ? ` · ${new Date(trial.reportSubmittedAt).toLocaleString()}`
            : ""}
        </span>
      </div>

      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11px]">
            <dt className="min-w-28 shrink-0 font-semibold text-ink-3">{k}</dt>
            <dd className="font-bold text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>

      {trial.teacherFeedback && (
        <p className="mt-2.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px] text-ink-2">
          {trial.teacherFeedback}
        </p>
      )}
      {trial.reportNotes && (
        <p className="mt-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px] text-ink-3">
          {trial.reportNotes}
        </p>
      )}
    </div>
  );
}

/* ── Small shared bits ───────────────────────────────────────────────────── */

const inputCls =
  "h-9 w-full rounded-lg border border-hairline bg-surface px-3 text-xs font-semibold text-ink focus:border-accent focus:outline-none";

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold text-ink-3">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-ink-3">{hint}</span>}
    </label>
  );
}
