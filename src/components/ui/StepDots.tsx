import { cn } from "./cn";

export function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === current ? "w-5 bg-ink" : "w-1.5",
            i < current ? "bg-ink-3" : i === current ? "" : "bg-well-2",
          )}
        />
      ))}
    </div>
  );
}
