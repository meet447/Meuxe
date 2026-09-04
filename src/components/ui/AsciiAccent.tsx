import { useMemo } from "react";
import { cn } from "./cn";

const GLYPHS = [" ", " ", "·", "·", "∙", "•", "◦", "°", ":", "∘"] as const;

function hash(seed: number, r: number, c: number) {
  const v = Math.sin(seed * 12.9898 + r * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Stippled text-art strip — the "craft-hacker" accent. Deterministic for a
 * given seed so it never flickers between renders. Decorative only.
 *
 * `direction="vertical"` renders a tall narrow column (sidebar rail);
 * `"horizontal"` renders a short wide band (section dividers, headers).
 */
export function AsciiAccent({
  rows = 28,
  cols = 7,
  seed = 3,
  density = 1,
  fade = "both",
  className,
}: {
  rows?: number;
  cols?: number;
  seed?: number;
  /** 0..1 multiplier on how many dark glyphs appear */
  density?: number;
  /** Where the pattern thins out to nothing */
  fade?: "none" | "start" | "end" | "both";
  className?: string;
}) {
  const text = useMemo(() => {
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      const t = rows <= 1 ? 0.5 : r / (rows - 1);
      let envelope = 1;
      if (fade === "start") envelope = t;
      else if (fade === "end") envelope = 1 - t;
      else if (fade === "both") envelope = Math.sin(t * Math.PI);
      // A slow wave gives the strip a woven, textile-like rhythm.
      const wave = 0.65 + 0.35 * Math.sin(t * Math.PI * 2.4 + seed);
      let line = "";
      for (let c = 0; c < cols; c++) {
        const n = hash(seed, r, c) * envelope * wave * density;
        const idx = Math.min(GLYPHS.length - 1, Math.floor(n * GLYPHS.length * 1.15));
        line += GLYPHS[idx];
      }
      lines.push(line);
    }
    return lines.join("\n");
  }, [rows, cols, seed, density, fade]);

  return (
    <pre aria-hidden className={cn("ascii-strip text-ink-4", className)}>
      {text}
    </pre>
  );
}
