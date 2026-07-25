import type { ReactNode } from "react";
import { MeuxeMark } from "../ui/MeuxeMark";

const STEP_LABELS = ["Start", "You", "Companion", "Voice", "Connect"];

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

  return (
    <div className="relative min-h-screen overflow-y-auto bg-gradient-to-b from-indigo-50/80 via-white to-slate-50">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[15%] top-[-10%] h-[45%] w-[45%] rounded-full bg-indigo-200/30 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-blue-200/25 blur-[120px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center gap-2.5">
          <MeuxeMark className="h-9 w-9" />
          <span className="text-sm font-bold tracking-tight text-slate-800">Meuxe setup</span>
        </div>

        {step < 5 && (
          <div className="mb-6 w-full max-w-4xl">
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-1 sm:gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        i === step
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30"
                          : i < step
                            ? "bg-indigo-100 text-indigo-700"
                            : "border border-slate-200 bg-white text-slate-400"
                      }`}
                    >
                      {i < step ? "✓" : i + 1}
                    </div>
                    <span
                      className={`hidden text-[10px] font-semibold sm:block ${
                        i === step ? "text-indigo-600" : i < step ? "text-indigo-400" : "text-slate-400"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div
                      className={`mb-4 h-0.5 w-5 sm:mb-5 sm:w-8 rounded-full ${i < step ? "bg-indigo-300" : "bg-slate-200"}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className={`w-full max-w-4xl ${showPreview ? "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,300px)_1fr] lg:items-start lg:gap-6" : ""}`}
        >
          {showPreview && <div className="w-full max-w-sm mx-auto lg:max-w-none lg:sticky lg:top-8">{preview}</div>}
          <div className="rounded-[2rem] border border-white/90 bg-white/95 p-6 shadow-[0_8px_40px_rgb(0,0,0,0.06)] ring-1 ring-slate-100/90 sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
