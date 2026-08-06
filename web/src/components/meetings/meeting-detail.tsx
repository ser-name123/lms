"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  ArrowLeft, CalendarClock, CheckCircle2, ExternalLink, FileText, History, Link2, ListChecks,
  Loader2, LogIn, LogOut, Paperclip, Pencil, Play, Plus, Save, Send, Square, Trash2, Undo2,
  Upload, Users, X,
} from "lucide-react";

import { useAuth } from "@/store/auth";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichHtml } from "@/components/assignments/rich-text";
import { MeetingForm } from "./meeting-form";
import {
  ACTION_LABEL, ActionStatusBadge, AttendanceBadge, MEETING_TYPE_LABELS, MeetingStatusBadge,
  MinutesBadge, PriorityBadge, fmtDateTime, fmtDay, fmtDuration, relativeWhen, toLocalInput,
} from "./shared";
import {
  addMeetingActionItem, addMeetingAttachment, cancelMeeting, deleteMeetingActionItem,
  deleteMeetingAttachment, endMeeting, fetchMeeting, fetchMeetingAudit, joinMeeting, leaveMeeting,
  markMeetingAttendance, publishMeetingMinutes, reopenMeetingMinutes, rescheduleMeeting,
  resolveFileUrl, saveMeetingMinutes, startMeeting, updateMeetingActionItem, uploadMeetingAttachment,
  type MeetingActionItem, type MeetingAttendanceStatus, type MeetingAuditRow, type MeetingRecord,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Action failed",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });
const ok = (title: string, text?: string) =>
  Swal.fire({ title, text, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });

/*
 * SweetAlert dialogs are built as raw HTML strings, so any value interpolated
 * into an attribute has to be escaped — an action item titled `" onerror="…`
 * would otherwise break out of the attribute it sits in.
 */
const escapeAttr = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const input =
  "h-9 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const textarea =
  "w-full rounded-xl border border-hairline bg-surface p-3 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3";

type Tab = "overview" | "attendance" | "minutes" | "actions" | "files" | "audit";

/*
 * One meeting, rendered for whichever panel is asking.
 *
 * Deliberately shared across admin, teacher and student rather than copied
 * three times: it is the same row with the same rules, and the server already
 * tells us what this caller may do via `canManage` / `canJoin`. Three copies
 * would drift, and the one that drifted would be the student's — the panel
 * nobody demos.
 *
 * `backHref` is the only thing the panels differ on, because each shell has its
 * own list route.
 */
export function MeetingDetail({ id, backHref }: { id: string; backHref: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [m, setM] = useState<MeetingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchMeeting(id)
      .then(setM)
      .catch(() => setM(null))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => load(), [load]);

  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await fn();
      load();
      if (message) await ok(message);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
        <Loader2 className="size-4 animate-spin text-accent" /> Loading…
      </div>
    );
  }
  if (!m) {
    return (
      <div className="p-8">
        <Card className="border border-hairline bg-surface">
          <CardBody className="p-10 text-center">
            <CalendarClock className="mx-auto size-8 text-ink-3" />
            <p className="mt-3 text-sm font-bold text-ink">Meeting not found</p>
            <p className="mt-1 text-xs text-ink-3">It may have been deleted, or you are not a participant.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push(backHref)}>
              <ArrowLeft className="size-3.5" /> Back
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const when = relativeWhen(m.startsAt, m.endsAt, m.status);
  const TABS: { key: Tab; label: string; icon: typeof Users; show: boolean }[] = [
    { key: "overview", label: "Overview", icon: CalendarClock, show: true },
    { key: "attendance", label: `Attendance (${m.participants.length})`, icon: Users, show: true },
    { key: "minutes", label: "Minutes", icon: FileText, show: m.canManage || m.minutesStatus === "PUBLISHED" },
    { key: "actions", label: `Action items (${m.actionItems.length})`, icon: ListChecks, show: true },
    { key: "files", label: `Files (${m.attachments.length})`, icon: Paperclip, show: true },
    // "All meeting actions shall be recorded in the audit log" — recorded is
    // only half of it; somebody has to be able to read it. Gated on canManage
    // because that is exactly who the API lets through: staff or the organiser.
    { key: "audit", label: "History", icon: History, show: m.canManage },
  ];

  return (
    <div className="animate-fade-up space-y-5 p-4 lg:p-6">
      {/* ── Header ── */}
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                onClick={() => router.push(backHref)}
                className="mb-2 flex items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink"
              >
                <ArrowLeft className="size-3.5" /> All meetings
              </button>
              <h1 className="text-lg font-black text-ink">{m.title}</h1>
              <p className="mt-1 text-xs text-ink-3">
                {MEETING_TYPE_LABELS[m.type] ?? m.type} · {fmtDateTime(m.startsAt)} · {fmtDuration(m.durationMins)}
                {m.organizerName ? ` · organised by ${m.organizerName}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MeetingStatusBadge status={m.status} />
                <Badge tone={when.tone}>{when.label}</Badge>
                <MinutesBadge status={m.minutesStatus} />
                {m.series ? <Badge tone="neutral">Recurring · every {m.series.intervalWeeks} week(s)</Badge> : null}
                {m.myStatus ? <AttendanceBadge status={m.myStatus} /> : null}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {m.canJoin && m.meetingLink ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const res = await joinMeeting(m.id);
                      // The join is recorded first, then the room opens — a
                      // popup blocker must not cost the attendance record.
                      if (res.meetingLink) window.open(res.meetingLink, "_blank", "noopener,noreferrer");
                      load();
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  <LogIn className="size-3.5" /> Join meeting
                </Button>
              ) : null}
              {m.canJoin && m.myStatus && m.myStatus !== "INVITED" ? (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => leaveMeeting(m.id), "Marked as left")}>
                  <LogOut className="size-3.5" /> Leave
                </Button>
              ) : null}

              {m.canManage && m.status === "SCHEDULED" ? (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => startMeeting(m.id), "Meeting started")}>
                  <Play className="size-3.5" /> Start
                </Button>
              ) : null}
              {m.canManage && (m.status === "LIVE" || m.status === "SCHEDULED") ? (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => endMeeting(m.id), "Meeting completed")}>
                  <Square className="size-3.5" /> Complete
                </Button>
              ) : null}
              {m.canManage && m.status !== "CANCELLED" && m.status !== "COMPLETED" ? (
                <>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => doReschedule(m, act)}>
                    <CalendarClock className="size-3.5" /> Reschedule
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => doCancel(m, act)}>
                    <X className="size-3.5" /> Cancel
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {m.status === "CANCELLED" ? (
            <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
              Cancelled{m.cancelledByName ? ` by ${m.cancelledByName}` : ""}
              {m.cancelReason ? ` — ${m.cancelReason}` : "."}
            </p>
          ) : null}
          {m.rescheduledFrom ? (
            <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              Moved from {fmtDateTime(m.rescheduledFrom)}
              {m.rescheduleNote ? ` — ${m.rescheduleNote}` : "."}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* ── Tabs ── */}
      <div className="flex flex-wrap gap-2">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
              tab === t.key ? "bg-accent text-accent-ink" : "border border-hairline bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <Overview m={m} /> : null}
      {tab === "attendance" ? <Attendance m={m} act={act} busy={busy} /> : null}
      {tab === "minutes" ? <Minutes m={m} act={act} busy={busy} /> : null}
      {tab === "actions" ? <Actions m={m} act={act} busy={busy} /> : null}
      {tab === "files" ? <Files m={m} act={act} busy={busy} /> : null}
      {tab === "audit" ? <AuditTrail id={m.id} /> : null}

      {editing ? (
        <MeetingForm
          role={user?.role ?? "TEACHER"}
          meeting={m}
          onClose={() => setEditing(false)}
          onSaved={() => load()}
        />
      ) : null}
    </div>
  );
}

// ── Reschedule / cancel prompts ─────────────────────────────────────────────

async function doReschedule(m: MeetingRecord, act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>) {
  const r = await Swal.fire({
    title: "Reschedule meeting",
    html:
      `<input id="sw-when" type="datetime-local" class="swal2-input" value="${toLocalInput(m.startsAt)}">` +
      `<input id="sw-dur" type="number" min="5" max="600" class="swal2-input" placeholder="Duration (minutes)" value="${m.durationMins}">` +
      `<input id="sw-note" class="swal2-input" placeholder="Reason (optional)">`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Reschedule and notify",
    background: swalBg(),
    confirmButtonColor: "#10b981",
    preConfirm: () => {
      const when = (document.getElementById("sw-when") as HTMLInputElement)?.value;
      if (!when) {
        Swal.showValidationMessage("Pick a new date and time");
        return false;
      }
      return {
        startsAt: new Date(when).toISOString(),
        durationMins: Number((document.getElementById("sw-dur") as HTMLInputElement)?.value) || m.durationMins,
        note: (document.getElementById("sw-note") as HTMLInputElement)?.value || undefined,
      };
    },
  });
  if (!r.isConfirmed || !r.value) return;
  await act(() => rescheduleMeeting(m.id, r.value as never), "Rescheduled — everyone has been notified");
}

async function doCancel(m: MeetingRecord, act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>) {
  const r = await Swal.fire({
    title: "Cancel this meeting?",
    text: "Every participant will be notified.",
    input: "text",
    inputPlaceholder: "Reason (optional)",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Cancel meeting",
    background: swalBg(),
    confirmButtonColor: "#ef4444",
  });
  if (!r.isConfirmed) return;
  await act(() => cancelMeeting(m.id, String(r.value ?? "").trim() || undefined), "Meeting cancelled");
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function Overview({ m }: { m: MeetingRecord }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="border border-hairline bg-surface lg:col-span-2">
        <CardBody className="p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Agenda</p>
          {m.description?.trim() ? (
            <RichHtml html={m.description} className="mt-2 text-sm text-ink-2" />
          ) : (
            <p className="mt-2 text-xs text-ink-3">No agenda was written for this meeting.</p>
          )}
        </CardBody>
      </Card>

      <Card className="border border-hairline bg-surface">
        <CardBody className="space-y-3 p-5 text-xs">
          <Row k="Starts" v={fmtDateTime(m.startsAt)} />
          <Row k="Ends" v={fmtDateTime(m.endsAt)} />
          <Row k="Duration" v={fmtDuration(m.durationMins)} />
          <Row k="Platform" v={m.platform} />
          {m.meetingLink ? (
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Link</p>
              <a
                href={m.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1.5 break-all text-[11px] font-semibold text-accent hover:underline"
              >
                <Link2 className="size-3 shrink-0" /> {m.meetingLink}
              </a>
            </div>
          ) : (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              No meeting link yet — the organiser can add one.
            </p>
          )}
          {m.startedAt ? <Row k="Started" v={fmtDateTime(m.startedAt)} /> : null}
          {m.endedAt ? <Row k="Ended" v={fmtDateTime(m.endedAt)} /> : null}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{k}</p>
      <p className="mt-0.5 text-xs font-semibold text-ink-2">{v}</p>
    </div>
  );
}

function Attendance({
  m, act, busy,
}: { m: MeetingRecord; act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>; busy: boolean }) {
  const mark = async (userId: string, name: string) => {
    const r = await Swal.fire({
      title: `Attendance for ${name}`,
      input: "select",
      inputOptions: { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", EXCUSED: "Excused" },
      inputPlaceholder: "Pick a status",
      showCancelButton: true,
      background: swalBg(),
      confirmButtonColor: "#10b981",
      html: `<input id="sw-reason" class="swal2-input" placeholder="Reason (excused only)">`,
      preConfirm: (status: string) => {
        if (!status) {
          Swal.showValidationMessage("Pick a status");
          return false;
        }
        return { status, reason: (document.getElementById("sw-reason") as HTMLInputElement)?.value || undefined };
      },
    });
    if (!r.isConfirmed || !r.value) return;
    const v = r.value as { status: MeetingAttendanceStatus; reason?: string };
    await act(() => markMeetingAttendance(m.id, { userId, status: v.status, reason: v.reason }), "Attendance updated");
  };

  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-hairline bg-surface-2/40">
              <tr>
                {["Participant", "Role", "Status", "Joined", "Left", "Time in", ""].map((h) => (
                  <th key={h} className="px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.participants.map((p) => (
                <tr key={p.id} className="border-b border-hairline/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-bold text-ink">
                      {p.name}
                      {p.isOrganizer ? <span className="ml-1.5 text-[10px] font-extrabold text-accent">ORGANISER</span> : null}
                      {p.isOptional ? <span className="ml-1.5 text-[10px] text-ink-3">optional</span> : null}
                    </p>
                    <p className="text-[10px] text-ink-3">{p.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-ink-3">{p.role}</td>
                  <td className="px-4 py-2.5">
                    <AttendanceBadge status={p.status} />
                    {p.excuseReason ? <p className="mt-0.5 text-[10px] text-ink-3">{p.excuseReason}</p> : null}
                    {p.markedByName ? <p className="mt-0.5 text-[10px] text-ink-3">set by {p.markedByName}</p> : null}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-ink-3">
                    {p.joinedAt ? fmtDateTime(p.joinedAt) : "—"}
                    {p.lateMinutes > 0 ? (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">+{p.lateMinutes}m</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-ink-3">{p.leftAt ? fmtDateTime(p.leftAt) : "—"}</td>
                  <td className="px-4 py-2.5 text-[11px] font-semibold text-ink-2">
                    {p.durationMins ? fmtDuration(p.durationMins) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {m.canManage ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => mark(p.userId, p.name)}>
                        Set
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function Minutes({
  m, act, busy,
}: { m: MeetingRecord; act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>; busy: boolean }) {
  const [summary, setSummary] = useState(m.minutes?.summary ?? "");
  const [discussion, setDiscussion] = useState(m.minutes?.discussionPoints ?? "");
  const [decisions, setDecisions] = useState(m.minutes?.decisions ?? "");
  const [remarks, setRemarks] = useState(m.minutes?.remarks ?? "");

  const locked = m.minutesStatus === "PUBLISHED" || !m.canManage;

  if (locked) {
    return (
      <Card className="border border-hairline bg-surface">
        <CardBody className="space-y-4 p-5">
          {m.minutesStatus !== "PUBLISHED" ? (
            <p className="text-xs text-ink-3">The minutes for this meeting have not been published yet.</p>
          ) : (
            <>
              <p className="text-[11px] text-ink-3">
                Published {fmtDateTime(m.minutes?.publishedAt)}
                {m.minutes?.byName ? ` by ${m.minutes.byName}` : ""}
              </p>
              <Section title="Summary" body={m.minutes?.summary} />
              <Section title="Discussion points" body={m.minutes?.discussionPoints} />
              <Section title="Decisions taken" body={m.minutes?.decisions} />
              <Section title="General remarks" body={m.minutes?.remarks} />
              {m.canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => act(() => reopenMeetingMinutes(m.id), "Minutes reopened")}
                >
                  <Undo2 className="size-3.5" /> Reopen for correction
                </Button>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="space-y-4 p-5">
        <p className="text-[11px] text-ink-3">
          Minutes stay editable until they are published. Publishing notifies every participant, and a completed
          meeting requires them.
        </p>
        <div>
          <label className={label}>Meeting summary (required to publish)</label>
          <textarea rows={3} className={textarea} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div>
          <label className={label}>Discussion points</label>
          <textarea rows={4} className={textarea} value={discussion} onChange={(e) => setDiscussion(e.target.value)} />
        </div>
        <div>
          <label className={label}>Decisions taken</label>
          <textarea rows={3} className={textarea} value={decisions} onChange={(e) => setDecisions(e.target.value)} />
        </div>
        <div>
          <label className={label}>General remarks</label>
          <textarea rows={3} className={textarea} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              act(
                () => saveMeetingMinutes(m.id, { summary, discussionPoints: discussion, decisions, remarks }),
                "Minutes saved",
              )
            }
          >
            <Save className="size-4" /> Save draft
          </Button>
          <Button
            variant="primary"
            disabled={busy || !summary.trim()}
            onClick={async () => {
              await act(
                () => saveMeetingMinutes(m.id, { summary, discussionPoints: discussion, decisions, remarks }),
              );
              await act(() => publishMeetingMinutes(m.id), "Minutes published to all participants");
            }}
          >
            <Send className="size-4" /> Publish minutes
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Section({ title, body }: { title: string; body?: string | null }) {
  if (!body?.trim()) return null;
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{title}</p>
      <RichHtml html={body} className="mt-1 text-sm text-ink-2" />
    </div>
  );
}

/**
 * Reassign an action item, or move its due date and priority.
 *
 * Separate from the status buttons on purpose: the assignee may change the
 * status of their own item, but only the organiser may change WHO owns it and
 * WHEN it is due — otherwise "assigned to you by Friday" is a suggestion.
 */
async function editAction(
  m: MeetingRecord,
  a: MeetingActionItem,
  act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>,
) {
  const options: Record<string, string> = { "": "Nobody yet" };
  for (const p of m.participants) options[p.userId] = p.name;
  const r = await Swal.fire({
    title: "Edit action item",
    html:
      `<input id="sw-desc" class="swal2-input" value="${escapeAttr(a.description)}">` +
      `<select id="sw-who" class="swal2-input">${Object.entries(options)
        .map(([v, l]) => `<option value="${v}"${v === (a.assignedToId ?? "") ? " selected" : ""}>${l}</option>`)
        .join("")}</select>` +
      `<input id="sw-due" type="date" class="swal2-input" value="${a.dueDate ? a.dueDate.slice(0, 10) : ""}">` +
      `<select id="sw-pri" class="swal2-input">${["LOW", "MEDIUM", "HIGH", "URGENT"]
        .map((p) => `<option value="${p}"${p === a.priority ? " selected" : ""}>${p}</option>`)
        .join("")}</select>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Save",
    background: swalBg(),
    confirmButtonColor: "#10b981",
    preConfirm: () => {
      const description = (document.getElementById("sw-desc") as HTMLInputElement)?.value?.trim();
      if (!description) {
        Swal.showValidationMessage("Describe the action");
        return false;
      }
      const due = (document.getElementById("sw-due") as HTMLInputElement)?.value;
      return {
        description,
        assignedToId: (document.getElementById("sw-who") as HTMLSelectElement)?.value ?? "",
        dueDate: due ? new Date(due).toISOString() : null,
        priority: (document.getElementById("sw-pri") as HTMLSelectElement)?.value,
      };
    },
  });
  if (!r.isConfirmed || !r.value) return;
  await act(() => updateMeetingActionItem(a.id, r.value as never), "Action item updated");
}

