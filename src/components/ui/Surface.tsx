import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type SurfaceTone = "surface" | "raised" | "well" | "canvas";
export type SurfaceRadius = "control" | "field" | "card" | "panel" | "sheet";

const TONE: Record<SurfaceTone, string> = {
  surface: "bg-surface",
  raised: "bg-surface-2",
  well: "bg-well",
  canvas: "bg-canvas",
};

const RADIUS: Record<SurfaceRadius, string> = {
  control: "rounded-control",
  field: "rounded-field",
  card: "rounded-card",
  panel: "rounded-panel",
  sheet: "rounded-sheet",
};

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "aside" | "article" | "header" | "footer" | "nav";
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  /** soft = resting card, float = docks/menus, pop = modals */
  elevation?: "none" | "soft" | "float" | "pop";
  /** Adds a hover lift for clickable cards. */
  interactive?: boolean;
  children?: ReactNode;
}

/**
 * The basic container. Elevation is expressed through surface-colour shifts
 * and ultra-soft shadows: never through hard borders.
 */
export function Surface({
  as = "div",
  tone = "surface",
  radius = "card",
  elevation = "soft",
  interactive = false,
  className,
  children,
  ...rest
}: SurfaceProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "squircle",
        TONE[tone],
        RADIUS[radius],
        elevation === "soft" && "shadow-soft",
        elevation === "float" && "shadow-float",
        elevation === "pop" && "shadow-pop",
        interactive && "transition-all duration-150 hover:bg-white hover:shadow-float",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Small section heading used inside panels and settings pages. */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h3 className="text-[13px] font-semibold text-ink-3">{children}</h3>
      {action}
    </div>
  );
}
