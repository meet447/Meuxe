import { cn } from "./cn";

export type MascotMood = "neutral" | "happy" | "thinking" | "sleepy" | "surprised";
export type MascotTone = "warm" | "light" | "peach";

const BODY: Record<MascotTone, string> = {
  warm: "var(--color-accent-300)",
  light: "var(--color-accent-100)",
  peach: "var(--color-peach-200)",
};

const GAZE: Record<MascotMood, { x: number; y: number }> = {
  neutral: { x: 0, y: 0 },
  happy: { x: 0, y: 0 },
  thinking: { x: 1.6, y: -1.8 },
  sleepy: { x: 0, y: 1 },
  surprised: { x: 0, y: 0 },
};

/**
 * The Meuxe blob — a soft, wide-eyed mascot used for the logo mark,
 * empty states and loading moments. Purely decorative (aria-hidden).
 */
export function Mascot({
  mood = "neutral",
  tone = "warm",
  animated = true,
  className = "h-16 w-16",
}: {
  mood?: MascotMood;
  tone?: MascotTone;
  animated?: boolean;
  className?: string;
}) {
  const gaze = GAZE[mood];
  const ink = "var(--color-ink)";
  const blushOpacity = mood === "happy" ? 0.45 : 0.3;
  const eyeRy = mood === "sleepy" ? 3.4 : mood === "surprised" ? 8 : 7;
  const eyeRx = mood === "surprised" ? 6.5 : 6;
  const pupilR = mood === "sleepy" ? 2.3 : mood === "surprised" ? 3.6 : 3.2;

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("overflow-visible", animated && "motion-safe:animate-breathe", className)}
      style={{ transformOrigin: "50% 60%" }}
      aria-hidden
    >
      <path
        d="M32 7C44 6 56 14 56 27c0 13-6 26-22 29C18 59 7 47 8 33 9 19 20 8 32 7Z"
        fill={BODY[tone]}
      />
      <ellipse cx="24" cy="19" rx="9" ry="5.5" fill="white" opacity="0.22" />

      <circle cx="16.5" cy="39.5" r="3.4" fill="var(--color-peach-400)" opacity={blushOpacity} />
      <circle cx="47.5" cy="39.5" r="3.4" fill="var(--color-peach-400)" opacity={blushOpacity} />

      {mood === "happy" ? (
        <g stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d="M17.5 32.5Q23 26 28.5 32.5" />
          <path d="M35.5 32.5Q41 26 46.5 32.5" />
        </g>
      ) : (
        <g
          className={cn(animated && "motion-safe:animate-blink")}
          style={{ transformOrigin: "32px 31px" }}
        >
          <ellipse cx="23" cy="31" rx={eyeRx} ry={eyeRy} fill="white" />
          <ellipse cx="41" cy="31" rx={eyeRx} ry={eyeRy} fill="white" />
          <circle cx={23 + gaze.x} cy={32 + gaze.y} r={pupilR} fill={ink} />
          <circle cx={41 + gaze.x} cy={32 + gaze.y} r={pupilR} fill={ink} />
          <circle cx={24.3 + gaze.x} cy={30.6 + gaze.y} r="1.05" fill="white" />
          <circle cx={42.3 + gaze.x} cy={30.6 + gaze.y} r="1.05" fill="white" />
        </g>
      )}

      {mood === "surprised" ? (
        <circle cx="32" cy="44.5" r="2.3" fill={ink} opacity="0.85" />
      ) : (
        <path
          d={
            mood === "happy"
              ? "M25 41Q32 49 39 41"
              : mood === "thinking"
                ? "M29 44.2Q32 42.6 35 44.2"
                : mood === "sleepy"
                  ? "M29 43Q32 45 35 43"
                  : "M27.5 42.5Q32 46.2 36.5 42.5"
          }
          stroke={ink}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      )}
    </svg>
  );
}
