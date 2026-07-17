"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Loader2,
  ClipboardList,
  Users,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  ShieldCheck,
  ShieldAlert,
  Info,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Wallet,
  FileText,
  Paperclip,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  fetchTeacherRegistrations,
  fetchTeacherRegistrationStats,
  reviewTeacherRegistration,
  resolveTeacherDocSrc,
  type TeacherRegistration,
  type TeacherRegistrationStats,
  type TeacherRegistrationStatus,
} from "@/lib/api";

const STATUS_TABS = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "DEMO_CLASS",
  "APPROVAL",
  "TRAINING",
  "ACTIVATED",
  "NEEDS_INFO",
  "REJECTED",
] as const;

// The linear hiring pipeline. "Advance" moves an application to the next entry.
const PIPELINE: TeacherRegistrationStatus[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "DEMO_CLASS",
  "APPROVAL",
  "TRAINING",
  "ACTIVATED",
];

const statusTone: Record<TeacherRegistrationStatus, Tone> = {
  APPLIED: "neutral",
  SCREENING: "accent",
  INTERVIEW: "warning",
  DEMO_CLASS: "warning",
  APPROVAL: "warning",
  TRAINING: "accent",
  ACTIVATED: "good",
  REJECTED: "critical",
  NEEDS_INFO: "warning",
};

const statusLabel: Record<TeacherRegistrationStatus, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  DEMO_CLASS: "Demo Class",
  APPROVAL: "Approval",
  TRAINING: "Training",
  ACTIVATED: "Activated",
  REJECTED: "Rejected",
  NEEDS_INFO: "Needs Info",
};

const DOC_FIELDS: { key: keyof TeacherRegistration; label: string }[] = [
  { key: "resumeUrl", label: "Resume / CV" },
  { key: "degreeUrl", label: "Degree" },
  { key: "certificatesUrl", label: "Certificates" },
  { key: "govIdUrl", label: "Government ID" },
  { key: "photoUrl", label: "Photo" },
  { key: "experienceLetterUrl", label: "Experience Letter" },
  { key: "policeVerificationUrl", label: "Police Verification" },
];

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

// The stage an application would advance to (null once terminal / after training).
const nextStage = (s: TeacherRegistrationStatus): TeacherRegistrationStatus | null => {
  if (s === "NEEDS_INFO") return "SCREENING"; // resume the pipeline after info received
  const idx = PIPELINE.indexOf(s);
  if (idx === -1 || idx >= PIPELINE.length - 1) return null;
  return PIPELINE[idx + 1];
};

