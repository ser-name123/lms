"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { money, type Currency } from "@/lib/currency";
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
  AlertCircle,
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
  submitLeadTrialFeedback,
  sendLeadTrialReminder,
  requestTrialInfo,
  fetchTrialOptions,
  fetchTeacherAvailability,
  leadCoachDecision,
  fetchEnrollmentTeachers,
  type EnrollmentTeacher,
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
  getLeadStatusLabel,
  getLeadStatusTone,
} from "@/components/leads/lead-meta";
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
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);

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

        {lead.duplicateCount !== undefined && lead.duplicateCount > 0 && (
          <div className="flex items-center justify-between p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-2xl text-xs font-semibold animate-pulse shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-5 shrink-0" />
              <span>
                <strong>Warning:</strong> This student has <strong>{lead.duplicateCount} duplicate request{lead.duplicateCount > 1 ? "s" : ""}</strong> under the same Email or Mobile number.
              </span>
            </div>
            <button
              onClick={() => setShowDuplicatesModal(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm cursor-pointer ml-4 whitespace-nowrap"
            >
              View Duplicates
            </button>
          </div>
        )}

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
                  <Badge tone={getLeadStatusTone(lead)}>{getLeadStatusLabel(lead)}</Badge>
                  <Badge tone={LEAD_PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
                  {lead.duplicateCount !== undefined && lead.duplicateCount > 0 && (
                    <button
                      onClick={() => setShowDuplicatesModal(true)}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-600 px-2 py-0.5 text-[10px] font-bold border border-rose-500/20 animate-pulse cursor-pointer hover:bg-rose-500/20"
                    >
                      <AlertCircle className="size-3" />
                      {lead.duplicateCount} Duplicates
                    </button>
                  )}
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

        {showDuplicatesModal && lead.duplicateLeads && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] transition-opacity">
            <div className="bg-surface border border-hairline rounded-3xl w-full max-w-3xl max-h-[90vh] shadow-pop overflow-hidden flex flex-col transition-all">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
                <div>
                  <h2 className="font-extrabold text-base text-ink">Duplicate Lead Requests</h2>
                  <p className="text-xs text-ink-3 mt-0.5">Other bookings matching this lead's email ({lead.email}) or mobile ({lead.mobile})</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowDuplicatesModal(false)} 
                  className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer"
                >
                  <XCircle className="size-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="overflow-x-auto rounded-xl border border-hairline bg-surface shadow-sm">
                  <table className="w-full text-left text-xs font-semibold text-ink-2 border-collapse">
                    <thead>
                      <tr className="border-b border-hairline text-ink-3 uppercase text-[10px] tracking-wider bg-surface-2/15">
                        <th className="p-3 pl-4">Request ID</th>
                        <th className="p-3">Student Name</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Mobile No.</th>
                        <th className="p-3">Applied Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 pr-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {lead.duplicateLeads.map((dup: any) => (
                        <tr key={dup.id} className="hover:bg-surface-2/5 transition">
                          <td className="p-3 pl-4 font-mono font-bold text-accent">{dup.leadNumber}</td>
                          <td className="p-3 font-bold text-ink">{dup.studentFirstName} {dup.studentLastName}</td>
                          <td className="p-3 text-ink-3">{dup.email}</td>
                          <td className="p-3 text-ink-3">{dup.mobile}</td>
                          <td className="p-3 text-ink-3">{new Date(dup.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                          <td className="p-3"><Badge tone={getLeadStatusTone(dup)}>{getLeadStatusLabel(dup)}</Badge></td>
                          <td className="p-3 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setShowDuplicatesModal(false);
                                router.push(`/leads/${dup.id}`);
                              }}
                              className="px-3 py-1 bg-accent text-white font-bold rounded-lg text-[10px] hover:bg-accent-active cursor-pointer"
                            >
                              Open Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end p-4 border-t border-hairline bg-surface-2/50">
                <button 
                  type="button" 
                  onClick={() => setShowDuplicatesModal(false)} 
                  className="h-9 px-4 rounded-xl border border-hairline bg-surface hover:bg-surface-2 text-xs font-bold text-ink-2 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
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

      {/*
        * The day-at-a-glance availability grid used to sit here. Both places a
        * teacher is actually chosen — the scheduling form and the trial card —
        * list who is free at the moment of the decision and say when nobody
        * is, so the grid only pushed the trials themselves down the page.
        */}

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
        trials.map((t) => (
          <TrialCard
            key={t.id}
            trial={t}
            teachers={teachers}
            recommendedTeacherId={lead.recommendedTeacherId}
            leadAssignedTeacherId={lead.assignedTeacherId}
            onChange={refresh}
          />
        ))
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
              {/*
                * No "leave unassigned" option: a trial with no teacher shows up
                * on nobody's screen, and the family is still sent a reminder
                * for it. The API refuses one too.
                */}
              <option value="">— Select a teacher —</option>
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
          <button onClick={submit} disabled={busy || !slot || !teacherId} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />} Schedule & Send Invite
          </button>
          <button onClick={onCancel} className="inline-flex h-10 items-center rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2">Cancel</button>
        </div>
      </CardBody>
    </Card>
  );
}

function TrialCard({
  trial,
  teachers,
  recommendedTeacherId,
  leadAssignedTeacherId,
  onChange,
}: {
  trial: LeadTrial;
  teachers: { id: string; name: string }[];
  recommendedTeacherId?: string | null;
  leadAssignedTeacherId?: string | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
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
              {!leadAssignedTeacherId && trial.status === "SCHEDULED" ? (
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-600 border-blue-500/20">REQUEST</span>
              ) : (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${TRIAL_STATUS_TONE[trial.status] || ""}`}>{trial.status.replace(/_/g, " ")}</span>
              )}
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
              <button onClick={() => setEditing((s) => !s)} disabled={busy}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[11px] font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-50">
                <Pencil className="size-3.5" /> {editing ? "Close" : "Edit"}
              </button>
            </div>
          )}
        </div>

        {editing && (
          <EditTrialForm
            trial={trial}
            teachers={teachers}
            onCancel={() => setEditing(false)}
            onSaved={() => { setEditing(false); onChange(); }}
          />
        )}

        <AssignTeacherRow
          trial={trial}
          teachers={teachers}
          recommendedTeacherId={recommendedTeacherId}
          leadAssignedTeacherId={leadAssignedTeacherId}
          onChange={onChange}
        />

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

  // These four are enrollment preferences the family settles around the trial —
  // the website booking never captures them, so a freshly scheduled trial is
  // *expected* to be missing all four. Chasing them only makes sense once the
  // trial has actually happened; before that (SCHEDULED/RESCHEDULED) or when it
  // never will (NO_SHOW/CANCELLED) the prompt is just noise. If a link was
  // already sent, keep showing its status regardless of state.
  if (!trial.infoRequestedAt && (trial.status !== "COMPLETED" || !missing.length)) {
    return null;
  }

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

/*
 * A trial with no teacher is the quietest failure in this flow: it shows on
 * nobody's schedule, the Zoom room exists, and the family is still sent their
 * 24h reminder for a class no one is going to run. Website bookings assign a
 * teacher automatically now, but one booked before that — or booked when
 * nobody was free — needs somebody to notice. So it says so loudly and offers
 * the fix in place, rather than leaving "Unassigned teacher" in grey text.
 */
/*
 * Who could teach a trial starting at `whenIso` and running `durationMins` —
 * free for *every* half-hour it spans, not just the one it starts in. Shared by
 * the assign row and the edit form so the two can never disagree about who is
 * available; the edit form re-runs it as the coach changes the time.
 */
function useFreeTeachers(whenIso: string, durationMins: number) {
  const [avail, setAvail] = useState<TrialDayAvailability | null>(null);
  const date = whenIso ? whenIso.slice(0, 10) : "";

  useEffect(() => {
    if (!date) return;
    let alive = true;
    fetchTeacherAvailability(date)
      .then((a) => { if (alive) setAvail(a); })
      .catch(() => { if (alive) setAvail(null); });
    return () => { alive = false; };
  }, [date]);

  return useMemo(() => {
    if (!avail || !whenIso) return [];
    const start = new Date(whenIso);
    if (isNaN(start.getTime())) return [];
    const from = start.getUTCHours() * 60 + start.getUTCMinutes();
    const need = Math.max(1, Math.ceil((durationMins || 30) / 30));
    const wanted: string[] = [];
    for (let i = 0; i < need; i++) {
      const m = from + i * 30;
      wanted.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    return avail.teachers.filter((t) => wanted.every((s) => t.freeSlots.includes(s)));
  }, [avail, whenIso, durationMins]);
}

function AssignTeacherRow({
  trial,
  teachers,
  recommendedTeacherId,
  leadAssignedTeacherId,
  onChange,
}: {
  trial: LeadTrial;
  teachers: { id: string; name: string }[];
  recommendedTeacherId?: string | null;
  leadAssignedTeacherId?: string | null;
  onChange: () => void;
}) {
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState(false);

  const open = !leadAssignedTeacherId && !isTrialClosed(trial) && trial.status !== "CANCELLED";
  const free = useFreeTeachers(trial.scheduledAt, trial.durationMins);

  useEffect(() => {
    if (recommendedTeacherId) {
      setTeacherId(recommendedTeacherId);
    } else if (trial.teacherId) {
      setTeacherId(trial.teacherId);
    }
  }, [recommendedTeacherId, trial.teacherId]);

  if (!open) return null;

  /*
   * When nobody is free we still list everyone, labelled. Offering only free
   * teachers would be the tidier rule, but it leaves the coach with an empty
   * dropdown and a class that stays teacherless — which is the bug this row
   * exists to close.
   */
  const options = free.length
    ? free.map((t) => {
        const isRec = t.teacherId === recommendedTeacherId;
        return {
          id: t.teacherId,
          label: isRec ? `${t.name} (Recommended)` : t.name,
          free: true,
        };
      })
    : teachers.map((t) => {
        const isRec = t.id === recommendedTeacherId;
        return {
          id: t.id,
          label: isRec ? `${t.name} (Recommended)` : t.name,
          free: false,
        };
      });

  // If there are free teachers and the recommended teacher is not free,
  // we still inject the recommended teacher in options so it can be selected/rendered.
  if (free.length && recommendedTeacherId && !options.some((o) => o.id === recommendedTeacherId)) {
    const recTeacher = teachers.find((t) => t.id === recommendedTeacherId);
    if (recTeacher) {
      options.push({
        id: recTeacher.id,
        label: `${recTeacher.name} (Recommended)`,
        free: false,
      });
    }
  }

  const assign = async () => {
    if (!teacherId) return;
    setBusy(true);
    try {
      await updateLeadTrial(trial.id, { teacherId });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Teacher assigned", showConfirmButton: false, timer: 1800 });
      onChange();
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() });
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-4 rounded-xl border border-blue-500/40 bg-blue-500/10 p-3">
      <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
        Trial Request Pending Confirmation — Assign teacher to confirm and schedule the trial class.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={busy}
          className="h-9 min-w-[220px] rounded-lg border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-accent">
          <option value="">— Select a teacher —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}{o.free ? "" : " · not free at this time"}</option>
          ))}
        </select>
        <button onClick={assign} disabled={busy || !teacherId}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <GraduationCap className="size-3.5" />} Confirm Schedule
        </button>
      </div>
      {!free.length && (
        <p className="mt-1.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
          Nobody has approved availability at this time. Assigning anyway is fine — or reschedule to a slot somebody published.
        </p>
      )}
    </div>
  );
}


// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, and the stored value
// is UTC ISO. Subtracting the offset before slicing keeps the box showing the
// same clock time the card does.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/*
 * Editing a booked trial. This replaces a Reschedule button that could only
 * move the date — it was handed the teacher list and threw it away — so once a
 * trial existed there was no way to change who taught it, how long it ran, or
 * where it met, short of cancelling and rebooking.
 *
 * Only the fields the coach owns. Status, attendance and the report are set by
 * the buttons and the teacher, and editing them from here would let a closed
 * trial be quietly reopened.
 */
function EditTrialForm({ trial, teachers, onCancel, onSaved }: {
  trial: LeadTrial; teachers: { id: string; name: string }[]; onCancel: () => void; onSaved: () => void;
}) {
  const [when, setWhen] = useState(() => toLocalInput(trial.scheduledAt));
  const [duration, setDuration] = useState(trial.durationMins || 30);
  const [teacherId, setTeacherId] = useState(trial.teacherId || "");
  const [provider, setProvider] = useState(trial.meetingProvider || "Zoom");
  const [link, setLink] = useState(trial.meetingLink || "");
  const [notes, setNotes] = useState(trial.notes || "");
  const [busy, setBusy] = useState(false);

  const whenIso = when ? new Date(when).toISOString() : trial.scheduledAt;
  const free = useFreeTeachers(whenIso, duration);

  /*
   * Free teachers first, but never an empty list: the currently assigned one
   * has to stay selectable even after a time change makes them "busy" (they
   * are busy with this very trial), or saving any other field would silently
   * demand a different teacher.
   */
  const options = (() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; free: boolean }[] = [];
    for (const t of free) { seen.add(t.teacherId); out.push({ id: t.teacherId, label: t.name, free: true }); }
    for (const t of teachers) if (!seen.has(t.id)) out.push({ id: t.id, label: t.name, free: false });
    return out;
  })();

  const save = async () => {
    if (!teacherId) return;
    setBusy(true);
    try {
      await updateLeadTrial(trial.id, {
        scheduledAt: whenIso,
        durationMins: duration,
        teacherId,
        meetingProvider: provider || undefined,
        meetingLink: link,
        notes,
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Trial updated", showConfirmButton: false, timer: 1800 });
      onSaved();
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed.", icon: "error", background: swalBg() });
    } finally { setBusy(false); }
  };

  const moved = whenIso !== trial.scheduledAt;

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-surface-2/40 p-4">
      <h4 className="mb-3 text-sm font-bold text-ink">Edit trial</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date & time">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
        </Field>
        <Field label="Duration (minutes)">
          <input type="number" min={10} max={240} step={5} value={duration}
            onChange={(e) => setDuration(Number(e.target.value))} disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
        </Field>
        <Field label="Teacher" full>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
            <option value="">— Select a teacher —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}{o.free ? "" : " · not free at this time"}</option>
            ))}
          </select>
        </Field>
        <Field label="Platform">
          <input value={provider} onChange={(e) => setProvider(e.target.value)} disabled={busy}
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
        </Field>
        <Field label="Meeting link">
          <input value={link} onChange={(e) => setLink(e.target.value)} disabled={busy} placeholder="Left as is if the room is managed for you"
            className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
        </Field>
        <Field label="Notes" full>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={busy}
            className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
        </Field>
      </div>

      {moved && (
        <p className="mt-2 text-[11px] font-semibold text-amber-600">
          Moving the time marks this rescheduled, re-arms the 24h / 1h reminders and updates the meeting room.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={save} disabled={busy || !when || !teacherId}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Save changes
        </button>
        <button onClick={onCancel} disabled={busy}
          className="inline-flex h-9 items-center rounded-xl border border-hairline px-4 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
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

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const parsePreferredTime = (
  preferredTime: string | null | undefined,
  preferredDays: string[],
): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!preferredTime) return result;

  const pairs = preferredTime.split(",").map((p) => p.trim());
  let parsedAny = false;
  pairs.forEach((pair) => {
    const colonIndex = pair.indexOf(":");
    if (colonIndex !== -1) {
      const day = pair.slice(0, colonIndex).trim();
      const time = pair.slice(colonIndex + 1).trim();
      if (preferredDays.includes(day)) {
        result[day] = time;
        parsedAny = true;
      }
    }
  });

  if (!parsedAny && preferredTime.trim().length > 0) {
    preferredDays.forEach((day) => {
      result[day] = preferredTime.trim();
    });
  }

  return result;
};

const serializePreferredTime = (
  preferredDays: string[],
  dayTimes: Record<string, string>,
): string | undefined => {
  if (!preferredDays || preferredDays.length === 0) return undefined;
  if (preferredDays.length === 1) {
    return dayTimes[preferredDays[0]] || undefined;
  }
  const parts = preferredDays
    .map((day) => {
      const time = dayTimes[day];
      return time ? `${day}: ${time}` : null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
};

// ── Coach decision + conversion (Steps 13–14) ─────────────────────────────────
function DecisionTab({ lead, onChange }: { lead: Lead; onChange: () => void }) {
  const [decision, setDecision] = useState<"ENROLL" | "FOLLOW_UP" | "REJECT">(
    (lead as any).coachDecision === "FOLLOW_UP"
      ? "FOLLOW_UP"
      : (lead as any).coachDecision === "REJECT"
      ? "REJECT"
      : "ENROLL"
  );
  const [followUpAt, setFollowUpAt] = useState("");
  const [enrollDate, setEnrollDate] = useState(new Date().toISOString().slice(0, 10));
  const [enrollTime, setEnrollTime] = useState("");
  const [chosenDays, setChosenDays] = useState<string[]>([]);
  const [dayTimes, setDayTimes] = useState<Record<string, string>>({});
  // Currency override (null → use the country-derived currency). Hourly plans
  // also let the coach pick class duration and weekly classes independently.
  const [currencyOverride, setCurrencyOverride] = useState<Currency | null>(null);
  const [hourlyDuration, setHourlyDuration] = useState<number>(60);
  const [hourlyWeekly, setHourlyWeekly] = useState<number>(2);
  // Teacher assignment: the coach searches for teachers who can take the chosen
  // recurring schedule, then picks one (or assigns a non-matching one manually).
  const [teacherId, setTeacherId] = useState<string>("");
  // The course the trial teacher recommended — used to narrow the teacher search
  // to teachers who actually teach this course (backend filters on it).
  const [enrollCourseId, setEnrollCourseId] = useState<string | null>(null);
  const [teacherResults, setTeacherResults] = useState<{ matching: EnrollmentTeacher[]; others: EnrollmentTeacher[] } | null>(null);
  const [teacherSearching, setTeacherSearching] = useState(false);

  const handleDayToggle = (day: string) => {
    setChosenDays((prev) => {
      const on = prev.includes(day);
      return on ? prev.filter((d) => d !== day) : [...prev, day];
    });
  };

  useEffect(() => {
    const serialized = serializePreferredTime(chosenDays, dayTimes);
    setEnrollTime(serialized || "");
  }, [chosenDays, dayTimes]);
  const [notes, setNotes] = useState(lead.coachDecisionNotes || "");
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const converted = !!lead.convertedStudentId;

  const loadActivities = () => {
    fetchLeadActivities(lead.id).then(setActivities).catch(() => undefined);
  };

  useEffect(() => {
    loadActivities();
  }, [lead.id]);

  /*
   * The package decides the first invoice. Left blank the server falls back to
   * whatever the family chose — on the trial or afterwards on the info-form
   * link — so the coach only touches this when overriding them.
   */
  const [familyPackageName, setFamilyPackageName] = useState<string | null>(null);
  const [packages, setPackages] = useState<TrialOptions["packages"]>([]);
  const [packageId, setPackageId] = useState("");
  useEffect(() => {
    if (converted) return;
    
    Promise.all([
      fetchTrialOptions(),
      fetchLeadTrials(lead.id)
    ]).then(([options, trialsList]) => {
      setPackages(options.packages);
      
      const latestTrialWithPkg = trialsList
        .filter(t => t.preferredPackage)
        .sort((a, b) => new Date(b.reportSubmittedAt || b.createdAt).getTime() - new Date(a.reportSubmittedAt || a.createdAt).getTime())[0];
        
      const familyChosenPkg = latestTrialWithPkg?.preferredPackage || (lead as any).preferredPackage;
      
      if (familyChosenPkg) {
        setFamilyPackageName(familyChosenPkg);
        const matched = options.packages.find(
          p => p.name.toLowerCase() === familyChosenPkg.toLowerCase()
        );
        if (matched) {
          setPackageId(matched.id);
        }
      } else {
        setFamilyPackageName(null);
      }

      // Initialize enrollDate & weekly schedule from the latest trial or lead preferences
      const latestTrial = trialsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      // Carry the recommended course through to the teacher search.
      setEnrollCourseId(latestTrial?.recommendedCourseId ?? null);
      if (latestTrial) {
        if (latestTrial.preferredStartDate) {
          const dtStr = new Date(latestTrial.preferredStartDate).toISOString().slice(0, 10);
          setEnrollDate(dtStr);
        }
        const initialDays = latestTrial.preferredDays?.length 
          ? latestTrial.preferredDays 
          : (lead.preferredDays ?? []);
        setChosenDays(initialDays);

        const initialTimeStr = latestTrial.preferredTime || "";
        const parsed = parsePreferredTime(initialTimeStr, initialDays);
        setDayTimes(parsed);
      } else {
        const initialDays = lead.preferredDays ?? [];
        setChosenDays(initialDays);
        const parsed = parsePreferredTime(lead.preferredSlot ? `${lead.preferredSlot}` : "", initialDays);
        setDayTimes(parsed);
      }
    }).catch(() => undefined);
  }, [lead.id, converted]);

  /*
   * The full plan catalogue + models, so this screen can show the subscription
   * model, class structure and an estimated monthly tuition before enrolling,
   * and cap the day picker to what a monthly plan allows — the spec's trial
   * package/schedule selection. Same ids as the trial-options packages above.
   */
  const [richPackages, setRichPackages] = useState<any[]>([]);
  const [subModels, setSubModels] = useState<any[]>([]);
  useEffect(() => {
    if (converted) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
    fetch(`${apiBase}/lms-data/packages`).then((r) => r.json()).then((d) => setRichPackages(Array.isArray(d) ? d : [])).catch(() => undefined);
    fetch(`${apiBase}/lms-data/subscription-models`).then((r) => r.json()).then((d) => setSubModels(Array.isArray(d) ? d : [])).catch(() => undefined);
  }, [converted]);

  const leadCurrency: Currency = useMemo(() => {
    const c = String((lead as any).country ?? "").trim().toUpperCase();
    if (["AE", "UAE", "UNITED ARAB EMIRATES"].includes(c)) return "AED";
    if (["GB", "UK", "UNITED KINGDOM", "GREAT BRITAIN"].includes(c)) return "GBP";
    return "USD";
  }, [lead]);

  const plan = useMemo(() => {
    const byName = richPackages.find((p) => (p.title ?? "").toLowerCase() === (familyPackageName ?? "").toLowerCase());
    const id = packageId || byName?.id || "";
    return richPackages.find((p) => p.id === id) ?? null;
  }, [richPackages, packageId, familyPackageName]);

  const isHourly = useMemo(
    () => subModels.find((m) => m.id === plan?.modelId)?.pricingMode === "HOURLY",
    [subModels, plan],
  );
  // The currency actually billed: the coach's override, else country-derived.
  const effectiveCurrency: Currency = currencyOverride ?? leadCurrency;
  // Hourly plans let the coach choose duration + weekly classes; monthly plans
  // take both from the tier. The day picker is capped to whichever weekly count
  // applies (the chosen one for hourly, the plan's for monthly).
  const planDuration: number = isHourly ? hourlyDuration : (plan?.durationMinutes ?? 60);
  const planWeekly = isHourly ? hourlyWeekly : (plan?.weeklyClasses ?? chosenDays.length);
  const dayCap: number | null = isHourly ? hourlyWeekly : (plan?.weeklyClasses ?? null);
  const planMonthlyHours = planDuration && planWeekly ? (planDuration / 60) * planWeekly * 4 : 0;
  const estTuition: number | null = useMemo(() => {
    if (!plan) return null;
    const pick = (usd: any, aed: any, gbp: any) => (effectiveCurrency === "AED" ? aed : effectiveCurrency === "GBP" ? gbp : usd);
    if (isHourly) {
      const rate = pick(plan.hourlyRateUSD, plan.hourlyRateAED, plan.hourlyRateGBP);
      return rate != null && planMonthlyHours > 0 ? Math.round(Number(rate) * planMonthlyHours * 100) / 100 : null;
    }
    const price = pick(plan.priceUSD, plan.priceAED, plan.priceGBP);
    return price != null ? Number(price) : null;
  }, [plan, isHourly, effectiveCurrency, planMonthlyHours]);

  const searchTeachers = async () => {
    const time = dayTimes[chosenDays[0]] || Object.values(dayTimes)[0] || "";
    if (!chosenDays.length || !time) {
      Swal.fire({ title: "Pick days & time first", text: "Choose the class days and a time before searching for a teacher.", icon: "warning", background: swalBg() });
      return;
    }
    setTeacherSearching(true);
    try {
      const res = await fetchEnrollmentTeachers({
        courseId: enrollCourseId || undefined,
        gender: (lead as any).preferredTeacherGender || undefined,
        days: chosenDays,
        time,
        durationMinutes: isHourly ? hourlyDuration : planDuration,
      });
      setTeacherResults(res);
    } catch {
      setTeacherResults({ matching: [], others: [] });
    } finally {
      setTeacherSearching(false);
    }
  };

  const decide = async (selectedDecision: "ENROLL" | "REJECT" | "FOLLOW_UP") => {
    if ((selectedDecision === "REJECT" || selectedDecision === "FOLLOW_UP") && !notes.trim()) {
      Swal.fire({ title: "Required", text: "Notes are compulsory for this decision.", icon: "warning", background: swalBg() });
      return;
    }
    if (selectedDecision === "FOLLOW_UP" && !followUpAt) {
      Swal.fire({ title: "Required", text: "Please select a date and time for follow up.", icon: "warning", background: swalBg() });
      return;
    }

    if (selectedDecision === "ENROLL") {
      let warningText = "This creates the student account and raises the first invoice. Classes and the teacher's schedule are reserved once that invoice is paid.";
      if (!packageId) {
        if (familyPackageName) {
          warningText += ` No package selected — the family chosen package "${familyPackageName}" will be used.`;
        } else {
          warningText += " Warning: No package is selected, and the family did not choose any package. Enrolling will create the student but raise no invoice.";
        }
      }
      const ok = await Swal.fire({
        title: "Convert to student?",
        text: warningText,
        icon: "question", showCancelButton: true, confirmButtonText: "Yes, enrol", background: swalBg(),
      });
      if (!ok.isConfirmed) return;
    }
    setBusy(true);
    try {
      await leadCoachDecision(lead.id, {
        decision: selectedDecision,
        notes: notes || undefined,
        ...(selectedDecision === "ENROLL" && packageId ? { packageId } : {}),
        ...(selectedDecision === "ENROLL" && enrollDate ? { preferredStartDate: new Date(enrollDate).toISOString() } : {}),
        ...(selectedDecision === "ENROLL" && enrollTime ? { preferredTime: enrollTime } : {}),
        ...(selectedDecision === "ENROLL" && chosenDays?.length ? { preferredDays: chosenDays } : {}),
        ...(selectedDecision === "ENROLL" && currencyOverride ? { currencyOverride } : {}),
        ...(selectedDecision === "ENROLL" && isHourly ? { durationMinutes: hourlyDuration, weeklyClasses: hourlyWeekly } : {}),
        ...(selectedDecision === "ENROLL" && teacherId ? { teacherId } : {}),
        ...(selectedDecision === "FOLLOW_UP" && followUpAt ? { followUpAt: new Date(followUpAt).toISOString() } : {}),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: selectedDecision === "ENROLL" ? "Converted to student 🎉" : "Decision recorded", showConfirmButton: false, timer: 2200 });
      if (selectedDecision === "FOLLOW_UP") {
        setNotes("");
        setFollowUpAt("");
      }
      onChange();
      loadActivities();
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

        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Select Outcome</label>
        <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setDecision("ENROLL")}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-black transition cursor-pointer border ${
              decision === "ENROLL"
                ? "bg-emerald-600 border-emerald-600 text-white shadow-sm font-extrabold"
                : "bg-surface border-hairline text-ink-2 hover:bg-surface-2"
            }`}
          >
            <UserPlus className="size-4" /> Enrol as Student
          </button>
          <button
            type="button"
            onClick={() => setDecision("FOLLOW_UP")}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-black transition cursor-pointer border ${
              decision === "FOLLOW_UP"
                ? "bg-accent border-accent text-white shadow-sm font-extrabold"
                : "bg-surface border-hairline text-ink-2 hover:bg-surface-2"
            }`}
          >
            <CalendarClock className="size-4" /> Follow Up Later
          </button>
          <button
            type="button"
            onClick={() => setDecision("REJECT")}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-black transition cursor-pointer border ${
              decision === "REJECT"
                ? "bg-rose-600 border-rose-600 text-white shadow-sm font-extrabold"
                : "bg-surface border-hairline text-ink-2 hover:bg-surface-2"
            }`}
          >
            <XCircle className="size-4" /> Not Enrolling
          </button>
        </div>

        {decision === "ENROLL" && (
          <div className="mb-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Enroll Start Date</label>
                <input
                  type="date"
                  value={enrollDate}
                  onChange={(e) => setEnrollDate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Preferred Class Day &amp; Time</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {WEEKDAYS.map((d) => {
                    const on = chosenDays.includes(d);
                    const blocked = !on && dayCap != null && chosenDays.length >= dayCap;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={blocked}
                        onClick={() => handleDayToggle(d)}
                        className={`h-9 rounded-lg border px-3 text-[11.5px] font-bold transition ${
                          on
                            ? "border-accent bg-accent/10 text-accent cursor-pointer"
                            : blocked
                            ? "border-hairline bg-surface-2 text-ink-3/40 cursor-not-allowed"
                            : "border-hairline bg-surface text-ink-3 hover:bg-surface-2 cursor-pointer"
                        }`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                {dayCap != null && (
                  <p className="mb-1 text-[10.5px] font-semibold text-ink-3">
                    This plan allows {dayCap} class day{dayCap > 1 ? "s" : ""} a week — {chosenDays.length}/{dayCap} selected.
                  </p>
                )}
                {chosenDays.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 mt-2">
                    {chosenDays.map((day) => (
                      <div key={day} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink-3 w-10">{day.slice(0, 3)}:</span>
                        <input
                          type="time"
                          value={dayTimes[day] ?? ""}
                          onChange={(e) => {
                            const timeVal = e.target.value;
                            setDayTimes((prev) => ({ ...prev, [day]: timeVal }));
                          }}
                          className="h-9 w-full rounded-lg border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-accent cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Billing currency (auto from country, override if needed) and —
                for hourly plans — the class duration and weekly-class count the
                family chooses, which drive the tuition estimate below. */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Billing currency</label>
                <select
                  value={effectiveCurrency}
                  onChange={(e) => setCurrencyOverride(e.target.value as Currency)}
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                >
                  {(["USD", "AED", "GBP"] as Currency[]).map((c) => (
                    <option key={c} value={c}>
                      {c}{c === leadCurrency ? " (auto)" : ""}
                    </option>
                  ))}
                </select>
                {currencyOverride && currencyOverride !== leadCurrency && (
                  <button type="button" onClick={() => setCurrencyOverride(null)}
                    className="mt-1 text-[10.5px] font-semibold text-accent hover:underline">
                    Reset to auto ({leadCurrency})
                  </button>
                )}
              </div>
              {isHourly && (
                <>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Class duration</label>
                    <select
                      value={hourlyDuration}
                      onChange={(e) => setHourlyDuration(Number(e.target.value))}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Weekly classes</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={hourlyWeekly}
                      onChange={(e) => setHourlyWeekly(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Package to bill</label>
              <select value={packageId} onChange={(e) => setPackageId(e.target.value)}
                className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent">
                {familyPackageName ? (
                  <option value="">Use the package the family chose ({familyPackageName})</option>
                ) : (
                  <option value="">Select a package...</option>
                )}
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.classesPerMonth} classes/month
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-ink-3">
                The first invoice is raised from this, one per child, and goes out with the welcome
                email. With no package on record none is raised and the timeline says so.
              </p>

              {/* Plan summary + estimated monthly tuition, in the family's currency. */}
              {plan && (
                <div className="mt-3 rounded-xl border border-hairline bg-surface-2/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-black text-ink">
                      {isHourly ? "Hourly Subscription" : "Monthly Package"}
                      {plan.tier ? ` · ${plan.tier}` : ""}
                    </span>
                    <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-black text-emerald-600">
                      {money(estTuition, effectiveCurrency, { emptyText: "Not priced" })} / month
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-2 sm:grid-cols-4">
                    <span>Duration: <b>{planDuration} min</b></span>
                    <span>Weekly: <b>{planWeekly || "—"}×</b></span>
                    <span>Monthly hours: <b>{planMonthlyHours ? Math.round(planMonthlyHours) : "—"}</b></span>
                    {isHourly ? (
                      <span>Rate × hours × 4 wks</span>
                    ) : (
                      <span>Reschedules: <b>{plan.rescheduleLimit ?? 0}</b></span>
                    )}
                  </div>
                  {isHourly && (
                    <p className="mt-1.5 text-[10.5px] text-ink-3">
                      Tuition = rate × ({planDuration}÷60) × {planWeekly} × 4 weeks. Pick the days above to match {hourlyWeekly} weekly {hourlyWeekly === 1 ? "class" : "classes"}.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Teacher assignment — search for teachers free on the chosen recurring
                schedule; the coach may also assign a non-matching teacher. */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-3">Assign teacher</label>
                <button type="button" onClick={searchTeachers} disabled={teacherSearching}
                  className="text-[11px] font-bold text-accent hover:underline disabled:opacity-50">
                  {teacherSearching ? "Searching…" : "Find available teachers"}
                </button>
              </div>
              {teacherResults && (
                <div className="mt-2 space-y-2 rounded-xl border border-hairline bg-surface-2/40 p-3">
                  {teacherResults.matching.length === 0 && teacherResults.others.length === 0 && (
                    <p className="text-[11px] text-ink-3">No teachers found — check the days and time.</p>
                  )}
                  {teacherResults.matching.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Available for this schedule</p>
                      {teacherResults.matching.map((t) => (
                        <label key={t.teacherId} className="flex items-center gap-2 text-xs text-ink-2">
                          <input type="radio" name="enrollTeacher" checked={teacherId === t.teacherId} onChange={() => setTeacherId(t.teacherId)} />
                          {t.name}{t.gender ? ` · ${t.gender}` : ""}
                        </label>
                      ))}
                    </div>
                  )}
                  {teacherResults.others.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Other teachers (assign manually)</summary>
                      <div className="mt-1 space-y-1">
                        {teacherResults.others.map((t) => (
                          <label key={t.teacherId} className="flex items-center gap-2 text-xs text-ink-2">
                            <input type="radio" name="enrollTeacher" checked={teacherId === t.teacherId} onChange={() => setTeacherId(t.teacherId)} />
                            {t.name}{t.gender ? ` · ${t.gender}` : ""}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
              <p className="mt-1 text-[10.5px] text-ink-3">Leave unselected to keep the trial teacher.</p>
            </div>
          </div>
        )}

        {decision === "FOLLOW_UP" && (
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Date & Time for Follow Up</label>
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
            Decision notes {decision === "ENROLL" ? "(optional)" : "(compulsory)"}
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={decision === "ENROLL" ? "Summary of the decision (optional)…" : "Please explain the reason for this decision (compulsory)…"}
            className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
        </div>

        <button
          onClick={() => decide(decision)}
          disabled={busy || (decision === "FOLLOW_UP" && !followUpAt) || ((decision === "FOLLOW_UP" || decision === "REJECT") && !notes.trim())}
          className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer transition ${
            decision === "ENROLL"
              ? "bg-emerald-600"
              : decision === "FOLLOW_UP"
              ? "bg-accent"
              : "bg-rose-600"
          }`}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : decision === "ENROLL" ? (
            <UserPlus className="size-4" />
          ) : decision === "FOLLOW_UP" ? (
            <CalendarClock className="size-4" />
          ) : (
            <XCircle className="size-4" />
          )}
          {decision === "ENROLL" ? "Convert & Enrol as Student" : decision === "FOLLOW_UP" ? "Schedule Follow Up" : "Confirm Not Enrolling"}
        </button>

        {(() => {
          const followUps = activities.filter(
            (a) => a.type === "FOLLOW_UP_SCHEDULED" ||
                   (a.type === "COACH_DECISION" && a.message.toLowerCase().includes("follow up"))
          );
          if (followUps.length === 0) return null;
          return (
            <div className="mt-6 border-t border-hairline pt-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-3">Follow Up History</h4>
              <div className="space-y-3">
                {followUps.map((f) => (
                  <div key={f.id} className="rounded-xl border border-hairline bg-surface-2/40 p-3.5 text-xs animate-fade-in">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <span className="font-bold text-ink flex items-center gap-1.5">
                        <CalendarClock className="size-3.5 text-accent" />
                        {f.message.split(" — ")[0]}
                      </span>
                      <span className="text-[10px] text-ink-3">
                        Recorded by {f.actorName || "Coach"} on {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {f.message.includes(" — ") && (
                      <p className="text-ink-2 font-medium bg-surface border border-hairline/60 rounded-lg p-2.5 mt-1 whitespace-pre-wrap">
                        {f.message.split(" — ").slice(1).join(" — ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
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
