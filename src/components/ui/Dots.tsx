import { cn } from "./cn";

/** Three soft bouncing dots — "thinking", "loading", "speaking". */
export function Dots({
  tone = "accent",
  size = "md",
  className,
}: {
  tone?: "accent" | "ink" | "honey" | "peach";
  size?: "sm" | "md";
  className?: string;
}) {
  const color = {
    accent: "bg-accent-400",
    ink: "bg-ink-3",
    honey: "bg-honey-400",
    peach: "bg-peach-400",
  }[tone];
  const dim = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden>
      <span className={cn("rounded-full animate-dot", dim, color)} />
      <span className={cn("rounded-full animate-dot [animation-delay:0.15s]", dim, color)} />
      <span className={cn("rounded-full animate-dot [animation-delay:0.3s]", dim, color)} />
    </span>
  );
}
