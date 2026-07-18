"use client";

/*
 * Notification template CRUD.
 *
 * System templates (the 17 seeded ones) are editable but not deletable — the
 * engine looks them up by code, so deleting one would break a send path. The
 * server enforces that; the UI just hides the button so nobody is offered an
 * action that will be refused.
 */

import { useCallback, useEffect, useState } from "react";
import { Eye, FileText, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import Swal from "sweetalert2";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/primitives";
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  fetchNotificationTemplates,
  previewNotificationTemplate,
  updateNotificationTemplate,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationTemplate,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const CATEGORIES: NotificationCategory[] = [
  "ACADEMIC", "ATTENDANCE", "ASSIGNMENT", "ASSESSMENT", "FINANCE", "PROGRESS", "SYSTEM",
];
const CHANNELS: NotificationChannel[] = ["IN_APP", "EMAIL", "PUSH"];

type Draft = {
  code: string;
  name: string;
  description: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  subject: string;
  bodyText: string;
  link: string;
  active: boolean;
};

const EMPTY: Draft = {
  code: "",
  name: "",
  description: "",
  category: "SYSTEM",
  priority: "MEDIUM",
  channels: ["IN_APP"],
  subject: "",
  bodyText: "",
  link: "",
  active: true,
};

export function TemplateManager() {
  const [items, setItems] = useState<NotificationTemplate[] | null>(null);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetchNotificationTemplates()
        .then(setItems)
        .catch(() => setItems([])),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (t: NotificationTemplate) => {
    setCreating(false);
    setEditing(t);
    setDraft({
      code: t.code,
      name: t.name,
      description: t.description ?? "",
      category: t.category,
      priority: t.priority,
      channels: t.channels.length ? t.channels : ["IN_APP"],
      subject: t.subject,
      bodyText: t.bodyText,
      link: t.link ?? "",
      active: t.active,
    });
  };

  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setDraft(EMPTY);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.subject.trim() || !draft.bodyText.trim()) {
      Swal.fire({
        title: "Name, subject and body are required",
        icon: "info",
        background: swalBg(),
      });
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        if (!draft.code.trim()) {
          Swal.fire({ title: "A code is required", icon: "info", background: swalBg() });
          return;
        }
        await createNotificationTemplate({
          code: draft.code,
          name: draft.name,
          description: draft.description || undefined,
          category: draft.category,
          priority: draft.priority,
          channels: draft.channels,
          subject: draft.subject,
          bodyText: draft.bodyText,
          link: draft.link || undefined,
          active: draft.active,
        });
      } else if (editing) {
        await updateNotificationTemplate(editing.code, {
          name: draft.name,
          description: draft.description,
          category: draft.category,
          priority: draft.priority,
          channels: draft.channels,
          subject: draft.subject,
          bodyText: draft.bodyText,
          link: draft.link,
          active: draft.active,
        });
      }
      await load();
      close();
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Saved",
        showConfirmButton: false,
        timer: 1500,
      });
    } catch (e) {
      Swal.fire({
        title: "Could not save",
        text: e instanceof Error ? e.message : "Please try again.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: NotificationTemplate) => {
    const ok = await Swal.fire({
      title: `Delete "${t.name}"?`,
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#e11d48",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;
    await deleteNotificationTemplate(t.code).catch((e: Error) =>
      Swal.fire({ title: "Failed", text: e.message, icon: "error", background: swalBg() }),
    );
    void load();
  };

  const preview = async (t: NotificationTemplate) => {
    const p = await previewNotificationTemplate(t.code).catch(() => null);
    if (!p) return;
    const esc = (s: string) =>
      s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
    Swal.fire({
      title: t.name,
      html: `<div style="text-align:left">
        <p style="font-size:12px;color:#6b7280;margin:0 0 4px">Subject</p>
        <p style="font-weight:700;margin:0 0 12px">${esc(p.subject)}</p>
        <p style="font-size:12px;color:#6b7280;margin:0 0 4px">Body</p>
        <p style="margin:0 0 12px">${esc(p.bodyText)}</p>
        <p style="font-size:11px;color:#9ca3af;margin:0">
          Placeholders: ${p.placeholders.length ? esc(p.placeholders.join(", ")) : "none"}
        </p>
      </div>`,
      background: swalBg(),
      confirmButtonColor: "#386FA4",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-3">
          {items?.length ?? 0} template(s). Placeholders use <code>{"{{name}}"}</code>; a section
          like <code>{"{{#dueAt}}…{{/dueAt}}"}</code> disappears when the value is empty.
        </p>
        <Button variant="primary" size="sm" onClick={startCreate}>
          <Plus className="mr-1.5 size-3.5" /> New template
        </Button>
      </div>

      {creating || editing ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-ink">
              {creating ? "New template" : `Editing ${editing?.code}`}
            </h3>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {creating ? (
              <Field label="Code (unique, UPPER_SNAKE)">
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none"
                />
              </Field>
            ) : null}

            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none"
              />
            </Field>

            <Field label="Category">
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as NotificationCategory })
                }
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Priority">
              <select
                value={draft.priority}
                onChange={(e) =>
                  setDraft({ ...draft, priority: e.target.value as NotificationPriority })
                }
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-2 text-sm text-ink focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </Field>

            <div className="lg:col-span-2">
              <Field label="Subject">
                <input
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none"
                />
              </Field>
            </div>

            <div className="lg:col-span-2">
              <Field label="Body">
                <textarea
                  value={draft.bodyText}
                  onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none"
                />
              </Field>
            </div>

            <Field label="Link">
              <input
                value={draft.link}
                onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                placeholder="/dashboard"
                className="h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
              />
            </Field>

            <Field label="Channels">
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        channels: draft.channels.includes(c)
                          ? draft.channels.filter((x) => x !== c)
                          : [...draft.channels, c],
                      })
                    }
                    aria-pressed={draft.channels.includes(c)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      draft.channels.includes(c)
                        ? "border-transparent bg-accent text-accent-ink"
                        : "border-hairline text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {c.replace(/_/g, "-")}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Active
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={save} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-0">
        {items === null ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-5 animate-spin text-ink-3" />
          </div>
        ) : !items.length ? (
          <div className="py-14">
            <EmptyState title="No templates yet" icon={FileText} />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {items.map((t) => (
              <li key={t.code} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink">{t.name}</span>
                    <Badge tone="neutral">{t.code}</Badge>
                    <Badge tone="neutral">{t.category}</Badge>
                    {t.isSystem ? <Badge tone="accent">System</Badge> : null}
                    {!t.active ? <Badge tone="warning">Inactive</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-2">{t.subject}</p>
                  {t.placeholders.length ? (
                    <p className="mt-1 text-[11px] text-ink-3">
                      Placeholders: {t.placeholders.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => void preview(t)}>
                    <Eye className="mr-1.5 size-3.5" /> Preview
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                    Edit
                  </Button>
                  {/* System templates are looked up by code by the engine. */}
                  {!t.isSystem ? (
                    <Button variant="ghost" size="sm" onClick={() => void remove(t)}>
                      <Trash2 className="size-3.5 text-critical" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
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
