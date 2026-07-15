import { BookOpen, GraduationCap, Users, Wallet, User as UserIcon, LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Kpi } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const kpiTheme: Record<
  string,
  {
    bg: string;
    iconBg: string;
    iconColor: string;
    textColor: string;
    fillColor: string;
    trackColor: string;
    icon: LucideIcon;
    progress: number;
    progressText: string;
  }
> = {
  students: {
    bg: "bg-surface border border-hairline",
    iconBg: "bg-blue-100/80 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    textColor: "text-blue-600 dark:text-blue-400",
    fillColor: "bg-blue-600 dark:bg-blue-400",
    trackColor: "bg-blue-100/50 dark:bg-blue-950/50",
    icon: Users,
    progress: 80,
    progressText: "80% Increase in 20 Days",
  },
  classes: {
    bg: "bg-surface border border-hairline",
    iconBg: "bg-amber-100/80 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    textColor: "text-amber-600 dark:text-amber-400",
    fillColor: "bg-amber-600 dark:bg-amber-400",
    trackColor: "bg-amber-100/50 dark:bg-amber-950/50",
    icon: UserIcon,
    progress: 50,
    progressText: "50% Increase in 25 Days",
  },
  completion: {
    bg: "bg-surface border border-hairline",
    iconBg: "bg-purple-100/80 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    textColor: "text-purple-600 dark:text-purple-400",
    fillColor: "bg-purple-600 dark:bg-purple-400",
    trackColor: "bg-purple-100/50 dark:bg-purple-950/50",
    icon: GraduationCap,
    progress: 76,
    progressText: "76% Increase in 20 Days",
  },
  revenue: {
    bg: "bg-surface border border-hairline",
    iconBg: "bg-rose-100/80 dark:bg-rose-900/30",
    iconColor: "text-rose-600 dark:text-rose-400",
    textColor: "text-rose-600 dark:text-rose-400",
    fillColor: "bg-rose-600 dark:bg-rose-400",
    trackColor: "bg-rose-100/50 dark:bg-rose-950/50",
    icon: Wallet,
    progress: 30,
    progressText: "30% Increase in 30 Days",
  },
};

export function StatTile({ kpi }: { kpi: Kpi }) {
  const theme = kpiTheme[kpi.id] || kpiTheme.students;
  const Icon = theme.icon;

  return (
    <Card className={cn("relative p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md overflow-hidden bg-surface", theme.bg)}>
      <div className="flex items-center gap-4">
        {/* Left: Circle Icon container */}
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-full shadow-sm", theme.iconBg, theme.iconColor)}>
          <Icon className="size-5" />
        </span>

        {/* Right: Labels & Value */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-2">{kpi.label}</p>
          <p className="text-2xl font-black tracking-tight text-ink mt-0.5">{kpi.value}</p>
        </div>
      </div>

      {/* Progress Bar & Growth Text */}
      <div className="mt-4">
        <div className={cn("h-1.5 w-full rounded-full overflow-hidden", theme.trackColor)}>
          <div className={cn("h-full rounded-full", theme.fillColor)} style={{ width: `${theme.progress}%` }} />
        </div>
        <p className={cn("mt-2 text-[10px] font-bold", theme.textColor)}>{theme.progressText}</p>
      </div>
    </Card>
  );
}
