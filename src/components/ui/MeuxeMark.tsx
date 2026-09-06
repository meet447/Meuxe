import { cn } from "./cn";
import { Mascot } from "./Mascot";

/**
 * App mark: pastel amber squircle holding the mascot. Sizes via `className`
 * (default h-12 w-12). Use `plain` for a flat, non-elevated version, or `bare`
 * to render just the mascot with no background or border.
 */
export function MeuxeMark({
  className = "h-12 w-12",
  plain = false,
  bare = false,
}: {
  className?: string;
  plain?: boolean;
  bare?: boolean;
}) {
  if (bare) {
    return <Mascot tone="warm" animated={false} className={cn("shrink-0", className)} />;
  }

  return (
    <div
      className={cn(
        "squircle flex shrink-0 items-center justify-center rounded-[30%] bg-accent-100",
        !plain && "shadow-soft",
        className,
      )}
      aria-hidden
    >
      <Mascot tone="warm" animated={false} className="h-[74%] w-[74%] translate-y-[3%]" />
    </div>
  );
}
