import type { ReactNode } from "react";
import { MeuxeMark, Mascot } from "../ui";
import type { MascotMood } from "../ui";
import { cn } from "../ui/cn";

const STEP_LABELS = ["Start", "You", "Companion", "Voice", "Connect"];

const STEP_HEADINGS = [
  "A companion on your desktop",
  "First, your name",
  "Meet them",
  "How they sound",
  "Who answers for them?",
  "See you on the desktop",
];

const STEP_SUBTITLES = [
  "Talk to someone who remembers you. They live on your computer—not in a generic chat app.",
  "So they know who they're talking to. Only saved on this device.",
  "Name, look, and personality—in one place.",
  "Pick a voice and tap listen.",
  "Meuxe is the face and memory. Choose the assistant on your computer that powers chat.",
  "",
];

const MASCOT_BY_STEP: MascotMood[] = [
  "neutral",
  "happy",
  "surprised",
  "neutral",
  "thinking",
  "happy",
];

export function OnboardingShell({
  step,
  preview,
  children,
}: {
  step: number;
  preview?: ReactNode;
  children: ReactNode;
}) {
  const isDone = step >= 5;
  const showPreview = preview && step >= 2 && step <= 3;
  const mascotMood = MASCOT_BY_STEP[Math.min(step, 5)];

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-surface scrollbar-thin">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <MeuxeMark className="h-7 w-7" />
          <span className="text-sm font-semibold text-ink">Meuxe</span>
        </div>
        {!isDone && (
          <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 5`}>
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-ink" : "w-1.5",
                  i < step ? "bg-ink-3" : i === step ? "" : "bg-well-2",
                )}
              />
            ))}
          </div>
        )}
      </header>

      <div
        key={step}
        className="mx-auto w-full max-w-[560px] animate-rise-in px-6 pb-24 pt-10 sm:pt-16"
      >
        <div className="text-center">
          <Mascot mood={mascotMood} className="mx-auto h-14 w-14" />
          {!isDone && (
            <p className="mt-3 text-[12px] text-ink-3">
              Step {step + 1} of 5 · {STEP_LABELS[step]}
            </p>
          )}
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">
            {STEP_HEADINGS[Math.min(step, 5)]}
          </h1>
          {STEP_SUBTITLES[step] && (
            <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">
              {STEP_SUBTITLES[step]}
            </p>
          )}
        </div>

        <div className="mt-8">
          {showPreview && <div className="mb-6">{preview}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}
