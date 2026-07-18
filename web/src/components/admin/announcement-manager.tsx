"use client";

/*
 * Admin announcement management. Publishing fans out an in-app notification to
 * the chosen audience, so the bell reflects it immediately.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Pin, Plus, Trash2 } from "lucide-react";
import Swal from "sweetalert2";

import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAllAnnouncements,
  updateAnnouncement,
  type AnnouncementAdminItem,
  type AnnouncementType,
} from "@/lib/api";
import type { Role } from "@/store/auth";
import { EmptyState, Spinner, relativeTime } from "@/components/dashboard/primitives";

const TYPES: AnnouncementType[] = ["GENERAL", "HOLIDAY", "MAINTENANCE", "EXAM", "COURSE"];

const TYPE_TONE: Record<AnnouncementType, Tone> = {
  HOLIDAY: "accent",
  MAINTENANCE: "warning",
  EXAM: "critical",
  COURSE: "good",
  GENERAL: "neutral",
};

const AUDIENCE: { role: Role; label: string }[] = [
  { role: "ADMIN", label: "Super Admin" },
  { role: "SUPERVISOR", label: "Admin" },
  { role: "ACADEMIC_COACH", label: "Coach" },
  { role: "TEACHER", label: "Teacher" },
  { role: "STUDENT", label: "Student" },
  { role: "PARENT", label: "Parent" },
];

const EMPTY_FORM = {
  title: "",
  body: "",
  type: "GENERAL" as AnnouncementType,
  audience: [] as Role[],
  pinned: false,
  expiresAt: "",
};

export function AnnouncementManager() {
  const [items, setItems] = useState<AnnouncementAdminItem[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetchAllAnnouncements()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(load, []);

  const isDark = () =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        type: form.type,
        // An empty audience means everyone — that is the server's contract.
        audience: form.audience,
        pinned: form.pinned,
        ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      };

      if (editingId) await updateAnnouncement(editingId, payload);
      else await createAnnouncement(payload);

      setForm(EMPTY_FORM);
      setEditingId(null);
      setOpen(false);
      load();
    } catch (err) {
      Swal.fire({
        title: "Could not save",
        text: err instanceof Error ? err.message : "Failed to save announcement.",
        icon: "error",
        background: isDark() ? "#18181b" : "#ffffff",
      });
    } finally {
      setSaving(false);
    }
  };

  const edit = (a: AnnouncementAdminItem) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      body: a.body,
      type: a.type,
      audience: a.audience,
      pinned: a.pinned,
      expiresAt: a.expiresAt ? a.expiresAt.slice(0, 16) : "",
    });
    setOpen(true);
  };

  const remove = async (a: AnnouncementAdminItem) => {
    const result = await Swal.fire({
      title: "Delete announcement?",
      text: `"${a.title}" will be removed for everyone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      background: isDark() ? "#18181b" : "#ffffff",
    });
    if (!result.isConfirmed) return;

    await deleteAnnouncement(a.id).catch(() => undefined);
    load();
  };

  const toggleActive = async (a: AnnouncementAdminItem) => {
    await updateAnnouncement(a.id, { active: !a.active }).catch(() => undefined);
    load();
  };

  const toggleAudience = (role: Role) =>
    setForm((f) => ({
      ...f,
      audience: f.audience.includes(role)
        ? f.audience.filter((r) => r !== role)
        : [...f.audience, role],
    }));

  return (
    <Card>
      <CardHeader
        title="Announcements"
        subtitle="Holiday notices, maintenance, exam schedules and general notices"
        action={
          <Button
            variant={open ? "outline" : "primary"}
            size="sm"
            onClick={() => {
              setOpen((o) => !o);
              if (open) {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }
            }}
          >
            {open ? (
              "Cancel"
            ) : (
              <>
                <Plus className="size-3.5" aria-hidden />
                New
              </>
            )}
          </Button>
        }
      />
      <CardBody>
        {/* The other half of the pairing explained in broadcast-composer. */}
        <p className="mb-4 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-ink-2">
          An announcement stays on everyone&apos;s dashboard until it expires, and
          publishing one also sends a notification. For a one-off message that does
          not stick around, use{" "}
          <Link
            href="/notification-management"
            className="font-bold text-accent hover:underline"
          >
            Broadcast
          </Link>{" "}
          in the Notification Centre.
        </p>
        {open ? (
          <form onSubmit={submit} className="mb-5 space-y-3 rounded-lg border border-hairline p-4">
            <div>
              <label htmlFor="ann-title" className="mb-1 block text-xs font-semibold text-ink-2">
                Title
              </label>
              <input
                id="ann-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                maxLength={200}
                className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
              />
            </div>

            <div>
              <label htmlFor="ann-body" className="mb-1 block text-xs font-semibold text-ink-2">
                Message
              </label>
              <textarea
                id="ann-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
                rows={3}
                className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ann-type" className="mb-1 block text-xs font-semibold text-ink-2">
                  Type
                </label>
                <select
                  id="ann-type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as AnnouncementType })}
                  className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ann-expiry" className="mb-1 block text-xs font-semibold text-ink-2">
                  Expires (optional)
                </label>
                <input
                  id="ann-expiry"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink"
                />
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-ink-2">
                Audience{" "}
                <span className="font-normal text-ink-3">(none selected = everyone)</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCE.map((a) => (
                  <button
                    key={a.role}
                    type="button"
                    aria-pressed={form.audience.includes(a.role)}
                    onClick={() => toggleAudience(a.role)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      form.audience.includes(a.role)
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-hairline text-ink-3 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex items-center gap-2 text-xs font-semibold text-ink-2">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                className="size-4 rounded border-hairline"
              />
              Pin to the top
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="submit" variant="primary" size="sm" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Publish"}
              </Button>
            </div>
          </form>
        ) : null}

        {items === null ? (
          <Spinner label="Loading announcements…" />
        ) : !items.length ? (
          <EmptyState
            title="No announcements yet"
            detail="Publish one to reach a role's dashboard and notification bell."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "rounded-lg border border-hairline p-3",
                  !a.active && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {a.pinned ? <Pin className="size-3.5 text-accent" aria-hidden /> : null}
                      <span className="truncate">{a.title}</span>
                      <Badge tone={TYPE_TONE[a.type] ?? "neutral"}>{a.type}</Badge>
                      {!a.active ? <Badge tone="neutral">Inactive</Badge> : null}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-2">{a.body}</p>
                    <p className="mt-1.5 text-xs text-ink-3">
                      {a.audience.length ? a.audience.join(", ") : "Everyone"} ·{" "}
                      {a.publishedAt ? relativeTime(a.publishedAt) : "unpublished"} · {a.readCount}{" "}
                      read
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleActive(a)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
                    >
                      {a.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => edit(a)}
                      aria-label={`Edit ${a.title}`}
                      className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      aria-label={`Delete ${a.title}`}
                      className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-red-600"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
