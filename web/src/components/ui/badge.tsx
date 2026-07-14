import { cn } from "@/lib/utils";

/* Status never rides on color alone — every tone ships a dot plus its label. */
const tones = {
  neutral: "text-ink-2 bg-surface-2",
  good: "text-ink-2 bg-surface-2",
  warning: "text-ink-2 bg-surface-2",
  critical: "text-ink-2 bg-surface-2",
  accent: "text-ink-2 bg-surface-2",
} as const;

const dots = {
  neutral: "bg-ink-3",
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  accent: "bg-accent",
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
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dots[tone])} aria-hidden />
      {children}
    </span>
  );
}
