import { memo } from "react";
import { Dots, Mascot, Surface } from "./ui";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  subMessage?: string;
  variant?: "default" | "model" | "chat" | "tts";
}

const VARIANT_COLOR = {
  default: "text-accent-500",
  model: "text-peach-500",
  chat: "text-honey-500",
  tts: "text-sage-500",
} as const;

export const LoadingOverlay = memo(function LoadingOverlay({
  visible,
  message = "Loading...",
  subMessage,
  variant = "default",
}: LoadingOverlayProps) {
  if (!visible) return null;

  const color = VARIANT_COLOR[variant];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface/60 backdrop-blur-sm">
      <Surface
        tone="raised"
        elevation="float"
        radius="panel"
        className="flex flex-col items-center gap-3 px-8 py-7"
      >
        <Mascot mood="sleepy" className="h-14 w-14" />
        <div className="text-sm font-semibold text-ink">{message}</div>
        {subMessage && <div className="text-xs text-ink-3">{subMessage}</div>}
        <Dots />
        <svg
          data-testid="loading-spinner"
          className={`h-12 w-12 animate-spin ${color}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </Surface>
    </div>
  );
});

interface PulsingDotProps {
  color?: string;
}

export const PulsingDot = memo(function PulsingDot({ color = "bg-accent-400" }: PulsingDotProps) {
  return <span className={`h-2 w-2 rounded-full ${color} animate-pulse-soft`} />;
});

export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce" />
    </div>
  );
});
