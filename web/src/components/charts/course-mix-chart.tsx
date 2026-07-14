"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { courseMix } from "@/lib/mock-data";
import { ChartTooltip, type ChartTooltipProps } from "./chart-kit";

const COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
];

const total = courseMix.reduce((sum, slice) => sum + slice.value, 0);

/* Two of these hues sit under 3:1 on the light surface, so the relief rule
   applies: every slice is labelled with its name and value in the list below,
   and identity never rests on the swatch alone. */
export function CourseMixChart() {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-4">
      <div className="relative shrink-0">
        <ResponsiveContainer width={168} height={168}>
          <PieChart>
            <Pie
              data={courseMix}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={76}
              paddingAngle={3}
              stroke="var(--surface)"
              strokeWidth={3}
            >
              {courseMix.map((slice, i) => (
                <Cell key={slice.name} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold tracking-tight text-ink">
            {total.toLocaleString()}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-ink-3 mt-0.5">students</span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {courseMix.map((slice, i) => (
          <li key={slice.name} className="flex items-center gap-2.5 text-xs border-b border-hairline/40 pb-2 last:border-0 last:pb-0">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: COLORS[i] }}
              aria-hidden
            />
            <span className="truncate text-ink-2 font-medium">{slice.name}</span>
            <span className="tnum ml-auto pl-3 font-bold text-ink">
              {slice.value.toLocaleString()}
            </span>
            <span className="tnum w-10 shrink-0 text-right font-bold text-ink-3">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
