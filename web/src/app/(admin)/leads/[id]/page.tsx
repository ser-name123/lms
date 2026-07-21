"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  User,
  Users,
  BookOpen,
  MessageSquare,
  ClipboardCheck,
  GraduationCap,
  History,
  CalendarClock,
  Save,
  Wand2,
  Video,
  CheckCircle2,
  XCircle,
  Star,
  Send,
  UserPlus,
  Plus,
  BadgeCheck,
  Link as LinkIcon,
  Pencil,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import {
  fetchLead,
  updateLead,
  evaluateLead,
  fetchLeadActivities,
  fetchEmployees,
  fetchTeachers,
  fetchLeadTrials,
  scheduleLeadTrial,
  updateLeadTrial,
  markLeadTrialAttendance,
  submitLeadTrialFeedback,
  sendLeadTrialReminder,
  requestTrialInfo,
  fetchTrialOptions,
  fetchTeacherAvailability,
  leadCoachDecision,
  type Lead,
  type LeadActivity,
  type LeadTrial,
  type TrialOptions,
  type TrialDayAvailability,
} from "@/lib/api";
import {
  ALL_LEAD_STATUSES,
  EVALUATION_SKILLS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_TONE,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
  isTrialClosed,
} from "@/components/leads/lead-meta";
import { TeacherAvailabilityPanel } from "@/components/leads/teacher-availability";
import { SubmittedReport } from "@/components/leads/trial-report";

