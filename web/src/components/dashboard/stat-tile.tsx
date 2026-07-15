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
    bg: "bg-[#133C55]/4 border border-[#133C55]/10 dark:bg-[#133C55]/10 dark:border-zinc-800",
    iconBg: "bg-[#133C55]/10 dark:bg-[#133C55]/30",
    iconColor: "text-[#133C55] dark:text-[#84D2F6]",
    textColor: "text-[#133C55] dark:text-[#84D2F6]",
    fillColor: "bg-[#133C55] dark:bg-[#84D2F6]",
    trackColor: "bg-[#133C55]/10 dark:bg-[#133C55]/20",
    icon: Users,
    progress: 80,
    progressText: "80% Increase in 20 Days",
  },
  classes: {
    bg: "bg-amber-500/4 border border-amber-500/10 dark:bg-amber-500/10 dark:border-zinc-800",
    iconBg: "bg-amber-100/80 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    textColor: "text-amber-600 dark:text-amber-400",
    fillColor: "bg-[#133C55] dark:bg-amber-400",
    trackColor: "bg-[#133C55]/10 dark:bg-amber-950/50",
    icon: UserIcon,
    progress: 50,
    progressText: "50% Increase in 25 Days",
  },
  completion: {
    bg: "bg-[#386FA4]/4 border border-[#386FA4]/10 dark:bg-[#386FA4]/10 dark:border-zinc-800",
    iconBg: "bg-[#386FA4]/10 dark:bg-[#386FA4]/30",
    iconColor: "text-[#386FA4] dark:text-[#91E5F6]",
    textColor: "text-[#386FA4] dark:text-[#91E5F6]",
    fillColor: "bg-[#133C55] dark:bg-[#91E5F6]",
    trackColor: "bg-[#133C55]/10 dark:bg-[#386FA4]/20",
    icon: GraduationCap,
    progress: 76,
    progressText: "76% Increase in 20 Days",
  },
  revenue: {
    bg: "bg-[#59A5D8]/4 border border-[#59A5D8]/10 dark:bg-[#59A5D8]/10 dark:border-zinc-800",
    iconBg: "bg-[#59A5D8]/10 dark:bg-[#59A5D8]/30",
    iconColor: "text-[#133C55] dark:text-[#84D2F6]",
    textColor: "text-[#133C55] dark:text-[#84D2F6]",
    fillColor: "bg-[#133C55] dark:bg-[#84D2F6]",
    trackColor: "bg-[#133C55]/10 dark:bg-[#133C55]/20",
    icon: Wallet,
    progress: 30,
    progressText: "30% Increase in 30 Days",
  },
};

export function StatTile({ kpi }: { kpi: Kpi }) {
  const theme = kpiTheme[kpi.id] || kpiTheme.students;
  const Icon = theme.icon;

  return (
    <Card className={cn("relative p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md overflow-hidden", theme.bg)}>
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
