"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Loader2,
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Eye,
  X,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Mail,
  Phone,
  MapPin,
  BookOpen,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  fetchRegistrations,
  fetchRegistrationStats,
  reviewRegistration,
  type StudentRegistration,
  type RegistrationStats,
  type RegistrationStatus,
} from "@/lib/api";

const STATUS_TABS = ["All", "PENDING", "NEEDS_INFO", "APPROVED", "REJECTED"] as const;

const statusTone: Record<RegistrationStatus, Tone> = {
  PENDING: "warning",
  NEEDS_INFO: "accent",
  APPROVED: "good",
  REJECTED: "critical",
};

const statusLabel: Record<RegistrationStatus, string> = {
  PENDING: "Pending",
  NEEDS_INFO: "Needs Info",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export default function RegistrationsPage() {
  const [items, setItems] = useState<StudentRegistration[]>([]);
  const [stats, setStats] = useState<RegistrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StudentRegistration | null>(null);

  const load = () => {
    setLoading(true);
    fetchRegistrations({ page: 1, limit: 100, status: statusFilter, search: search || undefined })
      .then((res) => setItems(res.items))
      .catch((err) => console.error("Failed to load registrations", err))
      .finally(() => setLoading(false));
    fetchRegistrationStats()
      .then(setStats)
      .catch(() => undefined);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [statusFilter]);

  const doReview = async (
    reg: StudentRegistration,
    status: "APPROVED" | "REJECTED" | "NEEDS_INFO",
  ) => {
    let notes: string | undefined;

    if (status === "APPROVED") {
      const r = await Swal.fire({
        title: `Approve ${reg.firstName}?`,
        text: "A student account will be created and login details emailed with generated Student ID, Admission & Roll numbers.",
        icon: "question",
        input: "textarea",
        inputPlaceholder: "Optional welcome note for the email…",
        showCancelButton: true,
        confirmButtonText: "Yes, Approve",
        confirmButtonColor: "#10b981",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
      if (!r.isConfirmed) return;
      notes = r.value || undefined;
    } else {
      const r = await Swal.fire({
        title: status === "REJECTED" ? `Reject ${reg.firstName}?` : "Request more information",
        input: "textarea",
        inputPlaceholder:
          status === "REJECTED" ? "Reason for rejection (emailed to applicant)…" : "What information is needed?…",
        inputValidator: (v) => (!v ? "Please add a note — it will be emailed to the applicant." : undefined),
        showCancelButton: true,
        confirmButtonText: status === "REJECTED" ? "Reject" : "Send Request",
        confirmButtonColor: status === "REJECTED" ? "#f85a6b" : "#386FA4",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
      if (!r.isConfirmed) return;
      notes = r.value;
    }

    setBusy(true);
    try {
      const updated = await reviewRegistration(reg.id, { status, notes });
      setSelected(null);
      if (status === "APPROVED") {
        Swal.fire({
          title: "Approved!",
          html: `Student account created.<br/><b>ID:</b> ${updated.approvedStudentCode}<br/><b>Admission:</b> ${updated.admissionNumber}<br/><b>Roll:</b> ${updated.rollNumber}`,
          icon: "success",
          confirmButtonColor: "#10b981",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      } else {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: status === "REJECTED" ? "Application rejected" : "Information requested",
          showConfirmButton: false,
          timer: 2000,
        });
      }
      load();
    } catch (err) {
      Swal.fire({ title: "Failed", text: err instanceof Error ? err.message : "Action failed.", icon: "error" });
    } finally {
      setBusy(false);
    }
  };

  const kpis = [
    { label: "Total", value: stats?.total ?? 0, icon: ClipboardList, color: "text-ink-2 bg-surface-3" },
    { label: "Pending", value: stats?.pending ?? 0, icon: Clock, color: "text-amber-500 bg-amber-500/10" },
    { label: "Needs Info", value: stats?.needsInfo ?? 0, icon: HelpCircle, color: "text-blue-500 bg-blue-500/10" },
    { label: "Approved", value: stats?.approved ?? 0, icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Rejected", value: stats?.rejected ?? 0, icon: XCircle, color: "text-rose-500 bg-rose-500/10" },
  ];

  return (
    <>
      <Topbar title="Admissions" subtitle="Review public student registration applications and approve admissions" />

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
          <div className="flex gap-1.5 rounded-xl border border-hairline bg-surface-2 p-1 w-fit overflow-x-auto">
            {STATUS_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setStatusFilter(t)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === t ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {t === "All" ? "All" : statusLabel[t as RegistrationStatus]}
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
              placeholder="Search name, email, admission #…"
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
                <p className="text-xs">New public registrations will appear here for review.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                    <th className="px-6 py-4">Applicant</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Course</th>
                    <th className="px-6 py-4">Mode</th>
                    <th className="px-6 py-4">Submitted</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-ink">
                          {r.firstName} {r.lastName}
                        </p>
                        <p className="text-[10px] text-ink-3 uppercase tracking-wider">{r.registrantType}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-ink-2">{r.studentEmail}</td>
                      <td className="px-6 py-4 text-xs text-ink-2">{r.courseTitle || "—"}</td>
                      <td className="px-6 py-4 text-[11px] font-semibold text-ink-3 capitalize">
                        {r.learningMode ? r.learningMode.toLowerCase() : "—"}
                      </td>
                      <td className="px-6 py-4 text-xs text-ink-3">
                        {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4">
                        <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
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
                          {r.status !== "APPROVED" && r.status !== "REJECTED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => doReview(r, "APPROVED")}
                              className="size-8 rounded-lg text-ink-3 hover:text-emerald-500 hover:bg-surface-3"
                              title="Approve"
                            >
                              <ShieldCheck className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
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
                  {selected.registrantType} · applied{" "}
                  {new Date(selected.createdAt).toLocaleDateString()}
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
                {selected.approvedStudentCode && (
                  <div className="text-right text-[11px] font-bold text-ink-2">
                    <span className="text-ink-3 font-medium">ID </span>{selected.approvedStudentCode} ·{" "}
                    <span className="text-ink-3 font-medium">Adm </span>{selected.admissionNumber} ·{" "}
                    <span className="text-ink-3 font-medium">Roll </span>{selected.rollNumber}
                  </div>
                )}
              </div>

              <Section title="Contact" icon={Mail}>
                <Row label="Student Email" value={selected.studentEmail} />
                <Row label="Student Mobile" value={selected.studentMobile} />
                <Row label="Parent Email" value={selected.parentEmail} />
                <Row label="Parent Mobile" value={selected.parentMobile} />
                <Row label="Emergency" value={selected.emergencyContact} />
                <Row label="WhatsApp" value={selected.whatsappNumber} />
              </Section>

              <Section title="Basic" icon={MapPin}>
                <Row label="Gender" value={selected.gender} />
                <Row label="Date of Birth" value={selected.dateOfBirth ? new Date(selected.dateOfBirth).toLocaleDateString() : null} />
                <Row label="Nationality" value={selected.nationality} />
                <Row label="Country" value={selected.country} />
                <Row label="State" value={selected.state} />
                <Row label="City" value={selected.city} />
                <Row label="Address" value={selected.address} />
              </Section>

              <Section title="Education" icon={BookOpen}>
                <Row label="School" value={selected.currentSchool} />
                <Row label="Board" value={selected.board} />
                <Row label="Class" value={selected.className} />
                <Row label="Grade" value={selected.grade} />
                <Row label="Subjects" value={selected.subjects} />
                <Row label="Language" value={selected.language} />
              </Section>

              <Section title="Course" icon={BookOpen}>
                <Row label="Course" value={selected.courseTitle || selected.courseCode} />
                <Row label="Batch" value={selected.batch} />
                <Row label="Timing" value={selected.preferredTiming} />
                <Row label="Mode" value={selected.learningMode} />
              </Section>

              <Section title="Guardian" icon={Phone}>
                <Row label="Father" value={selected.fatherName} />
                <Row label="Mother" value={selected.motherName} />
                <Row label="Occupation" value={selected.occupation} />
                <Row label="Relation" value={selected.guardianRelation} />
                <Row label="Guardian Email" value={selected.guardianEmail} />
                <Row label="Guardian Phone" value={selected.guardianPhone} />
                <Row label="Guardian Address" value={selected.guardianAddress} />
              </Section>

              {selected.reviewNotes && (
                <div className="rounded-xl border border-hairline bg-surface-2 p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Review Note</p>
                  <p className="mt-1 text-xs italic text-ink-2">{selected.reviewNotes}</p>
                </div>
              )}
            </div>

            {selected.status !== "APPROVED" && (
              <div className="flex gap-2 border-t border-hairline p-4">
                {selected.status !== "REJECTED" && (
                  <Button
                    onClick={() => doReview(selected, "REJECTED")}
                    disabled={busy}
                    className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-critical hover:bg-critical/5"
                  >
                    <ShieldAlert className="mr-1 size-4" /> Reject
                  </Button>
                )}
                <Button
                  onClick={() => doReview(selected, "NEEDS_INFO")}
                  disabled={busy}
                  className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 hover:bg-surface-2"
                >
                  <Info className="mr-1 size-4" /> Need Info
                </Button>
                <Button
                  onClick={() => doReview(selected, "APPROVED")}
                  disabled={busy}
                  className="h-10 flex-1 rounded-xl bg-emerald-500 text-xs font-bold text-white hover:bg-emerald-600"
                >
                  <ShieldCheck className="mr-1 size-4" /> Approve
                </Button>
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
