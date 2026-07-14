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
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-2">
      <div className="relative shrink-0">
        <ResponsiveContainer width={168} height={168}>
          <PieChart>
            <Pie
              data={courseMix}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {courseMix.map((slice, i) => (
                <Cell key={slice.name} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tracking-tight text-ink">
            {total.toLocaleString()}
          </span>
          <span className="text-xs text-ink-3">students</span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {courseMix.map((slice, i) => (
          <li key={slice.name} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: COLORS[i] }}
              aria-hidden
            />
            <span className="truncate text-ink-2">{slice.name}</span>
            <span className="tnum ml-auto pl-3 font-medium text-ink">
              {slice.value.toLocaleString()}
            </span>
            <span className="tnum w-10 shrink-0 text-right text-xs text-ink-3">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
