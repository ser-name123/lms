"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { enrollmentSeries } from "@/lib/mock-data";
import { ChartTooltip, Legend, axisTick, gridStroke, type ChartTooltipProps } from "./chart-kit";

export function EnrollmentChart() {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Legend
          items={[
            { name: "New", color: "var(--series-1)" },
            { name: "Churned", color: "var(--series-3)" },
          ]}
        />
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={enrollmentSeries}
          margin={{ top: 4, right: 8, bottom: 0, left: -18 }}
          barGap={2}
        >
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="month"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
          />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(91, 115, 232, 0.04)" }}
            content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} />}
          />

          {/* 4px rounded data-ends, anchored to the baseline. */}
          <Bar
            dataKey="new"
            name="New"
            fill="var(--series-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="churned"
            name="Churned"
            fill="var(--series-3)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
