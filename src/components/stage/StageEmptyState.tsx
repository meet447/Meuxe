import { Mascot, Button } from "../ui";

export function StageEmptyState({
  characterName,
  agentReady,
  onOpenSettings,
}: {
  characterName: string;
  agentReady: boolean;
  onOpenSettings: () => void;
}) {
  if (!agentReady) {
    return (
      <div className="pointer-events-auto squircle flex w-full max-w-xl items-center gap-3 rounded-card bg-surface-2/95 px-3 py-2 shadow-float backdrop-blur">
        <Mascot mood="thinking" className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">Your assistant isn&apos;t ready yet</p>
          <p className="truncate text-xs text-ink-3">
            Chat needs an assistant on this computer. Install one in Settings, then say hello to{" "}
            {characterName}.
          </p>
        </div>
        <Button variant="primary" size="sm" className="shrink-0" onClick={onOpenSettings}>
          Open settings
        </Button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none squircle flex w-full max-w-xl items-center gap-3 rounded-card bg-surface-2/95 px-3 py-2 shadow-float backdrop-blur">
      <Mascot mood="neutral" className="h-8 w-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">Say hello to {characterName}</p>
        <p className="truncate text-xs text-ink-3">
          Share what&apos;s on your mind: a small update, a worry, or just because you want to talk.
        </p>
      </div>
    </div>
  );
}
