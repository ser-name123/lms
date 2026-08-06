"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import {
  ArrowLeft, CalendarClock, Loader2, Play, Plus, Power, PowerOff, Save, SlidersHorizontal, Trash2,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MEETING_TYPE_LABELS, PLATFORM_LABEL, WEEKDAYS, fmtDateTime } from "@/components/meetings/shared";
import {
  createMeetingSeries, deleteMeetingSeries, fetchMeetingConfig, fetchMeetingInvitables,
  fetchMeetingSeries, generateMeetingSeries, saveMeetingConfig, updateMeetingSeries,
  type MeetingConfig, type MeetingInvitables, type MeetingSeries, type MeetingType,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const ok = (title: string, text?: string) =>
  Swal.fire({ title, text, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
const fail = (e: unknown) =>
  Swal.fire({
    title: "Could not save",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const input =
  "h-9 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3";

const ROLE_OPTIONS = ["TEACHER", "SUPERVISOR", "ACADEMIC_COACH", "ADMIN"];

/**
 * 8.2 and 8.3: the recurring schedules, and the rules the whole module runs by.
 *
 * A schedule is a rule, not a list of meetings. Changing it regenerates the
 * future dates nobody has touched and leaves alone the ones an admin already
 * moved or cancelled — an override of a single date outranks the pattern.
 */
export default function MeetingSettingsPage() {
  const [cfg, setCfg] = useState<MeetingConfig | null>(null);
  const [series, setSeries] = useState<MeetingSeries[]>([]);
  const [meta, setMeta] = useState<MeetingInvitables | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MeetingSeries | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMeetingConfig().catch(() => null),
      fetchMeetingSeries().catch(() => []),
      fetchMeetingInvitables().catch(() => null),
    ])
      .then(([c, s, m]) => {
        setCfg(c);
        setSeries(s);
        setMeta(m);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const saveRules = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      setCfg(await saveMeetingConfig(cfg));
      await ok("Rules saved");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

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

  return (
    <>
      <Topbar title="Meeting Setup" subtitle="Recurring schedules, reminders and attendance rules" />

      <div className="animate-fade-up space-y-5 p-4 lg:p-6">
        <Link href="/meetings" className="flex w-fit items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Back to meetings
        </Link>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : (
          <>
            {/* ── Recurring schedules ── */}
            <Card className="border border-hairline bg-surface">
              <CardBody className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-black text-ink">
                      <CalendarClock className="size-4 text-accent" /> Recurring schedules
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      Occurrences are generated ahead automatically. Moving or cancelling one date never brings it back.
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                    <Plus className="size-3.5" /> New schedule
                  </Button>
                </div>

                {!series.length ? (
                  <p className="py-8 text-center text-xs text-ink-3">
                    No recurring schedule yet. Create one for the academy&apos;s standing staff meeting.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {series.map((s) => (
                      <div key={s.id} className="rounded-xl border border-hairline bg-surface-2/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-ink">{s.name}</p>
                            <p className="mt-0.5 text-[11px] text-ink-3">
                              {MEETING_TYPE_LABELS[s.type] ?? s.type} · every {s.intervalWeeks} week(s) on{" "}
                              {WEEKDAYS[s.weekday]} at {s.startTime} · {s.durationMins} min · {PLATFORM_LABEL[s.platform]}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-3">
                              Invites: {s.inviteRoles.join(", ") || "nobody"}
                              {s.optionalInviteRoles?.length ? ` (optional: ${s.optionalInviteRoles.join(", ")})` : ""}
                              {" · "}organiser {s.organizerName ?? "—"}
                            </p>
                            <p className="mt-1 text-[11px] text-ink-3">
                              {s.generatedCount} generated · next{" "}
                              {s.nextOccurrence ? fmtDateTime(s.nextOccurrence.startsAt) : "none scheduled"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={s.active ? "good" : "neutral"}>{s.active ? "Active" : "Paused"}</Badge>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(s)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => act(() => generateMeetingSeries(s.id), "Upcoming dates generated")}
                            >
                              <Play className="size-3.5" /> Generate
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => act(() => updateMeetingSeries(s.id, { active: !s.active }), s.active ? "Paused" : "Activated")}
                            >
                              {s.active ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={async () => {
                                const r = await Swal.fire({
                                  title: `Delete "${s.name}"?`,
                                  text: "Meetings it already created are kept — people were invited to them.",
                                  icon: "warning",
                                  showCancelButton: true,
                                  confirmButtonText: "Delete schedule",
                                  background: swalBg(),
                                  confirmButtonColor: "#ef4444",
                                });
                                if (r.isConfirmed) act(() => deleteMeetingSeries(s.id), "Schedule deleted");
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* ── Rules ── */}
            {cfg ? (
              <Card className="border border-hairline bg-surface">
                <CardBody className="p-5">
                  <p className="flex items-center gap-1.5 text-sm font-black text-ink">
                    <SlidersHorizontal className="size-4 text-accent" /> Rules
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Num
                      label="Late after (minutes)"
                      hint="Joining later than this counts as Late, not Present."
                      value={cfg.lateAfterMins}
                      onChange={(v) => setCfg({ ...cfg, lateAfterMins: v })}
                    />
                    <Num
                      label="Minimum attendance (%)"
                      hint="Someone in for less than this share of the meeting counts as Late."
                      value={cfg.minAttendancePct}
                      onChange={(v) => setCfg({ ...cfg, minAttendancePct: v })}
                    />
                    <Num
                      label="First reminder (hours before)"
                      value={cfg.reminderHoursBefore}
                      onChange={(v) => setCfg({ ...cfg, reminderHoursBefore: v })}
                    />
                    <Num
                      label="Final reminder (minutes before)"
                      value={cfg.finalReminderMins}
                      onChange={(v) => setCfg({ ...cfg, finalReminderMins: v })}
                    />
                    <Num
                      label="Absence grace (minutes after end)"
                      hint="How long the system waits before marking non-joiners absent."
                      value={cfg.absenceGraceMins}
                      onChange={(v) => setCfg({ ...cfg, absenceGraceMins: v })}
                    />
                    <Num
                      label="Generate ahead (weeks)"
                      value={cfg.defaultGenerateAheadWeeks}
                      onChange={(v) => setCfg({ ...cfg, defaultGenerateAheadWeeks: v })}
                    />
                    <div className="sm:col-span-2">
                      <label className={label}>Jitsi base URL</label>
                      <input
                        className={input}
                        value={cfg.jitsiBaseUrl}
                        onChange={(e) => setCfg({ ...cfg, jitsiBaseUrl: e.target.value })}
                      />
                      <p className="mt-1 text-[10px] text-ink-3">
                        Rooms are named from the meeting id, so they cannot be guessed from the title.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {(
                      [
                        ["notifyOnStart", "Tell participants when a meeting starts"],
                        ["notifyOnAbsence", "Notify a participant when they are marked absent"],
                        [
                          "requireMinutesToComplete",
                          "Minutes must be published before a meeting can be completed",
                        ],
                      ] as const
                    ).map(([key, text]) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-ink-2">
                        <input
                          type="checkbox"
                          checked={cfg[key]}
                          onChange={(e) => setCfg({ ...cfg, [key]: e.target.checked })}
                        />
                        {text}
                      </label>
                    ))}
                  </div>

                  <div className="mt-5 flex justify-end">
                    <Button variant="primary" onClick={saveRules} disabled={busy}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save rules
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : null}
          </>
        )}
      </div>

      {creating || editing ? (
        <SeriesEditor
          editing={editing}
          meta={meta}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </>
  );
}

function Num({
  label: text, hint, value, onChange,
}: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className={label}>{text}</label>
      <input type="number" className={input} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint ? <p className="mt-1 text-[10px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

function SeriesEditor({
  editing, meta, onClose, onSaved,
}: {
  editing: MeetingSeries | null;
  meta: MeetingInvitables | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "Biweekly Teacher Meeting");
  const [type, setType] = useState<MeetingType>(editing?.type ?? "BIWEEKLY_TEACHER");
  const [intervalWeeks, setIntervalWeeks] = useState(editing?.intervalWeeks ?? 2);
  const [weekday, setWeekday] = useState(editing?.weekday ?? 6);
  const [startTime, setStartTime] = useState(editing?.startTime ?? "18:00");
  const [durationMins, setDurationMins] = useState(editing?.durationMins ?? 60);
  const [platform, setPlatform] = useState(editing?.platform ?? "JITSI");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [inviteRoles, setInviteRoles] = useState<string[]>(editing?.inviteRoles ?? ["TEACHER", "SUPERVISOR"]);
  // §8.2: "(Optional: Academic Coach and Admin may attend.)"
  const [optionalRoles, setOptionalRoles] = useState<string[]>(
    editing?.optionalInviteRoles ?? ["ACADEMIC_COACH", "ADMIN"],
  );
  const [organizerId, setOrganizerId] = useState(editing?.organizerId ?? "");
  const [generateAheadWeeks, setGenerateAheadWeeks] = useState(editing?.generateAheadWeeks ?? 8);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return fail(new Error("Give the schedule a name."));
    if (!inviteRoles.length) return fail(new Error("Pick at least one role to invite."));
    setBusy(true);
    try {
      const dto = {
        name: name.trim(),
        type,
        intervalWeeks: Number(intervalWeeks),
        weekday: Number(weekday),
        startTime,
        durationMins: Number(durationMins),
        platform,
        description: description.trim() || undefined,
        inviteRoles,
        // A role cannot be both; required wins, matching the server's rule.
        optionalInviteRoles: optionalRoles.filter((r) => !inviteRoles.includes(r)),
        organizerId: organizerId || undefined,
        generateAheadWeeks: Number(generateAheadWeeks),
      };
      if (editing) await updateMeetingSeries(editing.id, dto);
      else await createMeetingSeries(dto);
      await ok(editing ? "Schedule updated" : "Schedule created", "Upcoming dates will be generated automatically.");
      onSaved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <Card className="my-8 w-full max-w-2xl border border-hairline bg-surface shadow-xl">
        <CardBody className="p-6">
          <h2 className="mb-1 text-lg font-black text-ink">
            {editing ? "Edit recurring schedule" : "New recurring schedule"}
          </h2>
          <p className="mb-5 text-xs text-ink-3">
            Changing the day, time or interval regenerates the future dates nobody has touched.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>Name</label>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={label}>Meeting type</label>
              <select className={input} value={type} onChange={(e) => setType(e.target.value as MeetingType)}>
                {Object.entries(MEETING_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Repeat every … week(s)</label>
              <input
                type="number"
                min={1}
                max={52}
                className={input}
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Day</label>
              <select className={input} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Start time</label>
              <input type="time" className={input} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className={label}>Duration (minutes)</label>
              <input
                type="number"
                min={5}
                max={600}
                className={input}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Platform</label>
              <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value as never)}>
                {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Organiser</label>
              <select className={input} value={organizerId} onChange={(e) => setOrganizerId(e.target.value)}>
                <option value="">First available supervisor</option>
                {(meta?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Generate ahead (weeks)</label>
              <input
                type="number"
                min={1}
                max={52}
                className={input}
                value={generateAheadWeeks}
                onChange={(e) => setGenerateAheadWeeks(Number(e.target.value))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Who is invited</label>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setInviteRoles(inviteRoles.includes(r) ? inviteRoles.filter((x) => x !== r) : [...inviteRoles, r])
                    }
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
                      inviteRoles.includes(r)
                        ? "bg-accent text-accent-ink"
                        : "border border-hairline bg-surface text-ink-2 hover:text-ink"
                    }`}
                  >
                    {r.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-ink-3">
                Resolved fresh at every generation, so a newly hired teacher is invited to the next one.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Optional attendees</label>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.filter((r) => !inviteRoles.includes(r)).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setOptionalRoles(
                        optionalRoles.includes(r) ? optionalRoles.filter((x) => x !== r) : [...optionalRoles, r],
                      )
                    }
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
                      optionalRoles.includes(r)
                        ? "bg-accent text-accent-ink"
                        : "border border-hairline bg-surface text-ink-2 hover:text-ink"
                    }`}
                  >
                    {r.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-ink-3">
                Invited and reminded like everyone else, but their absence does not count against the meeting&apos;s
                attendance. A role already required above cannot also be optional.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Standing agenda</label>
              <textarea
                rows={3}
                className="w-full rounded-xl border border-hairline bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save schedule
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
