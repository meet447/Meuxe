import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-soft";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-white shadow-soft hover:bg-ink-2 active:translate-y-px disabled:hover:bg-ink",
  secondary:
    "bg-surface-2 text-ink shadow-soft hover:bg-well active:translate-y-px",
  soft: "bg-accent-100 text-accent-700 hover:bg-accent-200 active:translate-y-px",
  ghost: "text-ink-2 hover:bg-well hover:text-ink",
  danger: "bg-clay-500 text-white shadow-soft hover:bg-clay-700 active:translate-y-px",
  "danger-soft": "bg-clay-100 text-clay-700 hover:bg-clay-200 active:translate-y-px",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-[10px] px-3 text-[13px]",
  md: "h-10 gap-2 rounded-control px-4 text-sm",
  lg: "h-12 gap-2 rounded-field px-5 text-[15px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  leading,
  trailing,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "squircle inline-flex items-center justify-center font-semibold whitespace-nowrap transition-all duration-150 select-none disabled:opacity-45 disabled:active:translate-y-0",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : leading}
      {children}
      {!loading && trailing}
    </button>
  );
}

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 w-8 rounded-[10px]",
  md: "h-10 w-10 rounded-control",
  lg: "h-11 w-11 rounded-field",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: Exclude<ButtonVariant, "danger">;
  size?: ButtonSize;
  active?: boolean;
}

/** Square icon-only button. `label` becomes both aria-label and tooltip. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  active = false,
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        "squircle inline-flex shrink-0 items-center justify-center transition-all duration-150 disabled:opacity-45",
        active ? "bg-accent-100 text-accent-700 hover:bg-accent-100" : VARIANT[variant],
        ICON_SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70",
        className,
      )}
      aria-hidden
    />
  );
}