// The Recommendation tab is hidden. Teacher assignment still happens — the
// Schedule Trial form sets assignedTeacherId on the lead, and it picks from
// teachers who are actually free at that slot. The API endpoints stay in
// place; only this entry point is gone.
const TABS = [
  { key: "overview", label: "Overview", icon: User },
  { key: "evaluation", label: "Evaluation", icon: ClipboardCheck },
  { key: "trial", label: "Trial Classes", icon: CalendarClock },
  { key: "decision", label: "Decision", icon: BadgeCheck },
  { key: "timeline", label: "Timeline", icon: History },
] as const;

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = () => fetchLead(id).then(setLead).catch(() => undefined);

  useEffect(() => {
    setLoading(true);
    fetchLead(id).then(setLead).catch(() => undefined).finally(() => setLoading(false));
    fetchLeadActivities(id).then(setActivities).catch(() => undefined);
    fetchEmployees({ page: 1, limit: 100, role: "ACADEMIC_COACH", status: "ACTIVE" })
      .then((r) => setCoaches(r.items.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))))
      .catch(() => undefined);
    fetchTeachers({ page: 1, limit: 100, status: "ACTIVE" })
      .then((r) => setTeachers(r.items.map((t: any) => ({ id: t.id, name: `${t.user.firstName} ${t.user.lastName}` }))))
      .catch(() => undefined);
  }, [id]);

  const refreshActivities = () => fetchLeadActivities(id).then(setActivities).catch(() => undefined);

  const apply = async (dto: Record<string, unknown>, ok = "Updated") => {
    setBusy(true);
    try {
      const updated = await updateLead(id, dto);
      setLead(updated);
      refreshActivities();
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: ok, showConfirmButton: false, timer: 1800 });
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Action failed.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title="Lead" subtitle="Loading…" />
        <div className="flex items-center justify-center py-32 text-sm font-bold text-ink-3">
          <Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading lead…
        </div>
      </>
    );
  }
  if (!lead) {
    return (
      <>
        <Topbar title="Lead" subtitle="Not found" />
        <div className="p-6">
          <button onClick={() => router.push("/leads")} className="text-sm font-bold text-accent hover:underline">← Back to Trial Classes</button>
          <p className="mt-4 text-sm text-ink-3">This lead could not be found.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title={`${lead.studentFirstName} ${lead.studentLastName}`} subtitle={`${lead.leadNumber} · ${lead.leadSource} trial request`} />

      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        <button onClick={() => router.push("/leads")} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Back to Trial Classes
        </button>

        {/* Header controls */}
        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent font-black">
                {lead.studentFirstName[0]}{lead.studentLastName[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-ink">{lead.studentFirstName} {lead.studentLastName}</h2>
                  <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
                  <Badge tone={LEAD_PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-3">{lead.interestedSubject || "General"} · {lead.country || "—"} · {lead.email}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LabeledSelect label="Status" value={lead.status} onChange={(v) => apply({ status: v }, `Moved to ${LEAD_STATUS_LABEL[v as Lead["status"]]}`)}
                options={ALL_LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))} disabled={busy} />
              <LabeledSelect label="Priority" value={lead.priority} onChange={(v) => apply({ priority: v }, "Priority updated")}
                options={LEAD_PRIORITIES.map((p) => ({ value: p, label: p }))} disabled={busy} />
              <LabeledSelect label="Coach" value={lead.assignedCoachId || ""} onChange={(v) => apply({ assignedCoachId: v }, "Coach assigned")}
                options={[{ value: "", label: "— Unassigned —" }, ...coaches.map((c) => ({ value: c.id, label: c.name }))]} disabled={busy} />
            </div>
          </CardBody>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-1 w-full">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                tab === t.key ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"
              }`}>
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab lead={lead} onSaved={() => { reload(); refreshActivities(); }} />}
        {tab === "evaluation" && <EvaluationTab lead={lead} onDone={() => { reload(); refreshActivities(); }} />}
        {tab === "trial" && <TrialTab lead={lead} teachers={teachers} onChange={() => { reload(); refreshActivities(); }} />}
        {tab === "decision" && <DecisionTab lead={lead} onChange={() => { reload(); refreshActivities(); }} />}
        {tab === "timeline" && <TimelineTab activities={activities} />}
      </div>
    </>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

/* The form posts codes; these turn them back into the words the visitor saw. */
const SESSION_FOR_LABELS: Record<string, string> = {
  MYSELF: "Myself",
  FAMILY_MEMBER: "A family member",
};
const HOW_FOUND_LABELS: Record<string, string> = {
  FRIEND: "Friend",
  SOCIAL_MEDIA: "Social media",
  EMAIL: "Email",
  GOOGLE: "Google",
  OTHER: "Other",
};

function labelOf(map: Record<string, string>, code: string | null) {
  if (!code) return null;
  // Fall back to the raw code rather than blanking it — an unmapped value is
  // still information, and a silent gap looks like missing data.
  return map[code] ?? code;
}

function siblingNames(lead: Lead) {
  return (lead.siblings ?? [])
    .map((s) => `${s.firstName} ${s.lastName ?? ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

function requestedSlot(lead: Lead) {
  if (!lead.preferredDate) return null;
  const date = new Date(lead.preferredDate).toUTCString().slice(0, 16);
  return lead.preferredSlot
    ? `${date} · ${lead.preferredSlot} ${lead.preferredSlotTz ?? "UTC"}`
    : date;
}

/*
 * The trial request as the family submitted it — and, on Edit, as it should
 * have been.
 *
 * The whole form was read-only until now, which meant a mistyped email could
 * never be corrected: the acknowledgement, the reminders and every later
 * message all go to that address, and the coach's only recourse was to ask
 * the family to book again.
 *
 * Marketing fields (source, UTM, device, IP) stay read-only in every mode.
 * They are a record of how the request arrived, not a description of the
 * family, and editing them would be falsifying it.
 */
function OverviewTab({ lead, onSaved }: { lead: Lead; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const start = () => {
    setForm({
      studentFirstName: lead.studentFirstName ?? "",
      studentLastName: lead.studentLastName ?? "",
      gender: lead.gender ?? "",
      dateOfBirth: lead.dateOfBirth ? lead.dateOfBirth.slice(0, 10) : "",
      currentGrade: lead.currentGrade ?? "",
      currentSchool: lead.currentSchool ?? "",
      country: lead.country ?? "",
      timeZone: lead.timeZone ?? "",
      parentName: lead.parentName ?? "",
      relationship: lead.relationship ?? "",
      email: lead.email ?? "",
      countryCode: lead.countryCode ?? "",
      mobile: lead.mobile ?? "",
      whatsappNumber: lead.whatsappNumber ?? "",
      interestedSubject: lead.interestedSubject ?? "",
      preferredTeacherGender: lead.preferredTeacherGender ?? "",
      currentLevel: lead.currentLevel ?? "",
      preferredLanguage: lead.preferredLanguage ?? "",
      learningGoal: lead.learningGoal ?? "",
      specialRequirements: lead.specialRequirements ?? "",
      medicalDisability: lead.medicalDisability ?? "",
    });
    setEditing(true);
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.studentFirstName?.trim() || !form.studentLastName?.trim()) {
      Swal.fire({ title: "A name is required", icon: "info", background: swalBg() });
      return;
    }
    if (!form.email?.trim()) {
      Swal.fire({
        title: "An email is required",
        text: "Reminders and the joining link go to this address.",
        icon: "info",
        background: swalBg(),
      });
      return;
    }
    setBusy(true);
    try {
      await updateLead(lead.id, form);
      Swal.fire({
        toast: true, position: "top-end", icon: "success",
        title: "Details updated", showConfirmButton: false, timer: 1800,
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      Swal.fire({
        title: "Could not save",
        text: e instanceof Error ? e.message : "Failed.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button onClick={start}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3.5 text-xs font-bold text-ink-2 hover:border-accent hover:text-accent">
            <Pencil className="size-3.5" /> Edit details
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <InfoCard icon={User} title="Student">
            <Row label="Request ID" value={lead.leadNumber} />
            {/* How old the request is decides whether it is still warm. */}
            <Row label="Requested on" value={new Date(lead.createdAt).toLocaleString()} />
            <Row label="Name" value={`${lead.studentFirstName} ${lead.studentLastName}`} />
            <Row label="Gender" value={lead.gender} />
            <Row label="Date of Birth" value={lead.dateOfBirth ? new Date(lead.dateOfBirth).toLocaleDateString() : null} />
            <Row label="Current Grade" value={lead.currentGrade} />
            <Row label="Current School" value={lead.currentSchool} />
            <Row label="Country" value={lead.country} />
            <Row label="Time Zone" value={lead.timeZone} />
          </InfoCard>
          <InfoCard icon={Users} title="Parent / Contact">
            <Row label="Parent" value={lead.parentName} />
            <Row label="Relationship" value={lead.relationship} />
            <Row label="Email" value={lead.email} />
            <Row
              label="Mobile"
              value={[lead.countryCode, lead.mobile].filter(Boolean).join(" ") || null}
            />
            <Row label="WhatsApp" value={lead.whatsappNumber} />
            <Row label="Also attending" value={siblingNames(lead) || null} />
            <Row label="Time Zone" value={lead.timeZone} />
          </InfoCard>
          <InfoCard icon={BookOpen} title="Learning Requirements">
            <Row label="Subject" value={lead.interestedSubject} />
            <Row label="Session for" value={labelOf(SESSION_FOR_LABELS, lead.sessionFor)} />
            <Row label="Teacher Preference" value={lead.preferredTeacherGender} />
            <Row label="How they found us" value={labelOf(HOW_FOUND_LABELS, lead.howFound)} />
            {/* Requested slot, before a coach touches it — the trial row below is
                the source of truth once one exists. */}
            <Row label="Requested Slot" value={requestedSlot(lead)} />
            <Row label="Current Level" value={lead.currentLevel} />
            <Row label="Language" value={lead.preferredLanguage} />
            {/* Only meaningful on leads booked through the old form. */}
            <Row label="Preferred Days" value={lead.preferredDays?.join(", ") || null} />
            <Row label="Time Slots" value={lead.preferredTimeSlots?.join(", ") || null} />
          </InfoCard>
          <InfoCard icon={MessageSquare} title="Additional & Marketing">
            <Row label="Learning Goal" value={lead.learningGoal} />
            <Row label="Previous Coaching" value={lead.previousCoaching} />
            <Row label="Special Requirements" value={lead.specialRequirements} />
            <Row label="Medical / Disability" value={lead.medicalDisability} />
            <Row label="Source" value={lead.leadSource} />
            {/* Captured at submission; worth being able to point at. */}
            <Row
              label="Consent"
              value={
                lead.acceptPrivacy || lead.acceptTerms
                  ? [lead.acceptPrivacy && "Privacy", lead.acceptTerms && "Terms"]
                      .filter(Boolean)
                      .join(" + ") + " accepted"
                  : null
              }
            />
            <Row label="UTM" value={[lead.utmSource, lead.utmCampaign, lead.utmMedium].filter(Boolean).join(" / ") || null} />
            <Row label="Referral" value={lead.referralUrl} />
            <Row label="Device / Browser" value={[lead.device, lead.browser].filter(Boolean).join(" · ") || null} />
            <Row label="IP" value={lead.ipAddress} />
          </InfoCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-3">
          Corrections are recorded on the timeline, including what the value was before.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} disabled={busy}
            className="inline-flex h-9 items-center rounded-xl border border-hairline px-3.5 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-60">
            Cancel
          </button>
          <button onClick={save} disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save changes
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard icon={User} title="Student">
          <EditRow label="First name" value={form.studentFirstName} onChange={(v) => set("studentFirstName", v)} required />
          <EditRow label="Last name" value={form.studentLastName} onChange={(v) => set("studentLastName", v)} required />
          <EditRow label="Gender" value={form.gender} onChange={(v) => set("gender", v)}
            options={["", "Male", "Female"]} />
          <EditRow label="Date of Birth" value={form.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} type="date" />
          <EditRow label="Current Grade" value={form.currentGrade} onChange={(v) => set("currentGrade", v)} />
          <EditRow label="Current School" value={form.currentSchool} onChange={(v) => set("currentSchool", v)} />
          <EditRow label="Country" value={form.country} onChange={(v) => set("country", v)} />
          <EditRow label="Time Zone" value={form.timeZone} onChange={(v) => set("timeZone", v)} />
        </InfoCard>

        <InfoCard icon={Users} title="Parent / Contact">
          <EditRow label="Parent" value={form.parentName} onChange={(v) => set("parentName", v)} />
          <EditRow label="Relationship" value={form.relationship} onChange={(v) => set("relationship", v)} />
          <EditRow label="Email" value={form.email} onChange={(v) => set("email", v)} type="email" required
            hint="Reminders and the joining link go here." />
          <EditRow label="Dial code" value={form.countryCode} onChange={(v) => set("countryCode", v)} />
          <EditRow label="Mobile" value={form.mobile} onChange={(v) => set("mobile", v)} />
          <EditRow label="WhatsApp" value={form.whatsappNumber} onChange={(v) => set("whatsappNumber", v)} />
        </InfoCard>

        <InfoCard icon={BookOpen} title="Learning Requirements">
          <EditRow label="Subject" value={form.interestedSubject} onChange={(v) => set("interestedSubject", v)}
            options={["", "Quran", "Arabic Language", "Islamic Studies"]} />
          <EditRow label="Teacher Preference" value={form.preferredTeacherGender} onChange={(v) => set("preferredTeacherGender", v)}
            options={["", "Male", "Female", "Either"]} />
          <EditRow label="Current Level" value={form.currentLevel} onChange={(v) => set("currentLevel", v)} />
          <EditRow label="Language" value={form.preferredLanguage} onChange={(v) => set("preferredLanguage", v)} />
        </InfoCard>

        <InfoCard icon={MessageSquare} title="Additional">
          <EditRow label="Learning Goal" value={form.learningGoal} onChange={(v) => set("learningGoal", v)} />
          <EditRow label="Special Requirements" value={form.specialRequirements} onChange={(v) => set("specialRequirements", v)} />
          <EditRow label="Medical / Disability" value={form.medicalDisability} onChange={(v) => set("medicalDisability", v)} />
          {/* Source, UTM, device and IP are how the request arrived. Editing
              them would falsify the record, so they stay read-only. */}
          <Row label="Source" value={lead.leadSource} />
          <Row label="Requested Slot" value={requestedSlot(lead)} />
        </InfoCard>
      </div>
    </div>
  );
}

function EditRow({
  label, value, onChange, type = "text", options, required, hint,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  type?: string;
  options?: string[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-hairline/60 py-2 last:border-0 sm:flex-row sm:items-center sm:gap-3">
      <span className="min-w-36 shrink-0 text-[11px] font-semibold text-ink-3">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      <div className="w-full">
        {options ? (
          <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-hairline bg-surface px-2.5 text-xs font-semibold text-ink focus:border-accent focus:outline-none">
            {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        ) : (
          <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-hairline bg-surface px-2.5 text-xs font-semibold text-ink focus:border-accent focus:outline-none" />
        )}
        {hint && <span className="mt-0.5 block text-[10px] text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}

// ── Evaluation (Step 6) ───────────────────────────────────────────────────────
function EvaluationTab({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>(() => (lead.evaluationScores as any) || {});
  const [notes, setNotes] = useState(lead.evaluationNotes || "");
  const [busy, setBusy] = useState(false);

  const vals = Object.values(scores).filter((v) => typeof v === "number");
  const preview = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) : lead.overallScore ?? 0;

  const save = async () => {
    if (!Object.keys(scores).length) {
      Swal.fire({ title: "Add scores", text: "Score at least one skill.", icon: "info", background: swalBg() });
      return;
    }
    setBusy(true);
    try {
      await evaluateLead(lead.id, scores, notes || undefined);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Evaluation saved", showConfirmButton: false, timer: 1800 });
      onDone();
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Skill Evaluation <span className="text-ink-3 font-medium">(1–10 each)</span></h3>
          <div className="text-right">
            <p className="text-2xl font-black text-accent leading-none">{preview}%</p>
            <p className="text-[10px] font-semibold text-ink-3">Overall</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EVALUATION_SKILLS.map((skill) => (
            <div key={skill} className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-3 py-2">
              <span className="text-xs font-bold text-ink-2">{skill}</span>
              <select
                value={scores[skill] ?? ""}
                onChange={(e) => setScores((s) => { const n = { ...s }; if (e.target.value === "") delete n[skill]; else n[skill] = Number(e.target.value); return n; })}
                className="h-8 w-16 rounded-lg border border-hairline bg-surface px-2 text-xs font-bold text-ink focus:outline-none focus:border-accent"
              >
                <option value="">—</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Evaluation notes…"
          className="mt-4 w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
        <button onClick={save} disabled={busy} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save Evaluation
        </button>
      </CardBody>
    </Card>
  );
}

function TimelineTab({ activities }: { activities: LeadActivity[] }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <h3 className="mb-4 text-sm font-bold text-ink">Activity Timeline</h3>
        {activities.length === 0 ? (
          <p className="text-xs text-ink-3">No activity yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-hairline pl-5">
            {activities.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[22px] top-1 grid size-3 place-items-center rounded-full bg-accent ring-4 ring-surface" />
                <p className="text-xs font-bold text-ink">{a.message}</p>
                <p className="mt-0.5 text-[10px] text-ink-3">
                  {a.type.replace(/_/g, " ")} · {new Date(a.createdAt).toLocaleString()}{a.actorName ? ` · ${a.actorName}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

// ── Trial classes (Steps 9–12) ────────────────────────────────────────────────
const MEETING_PROVIDERS = ["Zoom", "Google Meet"];
const TRIAL_STATUS_TONE: Record<string, string> = {
  SCHEDULED: "text-accent bg-accent/10 border-accent/20",
  RESCHEDULED: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  COMPLETED: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  NO_SHOW: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  CANCELLED: "text-ink-3 bg-surface-2 border-hairline",
};

function TrialTab({ lead, teachers, onChange }: { lead: Lead; teachers: { id: string; name: string }[]; onChange: () => void }) {
  const [trials, setTrials] = useState<LeadTrial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = () => fetchLeadTrials(lead.id).then(setTrials).catch(() => undefined).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [lead.id]);

  const refresh = () => { load(); onChange(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Trial Classes</h3>
        <button onClick={() => setShowForm((s) => !s)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90">
          <Plus className="size-4" /> Schedule Trial
        </button>
      </div>

      {showForm && (
        <ScheduleTrialForm
          lead={lead}
          teachers={teachers}
          onCancel={() => setShowForm(false)}
          onScheduled={() => { setShowForm(false); refresh(); }}
        />
      )}

      {/* Opens on the date the visitor asked for, so the coach starts where the
          family expected rather than on an arbitrary day. */}
      <TeacherAvailabilityPanel
        defaultDate={lead.preferredDate ? lead.preferredDate.slice(0, 10) : null}
      />

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading trials…</div>
      ) : trials.length === 0 ? (
        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="flex flex-col items-center justify-center gap-2 py-14 text-center text-ink-3">
            <CalendarClock className="size-8 text-ink-3/40" />
            <p className="text-sm font-bold text-ink">No trial scheduled yet</p>
            <p className="max-w-sm text-xs">Schedule a free trial (demo) class. The parent gets an email invite and automatic 24h / 1h reminders.</p>
          </CardBody>
        </Card>
      ) : (
        trials.map((t) => <TrialCard key={t.id} trial={t} teachers={teachers} onChange={refresh} />)
      )}
    </div>
  );
}

/*
 * Scheduling a trial from the coach's side.
 *
 * This used to be a free-text datetime box and a dropdown of every teacher in
 * the academy, which let a coach book 3am with someone who does not work
 * Tuesdays — and the family only found out when nobody joined. The date now
 * comes prefilled from what the family asked for, the times offered are real
 * 30-minute slots, and the teacher list is whoever is actually free then.
 */
function ScheduleTrialForm({ lead, teachers, onCancel, onScheduled }: {
  lead: Lead; teachers: { id: string; name: string }[]; onCancel: () => void; onScheduled: () => void;
}) {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const toHHmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  /* Booking window mirrors the public form: tomorrow to +30 days. */
  const day = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const todayUtc = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const minDate = iso(todayUtc + day);
  const maxDate = iso(todayUtc + 30 * day);

  /* Start from the date the family picked, unless it has already gone by. */
  const wanted = lead.preferredDate ? lead.preferredDate.slice(0, 10) : "";
  const [date, setDate] = useState(wanted >= minDate && wanted <= maxDate ? wanted : minDate);

  const [avail, setAvail] = useState<TrialDayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [slot, setSlot] = useState("");
  const [teacherId, setTeacherId] = useState(lead.assignedTeacherId || "");
  const [duration, setDuration] = useState(30);
  const [provider, setProvider] = useState("Zoom");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setAvail(null);
    fetchTeacherAvailability(date)
      .then(setAvail)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [date]);

  /*
   * A 60-minute trial needs two consecutive free slots, not one. Checking only
   * the start would offer a teacher who is booked half an hour in.
   */
  const canStart = (free: string[], start: string) => {
    const set = new Set(free);
    const need = Math.ceil(duration / 30);
    const from = toMin(start);
    for (let i = 0; i < need; i++) if (!set.has(toHHmm(from + i * 30))) return false;
    return true;
  };

  /* Every time somebody could actually teach, across all teachers. */
  const slotOptions = useMemo(() => {
    if (!avail) return [];
    const all = new Set<string>();
    for (const t of avail.teachers) for (const s of t.freeSlots) if (canStart(t.freeSlots, s)) all.add(s);
    return [...all].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail, duration]);

  /* Only the teachers free for the whole of the chosen slot. */
  const freeTeachers = useMemo(() => {
    if (!avail || !slot) return [];
    const matching = avail.teachers.filter((t) => canStart(t.freeSlots, slot));
    /*
     * The family asked for a male or female teacher on the booking form. Not a
     * hard filter — a coach may still have to place them — but the ones who
     * match are listed first and labelled, so honouring the request is the
     * path of least resistance rather than something to remember.
     */
    const want = lead.preferredTeacherGender;
    if (!want || want === "Either") return matching;
    return [...matching].sort((a, b) => Number(b.gender === want) - Number(a.gender === want));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail, slot, duration, lead.preferredTeacherGender]);

  /* Prefer the slot the family asked for; otherwise the first one going. */
  useEffect(() => {
    if (!slotOptions.length) { setSlot(""); return; }
    setSlot((current) => {
      if (current && slotOptions.includes(current)) return current;
      const asked = lead.preferredSlot ?? "";
      return slotOptions.includes(asked) ? asked : slotOptions[0];
    });
  }, [slotOptions, lead.preferredSlot]);

  /* Keep the teacher honest: clear the choice if they are not free any more. */
  useEffect(() => {
    if (teacherId && !freeTeachers.some((t) => t.teacherId === teacherId)) setTeacherId("");
  }, [freeTeachers, teacherId]);

  const submit = async () => {
    if (!slot) { Swal.fire({ title: "Pick a time", icon: "info", background: swalBg() }); return; }
    setBusy(true);
    try {
      await scheduleLeadTrial(lead.id, {
        // Slots are published in UTC, same as the public booking form.
        scheduledAt: new Date(`${date}T${slot}:00.000Z`).toISOString(),
        teacherId: teacherId || undefined,
        durationMins: duration,
        meetingProvider: provider,
        meetingLink: link || undefined,
        notes: notes || undefined,
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Trial scheduled — invite sent", showConfirmButton: false, timer: 2000 });
      onScheduled();
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() });
    } finally { setBusy(false); }
  };

  const askedFor = lead.preferredDate
    ? `${lead.preferredDate.slice(0, 10)}${lead.preferredSlot ? ` at ${lead.preferredSlot}` : ""}`
    : null;

  return (
    <Card className="border border-accent/30 bg-surface shadow-sm">
      <CardBody className="p-5">
        <h4 className="mb-1 text-sm font-bold text-ink">Schedule a Trial Class</h4>
        <p className="mb-3 text-[11px] text-ink-3">
          {askedFor
            ? `The family asked for ${askedFor} (UTC). Only teachers free at the time you pick are listed.`
            : "Only teachers free at the time you pick are listed. Times in UTC."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
          </Field>
          <Field label="Duration (mins)">
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
              {[30, 60].map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </Field>

          <Field label="Time" full>
            {loading ? (
              <div className="flex items-center gap-2 py-2 text-xs font-bold text-ink-3">
                <Loader2 className="size-4 animate-spin text-accent" /> Checking who is free…
              </div>
            ) : slotOptions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline px-3 py-3 text-xs text-ink-3">
                No teacher is free for {duration} minutes on this date. Try another date, a shorter
                slot, or ask a teacher to publish their availability.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {slotOptions.map((s) => (
                  <button key={s} type="button" onClick={() => setSlot(s)}
                    className={`h-9 rounded-lg border px-3 text-xs font-bold transition-colors ${
                      slot === s ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3 hover:text-ink-2"
                    }`}>
                    {s}
                    {s === lead.preferredSlot ? " ★" : ""}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label={`Teacher${slot ? ` — free at ${slot}` : ""}`} full>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!slot}
              className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent disabled:opacity-50">
              <option value="">— Leave unassigned —</option>
              {freeTeachers.map((t) => (
                <option key={t.teacherId} value={t.teacherId}>
                  {t.name}
                  {t.gender ? ` · ${t.gender}` : ""}
                  {lead.preferredTeacherGender && lead.preferredTeacherGender !== "Either" && t.gender === lead.preferredTeacherGender
                    ? " · matches request"
                    : ""}
                  {t.subjects?.length ? ` · ${t.subjects.join(", ")}` : ""}
                </option>
              ))}
            </select>
            {slot && freeTeachers.length === 0 && (
              <p className="mt-1 text-[11px] font-semibold text-amber-600">
                Nobody is free at {slot} for {duration} minutes.
              </p>
            )}
            {/*
              * Teachers who never published availability cannot appear above,
              * so say how many are being left out rather than letting the coach
              * assume the academy is fully booked.
              */}
            {avail && teachers.length > avail.teachers.length && (
              <p className="mt-1 text-[11px] text-ink-3">
                {teachers.length - avail.teachers.length} of {teachers.length} teachers have no
                approved availability and cannot be offered here.
              </p>
            )}
          </Field>

          <Field label="Platform">
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
              {MEETING_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Meeting link (optional)">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Leave blank — Zoom room is created for you"
              className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
          </Field>
          <Field label="Notes (optional)" full>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the teacher should know…"
              className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={busy || !slot} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />} Schedule & Send Invite
          </button>
          <button onClick={onCancel} className="inline-flex h-10 items-center rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2">Cancel</button>
        </div>
      </CardBody>
    </Card>
  );
}

function TrialCard({ trial, teachers, onChange }: { trial: LeadTrial; teachers: { id: string; name: string }[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  /*
   * Same definition as the teacher's own screen. The coach used to treat a
   * NO_SHOW as still open, so it kept offering Present / No-show / Reschedule
   * on a trial the teacher had already closed — and clicking Present silently
   * turned their no-show into a completed class.
   */
  const done = isTrialClosed(trial);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); Swal.fire({ toast: true, position: "top-end", icon: "success", title: ok, showConfirmButton: false, timer: 1800 }); onChange(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-accent" />
              <p className="text-sm font-black text-ink">{new Date(trial.scheduledAt).toLocaleString()}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${TRIAL_STATUS_TONE[trial.status] || ""}`}>{trial.status.replace(/_/g, " ")}</span>
            </div>
            <p className="mt-1 text-xs text-ink-3">
              {trial.durationMins} mins · {trial.teacherName || "Unassigned teacher"}{trial.meetingProvider ? ` · ${trial.meetingProvider}` : ""}
            </p>
            {trial.meetingLink && (
              <a href={trial.meetingLink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline">
                <Video className="size-3.5" /> Join link
              </a>
            )}
            {(trial.reminder24hSentAt || trial.reminder1hSentAt) && (
              <p className="mt-1 text-[10px] text-ink-3">Reminders sent: {[trial.reminder24hSentAt && "24h", trial.reminder1hSentAt && "1h"].filter(Boolean).join(", ")}</p>
            )}
          </div>
          {!done && trial.status !== "CANCELLED" && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => act(() => sendLeadTrialReminder(trial.id), "Reminder sent")} disabled={busy}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[11px] font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-50">
                <Send className="size-3.5" /> Remind
              </button>
              <button onClick={() => act(() => markLeadTrialAttendance(trial.id, "PRESENT"), "Marked present")} disabled={busy}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50">
                <CheckCircle2 className="size-3.5" /> Present
              </button>
              <button onClick={() => act(() => markLeadTrialAttendance(trial.id, "ABSENT"), "Marked no-show")} disabled={busy}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 text-[11px] font-bold text-rose-600 hover:bg-rose-500/20 disabled:opacity-50">
                <XCircle className="size-3.5" /> No-show
              </button>
              <RescheduleButton trial={trial} teachers={teachers} onChange={onChange} />
            </div>
          )}
        </div>

        <MissingInfoRow trial={trial} onChange={onChange} />

        {/*
          * The teacher's report, once filed. Read-only here: the coach's
          * enrolment decision rests on it, so it must not change under them —
          * and the teacher was the one in the room.
          */}
        {trial.reportSubmittedAt ? (
          <SubmittedReport trial={trial} />
        ) : (
          done && (
            <p className="mt-3 rounded-lg border border-dashed border-hairline px-3 py-2 text-[11px] font-semibold text-ink-3">
              Waiting on {trial.teacherName || "the teacher"} to file the trial report.
            </p>
          )
        )}

        {/*
          * Parent feedback stays the coach's to record — they are the one who
          * calls the family afterwards. The teacher's half now arrives with
          * the report above rather than being typed in twice.
          */}
        {(done || trial.parentFeedback) && (
          <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2">
            {!trial.reportSubmittedAt && <FeedbackBlock trial={trial} side="teacher" onChange={onChange} />}
            <FeedbackBlock trial={trial} side="parent" onChange={onChange} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/*
 * Chasing the four details a trial often cannot pin down: the package, the
 * days, the time and the start date. Rather than the coach phoning and typing
 * them in second-hand, the family gets a link and their answers land straight
 * on the trial record.
 *
 * The URL is shown once, here, because only its hash is stored — a leaked
 * database should not hand out working links. Sending again mints a new one
 * and kills the old, which the confirmation says out loud.
 */
function MissingInfoRow({ trial, onChange }: { trial: LeadTrial; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const missing = [
    !trial.preferredPackage && "package",
    !trial.preferredDays?.length && "days",
    !trial.preferredTime && "time",
    !trial.preferredStartDate && "start date",
  ].filter(Boolean) as string[];

  // Nothing to chase and nothing sent — stay out of the way.
  if (!missing.length && !trial.infoRequestedAt) return null;

  const send = async () => {
    if (trial.infoRequestedAt && !trial.infoSubmittedAt) {
      const { isConfirmed } = await Swal.fire({
        title: "Send a new link?",
        text: "The link already sent will stop working.",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Send new link",
        background: swalBg(),
      });
      if (!isConfirmed) return;
    }
    setBusy(true);
    try {
      const res = await requestTrialInfo(trial.id);
      await Swal.fire({
        title: "Link sent",
        html:
          `<p style="font-size:13px">Emailed to <b>${res.sentTo}</b>. Copy it now if you also want to send it on WhatsApp — it is not stored and cannot be shown again.</p>` +
          `<input readonly value="${res.url}" style="width:100%;margin-top:10px;padding:8px;font-size:11px;border:1px solid #d1d5db;border-radius:8px" onclick="this.select()" />`,
        icon: "success",
        background: swalBg(),
      });
      onChange();
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-hairline px-3 py-2">
      <p className="text-[11px] font-semibold text-ink-3">
        {trial.infoSubmittedAt ? (
          <>
            The family completed their details on{" "}
            {new Date(trial.infoSubmittedAt).toLocaleDateString()}.
          </>
        ) : missing.length ? (
          <>Still missing: {missing.join(", ")}.</>
        ) : (
          <>All details are in.</>
        )}
        {trial.infoRequestedAt && !trial.infoSubmittedAt && (
          <> Link sent {new Date(trial.infoRequestedAt).toLocaleDateString()}, not returned yet.</>
        )}
      </p>
      {missing.length > 0 && (
        <button
          onClick={send}
          disabled={busy}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[11px] font-bold text-ink-2 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <LinkIcon className="size-3.5" />
          {trial.infoRequestedAt ? "Send again" : "Ask the family"}
        </button>
      )}
    </div>
  );
}

function RescheduleButton({ trial, teachers, onChange }: { trial: LeadTrial; teachers: { id: string; name: string }[]; onChange: () => void }) {
  const reschedule = async () => {
    const { value } = await Swal.fire({
      title: "Reschedule trial",
      html: `<input id="sw-dt" type="datetime-local" class="swal2-input" style="width:auto" />`,
      background: swalBg(),
      showCancelButton: true,
      confirmButtonText: "Reschedule",
      preConfirm: () => {
        const v = (document.getElementById("sw-dt") as HTMLInputElement)?.value;
        if (!v) { Swal.showValidationMessage("Pick a date & time"); return false; }
        return v;
      },
    });
    if (!value) return;
    try {
      await updateLeadTrial(trial.id, { scheduledAt: new Date(value as string).toISOString() });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Rescheduled", showConfirmButton: false, timer: 1800 });
      onChange();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() }); }
  };
  void teachers;
  return (
    <button onClick={reschedule} className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[11px] font-bold text-ink-2 hover:bg-surface-2">
      <CalendarClock className="size-3.5" /> Reschedule
    </button>
  );
}

function FeedbackBlock({ trial, side, onChange }: { trial: LeadTrial; side: "teacher" | "parent"; onChange: () => void }) {
  const existingRating = side === "teacher" ? trial.teacherRating : trial.parentRating;
  const existingText = side === "teacher" ? trial.teacherFeedback : trial.parentFeedback;
  const existingPositive = side === "teacher" ? trial.teacherRecommendsEnroll : trial.parentInterested;
  const [rating, setRating] = useState(existingRating ?? 0);
  const [text, setText] = useState(existingText ?? "");
  const [positive, setPositive] = useState<boolean | null>(existingPositive ?? null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await submitLeadTrialFeedback(trial.id, { side, rating: rating || undefined, feedback: text || undefined, positive: positive ?? undefined });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Feedback saved", showConfirmButton: false, timer: 1600 });
      onChange();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-hairline bg-surface-2/40 p-3">
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">{side === "teacher" ? "Teacher Feedback" : "Parent Feedback"}</p>
      <div className="mb-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)}>
            <Star className={`size-4 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-ink-3/40"}`} />
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={side === "teacher" ? "How did the student do?" : "How was the experience?"}
        className="w-full rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-accent" />
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-ink-3">{side === "teacher" ? "Recommend enrol?" : "Interested?"}</span>
        <button type="button" onClick={() => setPositive(true)} className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${positive === true ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-hairline text-ink-3"}`}>Yes</button>
        <button type="button" onClick={() => setPositive(false)} className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${positive === false ? "border-rose-500/40 bg-rose-500/10 text-rose-600" : "border-hairline text-ink-3"}`}>No</button>
      </div>
      <button onClick={save} disabled={busy} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
      </button>
    </div>
  );
}

// ── Coach decision + conversion (Steps 13–14) ─────────────────────────────────
function DecisionTab({ lead, onChange }: { lead: Lead; onChange: () => void }) {
  const [notes, setNotes] = useState(lead.coachDecisionNotes || "");
  const [busy, setBusy] = useState(false);
  const converted = !!lead.convertedStudentId;

  /*
   * The package decides the first invoice. Left blank the server falls back to
   * whatever the family chose — on the trial or afterwards on the info-form
   * link — so the coach only touches this when overriding them.
   */
  const [packages, setPackages] = useState<TrialOptions["packages"]>([]);
  const [packageId, setPackageId] = useState("");
  useEffect(() => {
    if (converted) return;
    fetchTrialOptions().then((o) => setPackages(o.packages)).catch(() => undefined);
  }, [converted]);

  const decide = async (decision: "ENROLL" | "REJECT" | "FOLLOW_UP") => {
    if (decision === "ENROLL") {
      const ok = await Swal.fire({
        title: "Convert to student?",
        text:
          "This creates an active student account, raises the first invoice, and emails the family their login, package and invoice." +
          (packageId ? "" : " No package selected — the one the family chose will be used, if there is one."),
        icon: "question", showCancelButton: true, confirmButtonText: "Yes, enrol", background: swalBg(),
      });
      if (!ok.isConfirmed) return;
    }
    setBusy(true);
    try {
      await leadCoachDecision(lead.id, {
        decision,
        notes: notes || undefined,
        ...(decision === "ENROLL" && packageId ? { packageId } : {}),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: decision === "ENROLL" ? "Converted to student 🎉" : "Decision recorded", showConfirmButton: false, timer: 2200 });
      onChange();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  if (converted) {
    return (
      <Card className="border border-emerald-500/30 bg-emerald-500/5 shadow-sm">
        <CardBody className="flex flex-col items-center justify-center gap-2 py-14 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600"><BadgeCheck className="size-7" /></div>
          <p className="text-base font-black text-ink">Converted to Student</p>
          <p className="text-sm font-bold text-emerald-600">{lead.convertedStudentCode}</p>
          <p className="max-w-sm text-xs text-ink-3">
            An active student account was created and login credentials were emailed to {lead.email}
            {lead.convertedAt ? ` on ${new Date(lead.convertedAt).toLocaleDateString()}` : ""}.
          </p>

          {/*
            * Billing outcome, on the screen the coach is already looking at.
            * "No invoice was raised" is the failure this most needs to be
            * loud about, and it was only ever written to another tab.
            */}
          <div className="mt-3 w-full max-w-sm space-y-1.5">
            {(lead.convertedStudents ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px]">
                <span className="font-bold text-ink-2">{s.name}</span>
                {s.invoiceNumber ? (
                  <span className="font-bold text-emerald-600">
                    {s.invoiceNumber}
                    {s.invoiceAmount != null ? ` · ${s.invoiceCurrency} ${s.invoiceAmount.toFixed(2)}` : ""}
                  </span>
                ) : (
                  <span className="font-bold text-amber-600">No invoice — raise one in Finance</span>
                )}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <BadgeCheck className="size-4 text-accent" />
          <h3 className="text-sm font-bold text-ink">Coach Decision</h3>
        </div>
        <p className="mb-4 text-xs text-ink-3">Record the outcome after the trial. Enrolling converts this lead into an active student and sends login credentials.</p>

        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Package to bill</label>
        <select value={packageId} onChange={(e) => setPackageId(e.target.value)}
          className="mb-1.5 h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
          <option value="">Use the package the family chose</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.classesPerMonth} classes/month
            </option>
          ))}
        </select>
        <p className="mb-4 text-[11px] text-ink-3">
          The first invoice is raised from this, one per child, and goes out with the welcome
          email. With no package on record none is raised and the timeline says so.
        </p>

        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Decision notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Summary of the decision…"
          className="mb-4 w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />

        <div className="grid gap-2.5 sm:grid-cols-3">
          <button onClick={() => decide("ENROLL")} disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Enrol as Student
          </button>
          <button onClick={() => decide("FOLLOW_UP")} disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface text-sm font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-60">
            <CalendarClock className="size-4 text-accent" /> Follow Up Later
          </button>
          <button onClick={() => decide("REJECT")} disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 text-sm font-bold text-rose-600 hover:bg-rose-500/10 disabled:opacity-60">
            <XCircle className="size-4" /> Not Enrolling
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      {children}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function InfoCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="size-4 text-accent" />
          <h3 className="text-sm font-bold text-ink">{title}</h3>
        </div>
        <div className="space-y-1.5">{children}</div>
      </CardBody>
    </Card>
  );
}

/*
 * Every field the form has, whether or not the family filled it in.
 *
 * This used to drop the whole row when the value was empty, which left the
 * coach unable to tell "they were asked and did not answer" from "we never
 * ask this" — and made two requests side by side look like different forms.
 * An em dash says the question exists and the answer does not.
 */
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline/50 pb-1.5 text-xs last:border-0">
      <span className="text-ink-3 font-medium shrink-0">{label}</span>
      <span className={`text-right break-words font-semibold ${value ? "text-ink-2" : "text-ink-3/50"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink focus:outline-none focus:border-accent disabled:opacity-60">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
