/**
 * Human-readable relative time for ISO timestamps or elapsed seconds.
 */
export function relativeTime(input: string | number, now: Date = new Date()): string {
  const diffSeconds =
    typeof input === "number"
      ? Math.max(0, Math.floor(input))
      : Math.max(0, Math.floor((now.getTime() - new Date(input).getTime()) / 1000));

  if (diffSeconds < 60) return "just now";

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) {
    return `${days} days ago`;
  }

  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}
