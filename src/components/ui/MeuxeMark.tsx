import { cn } from "./cn";
import { Mascot } from "./Mascot";

/**
 * App mark: caramel squircle holding the mascot. Sizes via `className`
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
        "squircle flex shrink-0 items-center justify-center rounded-[30%] bg-accent-500",
        !plain && "shadow-soft",
        className,
      )}
      aria-hidden
    >
      <Mascot tone="light" animated={false} className="h-[72%] w-[72%] translate-y-[3%]" />
    </div>
  );
}
