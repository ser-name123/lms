"use client";

/*
 * Reusable dashboard charts.
 *
 * Rules held here so no caller has to remember them:
 *   · one y-axis, always (two measures of different scale get two charts)
 *   · categorical colours assigned in fixed slot order, never cycled
 *   · a legend whenever there is more than one series
 *   · recessive grid/axes; series colours come from CSS vars so light/dark swap
 *     in CSS with no JS branch
 *   · a tooltip on every chart
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip, Legend, axisTick, gridStroke, type ChartTooltipProps } from "@/components/charts/chart-kit";
import { EmptyState } from "./primitives";

/** Fixed categorical order. A 9th series folds into "Other" — never generated. */
export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export type SeriesDef = { key: string; name: string; format?: (v: number) => string };

const pctFormat = (v: number) => `${v}%`;

function hasData(data: unknown[]): boolean {
  return Array.isArray(data) && data.length > 0;
}

// ─── Trend (line / area) ─────────────────────────────────────────────────────

export function TrendChart({
  data,
  series,
  height = 240,
  area = false,
  yFormat,
  emptyLabel = "No data for this period",
}: {
  data: Record<string, unknown>[];
  series: SeriesDef[];
  height?: number;
  area?: boolean;
  yFormat?: (v: number) => string;
  emptyLabel?: string;
}) {
  if (!hasData(data)) return <EmptyState title={emptyLabel} />;

  const format = series[0]?.format ?? yFormat ?? ((v: number) => String(v));

  return (
    <div>
      {series.length > 1 ? (
        <div className="mb-3 flex justify-end">
          <Legend items={series.map((s, i) => ({ name: s.name, color: SERIES[i % SERIES.length] }))} />
        </div>
      ) : null}

      <ResponsiveContainer width="100%" height={height}>
        {area ? (
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[i % SERIES.length]} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={SERIES[i % SERIES.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={yFormat} />
            <Tooltip
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
              content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} format={format} />}
            />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={SERIES[i % SERIES.length]}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={yFormat} />
            <Tooltip
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
              content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} format={format} />}
            />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={SERIES[i % SERIES.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** A percentage trend — y always pinned 0–100 so the shape cannot mislead. */
export function RateChart({
  data,
  name,
  height = 240,
}: {
  data: { label: string; rate: number }[];
  name: string;
  height?: number;
}) {
  if (!hasData(data)) return <EmptyState title="No data for this period" />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id={`rate-${name.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} />
        <YAxis
          domain={[0, 100]}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={pctFormat}
        />
        <Tooltip
          cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
          content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} format={pctFormat} />}
        />
        <Area
          type="monotone"
          dataKey="rate"
          name={name}
          stroke="var(--series-1)"
          strokeWidth={2}
          fill={`url(#rate-${name.replace(/\s/g, "")})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Bars ────────────────────────────────────────────────────────────────────

export function BarChart({
  data,
  series,
  height = 240,
  yFormat,
  layout = "vertical",
}: {
  data: Record<string, unknown>[];
  series: SeriesDef[];
  height?: number;
  yFormat?: (v: number) => string;
  /** "vertical" = upright bars; "horizontal" = bars running left→right. */
  layout?: "vertical" | "horizontal";
}) {
  if (!hasData(data)) return <EmptyState title="No data for this period" />;

  const format = series[0]?.format ?? yFormat ?? ((v: number) => String(v));
  const horizontal = layout === "horizontal";

  return (
    <div>
      {series.length > 1 ? (
        <div className="mb-3 flex justify-end">
          <Legend items={series.map((s, i) => ({ name: s.name, color: SERIES[i % SERIES.length] }))} />
        </div>
      ) : null}

      <ResponsiveContainer width="100%" height={height}>
        <ReBarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 8, bottom: 0, left: horizontal ? 8 : -12 }}
          barGap={2}
        >
          <CartesianGrid stroke={gridStroke} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={yFormat} />
              <YAxis
                type="category"
                dataKey="label"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={110}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={yFormat} />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} format={format} />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={SERIES[i % SERIES.length]}
              // 4px rounded data-end, anchored to the baseline.
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={horizontal ? 18 : 28}
            />
          ))}
        </ReBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Donut ───────────────────────────────────────────────────────────────────

export function DonutChart({
  data,
  height = 240,
  format = (v: number) => String(v),
}: {
  data: { name: string; value: number }[];
  height?: number;
  format?: (v: number) => string;
}) {
  if (!hasData(data)) return <EmptyState title="No data for this period" />;

  // Beyond eight slots identity would need a generated hue — fold the tail.
  const top = data.slice(0, 7);
  const rest = data.slice(7);
  const slices = rest.length
    ? [...top, { name: "Other", value: rest.reduce((sum, d) => sum + d.value, 0) }]
    : top;

  const total = slices.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <ResponsiveContainer width="100%" height={height} className="sm:!w-1/2">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {slices.map((s, i) => (
              <Cell key={s.name} fill={SERIES[i % SERIES.length]} />
            ))}
          </Pie>
          <Tooltip
            content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} format={format} />}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend doubles as the value table, so identity is never colour-alone. */}
      <ul className="flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: SERIES[i % SERIES.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-2">{s.name}</span>
            <span className="tnum font-bold text-ink">{format(s.value)}</span>
            <span className="tnum w-10 text-right text-ink-3">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Horizontal meter (used for skills, utilisation) ─────────────────────────

export function MeterList({
  items,
  format = (v: number) => `${v}%`,
}: {
  items: { name: string; value: number; max?: number }[];
  format?: (v: number) => string;
}) {
  if (!items.length) return <EmptyState title="Nothing to show yet" />;

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const max = item.max ?? 100;
        const pct = max ? Math.min(100, Math.round((item.value / max) * 100)) : 0;
        return (
          <li key={item.name}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-xs font-semibold text-ink-2">{item.name}</span>
              <span className="tnum text-xs font-bold text-ink">{format(item.value)}</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={item.name}
            >
              <div
                className="h-full rounded-full bg-[var(--series-1)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
