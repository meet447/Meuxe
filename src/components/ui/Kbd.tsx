import type { ReactNode } from "react";
import { cn } from "./cn";

function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-[7px] bg-surface-2 px-1.5 font-sans text-[11px] font-semibold text-ink-2 shadow-soft",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Renders "Cmd + Shift + E" as a row of keycaps. */
export function KeyCombo({ combo, className }: { combo: string; className?: string }) {
  const keys = combo.split(" + ");
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((k, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[11px] text-ink-4">+</span>}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}
