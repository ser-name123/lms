"use client";

/* Shared chart chrome. Series colors are referenced as CSS vars (SVG paint
   accepts var()), so light/dark swap happens in CSS with no JS branch. */

export const axisTick = { fill: "var(--ink-3)", fontSize: 11 };
export const gridStroke = "var(--line)";

/* Recharts types Tooltip's `content` against its own generics; this is the
   narrow slice we actually read, and charts cast their props into it. */
export type ChartTooltipProps = {
  active?: boolean;
  label?: React.ReactNode;
  payload?: readonly {
    dataKey?: string | number;
    name?: React.ReactNode;
    value?: number | string;
    color?: string;
  }[];
  format?: (v: number) => string;
};

export function ChartTooltip({
  active,
  payload,
  label,
  format = (v: number) => String(v),
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2 shadow-[var(--shadow-pop)]">
      <p className="mb-1.5 text-xs font-medium text-ink">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-ink-2 capitalize">{entry.name}</span>
            <span className="tnum ml-auto pl-4 font-medium text-ink">
              {format(Number(entry.value))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* A legend is always present for >= 2 series, so identity never rests on
   color alone. */
export function Legend({ items }: { items: { name: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5 text-xs">
          <span
            className="size-2 rounded-full"
            style={{ background: item.color }}
            aria-hidden
          />
          <span className="text-ink-2">{item.name}</span>
          {item.value ? <span className="tnum font-medium text-ink">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}
