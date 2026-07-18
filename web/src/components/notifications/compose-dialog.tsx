"use client";

/*
 * Compose a direct notification.
 *
 * The recipient list comes from the server, already narrowed to the people this
 * role may actually reach — a teacher sees their own students, a student sees
 * their own teachers. The server re-checks the same list on send, so this
 * picker is a convenience, never the security boundary.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Send, X } from "lucide-react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import {
  fetchComposeRecipients,
  sendNotification,
  type ComposeRecipient,
  type NotificationChannel,
  type NotificationPriority,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: "IN_APP", label: "In-app" },
  { value: "EMAIL", label: "Email" },
  { value: "PUSH", label: "Push" },
];

export function ComposeDialog({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<ComposeRecipient[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<NotificationPriority>("MEDIUM");
  const [channels, setChannels] = useState<NotificationChannel[]>(["IN_APP"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchComposeRecipients()
      .then(setRecipients)
      .catch(() => setRecipients([]));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return recipients ?? [];
    return (recipients ?? []).filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        (r.context ?? "").toLowerCase().includes(term),
    );
  }, [recipients, q]);

  // Group by role so a long list stays navigable.
  const grouped = useMemo(() => {
    const map = new Map<string, ComposeRecipient[]>();
    for (const r of filtered) {
      const list = map.get(r.role) ?? [];
      list.push(r);
      map.set(r.role, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const selectAllVisible = () =>
    setSelected((cur) => [...new Set([...cur, ...filtered.map((r) => r.id)])]);

  const send = async () => {
    if (!selected.length) {
      Swal.fire({ title: "Pick at least one recipient", icon: "info", background: swalBg() });
      return;
    }
    if (!title.trim() || !body.trim()) {
      Swal.fire({ title: "A title and a message are required", icon: "info", background: swalBg() });
      return;
    }

    setBusy(true);
    try {
      const res = await sendNotification({
        userIds: selected,
        title: title.trim(),
        body: body.trim(),
        priority,
        channels,
      });
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        // Suppressed is not a failure — it is recipients exercising their
        // preferences, and saying so avoids a confusing "sent 3 of 5".
        title: res.suppressed
          ? `Sent to ${res.sent} · ${res.suppressed} muted this`
          : `Sent to ${res.sent}`,
        showConfirmButton: false,
        timer: 2200,
      });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send a notification"
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <h2 className="text-sm font-extrabold text-ink">Send a notification</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-[280px_1fr]">
          {/* Recipients */}
          <div className="flex min-h-0 flex-col border-hairline md:border-r">
            <div className="border-b border-hairline p-3">
              <label className="relative block">
                <span className="sr-only">Search recipients</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-3" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search people…"
                  className="h-8 w-full rounded-lg border border-hairline bg-surface-2 pr-2 pl-8 text-xs text-ink placeholder:text-ink-3 focus:outline-none"
                />
              </label>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-ink-3">{selected.length} selected</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    className="font-bold text-accent hover:underline"
                  >
                    Select all
                  </button>
                  {selected.length ? (
                    <button
                      type="button"
                      onClick={() => setSelected([])}
                      className="font-bold text-ink-3 hover:text-ink"
                    >
                      Clear
                    </button>
                  ) : null}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {recipients === null ? (
                <div className="grid place-items-center py-10">
                  <Loader2 className="size-4 animate-spin text-ink-3" />
                </div>
              ) : !grouped.length ? (
                <p className="px-2 py-8 text-center text-xs text-ink-3">
                  {recipients.length
                    ? "Nobody matches that search."
                    : "There is nobody you can message yet."}
                </p>
              ) : (
                grouped.map(([role, people]) => (
                  <div key={role} className="mb-3">
                    <p className="px-2 pb-1 text-[10px] font-extrabold tracking-wider text-ink-3 uppercase">
                      {role.replace(/_/g, " ")}
                    </p>
                    <ul className="space-y-0.5">
                      {people.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => toggle(r.id)}
                            aria-pressed={selected.includes(r.id)}
                            className={cn(
                              "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                              selected.includes(r.id) ? "bg-accent-soft" : "hover:bg-surface-2",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                                selected.includes(r.id)
                                  ? "border-accent bg-accent text-accent-ink"
                                  : "border-hairline",
                              )}
                              aria-hidden
                            >
                              {selected.includes(r.id) ? "✓" : ""}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-ink">
                                {r.name}
                              </span>
                              <span className="block truncate text-[10px] text-ink-3">
                                {r.context ?? r.email}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Message */}
          <div className="min-h-0 space-y-3 overflow-y-auto p-4">
            <div>
              <label htmlFor="notif-title" className="mb-1 block text-xs font-bold text-ink-2">
                Title
              </label>
              <input
                id="notif-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="notif-body" className="mb-1 block text-xs font-bold text-ink-2">
                Message
              </label>
              <textarea
                id="notif-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={4000}
                className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-2">Channels</p>
              <div className="flex flex-wrap gap-2">
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
              <p className="mt-1.5 text-[11px] text-ink-3">
                Recipients who turned a channel off will not receive it there.
              </p>
            </div>

            <div>
              <label htmlFor="notif-priority" className="mb-1 block text-xs font-bold text-ink-2">
                Priority
              </label>
              <select
                id="notif-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as NotificationPriority)}
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                {/* Critical bypasses every recipient mute, so it is admin-only —
                    the server rejects it from anyone else. */}
                {user?.role === "ADMIN" ? <option value="CRITICAL">Critical</option> : null}
              </select>
              {priority === "CRITICAL" ? (
                <p className="mt-1.5 text-[11px] text-critical">
                  Critical ignores every recipient&apos;s mute settings. Use it sparingly.
                </p>
              ) : null}
            </div>

            {selected.length ? (
              <Badge tone="neutral">Will send to {selected.length} recipient(s)</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={send} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
