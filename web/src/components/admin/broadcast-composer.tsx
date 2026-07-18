"use client";

/*
 * Broadcast composer.
 *
 * The recipient count is asked of the server as the audience changes, so the
 * admin sees the real number before sending rather than guessing. The server
 * resolves the audience again at send time — a broadcast scheduled for tomorrow
 * must include whoever enrols tonight.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, FileText, Loader2, Megaphone, Send, Users } from "lucide-react";
import Link from "next/link";
import Swal from "sweetalert2";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createBroadcast,
  updateBroadcast,
  fetchAudienceOptions,
  fetchNotificationTemplates,
  previewBroadcast,
  type AudienceOptions,
  type BroadcastAudience,
  type BroadcastInput,
  type BroadcastRow,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationTemplate,
} from "@/lib/api";
import type { Role } from "@/store/auth";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const AUDIENCES: { value: BroadcastAudience; label: string }[] = [
  { value: "ALL", label: "All users" },
  { value: "ROLE", label: "By role" },
  { value: "COURSE", label: "By course" },
  { value: "BATCH", label: "By batch" },
  { value: "STUDENTS", label: "Selected students" },
];

const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "ACADEMIC_COACH", "TEACHER", "STUDENT", "PARENT"];

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: "IN_APP", label: "In-app" },
  { value: "EMAIL", label: "Email" },
  { value: "PUSH", label: "Push" },
];

export function BroadcastComposer({
  onSent,
  editDraft,
}: {
  onSent: () => void;
  /** A draft picked from the broadcast list; the form opens holding its content. */
  editDraft?: BroadcastRow | null;
}) {
  const [options, setOptions] = useState<AudienceOptions | null>(null);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [audience, setAudience] = useState<BroadcastAudience>("ROLE");
  const [roles, setRoles] = useState<Role[]>(["STUDENT"]);
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>(["IN_APP"]);
  const [priority, setPriority] = useState<NotificationPriority>("MEDIUM");
  const [scheduledAt, setScheduledAt] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** Set once this composer is backed by a saved draft, so it edits in place. */
  const [draftId, setDraftId] = useState<string | null>(null);

  // Hydrate from a draft the admin chose to reopen.
  useEffect(() => {
    if (!editDraft) return;
    setDraftId(editDraft.id);
    setTitle(editDraft.title);
    setBody(editDraft.body);
    setLink(editDraft.link ?? "");
    setTemplateCode(editDraft.templateCode ?? "");
    setAudience(editDraft.audience);
    setRoles(editDraft.roles?.length ? editDraft.roles : ["STUDENT"]);
    setCourseId(editDraft.courseId ?? "");
    setBatchId(editDraft.batchId ?? "");
    setStudentIds(editDraft.studentIds ?? []);
    setChannels(editDraft.channels?.length ? editDraft.channels : ["IN_APP"]);
    setPriority(editDraft.priority);
    // datetime-local wants a local `YYYY-MM-DDTHH:mm`, not the stored ISO string.
    setScheduledAt(
      editDraft.scheduledAt
        ? new Date(
            new Date(editDraft.scheduledAt).getTime() -
              new Date(editDraft.scheduledAt).getTimezoneOffset() * 60_000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    );
  }, [editDraft]);

  useEffect(() => {
    fetchAudienceOptions()
      .then(setOptions)
      .catch(() => setOptions(null));
    fetchNotificationTemplates()
      .then((t) => setTemplates(t.filter((x) => x.active)))
      .catch(() => setTemplates([]));
  }, []);

  const buildInput = useCallback((): BroadcastInput => {
    return {
      title: title.trim(),
      body: body.trim(),
      link: link.trim() || undefined,
      templateCode: templateCode || undefined,
      audience,
      roles: audience === "ROLE" ? roles : undefined,
      courseId: audience === "COURSE" ? courseId || undefined : undefined,
      batchId: audience === "BATCH" ? batchId || undefined : undefined,
      studentIds: audience === "STUDENTS" ? studentIds : undefined,
      channels,
      priority,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    };
  }, [
    title, body, link, templateCode, audience, roles, courseId, batchId,
    studentIds, channels, priority, scheduledAt,
  ]);

  // Recount whenever the audience changes — the title/body do not affect it.
  useEffect(() => {
    const ready =
      audience === "ALL" ||
      (audience === "ROLE" && roles.length > 0) ||
      (audience === "COURSE" && !!courseId) ||
      (audience === "BATCH" && !!batchId) ||
      (audience === "STUDENTS" && studentIds.length > 0);

    if (!ready) {
      setCount(null);
      return;
    }
    let active = true;
    previewBroadcast({ ...buildInput(), title: "x", body: "y" })
      .then((r) => active && setCount(r.recipientCount))
      .catch(() => active && setCount(null));
    return () => {
      active = false;
    };
  }, [audience, roles, courseId, batchId, studentIds, buildInput]);

  const applyTemplate = (code: string) => {
    setTemplateCode(code);
    const t = templates.find((x) => x.code === code);
    if (!t) return;
    // Prefill, but leave anything the admin already typed alone.
    if (!title.trim()) setTitle(t.subject);
    if (!body.trim()) setBody(t.bodyText);
    if (t.link && !link.trim()) setLink(t.link);
    if (t.channels.length) setChannels(t.channels);
    setPriority(t.priority);
  };

  /*
   * Saving a draft skips the recipient checks on purpose — a half-finished
   * broadcast is exactly the thing you want to park, and the audience is
   * resolved again at send time anyway.
   */
  const saveDraft = async () => {
    if (!title.trim() || !body.trim()) {
      Swal.fire({ title: "A title and a message are required", icon: "info", background: swalBg() });
      return;
    }
    setBusy(true);
    try {
      const input = { ...buildInput(), draft: true };
      const b = draftId ? await updateBroadcast(draftId, input) : await createBroadcast(input);
      setDraftId(b.id);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Draft saved",
        showConfirmButton: false,
        timer: 1800,
      });
      onSent();
    } catch (e) {
      Swal.fire({
        title: "Could not save the draft",
        text: e instanceof Error ? e.message : "Please try again.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      Swal.fire({ title: "A title and a message are required", icon: "info", background: swalBg() });
      return;
    }
    if (count === 0) {
      Swal.fire({
        title: "This audience is empty",
        text: "Nobody would receive it.",
        icon: "info",
        background: swalBg(),
      });
      return;
    }

    const scheduled = Boolean(scheduledAt);
    const ok = await Swal.fire({
      title: scheduled ? "Schedule this broadcast?" : "Send this broadcast?",
      html: `<b>${count ?? "?"}</b> recipient(s) via ${channels.join(", ").replace(/_/g, "-")}${
        scheduled ? `<br/>at ${new Date(scheduledAt).toLocaleString()}` : ""
      }`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: scheduled ? "Schedule" : "Send now",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;

    setBusy(true);
    try {
      // A draft being sent is an edit of that row, not a second broadcast.
      const input = { ...buildInput(), draft: false };
      const b = draftId ? await updateBroadcast(draftId, input) : await createBroadcast(input);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: scheduled ? "Scheduled" : `Sent to ${b.sentCount} of ${b.recipientCount}`,
        showConfirmButton: false,
        timer: 2200,
      });
      setDraftId(null);
      setTitle("");
      setBody("");
      setLink("");
      setScheduledAt("");
      setTemplateCode("");
      onSent();
    } catch (e) {
      Swal.fire({
        title: "Could not send",
        text: e instanceof Error ? e.message : "Please try again.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Megaphone className="size-4 text-ink-3" aria-hidden />
        <h2 className="text-sm font-extrabold text-ink">New broadcast</h2>
        {count !== null ? (
          <Badge tone={count === 0 ? "warning" : "accent"}>
            <Users className="mr-1 inline size-3" aria-hidden />
            {count} recipient{count === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>

      {/*
       * Broadcast and Announcements both reach a whole audience, which is a
       * genuinely confusing choice without this line. The difference is what
       * survives: a broadcast is a one-off notification, an announcement is a
       * post that stays on the dashboard until it expires.
       */}
      <p className="mb-3 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-ink-2">
        A broadcast is a one-off notification. If you want something that stays on
        everyone&apos;s dashboard until it expires, post an{" "}
        <Link href="/announcements" className="font-bold text-accent hover:underline">
          Announcement
        </Link>{" "}
        instead.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Template (optional)">
            <select
              value={templateCode}
              onChange={(e) => applyTemplate(e.target.value)}
              className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
            >
              <option value="">Write from scratch</option>
              {templates.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none"
            />
          </Field>

          <Field label="Message">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={4000}
              className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none"
            />
          </Field>

          <Field label="Link (optional)">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/dashboard"
              className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </Field>
        </div>

        <div className="space-y-3">
          <Field label="Audience">
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAudience(a.value)}
                  aria-pressed={audience === a.value}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    audience === a.value
                      ? "border-transparent bg-accent text-accent-ink"
                      : "border-hairline text-ink-2 hover:bg-surface-2",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Field>

          {audience === "ROLE" ? (
            <Field label="Roles">
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setRoles((cur) =>
                        cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r],
                      )
                    }
                    aria-pressed={roles.includes(r)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      roles.includes(r)
                        ? "border-transparent bg-accent text-accent-ink"
                        : "border-hairline text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {r.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          {audience === "COURSE" ? (
            <Field label="Course">
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
              >
                <option value="">Pick a course…</option>
                {(options?.courses ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {audience === "BATCH" ? (
            <Field label="Batch">
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
              >
                <option value="">Pick a batch…</option>
                {(options?.batches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.course}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {audience === "STUDENTS" ? (
            <Field label={`Students (${studentIds.length} selected)`}>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-hairline bg-surface-2 p-1.5">
                {(options?.students ?? []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setStudentIds((cur) =>
                        cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id],
                      )
                    }
                    aria-pressed={studentIds.includes(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                      studentIds.includes(s.id) ? "bg-accent-soft" : "hover:bg-surface-3",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border text-[9px]",
                        studentIds.includes(s.id)
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-hairline",
                      )}
                      aria-hidden
                    >
                      {studentIds.includes(s.id) ? "✓" : ""}
                    </span>
                    <span className="truncate font-semibold text-ink">{s.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-ink-3">
                      {s.studentCode}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          <Field label="Channels">
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() =>
                    setChannels((cur) =>
                      cur.includes(c.value)
                        ? cur.filter((x) => x !== c.value)
                        : [...cur, c.value],
                    )
                  }
                  aria-pressed={channels.includes(c.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    channels.includes(c.value)
                      ? "border-transparent bg-accent text-accent-ink"
                      : "border-hairline text-ink-2 hover:bg-surface-2",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as NotificationPriority)}
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </Field>
            <Field label="Schedule (optional)">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
              />
            </Field>
          </div>

          {priority === "CRITICAL" ? (
            <p className="text-[11px] text-critical">
              Critical ignores every recipient&apos;s mute settings and channel opt-outs.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {draftId ? (
          <span className="mr-auto text-xs font-bold text-ink-3">Editing a saved draft</span>
        ) : null}
        <Button variant="ghost" size="sm" onClick={saveDraft} disabled={busy}>
          <FileText className="mr-1.5 size-3.5" />
          {draftId ? "Update draft" : "Save draft"}
        </Button>
        <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : scheduledAt ? (
            <CalendarClock className="mr-1.5 size-3.5" />
          ) : (
            <Send className="mr-1.5 size-3.5" />
          )}
          {scheduledAt ? "Schedule" : "Send now"}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-ink-2">{label}</span>
      {children}
    </label>
  );
}
