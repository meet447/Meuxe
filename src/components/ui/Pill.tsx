import type { ReactNode } from "react";
import { cn } from "./cn";

export type PillTone = "neutral" | "accent" | "peach" | "honey" | "sage" | "clay";

const TONE: Record<PillTone, string> = {
  neutral: "bg-well text-ink-2",
  accent: "bg-accent-100 text-accent-700",
  peach: "bg-peach-100 text-peach-500",
  honey: "bg-honey-100 text-honey-700",
  sage: "bg-sage-100 text-sage-700",
  clay: "bg-clay-100 text-clay-700",
};

const DOT: Record<PillTone, string> = {
  neutral: "bg-ink-3",
  accent: "bg-accent-500",
  peach: "bg-peach-400",
  honey: "bg-honey-400",
  sage: "bg-sage-500",
  clay: "bg-clay-500",
};

export function Pill({
  tone = "neutral",
  dot = false,
  pulse = false,
  size = "sm",
  className,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  pulse?: boolean;
  size?: "xs" | "sm";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        TONE[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone], pulse && "animate-pulse-soft")} />
      )}
      {children}
    </span>
  );
}
