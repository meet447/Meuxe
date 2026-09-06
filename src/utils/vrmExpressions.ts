const VRM_EXPRESSION_ALIASES: Record<string, string> = {
  happy: "happy",
  joy: "happy",
  angry: "angry",
  sad: "sad",
  sorrow: "sad",
  relaxed: "relaxed",
  fun: "relaxed",
  surprised: "surprised",
  neutral: "",
};

/** Map a requested face name onto the expression the loaded VRM actually exposes. */
export function resolveVrmExpressionName(requested: string, available: string[]): string {
  const key = requested.trim().toLowerCase();
  const mapped = Object.prototype.hasOwnProperty.call(VRM_EXPRESSION_ALIASES, key)
    ? VRM_EXPRESSION_ALIASES[key]
    : requested.trim();
  if (!mapped) return "";
  const byMapped = available.find((name) => name.toLowerCase() === mapped.toLowerCase());
  if (byMapped) return byMapped;
  const byRaw = available.find((name) => name.toLowerCase() === key);
  return byRaw ?? mapped;
}
