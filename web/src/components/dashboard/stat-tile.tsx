import { BookOpen, GraduationCap, Users, Wallet, User as UserIcon, LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Kpi } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const kpiTheme: Record<
  string,
  {
    bg: string;
    color: string;
    icon: LucideIcon;
    progress: number;
    progressText: string;
  }
> = {
  students: {
    bg: "bg-[#5b73e8]",
    color: "text-[#5b73e8]",
    icon: Users,
    progress: 80,
    progressText: "80% Increase in 20 Days",
  },
  classes: {
    bg: "bg-[#ffb822]",
    color: "text-[#ffb822]",
    icon: UserIcon,
    progress: 50,
    progressText: "50% Increase in 25 Days",
  },
  completion: {
    bg: "bg-[#886cff]",
    color: "text-[#886cff]",
    icon: GraduationCap,
    progress: 76,
    progressText: "76% Increase in 20 Days",
  },
  revenue: {
    bg: "bg-[#f85a6b]",
    color: "text-[#f85a6b]",
    icon: Wallet,
    progress: 30,
    progressText: "30% Increase in 30 Days",
  },
};

export function StatTile({ kpi }: { kpi: Kpi }) {
  const theme = kpiTheme[kpi.id] || kpiTheme.students;
  const Icon = theme.icon;

  return (
    <Card className={cn("relative p-5 text-white border-0 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg overflow-hidden", theme.bg)}>
      <div className="flex items-center gap-4">
        {/* Left: Circle Icon container */}
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-sm", theme.color)}>
          <Icon className="size-5" />
        </span>

        {/* Right: Labels & Value */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">{kpi.label}</p>
          <p className="text-2xl font-black tracking-tight text-white mt-0.5">{kpi.value}</p>
        </div>
      </div>

      {/* Progress Bar & Growth Text */}
      <div className="mt-4">
        <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full" style={{ width: `${theme.progress}%` }} />
        </div>
        <p className="mt-2 text-[10px] font-bold text-white/95">{theme.progressText}</p>
      </div>
    </Card>
  );
}
