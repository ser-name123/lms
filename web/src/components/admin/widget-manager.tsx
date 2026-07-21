"use client";

/*
 * Admin widget management.
 *
 * Turning a widget off here removes it from that role's dashboard entirely —
 * the server stops sending it, so a user cannot re-enable it from their own
 * Customise panel. Personalisation only ever narrows what an admin allows.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  fetchRoleWidgets,
  updateRoleWidgets,
  type RoleWidgetRow,
  type WidgetCategory,
} from "@/lib/api";
import type { Role } from "@/store/auth";
import { EmptyState, Spinner } from "@/components/dashboard/primitives";

/* ADMIN is the Super Admin console and SUPERVISOR the day-to-day Admin one —
   labelled here so the distinction is visible where it is configured. */
const ROLES: { role: Role; label: string; detail: string }[] = [
  { role: "ADMIN", label: "Super Admin", detail: "Whole-academy monitoring" },
  { role: "SUPERVISOR", label: "Admin", detail: "Daily operations" },
  { role: "ACADEMIC_COACH", label: "Academic Coach", detail: "Assigned roster" },
  { role: "TEACHER", label: "Teacher", detail: "Own classes and work" },
  { role: "STUDENT", label: "Student", detail: "Own learning" },
];

const CATEGORY_TONE: Record<WidgetCategory, "accent" | "good" | "warning" | "neutral"> = {
  KPI: "accent",
  CHART: "good",
  TABLE: "warning",
  LIST: "neutral",
  ACTION: "neutral",
};

export function WidgetManager() {
  const [role, setRole] = useState<Role>("ADMIN");
  const [rows, setRows] = useState<RoleWidgetRow[] | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRows(null);
    fetchRoleWidgets(role)
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [role]);

  const toggle = useCallback(
    async (widget: RoleWidgetRow) => {
      setSavingKey(widget.key);
      // Optimistic — the response replaces it either way.
      setRows((prev) =>
        prev?.map((r) => (r.key === widget.key ? { ...r, enabled: !r.enabled } : r)) ?? null,
      );
      try {
        const next = await updateRoleWidgets(role, [
          { key: widget.key, enabled: !widget.enabled },
        ]);
        setRows(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
        setRows((prev) =>
          prev?.map((r) => (r.key === widget.key ? { ...r, enabled: widget.enabled } : r)) ?? null,
        );
      } finally {
        setSavingKey(null);
      }
    },
    [role],
  );

  const enabledCount = rows?.filter((r) => r.enabled).length ?? 0;

  return (
    <Card>
      <CardHeader
        title="Dashboard widgets"
        subtitle="Choose which widgets each role's dashboard may show"
        action={
          rows ? (
            <span className="text-xs font-semibold text-ink-3">
              {enabledCount} of {rows.length} enabled
            </span>
          ) : null
        }
      />
      <CardBody>
        <div
          role="group"
          aria-label="Choose role"
          className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-hairline bg-surface p-1"
        >
          {ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              aria-pressed={role === r.role}
              onClick={() => setRole(r.role)}
              title={r.detail}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                role === r.role
                  ? "bg-accent text-accent-ink"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {rows === null ? (
          <Spinner label="Loading widgets…" />
        ) : !rows.length ? (
          <EmptyState
            title="No widgets for this role"
            detail="Nothing in the registry targets this role yet."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((w) => (
              <li
                key={w.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5",
                  !w.enabled && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="truncate">{w.title}</span>
                    <Badge tone={CATEGORY_TONE[w.category] ?? "neutral"}>{w.category}</Badge>
                  </p>
                  {w.description ? (
                    <p className="truncate text-xs text-ink-3">{w.description}</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={w.enabled}
                  aria-label={`${w.enabled ? "Disable" : "Enable"} ${w.title} for ${role}`}
                  disabled={savingKey === w.key}
                  onClick={() => toggle(w)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                    w.enabled ? "bg-accent" : "bg-surface-3",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full bg-white transition-transform",
                      w.enabled ? "translate-x-5.5" : "translate-x-0.5",
                    )}
                  >
                    {savingKey === w.key ? (
                      <Loader2 className="size-3 animate-spin text-ink-3" aria-hidden />
                    ) : w.enabled ? (
                      <Check className="size-3 text-accent" aria-hidden />
                    ) : (
                      <X className="size-3 text-ink-3" aria-hidden />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
