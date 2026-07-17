"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Save, Eye, Paperclip, FileX2, type LucideIcon } from "lucide-react";

export type FieldType = "text" | "textarea" | "date" | "select" | "tags" | "docs" | "readonly";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
}

export interface SectionDef {
  title: string;
  icon: LucideIcon;
  fields: FieldDef[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  sections: SectionDef[];
  load: () => Promise<Record<string, any> | null>;
  save: (patch: Record<string, any>) => Promise<any>;
  resolveDoc?: (ref: string) => Promise<string>;
  emptyHint?: string;
}

const EDITABLE: FieldType[] = ["text", "textarea", "date", "select"];

const toDateInput = (v: any) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export function FullDetailsDrawer({
  open,
  onClose,
  title,
  subtitle,
  sections,
  load,
  save,
  resolveDoc,
  emptyHint,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMsg(null);
    load()
      .then((d) => {
        setData(d);
        setForm(d ? { ...d } : {});
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Only send editable fields.
      const patch: Record<string, any> = {};
      sections.forEach((s) =>
        s.fields.forEach((f) => {
          if (EDITABLE.includes(f.type ?? "text")) {
            const v = form[f.key];
            patch[f.key] = v === "" ? null : v;
          }
        }),
      );
      const updated = await save(patch);
      setData(updated);
      setForm({ ...updated });
      setMsg({ type: "success", text: "Saved. Changes also synced to the account." });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-hairline bg-surface shadow-2xl animate-slide-left">
        <div className="flex items-center justify-between border-b border-hairline bg-surface-2/30 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[10px] text-ink-3">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-sm font-bold text-ink-3">
              <Loader2 className="mr-2 size-5 animate-spin text-accent" /> Loading details…
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-ink-3">
              <FileX2 className="size-8 text-ink-3/40" />
              <p className="text-sm font-bold text-ink">No registration on file</p>
              <p className="max-w-xs text-xs">
                {emptyHint || "This person was added directly by an admin, so there is no registration form to show."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {msg && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                    msg.type === "success"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                      : "border-red-500/20 bg-red-500/10 text-red-500"
                  }`}
                >
                  {msg.text}
                </div>
              )}

              {sections.map((section) => (
                <div key={section.title}>
                  <div className="mb-2.5 flex items-center gap-1.5">
                    <section.icon className="size-3.5 text-accent" />
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">{section.title}</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {section.fields.map((f) => (
                      <FieldRow
                        key={f.key}
                        def={f}
                        value={form[f.key]}
                        onChange={(v) => set(f.key, v)}
                        resolveDoc={resolveDoc}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {data && !loading && (
          <div className="flex gap-2 border-t border-hairline p-4">
            <button
              onClick={onClose}
              className="h-10 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 hover:bg-surface-2"
            >
              Close
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  def,
  value,
  onChange,
  resolveDoc,
}: {
  def: FieldDef;
  value: any;
  onChange: (v: any) => void;
  resolveDoc?: (ref: string) => Promise<string>;
}) {
  const type = def.type ?? "text";
  const wide = type === "textarea" || type === "tags" || type === "docs";

  const label = (
    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{def.label}</label>
  );

  if (type === "tags") {
    const arr: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="sm:col-span-2">
        {label}
        {arr.length ? (
          <div className="flex flex-wrap gap-1.5">
            {arr.map((t, i) => (
              <span key={i} className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-2">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-3">—</p>
        )}
      </div>
    );
  }

  if (type === "docs") {
    return (
      <div className="sm:col-span-2">
        {label}
        {value ? (
          <DocButton refValue={value} resolveDoc={resolveDoc} />
        ) : (
          <p className="text-xs text-ink-3">Not uploaded</p>
        )}
      </div>
    );
  }

  if (type === "readonly") {
    return (
      <div className={wide ? "sm:col-span-2" : ""}>
        {label}
        <div className="flex h-11 items-center rounded-xl border border-hairline bg-surface-2/50 px-3 text-sm font-semibold text-ink-2">
          {value || "—"}
        </div>
      </div>
    );
  }

  if (type === "select") {
    return (
      <div>
        {label}
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
        >
          <option value="">—</option>
          {(def.options || []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div className="sm:col-span-2">
        {label}
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        type={type === "date" ? "date" : "text"}
        value={type === "date" ? toDateInput(value) : value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent"
      />
    </div>
  );
}

function DocButton({
  refValue,
  resolveDoc,
}: {
  refValue: string;
  resolveDoc?: (ref: string) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (!resolveDoc) return;
    setBusy(true);
    try {
      const url = await resolveDoc(refValue);
      if (url) window.open(url, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-bold text-ink hover:border-accent/40"
    >
      <Paperclip className="size-3.5 text-accent" /> View document
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5 text-ink-3" />}
    </button>
  );
}
