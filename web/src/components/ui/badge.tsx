import { cn } from "@/lib/utils";

/* Status never rides on color alone — every tone ships a dot plus its label. */
const tones = {
  neutral: "text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60",
  good: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/8 dark:bg-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/20",
  warning: "text-amber-700 dark:text-amber-400 bg-amber-500/8 dark:bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/20",
  critical: "text-red-700 dark:text-red-400 bg-red-500/8 dark:bg-red-500/10 border border-red-500/20 dark:border-red-500/20",
  accent: "text-indigo-700 dark:text-indigo-400 bg-indigo-500/8 dark:bg-indigo-500/10 border border-indigo-500/20 dark:border-indigo-500/20",
} as const;

const dots = {
  neutral: "bg-slate-400 dark:bg-zinc-500",
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  accent: "bg-indigo-500",
} as const;

export type Tone = keyof typeof tones;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dots[tone])} aria-hidden />
      {children}
    </span>
  );
}
