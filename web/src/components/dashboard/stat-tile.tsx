import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui/card";
import type { Kpi } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function StatTile({ kpi }: { kpi: Kpi }) {
  const up = kpi.delta >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="group p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md border border-hairline hover:border-accent/20 bg-gradient-to-b from-surface to-surface-2/30">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3/90">{kpi.label}</p>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-extrabold tracking-tight text-ink">{kpi.value}</p>
        <div className="-mb-1 w-24 opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:scale-105">
          <Sparkline data={kpi.spark} tone={up ? "good" : "critical"} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded-md border text-[11px]",
            up 
              ? "bg-good/10 text-good-ink border-good/20" 
              : "bg-critical/10 text-critical border-critical/20"
          )}
        >
          <Arrow className="size-3.5" />
          <span className="tnum">
            {up ? "+" : ""}
            {kpi.delta}%
          </span>
        </span>
        <span className="font-medium text-ink-3">{kpi.hint}</span>
      </div>
    </Card>
  );
}
