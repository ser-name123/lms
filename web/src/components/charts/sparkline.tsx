"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

import type { Trend } from "@/lib/mock-data";

/* Decoration-free micro-trend for stat tiles: no axes, no tooltip — the tile's
   value and delta carry the meaning, the shape only carries direction. */
export function Sparkline({ data, tone }: { data: Trend[]; tone: "good" | "critical" }) {
  const stroke = tone === "good" ? "var(--series-2)" : "var(--series-4)";
  const id = `spark-${tone}`;

  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
