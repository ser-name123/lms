"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { revenueSeries } from "@/lib/mock-data";
import { compact, currency } from "@/lib/utils";
import { ChartTooltip, Legend, axisTick, gridStroke, type ChartTooltipProps } from "./chart-kit";

/* Revenue and target are both dollars, so they share one y-axis.
   Two scales on two axes would be the classic dual-axis lie. */
export function RevenueChart() {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Legend
          items={[
            { name: "Revenue", color: "var(--series-1)" },
            { name: "Target", color: "var(--series-3)" },
          ]}
        />
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={revenueSeries} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="month"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => `$${compact(v)}`}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} format={currency} />}
          />

          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="url(#revenueFill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
          />
          <Line
            type="monotone"
            dataKey="target"
            name="Target"
            stroke="var(--series-3)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
