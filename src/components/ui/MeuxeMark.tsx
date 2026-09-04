import { cn } from "./cn";
import { Mascot } from "./Mascot";

/**
 * App mark: pastel amber squircle holding the mascot. Sizes via `className`
 * (default h-12 w-12). Use `plain` for a flat, non-elevated version.
 */
export function MeuxeMark({
  className = "h-12 w-12",
  plain = false,
}: {
  className?: string;
  plain?: boolean;
}) {
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
