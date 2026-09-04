import type { ReactNode } from "react";
import { AsciiAccent, CheckIcon, MeuxeMark, Mascot, Surface } from "../ui";
import type { MascotMood } from "../ui";
import { cn } from "../ui/cn";

const STEP_LABELS = ["Start", "You", "Companion", "Voice", "Connect"];

const STEP_DESCRIPTIONS = [
  "What Meuxe is",
  "Your name",
  "Name, look, personality",
  "How they sound",
  "Who powers chat",
];

const MASCOT_BY_STEP: { mood: MascotMood; caption: string }[] = [
  { mood: "neutral", caption: "Hi there." },
  { mood: "happy", caption: "Nice to meet you." },
  { mood: "surprised", caption: "Ooh, who's this?" },
  { mood: "neutral", caption: "Say something…" },
  { mood: "thinking", caption: "Almost there." },
  { mood: "happy", caption: "See you on the desktop." },
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
  const showPreview = preview && step >= 2 && step <= 3;
  const mascot = MASCOT_BY_STEP[Math.min(step, 5)];

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-canvas scrollbar-thin">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:flex lg:flex-col">
            <div className="flex items-center gap-2.5">
              <MeuxeMark className="h-9 w-9" />
              <div>
                <div className="text-[15px] font-bold tracking-tight text-ink">Meuxe</div>
                <div className="text-xs text-ink-3">Setup</div>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <AsciiAccent rows={22} cols={5} density={1} fade="end" className="shrink-0" />
              <div className="min-w-0 flex-1">
                {STEP_LABELS.map((label, i) => {
                  const isCurrent = i === step && step < 5;
                  const isDone = i < step || step >= 5;
                  const isUpcoming = !isCurrent && !isDone;

                  return (
                    <div key={label} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            isCurrent && "bg-accent-500 text-white",
                            isDone && "bg-sage-100 text-sage-700",
                            isUpcoming && "bg-well text-ink-4",
                          )}
                        >
                          {isDone ? <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.4} /> : i + 1}
                        </div>
                        {i < STEP_LABELS.length - 1 && (
                          <div
                            className={cn(
                              "my-1 w-px min-h-5 flex-1",
                              isDone ? "bg-sage-200" : "bg-line-2",
                            )}
                          />
                        )}
                      </div>
                      <div className={cn("pb-5", i === STEP_LABELS.length - 1 && "pb-0")}>
                        <div
                          className={cn(
                            "text-sm font-semibold",
                            isCurrent && "text-ink",
                            isDone && "text-ink-2",
                            isUpcoming && "text-ink-4",
                          )}
                        >
                          {label}
                        </div>
                        <div className="text-xs text-ink-3">{STEP_DESCRIPTIONS[i]}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-12 flex items-center gap-3">
              <Mascot mood={mascot.mood} className="h-16 w-16 shrink-0" />
              <p className="text-sm text-ink-2">{mascot.caption}</p>
            </div>
          </aside>

          <div className="min-w-0">
            {step < 5 && (
              <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
                {STEP_LABELS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      i === step ? "w-6 bg-accent-500" : "w-2",
                      i < step ? "bg-sage-200" : i === step ? "" : "bg-well",
                    )}
                  />
                ))}
              </div>
            )}

            <Surface radius="sheet" tone="surface" elevation="float" className="p-7 sm:p-9">
              {showPreview ? (
                <div className="md:grid md:grid-cols-[minmax(0,240px)_1fr] md:gap-8">
                  <div className="mb-6 md:mb-0 md:sticky md:top-0">{preview}</div>
                  <div>{children}</div>
                </div>
              ) : (
                children
              )}
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}
