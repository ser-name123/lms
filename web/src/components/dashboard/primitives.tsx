"use client";

/*
 * Shared dashboard building blocks.
 *
 * Before this existed every dashboard hand-rolled its own KPI tile, spinner and
 * empty state, and the admin KPI tile faked its progress bar from a static map.
 * Everything here renders exactly what it is handed.
 */

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import type { DashboardRange } from "@/lib/api";

// ─── Range picker ────────────────────────────────────────────────────────────

const RANGES: { key: DashboardRange; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "12m", label: "12 months" },
];

export function RangePicker({
  value,
  onChange,
  disabled,
}: {
  value: DashboardRange;
  onChange: (r: DashboardRange) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex rounded-lg border border-hairline bg-surface p-0.5"
    >
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          disabled={disabled}
          aria-pressed={value === r.key}
          onClick={() => onChange(r.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
            value === r.key
              ? "bg-accent text-accent-ink"
              : "text-ink-3 hover:bg-surface-2 hover:text-ink",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI tile ────────────────────────────────────────────────────────────────

export function Kpi({
  label,
  value,
  delta,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  /** Percent change vs the previous window. Omitted when there is no baseline. */
  delta?: number;
  hint?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="tnum mt-2 text-2xl font-bold text-ink">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta === undefined ? (
          hint ? <span className="text-xs text-ink-3">{hint}</span> : null
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              delta > 0 && "text-good-ink",
              delta < 0 && "text-red-600 dark:text-red-400",
              delta === 0 && "text-ink-3",
            )}
          >
            {delta > 0 ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : delta < 0 ? (
              <ArrowDownRight className="size-3.5" aria-hidden />
            ) : null}
            {/* Sign is carried by the arrow and the word, not colour alone. */}
            {delta > 0 ? "+" : ""}
            {delta}% vs previous
          </span>
        )}
        {tone !== "neutral" && hint ? <Badge tone={tone}>{hint}</Badge> : null}
      </div>
    </>
  );

  const className =
    "rounded-xl border border-hairline bg-surface p-4 shadow-[var(--shadow-card)]";

  return href ? (
    <Link href={href} className={cn(className, "block transition-colors hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── Loading / empty ─────────────────────────────────────────────────────────

export function DashboardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dashboard…</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-hairline bg-surface-2"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-xl border border-hairline bg-surface-2"
          />
        ))}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  icon: Icon,
  action,
}: {
  title: string;
  detail?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline px-6 py-10 text-center">
      {Icon ? <Icon className="size-6 text-ink-3" aria-hidden /> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {detail ? <p className="max-w-sm text-xs text-ink-3">{detail}</p> : null}
      {action}
    </div>
  );
}

// ─── Small list row ──────────────────────────────────────────────────────────

export function ListRow({
  title,
  subtitle,
  meta,
  href,
  leading,
  trailing,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  href?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        {subtitle ? <p className="truncate text-xs text-ink-3">{subtitle}</p> : null}
      </div>
      {meta ? <div className="shrink-0 text-xs text-ink-3">{meta}</div> : null}
      {trailing}
    </>
  );

  const className =
    "flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5";

  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-surface-2")}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

// ─── Formatting helpers used across dashboards ───────────────────────────────

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
