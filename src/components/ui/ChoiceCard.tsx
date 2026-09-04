import type { ReactNode } from "react";
import { cn } from "./cn";
import { CheckIcon } from "./icons";

/**
 * Selectable card used for personality packs, voice services, agents,
 * backgrounds: anywhere the user picks one of several options.
 * Selection is shown through a warm tint + soft ring, not a hard border.
 */
export function ChoiceCard({
  selected,
  onClick,
  leading,
  title,
  description,
  trailing,
  compact = false,
  disabled = false,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  /** Icon or glyph; rendered inside a soft squircle. */
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Replaces the default check mark on the right. */
  trailing?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "squircle group flex w-full items-center gap-3 rounded-card text-left transition-all duration-150 disabled:opacity-50",
        compact ? "px-3 py-2.5" : "px-3.5 py-3",
        selected
          ? "bg-accent-100 ring-2 ring-accent-300/70"
          : "bg-surface-2 shadow-soft hover:bg-well/60 hover:shadow-float",
        className,
      )}
    >
      {leading && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-[13px] transition-colors",
            compact ? "h-9 w-9" : "h-10 w-10",
            selected ? "bg-white text-accent-600" : "bg-well text-ink-2 group-hover:text-ink",
          )}
        >
          {leading}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-semibold", selected ? "text-accent-700" : "text-ink")}>
          {title}
        </span>
        {description && (
          <span className={cn("mt-0.5 block text-xs leading-snug", selected ? "text-accent-600/90" : "text-ink-3")}>
            {description}
          </span>
        )}
      </span>
      {trailing !== undefined ? (
        trailing
      ) : (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all",
            selected ? "bg-ink text-white" : "bg-well text-transparent group-hover:bg-well-2",
          )}
        >
          <CheckIcon className="h-3 w-3" strokeWidth={2.4} />
        </span>
      )}
    </button>
  );
}
