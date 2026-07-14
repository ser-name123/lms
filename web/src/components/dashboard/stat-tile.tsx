import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui/card";
import type { Kpi } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function StatTile({ kpi }: { kpi: Kpi }) {
  const up = kpi.delta >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="group p-5 transition-shadow hover:shadow-[var(--shadow-pop)]">
      <p className="text-xs font-medium text-ink-3">{kpi.label}</p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight text-ink">{kpi.value}</p>
        <div className="-mb-1 w-24 opacity-80 transition-opacity group-hover:opacity-100">
          <Sparkline data={kpi.spark} tone={up ? "good" : "critical"} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {/* Direction is stated by the arrow and the sign, not by color alone. */}
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-medium",
            up ? "text-good-ink" : "text-critical",
          )}
        >
          <Arrow className="size-3.5" />
          <span className="tnum">
            {up ? "+" : ""}
            {kpi.delta}%
          </span>
        </span>
        <span className="text-ink-3">{kpi.hint}</span>
      </div>
    </Card>
  );
}