function Actions({
  m, act, busy,
}: { m: MeetingRecord; act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>; busy: boolean }) {
  const add = async () => {
    const options: Record<string, string> = { "": "Nobody yet" };
    for (const p of m.participants) options[p.userId] = p.name;
    const r = await Swal.fire({
      title: "New action item",
      html:
        `<input id="sw-desc" class="swal2-input" placeholder="What needs doing?">` +
        `<select id="sw-who" class="swal2-input">${Object.entries(options)
          .map(([v, l]) => `<option value="${v}">${l}</option>`)
          .join("")}</select>` +
        `<input id="sw-due" type="date" class="swal2-input">` +
        `<select id="sw-pri" class="swal2-input">${["LOW", "MEDIUM", "HIGH", "URGENT"]
          .map((p) => `<option value="${p}"${p === "MEDIUM" ? " selected" : ""}>${p}</option>`)
          .join("")}</select>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Assign",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: () => {
        const description = (document.getElementById("sw-desc") as HTMLInputElement)?.value?.trim();
        if (!description) {
          Swal.showValidationMessage("Describe the action");
          return false;
        }
        const due = (document.getElementById("sw-due") as HTMLInputElement)?.value;
        return {
          description,
          assignedToId: (document.getElementById("sw-who") as HTMLSelectElement)?.value || undefined,
          dueDate: due ? new Date(due).toISOString() : undefined,
          priority: (document.getElementById("sw-pri") as HTMLSelectElement)?.value,
        };
      },
    });
    if (!r.isConfirmed || !r.value) return;
    await act(() => addMeetingActionItem(m.id, r.value as never), "Action item assigned");
  };

  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-black text-ink">Action items</p>
          {m.canManage ? (
            <Button variant="primary" size="sm" disabled={busy} onClick={add}>
              <Plus className="size-3.5" /> Assign
            </Button>
          ) : null}
        </div>

        {!m.actionItems.length ? (
          <p className="py-8 text-center text-xs text-ink-3">Nothing was assigned from this meeting.</p>
        ) : (
          <div className="space-y-2">
            {m.actionItems.map((a) => {
              // Only the organiser (or staff) and the person it is assigned to
              // may move an item along. The server has always enforced this;
              // showing the buttons to everyone just produced a 403 on click.
              const mine = a.assignedToId === m.myUserId;
              return (
              <div
                key={a.id}
                className={`rounded-xl border p-3 ${
                  a.overdue ? "border-red-500/30 bg-red-500/5" : "border-hairline bg-surface-2/30"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{a.description}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {a.assignedToName ?? "Unassigned"}
                      {a.dueDate ? ` · due ${fmtDay(a.dueDate)}` : ""}
                      {a.overdue ? " · overdue" : ""}
                      {a.completionNote ? ` · ${a.completionNote}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge priority={a.priority} />
                    <ActionStatusBadge status={a.status} />
                  </div>
                </div>

                {m.canManage || mine ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)
                      .filter((s) => s !== a.status)
                      .map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            act(() => updateMeetingActionItem(a.id, { status: s }), `Moved to ${ACTION_LABEL[s]}`)
                          }
                        >
                          {s === "COMPLETED" ? <CheckCircle2 className="size-3" /> : null} {ACTION_LABEL[s]}
                        </Button>
                      ))}
                    {m.canManage ? (
                      <>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => editAction(m, a, act)}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => act(() => deleteMeetingActionItem(a.id), "Removed")}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  CREATED: "Meeting created",
  UPDATED: "Details updated",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  STARTED: "Started",
  ENDED: "Completed",
  JOINED: "Joined",
  LEFT: "Left",
  ATTENDANCE_MARKED: "Attendance set",
  MINUTES_SAVED: "Minutes saved",
  MINUTES_PUBLISHED: "Minutes published",
  MINUTES_REOPENED: "Minutes reopened",
  ACTION_ASSIGNED: "Action item assigned",
  ACTION_UPDATED: "Action item updated",
  ATTACHMENT_ADDED: "File attached",
  ATTACHMENT_REMOVED: "File removed",
};

/**
 * The business rule says every meeting action is recorded in the audit log.
 * This is where it is read back — who did what, and when.
 */
function AuditTrail({ id }: { id: string }) {
  const [rows, setRows] = useState<MeetingAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMeetingAudit(id)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the history"));
  }, [id]);

  if (error) {
    return (
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-8 text-center text-xs text-ink-3">{error}</CardBody>
      </Card>
    );
  }
  if (!rows) {
    return (
      <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
        <Loader2 className="size-4 animate-spin text-accent" /> Loading history…
      </div>
    );
  }

  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-5">
        <p className="mb-3 text-sm font-black text-ink">Meeting history</p>
        {!rows.length ? (
          <p className="py-8 text-center text-xs text-ink-3">Nothing has been recorded yet.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-hairline pl-4">
            {rows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-accent" />
                <p className="text-xs font-bold text-ink">{AUDIT_LABEL[r.action] ?? r.action}</p>
                {r.description ? <p className="text-[11px] text-ink-2">{r.description}</p> : null}
                <p className="text-[10px] text-ink-3">
                  {r.actorName ?? "System"} · {fmtDateTime(r.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * 8.8 — recordings, documents, presentations and training material.
 *
 * Two ways in, because both are real: upload a file the academy holds, or link
 * one that already lives somewhere else (a Zoom cloud recording, a shared
 * drive). Making the link case go through an upload would mean re-hosting a
 * file the academy already has a URL for.
 */
function Files({
  m, act, busy,
}: { m: MeetingRecord; act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>; busy: boolean }) {
  const [uploading, setUploading] = useState(false);

  const askKind = async (defaultTitle: string) => {
    const r = await Swal.fire({
      title: "Describe this file",
      html:
        `<input id="sw-title" class="swal2-input" placeholder="Title" value="${escapeAttr(defaultTitle)}">` +
        `<select id="sw-kind" class="swal2-input">` +
        ["DOCUMENT", "RECORDING", "PRESENTATION", "TRAINING_MATERIAL"]
          .map((k) => `<option value="${k}">${k.replace(/_/g, " ").toLowerCase()}</option>`)
          .join("") +
        `</select>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Attach",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: () => {
        const title = (document.getElementById("sw-title") as HTMLInputElement)?.value?.trim();
        if (!title) {
          Swal.showValidationMessage("Give the file a title");
          return false;
        }
        return { title, kind: (document.getElementById("sw-kind") as HTMLSelectElement)?.value };
      },
    });
    return r.isConfirmed && r.value ? (r.value as { title: string; kind: string }) : null;
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    e.target.value = "";
    if (!file) return;
    const meta = await askKind(file.name.replace(/\.[^.]+$/, ""));
    if (!meta) return;
    setUploading(true);
    try {
      const up = await uploadMeetingAttachment(file);
      await act(
        () => addMeetingAttachment(m.id, { title: meta.title, url: up.url, kind: meta.kind } as never),
        "Uploaded",
      );
    } catch (err) {
      fail(err);
    } finally {
      setUploading(false);
    }
  };

  const addLink = async () => {
    const r = await Swal.fire({
      title: "Link a file",
      html:
        `<input id="sw-title" class="swal2-input" placeholder="Title">` +
        `<input id="sw-url" class="swal2-input" placeholder="https://…">` +
        `<select id="sw-kind" class="swal2-input">` +
        ["DOCUMENT", "RECORDING", "PRESENTATION", "TRAINING_MATERIAL"]
          .map((k) => `<option value="${k}">${k.replace(/_/g, " ").toLowerCase()}</option>`)
          .join("") +
        `</select>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Attach",
      background: swalBg(),
      confirmButtonColor: "#10b981",
      preConfirm: () => {
        const title = (document.getElementById("sw-title") as HTMLInputElement)?.value?.trim();
        const url = (document.getElementById("sw-url") as HTMLInputElement)?.value?.trim();
        if (!title || !url) {
          Swal.showValidationMessage("Both a title and a link are needed");
          return false;
        }
        return { title, url, kind: (document.getElementById("sw-kind") as HTMLSelectElement)?.value };
      },
    });
    if (!r.isConfirmed || !r.value) return;
    await act(() => addMeetingAttachment(m.id, r.value as never), "Attached");
  };

  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-ink">Recordings & documents</p>
            <p className="text-[11px] text-ink-3">Presentations, training material and meeting recordings.</p>
          </div>
          {m.canManage ? (
            <div className="flex gap-2">
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink ${
                  uploading || busy ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {uploading ? "Uploading…" : "Upload"}
                <input type="file" className="hidden" onChange={onPick} disabled={uploading || busy} />
              </label>
              <Button variant="outline" size="sm" disabled={busy || uploading} onClick={addLink}>
                <Plus className="size-3.5" /> Link
              </Button>
            </div>
          ) : null}
        </div>

        {!m.attachments.length ? (
          <p className="py-8 text-center text-xs text-ink-3">Nothing has been attached to this meeting.</p>
        ) : (
          <div className="space-y-2">
            {m.attachments.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2/30 p-3">
                <div className="min-w-0">
                  <a
                    href={resolveFileUrl(f.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
                  >
                    <ExternalLink className="size-3.5 shrink-0" /> {f.title}
                  </a>
                  <p className="mt-0.5 text-[10px] text-ink-3">
                    {f.kind.replace(/_/g, " ").toLowerCase()} · {f.uploadedByName ?? "—"} · {fmtDay(f.createdAt)}
                  </p>
                </div>
                {m.canManage ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => deleteMeetingAttachment(f.id), "Removed")}>
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
