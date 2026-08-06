"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, Save, Users, X } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CREATABLE_TYPES, MEETING_TYPE_LABELS, PLATFORM_LABEL, toLocalInput } from "./shared";
import {
  createMeeting, fetchMeetingInvitables, updateMeeting,
  type MeetingInvitables, type MeetingPlatform, type MeetingRecord, type MeetingType,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const fail = (e: unknown) =>
  Swal.fire({
    title: "Could not save",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const input =
  "h-9 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const textarea =
  "w-full rounded-xl border border-hairline bg-surface p-3 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3";

const GROUP_ROLES = [
  { value: "TEACHER", label: "All teachers" },
  { value: "SUPERVISOR", label: "All supervisors" },
  { value: "ACADEMIC_COACH", label: "All academic coaches" },
  { value: "ADMIN", label: "All admins" },
];

/** Minutes between two `datetime-local` strings, or null if either is unusable. */
function minutesBetween(startLocal: string, endLocal: string): number | null {
  const a = new Date(startLocal).getTime();
  const b = new Date(endLocal).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const mins = Math.round((b - a) / 60_000);
  return mins > 0 ? mins : null;
}

/** `start + minutes` as a `datetime-local` string. */
function endFrom(startLocal: string, mins: number): string {
  const a = new Date(startLocal).getTime();
  if (!Number.isFinite(a) || !(mins > 0)) return "";
  return toLocalInput(new Date(a + mins * 60_000));
}

/**
 * Schedule a meeting, or edit one that already exists.
 *
 * The participant picker sends GROUPS ("all teachers", "this course") rather
 * than the ids it happens to be showing — the server expands them when the
 * meeting is saved, so a teacher hired between opening this form and pressing
 * Save is still invited. Individually ticked people are sent as ids.
 *
 * In edit mode the date and time are deliberately absent: moving a meeting is
 * a RESCHEDULE (§8.3), which notifies everyone and records what it moved from.
 * Letting the plain edit form quietly change the start would lose that.
 */
export function MeetingForm({
  role,
  meeting,
  onClose,
  onSaved,
}: {
  role: string;
  /** Present when editing; the form switches to PATCH and hides date/time. */
  meeting?: MeetingRecord;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const editing = !!meeting;
  const [meta, setMeta] = useState<MeetingInvitables | null>(null);
  const [busy, setBusy] = useState(false);

  const types = CREATABLE_TYPES[role] ?? CREATABLE_TYPES.TEACHER;
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [type, setType] = useState<MeetingType>(meeting?.type ?? types[0]);
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [startsAt, setStartsAt] = useState(() => {
    if (meeting) return toLocalInput(meeting.startsAt);
    // Default to the next round hour tomorrow — a sane slot nobody has to fix.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInput(d);
  });
  const [durationMins, setDurationMins] = useState(meeting?.durationMins ?? 60);
  // §8.4 asks for an End Time as well as a duration. They are the same fact, so
  // each one writes the other rather than being sent as two fields that can
  // disagree.
  const [endsAt, setEndsAt] = useState(() =>
    meeting ? toLocalInput(meeting.endsAt) : "",
  );
  const [platform, setPlatform] = useState<MeetingPlatform>(meeting?.platform ?? "JITSI");
  const [meetingLink, setMeetingLink] = useState(meeting?.meetingLink ?? "");

  const [roles, setRoles] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>(
    meeting ? meeting.participants.filter((p) => !p.isOptional).map((p) => p.userId) : [],
  );
  const [optionalIds, setOptionalIds] = useState<string[]>(
    meeting ? meeting.participants.filter((p) => p.isOptional).map((p) => p.userId) : [],
  );
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  useEffect(() => {
    fetchMeetingInvitables().then(setMeta).catch(() => undefined);
  }, []);

  // Keep the end time in step with the start until the user sets one directly.
  useEffect(() => {
    setEndsAt((prev) => (prev ? prev : endFrom(startsAt, durationMins)));
  }, [startsAt, durationMins]);

  const setDuration = (mins: number) => {
    setDurationMins(mins);
    setEndsAt(endFrom(startsAt, mins));
  };
  const setEnd = (value: string) => {
    setEndsAt(value);
    const mins = minutesBetween(startsAt, value);
    if (mins) setDurationMins(mins);
  };

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  /**
   * Ticking someone as optional takes them off the required list, and vice
   * versa — a person cannot be both, and silently keeping them in both buckets
   * would make the attendance denominator depend on click order.
   */
  const toggleRequired = (id: string) => {
    setOptionalIds((o) => o.filter((v) => v !== id));
    toggle(userIds, setUserIds, id);
  };
  const toggleOptional = (id: string) => {
    setUserIds((u) => u.filter((v) => v !== id));
    toggle(optionalIds, setOptionalIds, id);
  };

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    const all = meta?.staff ?? [];
    return q ? all.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) : all;
  }, [meta, staffSearch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const all = meta?.students ?? [];
    if (!q) return all.slice(0, 30);
    return all.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)).slice(0, 30);
  }, [meta, studentSearch]);

  const selectionCount = roles.length + userIds.length + optionalIds.length + courseIds.length + studentIds.length;

  const save = async () => {
    if (!title.trim()) return fail(new Error("Give the meeting a title."));
    if (!editing && !startsAt) return fail(new Error("Pick a date and time."));
    if (!selectionCount) return fail(new Error("Invite at least one person or group."));
    if (platform !== "JITSI" && !meetingLink.trim()) {
      return fail(new Error(`A ${PLATFORM_LABEL[platform]} meeting needs a link — only Jitsi generates its own.`));
    }
    const participants = {
      roles: roles.length ? roles : undefined,
      userIds: userIds.length ? userIds : undefined,
      optionalUserIds: optionalIds.length ? optionalIds : undefined,
      courseIds: courseIds.length ? courseIds : undefined,
      studentIds: studentIds.length ? studentIds : undefined,
    };

    setBusy(true);
    try {
      if (editing && meeting) {
        await updateMeeting(meeting.id, {
          title: title.trim(),
          type,
          description: description.trim() || undefined,
          platform,
          meetingLink: platform === "JITSI" ? undefined : meetingLink.trim(),
          participants,
        });
        onSaved(meeting.id);
      } else {
        const created = await createMeeting({
          title: title.trim(),
          type,
          description: description.trim() || undefined,
          startsAt: new Date(startsAt).toISOString(),
          durationMins: Number(durationMins) || 60,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          platform,
          meetingLink: platform === "JITSI" ? undefined : meetingLink.trim(),
          participants,
        });
        onSaved(created.id);
      }
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <Card className="my-8 w-full max-w-3xl border border-hairline bg-surface shadow-xl">
        <CardBody className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-ink">{editing ? "Edit meeting" : "Schedule a meeting"}</h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {editing
                  ? "Anyone newly invited is notified. To move the meeting, use Reschedule — it records what it moved from and tells everyone."
                  : "Everyone invited is notified straight away, then reminded a day and an hour before."}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>Title</label>
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Biweekly teacher sync" />
            </div>
            <div>
              <label className={label}>Meeting type</label>
              <select className={input} value={type} onChange={(e) => setType(e.target.value as MeetingType)}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {MEETING_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Platform</label>
              <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value as MeetingPlatform)}>
                {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {editing ? null : (
              <>
                <div>
                  <label className={label}>Starts</label>
                  <input type="datetime-local" className={input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Ends</label>
                  <input type="datetime-local" className={input} value={endsAt} onChange={(e) => setEnd(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Duration (minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    className={input}
                    value={durationMins}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </div>
              </>
            )}

            {platform !== "JITSI" ? (
              <div className="sm:col-span-2">
                <label className={label}>Meeting link</label>
                <input
                  className={input}
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder={platform === "ZOOM" ? "Left blank, Zoom creates one automatically if configured" : "https://…"}
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className={label}>Agenda</label>
              <textarea
                rows={3}
                className={textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will be covered?"
              />
            </div>
          </div>

          {/* ── Participants ── */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                <Users className="size-3.5" /> Participants
              </p>
              <Badge tone={selectionCount ? "good" : "critical"}>
                {selectionCount ? `${selectionCount} selection(s)` : "nobody invited"}
              </Badge>
            </div>

            <p className="mb-2 text-[11px] text-ink-3">
              Groups are resolved when the meeting is saved, so anyone who joins the academy before then is included.
              Optional attendees are invited and reminded, but their absence does not count against attendance.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {GROUP_ROLES.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => toggle(roles, setRoles, g.value)}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
                    roles.includes(g.value)
                      ? "bg-accent text-accent-ink"
                      : "border border-hairline bg-surface text-ink-2 hover:text-ink"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {meta?.courses.length ? (
              <>
                <p className={`${label} mt-4`}>By course (department)</p>
                <div className="flex flex-wrap gap-1.5">
                  {meta.courses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(courseIds, setCourseIds, c.id)}
                      className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
                        courseIds.includes(c.id)
                          ? "bg-accent text-accent-ink"
                          : "border border-hairline bg-surface text-ink-2 hover:text-ink"
                      }`}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <p className={`${label} mt-4`}>Individual staff</p>
            <input
              className={`${input} mb-2`}
              placeholder="Search staff…"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
            />
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-hairline bg-surface-2/30 p-2">
              <div className="flex items-center gap-2 px-2 pb-1 text-[9px] font-extrabold uppercase tracking-wider text-ink-3">
                <span className="w-16 shrink-0">Required</span>
                <span className="w-16 shrink-0">Optional</span>
                <span>Name</span>
              </div>
              {filteredStaff.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-surface-2">
                  <span className="w-16 shrink-0">
                    <input
                      type="checkbox"
                      aria-label={`${s.name} required`}
                      checked={userIds.includes(s.id)}
                      onChange={() => toggleRequired(s.id)}
                    />
                  </span>
                  <span className="w-16 shrink-0">
                    <input
                      type="checkbox"
                      aria-label={`${s.name} optional`}
                      checked={optionalIds.includes(s.id)}
                      onChange={() => toggleOptional(s.id)}
                    />
                  </span>
                  <span className="font-semibold text-ink">{s.name}</span>
                  <span className="text-[10px] text-ink-3">{s.role}</span>
                </div>
              ))}
              {!filteredStaff.length ? <p className="p-2 text-[11px] text-ink-3">Nobody matches.</p> : null}
            </div>

            {meta?.canInviteStudents ? (
              <>
                <p className={`${label} mt-4`}>Students</p>
                <p className="mb-2 text-[11px] text-ink-3">
                  Academic coaches and supervisors may include a student in a meeting.
                </p>
                <input
                  className={`${input} mb-2`}
                  placeholder="Search by name or student code…"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-hairline bg-surface-2/30 p-2">
                  {filteredStudents.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={studentIds.includes(s.id)}
                        onChange={() => toggle(studentIds, setStudentIds, s.id)}
                      />
                      <span className="font-semibold text-ink">{s.name}</span>
                      <span className="text-[10px] text-ink-3">{s.code}</span>
                    </label>
                  ))}
                  {!filteredStudents.length ? (
                    <p className="p-2 text-[11px] text-ink-3">
                      {studentSearch ? "Nobody matches." : "Search to pick a student."}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
              {editing ? "Save changes" : "Schedule and notify"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
