import type { ReactNode } from "react";
import { cn } from "./cn";
import { CheckIcon, InfoIcon, WarningIcon } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "danger" | "neutral";

const TONE: Record<NoticeTone, { box: string; icon: string }> = {
  neutral: { box: "bg-well text-ink-2", icon: "text-ink-3" },
  info: { box: "bg-accent-50 text-accent-700", icon: "text-accent-500" },
  success: { box: "bg-sage-50 text-sage-700", icon: "text-sage-500" },
  warning: { box: "bg-honey-50 text-honey-700", icon: "text-honey-500" },
  danger: { box: "bg-clay-50 text-clay-700", icon: "text-clay-500" },
};

/** Soft inline callout. No border — tone comes from the tinted surface. */
export function Notice({
  tone = "info",
  title,
  icon,
  children,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  icon?: ReactNode | false;
  children?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const defaultIcon =
    tone === "success" ? (
      <CheckIcon className="h-4 w-4" />
    ) : tone === "warning" || tone === "danger" ? (
      <WarningIcon className="h-4 w-4" />
    ) : (
      <InfoIcon className="h-4 w-4" />
    );
  const glyph = icon === false ? null : icon ?? defaultIcon;

  return (
    <div className={cn("squircle flex gap-3 rounded-card px-4 py-3 text-sm leading-relaxed", t.box, className)}>
      {glyph && <span className={cn("mt-0.5 shrink-0", t.icon)}>{glyph}</span>}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? "mt-0.5 opacity-90" : undefined}>{children}</div>}
      </div>
    </div>
  );
}