export default function TeacherRegistrationsPage() {
  const [items, setItems] = useState<TeacherRegistration[]>([]);
  const [stats, setStats] = useState<TeacherRegistrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("APPLIED");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TeacherRegistration | null>(null);

  const load = () => {
    setLoading(true);
    fetchTeacherRegistrations({ page: 1, limit: 100, status: statusFilter, search: search || undefined })
      .then((res) => setItems(res.items))
      .catch((err) => console.error("Failed to load teacher applications", err))
      .finally(() => setLoading(false));
    fetchTeacherRegistrationStats()
      .then(setStats)
      .catch(() => undefined);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [statusFilter]);

  const applyReview = async (
    reg: TeacherRegistration,
    dto: {
      status: Exclude<TeacherRegistrationStatus, "APPLIED">;
      notes?: string;
      interviewDate?: string;
      demoDate?: string;
    },
  ) => {
    setBusy(true);
    try {
      const updated = await reviewTeacherRegistration(reg.id, dto);
      setSelected(null);
      const sentTo = updated.notification?.to;
      if (dto.status === "ACTIVATED") {
        Swal.fire({
          title: "Activated!",
          html: `Teacher account created.<br/><b>Teacher ID:</b> ${updated.approvedTeacherCode}<br/>They can now sign in with their email & password.${sentTo ? `<br/><span style="color:#10b981;font-size:12px;">📧 Update sent to ${sentTo}</span>` : ""}`,
          icon: "success",
          confirmButtonColor: "#10b981",
          background: swalBg(),
        });
      } else {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: sentTo ? `Moved to ${statusLabel[dto.status]} · update sent` : `Moved to ${statusLabel[dto.status]}`,
          showConfirmButton: false,
          timer: 2500,
        });
      }
      load();
    } catch (err) {
      Swal.fire({ title: "Failed", text: err instanceof Error ? err.message : "Action failed.", icon: "error" });
    } finally {
      setBusy(false);
    }
  };

  const advance = async (reg: TeacherRegistration) => {
    const target = nextStage(reg.status);
    if (!target) return;

    // Activation creates the real account — confirm explicitly.
    if (target === "ACTIVATED") {
      const r = await Swal.fire({
        title: `Activate ${reg.firstName}?`,
        text: "A teacher account will be created and a Teacher ID generated. Login details will be emailed.",
        icon: "question",
        input: "textarea",
        inputPlaceholder: "Optional welcome note for the email…",
        showCancelButton: true,
        confirmButtonText: "Yes, Activate",
        confirmButtonColor: "#10b981",
        background: swalBg(),
      });
      if (!r.isConfirmed) return;
      return applyReview(reg, { status: "ACTIVATED", notes: r.value || undefined });
    }

    // Interview / Demo let the admin schedule a date; other stages just advance.
    if (target === "INTERVIEW" || target === "DEMO_CLASS") {
      const r = await Swal.fire({
        title: `Move to ${statusLabel[target]}`,
        input: "text",
        inputLabel: `${target === "INTERVIEW" ? "Interview" : "Demo class"} date & time (optional)`,
        inputPlaceholder: "e.g. 2026-07-25 17:00",
        showCancelButton: true,
        confirmButtonText: "Advance",
        confirmButtonColor: "#386FA4",
        background: swalBg(),
      });
      if (!r.isConfirmed) return;
      const raw = (r.value || "").trim();
      const iso = raw && !isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : undefined;
      return applyReview(reg, {
        status: target,
        ...(target === "INTERVIEW" ? { interviewDate: iso } : { demoDate: iso }),
      });
    }

    const r = await Swal.fire({
      title: `Move to ${statusLabel[target]}?`,
      input: "textarea",
      inputPlaceholder: "Optional note (emailed to the applicant)…",
      showCancelButton: true,
      confirmButtonText: "Advance",
      confirmButtonColor: "#386FA4",
      background: swalBg(),
    });
    if (!r.isConfirmed) return;
    // nextStage() never returns "APPLIED" (pipeline index 0), so this is safe.
    return applyReview(reg, {
      status: target as Exclude<typeof target, "APPLIED">,
      notes: r.value || undefined,
    });
  };

  const reject = async (reg: TeacherRegistration, mode: "REJECTED" | "NEEDS_INFO") => {
    const r = await Swal.fire({
      title: mode === "REJECTED" ? `Reject ${reg.firstName}?` : "Request more information",
      input: "textarea",
      inputPlaceholder:
        mode === "REJECTED" ? "Reason for rejection (emailed to applicant)…" : "What information is needed?…",
      inputValidator: (v) => (!v ? "Please add a note — it will be emailed to the applicant." : undefined),
      showCancelButton: true,
      confirmButtonText: mode === "REJECTED" ? "Reject" : "Send Request",
      confirmButtonColor: mode === "REJECTED" ? "#f85a6b" : "#386FA4",
      background: swalBg(),
    });
    if (!r.isConfirmed) return;
    return applyReview(reg, { status: mode, notes: r.value });
  };

  const kpis = [
    { label: "Total", value: stats?.total ?? 0, icon: ClipboardList, color: "text-ink-2 bg-surface-3" },
    { label: "In Pipeline", value: stats?.inPipeline ?? 0, icon: Users, color: "text-blue-500 bg-blue-500/10" },
    { label: "Interview", value: stats?.interview ?? 0, icon: CalendarClock, color: "text-amber-500 bg-amber-500/10" },
    { label: "Activated", value: stats?.activated ?? 0, icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Rejected", value: stats?.rejected ?? 0, icon: XCircle, color: "text-rose-500 bg-rose-500/10" },
  ];

  const terminal = (s: TeacherRegistrationStatus) => s === "ACTIVATED" || s === "REJECTED";

  return (
    <>
      <Topbar title="Teacher Applications" subtitle="Review teacher applications and move them through the hiring pipeline" />

      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {kpis.map((k) => (
            <Card key={k.label} className="border border-hairline bg-surface shadow-sm">
              <CardBody className="flex items-center gap-3 p-4">
                <span className={`grid size-10 place-items-center rounded-xl ${k.color}`}>
                  <k.icon className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-black text-ink leading-none">{k.value}</p>
                  <p className="text-[11px] font-semibold text-ink-3 mt-1">{k.label}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-full sm:w-fit overflow-x-auto">
            {STATUS_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setStatusFilter(t)}
                className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === t ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {statusLabel[t as TeacherRegistrationStatus]}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="relative max-w-xs w-full"
          >
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, teacher ID…"
              className="h-10 w-full rounded-xl border border-hairline bg-surface pl-9 pr-3 text-xs text-ink focus:outline-none focus:border-accent"
            />
          </form>
        </div>

        {/* Table */}
        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto min-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm font-bold text-ink-3">
                <Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading applications…
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-ink-3">
                <ClipboardList className="size-8 text-ink-3/40" />
                <p className="text-sm font-bold">No applications found.</p>
                <p className="text-xs">New teacher applications will appear here for review.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                    <th className="px-6 py-4">Applicant</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Subjects</th>
                    <th className="px-6 py-4">Exp.</th>
                    <th className="px-6 py-4">Stage</th>
                    <th className="px-6 py-4">Applied</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {items.map((r) => {
                    const target = nextStage(r.status);
                    return (
                      <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-ink">
                            {r.firstName} {r.lastName}
                          </p>
                          <p className="text-[10px] text-ink-3">
                            {r.approvedTeacherCode || (r.teachingMode ? r.teachingMode.toLowerCase() : "—")}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-ink-2">{r.email}</td>
                        <td className="px-6 py-4 text-xs text-ink-2 max-w-[180px] truncate">{r.subjects || "—"}</td>
                        <td className="px-6 py-4 text-xs text-ink-3">{r.experienceYears ? `${r.experienceYears} yr` : "—"}</td>
                        <td className="px-6 py-4">
                          <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-3">
                          {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelected(r)}
                              className="size-8 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3"
                              title="View details"
                            >
                              <Eye className="size-4.5" />
                            </Button>
                            {target && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => advance(r)}
                                className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-accent hover:bg-accent/10"
                                title={`Advance to ${statusLabel[target]}`}
                              >
                                {target === "ACTIVATED" ? "Activate" : statusLabel[target]}
                                <ChevronRight className="ml-0.5 size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={() => setSelected(null)} />
          <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-hairline bg-surface shadow-2xl animate-slide-left">
            <div className="flex items-center justify-between border-b border-hairline bg-surface-2/30 px-6 py-4">
              <div>
                <h3 className="text-sm font-bold text-ink">
                  {selected.firstName} {selected.middleName || ""} {selected.lastName}
                </h3>
                <p className="mt-0.5 text-[10px] text-ink-3">
                  Applied {new Date(selected.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
              >
                <X className="size-4.5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <div className="flex items-center justify-between">
                <Badge tone={statusTone[selected.status]}>{statusLabel[selected.status]}</Badge>
                {selected.approvedTeacherCode && (
                  <div className="text-right text-[11px] font-bold text-ink-2">
                    <span className="text-ink-3 font-medium">Teacher ID </span>
                    {selected.approvedTeacherCode}
                  </div>
                )}
              </div>

              {/* Pipeline progress */}
              <div className="flex flex-wrap items-center gap-1.5">
                {PIPELINE.map((stage) => {
                  const done = PIPELINE.indexOf(selected.status) >= PIPELINE.indexOf(stage) && !terminal(stage);
                  const isCurrent = selected.status === stage;
                  const rejected = selected.status === "REJECTED";
                  return (
                    <span
                      key={stage}
                      className={`rounded-md px-2 py-1 text-[10px] font-bold ${
                        rejected
                          ? "bg-surface-3 text-ink-3"
                          : isCurrent
                            ? "bg-accent text-white"
                            : done || PIPELINE.indexOf(selected.status) > PIPELINE.indexOf(stage)
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-surface-3 text-ink-3"
                      }`}
                    >
                      {statusLabel[stage]}
                    </span>
                  );
                })}
              </div>

              <Section title="Contact" icon={Mail}>
                <Row label="Email" value={selected.email} />
                <Row label="Mobile" value={selected.mobile} />
                <Row label="WhatsApp" value={selected.whatsappNumber} />
              </Section>

              <Section title="Personal" icon={MapPin}>
                <Row label="Gender" value={selected.gender} />
                <Row label="Date of Birth" value={selected.dateOfBirth ? new Date(selected.dateOfBirth).toLocaleDateString() : null} />
                <Row label="Nationality" value={selected.nationality} />
                <Row label="Country" value={selected.country} />
                <Row label="State" value={selected.state} />
                <Row label="City" value={selected.city} />
                <Row label="Address" value={selected.address} />
              </Section>

              <Section title="Professional" icon={Briefcase}>
                <Row label="Qualification" value={selected.highestQualification} />
                <Row label="University" value={selected.university} />
                <Row label="Passing Year" value={selected.passingYear} />
                <Row label="Experience" value={selected.experienceYears ? `${selected.experienceYears} yr` : null} />
                <Row label="Current Employer" value={selected.currentEmployer} />
                <Row label="Expected Salary" value={selected.expectedSalary} />
                <Row label="Subjects" value={selected.subjects} />
                <Row label="Languages" value={selected.languages} />
                <Row label="Teaching Mode" value={selected.teachingMode} />
              </Section>

              <Section title="Availability & Skills" icon={CalendarClock}>
                <Row label="Days" value={selected.availabilityDays?.join(", ") || null} />
                <Row label="Slots" value={selected.availabilitySlots?.join(", ") || null} />
                <Row label="Technical Skills" value={selected.technicalSkills?.join(", ") || null} />
              </Section>

              <Section title="Bank" icon={Wallet}>
                <Row label="Account #" value={selected.accountNumber} />
                <Row label="IFSC / SWIFT" value={selected.ifsc} />
                <Row label="Bank" value={selected.bankName} />
                <Row label="UPI" value={selected.upi} />
                <Row label="Tax #" value={selected.taxNumber} />
              </Section>

              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <FileText className="size-3.5 text-accent" />
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Documents</h4>
                </div>
                <div className="space-y-1.5">
                  {DOC_FIELDS.filter((d) => selected[d.key]).length === 0 ? (
                    <p className="text-xs text-ink-3">No documents uploaded.</p>
                  ) : (
                    DOC_FIELDS.filter((d) => selected[d.key]).map((d) => (
                      <DocLink key={d.key} label={d.label} refValue={selected[d.key] as string} />
                    ))
                  )}
                </div>
              </div>

              {(selected.interviewDate || selected.demoDate) && (
                <Section title="Schedule" icon={CalendarClock}>
                  <Row label="Interview" value={selected.interviewDate ? new Date(selected.interviewDate).toLocaleString() : null} />
                  <Row label="Demo Class" value={selected.demoDate ? new Date(selected.demoDate).toLocaleString() : null} />
                </Section>
              )}

              {selected.reviewNotes && (
                <div className="rounded-xl border border-hairline bg-surface-2 p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Latest Note</p>
                  <p className="mt-1 text-xs italic text-ink-2">{selected.reviewNotes}</p>
                </div>
              )}
            </div>

            {!terminal(selected.status) && (
              <div className="flex gap-2 border-t border-hairline p-4">
                <Button
                  onClick={() => reject(selected, "REJECTED")}
                  disabled={busy}
                  className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-critical hover:bg-critical/5"
                >
                  <ShieldAlert className="mr-1 size-4" /> Reject
                </Button>
                <Button
                  onClick={() => reject(selected, "NEEDS_INFO")}
                  disabled={busy}
                  className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 hover:bg-surface-2"
                >
                  <Info className="mr-1 size-4" /> Need Info
                </Button>
                {nextStage(selected.status) && (
                  <Button
                    onClick={() => advance(selected)}
                    disabled={busy}
                    className="h-10 flex-1 rounded-xl bg-accent text-xs font-bold text-white hover:opacity-90"
                  >
                    <ShieldCheck className="mr-1 size-4" />
                    {nextStage(selected.status) === "ACTIVATED" ? "Activate" : `→ ${statusLabel[nextStage(selected.status)!]}`}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5 text-accent" />
        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{title}</h4>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline/50 pb-1.5 text-xs last:border-0">
      <span className="text-ink-3 font-medium shrink-0">{label}</span>
      <span className="text-ink-2 font-semibold text-right break-words">{value}</span>
    </div>
  );
}

function DocLink({ label, refValue }: { label: string; refValue: string }) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const url = await resolveTeacherDocSrc(refValue);
      if (url) window.open(url, "_blank", "noopener");
    } catch {
      Swal.fire({ title: "Could not open", text: "The document could not be loaded.", icon: "error" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-left hover:border-accent/40"
    >
      <span className="flex items-center gap-2 text-xs font-bold text-ink">
        <Paperclip className="size-3.5 text-accent" /> {label}
      </span>
      {loading ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <Eye className="size-3.5 text-ink-3" />}
    </button>
  );
}
