"use client";

/*
 * The dashboard shell.
 *
 * Which widgets exist and in what order comes from the server
 * (`/dashboard/widgets/me`), which already applies the admin's per-role
 * enable/disable on top of the registry. This component only renders that list
 * and lets the user reorder / resize / hide their own copy.
 *
 * Personalisation can only ever narrow: a widget an admin disabled for the role
 * never reaches the client, so nothing here can bring it back.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  Settings2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchMyWidgets,
  resetMyWidgets,
  saveMyWidgets,
  type ResolvedWidget,
  type WidgetSize,
} from "@/lib/api";
import { EmptyState } from "./primitives";

const SIZE_CLASS: Record<WidgetSize, string> = {
  SM: "lg:col-span-3",
  MD: "lg:col-span-6",
  LG: "lg:col-span-8",
  FULL: "lg:col-span-12",
};

const SIZE_LABEL: Record<WidgetSize, string> = {
  SM: "Small",
  MD: "Medium",
  LG: "Large",
  FULL: "Full width",
};

const SIZES: WidgetSize[] = ["SM", "MD", "LG", "FULL"];

export type WidgetRenderer = (widget: ResolvedWidget) => React.ReactNode;

export function useMyWidgets() {
  const [widgets, setWidgets] = useState<ResolvedWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMyWidgets()
      .then((w) => active && setWidgets(w))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);

  return { widgets, setWidgets, error };
}

export function WidgetGrid({
  widgets,
  onWidgetsChange,
  render,
  /** Rendered above the grid — range picker, page actions. */
  toolbar,
}: {
  widgets: ResolvedWidget[];
  onWidgetsChange: (next: ResolvedWidget[]) => void;
  render: WidgetRenderer;
  toolbar?: React.ReactNode;
}) {
  const [customising, setCustomising] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragKey = useRef<string | null>(null);

  const visible = widgets.filter((w) => !w.hidden);

  const persist = useCallback(
    async (next: ResolvedWidget[]) => {
      onWidgetsChange(next);
      setSaving(true);
      try {
        const saved = await saveMyWidgets(
          next.map((w, i) => ({ key: w.key, order: i * 10, size: w.size, hidden: w.hidden })),
        );
        onWidgetsChange(saved);
      } finally {
        setSaving(false);
      }
    },
    [onWidgetsChange],
  );

  const move = (key: string, direction: -1 | 1) => {
    const index = widgets.findIndex((w) => w.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[target]] = [next[target], next[index]];
    void persist(next);
  };

  const dropOn = (targetKey: string) => {
    const from = dragKey.current;
    dragKey.current = null;
    if (!from || from === targetKey) return;
    const next = [...widgets];
    const fromIndex = next.findIndex((w) => w.key === from);
    const toIndex = next.findIndex((w) => w.key === targetKey);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    void persist(next);
  };

  const setSize = (key: string, size: WidgetSize) =>
    void persist(widgets.map((w) => (w.key === key ? { ...w, size } : w)));

  const toggleHidden = (key: string) =>
    void persist(widgets.map((w) => (w.key === key ? { ...w, hidden: !w.hidden } : w)));

  const reset = async () => {
    setSaving(true);
    try {
      onWidgetsChange(await resetMyWidgets());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        <div className="flex items-center gap-2">
          {saving ? <span className="text-xs text-ink-3">Saving…</span> : null}
          {customising ? (
            <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
              <RotateCcw className="size-3.5" aria-hidden />
              Reset
            </Button>
          ) : null}
          <Button
            variant={customising ? "primary" : "outline"}
            size="sm"
            onClick={() => setCustomising((c) => !c)}
            aria-pressed={customising}
          >
            {customising ? (
              <>
                <Check className="size-3.5" aria-hidden />
                Done
              </>
            ) : (
              <>
                <Settings2 className="size-3.5" aria-hidden />
                Customise
              </>
            )}
          </Button>
        </div>
      </div>

      {customising ? (
        <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs text-ink-2">
          Drag a card by its handle, or use the arrows, to reorder. Change the size or hide a card —
          your layout is saved to your account, not this browser.
        </p>
      ) : null}

      {!visible.length && !customising ? (
        <EmptyState
          title="No widgets on your dashboard"
          detail="Every widget is hidden. Use Customise to bring some back."
          action={
            <Button variant="outline" size="sm" onClick={() => setCustomising(true)}>
              Customise
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {(customising ? widgets : visible).map((widget, index) => (
            <div
              key={widget.key}
              className={cn("min-w-0", SIZE_CLASS[widget.size] ?? SIZE_CLASS.MD)}
              draggable={customising}
              onDragStart={() => {
                dragKey.current = widget.key;
              }}
              onDragOver={(e) => customising && e.preventDefault()}
              onDrop={() => customising && dropOn(widget.key)}
            >
              {customising ? (
                <Card className={cn(widget.hidden && "opacity-60")}>
                  <CardHeader
                    title={
                      <span className="flex items-center gap-2">
                        <GripVertical className="size-4 cursor-grab text-ink-3" aria-hidden />
                        {widget.title}
                      </span>
                    }
                    subtitle={widget.description ?? undefined}
                    action={
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => move(widget.key, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${widget.title} up`}
                          className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                        >
                          <ChevronUp className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(widget.key, 1)}
                          disabled={index === widgets.length - 1}
                          aria-label={`Move ${widget.title} down`}
                          className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                        >
                          <ChevronDown className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleHidden(widget.key)}
                          aria-label={`${widget.hidden ? "Show" : "Hide"} ${widget.title}`}
                          className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
                        >
                          {widget.hidden ? (
                            <EyeOff className="size-4" aria-hidden />
                          ) : (
                            <Eye className="size-4" aria-hidden />
                          )}
                        </button>
                      </div>
                    }
                  />
                  <CardBody>
                    <label className="flex items-center gap-2 text-xs text-ink-3">
                      Size
                      <select
                        value={widget.size}
                        onChange={(e) => setSize(widget.key, e.target.value as WidgetSize)}
                        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs font-semibold text-ink"
                      >
                        {SIZES.map((s) => (
                          <option key={s} value={s}>
                            {SIZE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </CardBody>
                </Card>
              ) : (
                render(widget)
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Standard chrome for a widget's content. */
export function WidgetCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <CardBody className="flex-1">{children}</CardBody>
    </Card>
  );
}
