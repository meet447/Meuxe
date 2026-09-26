export function StageEmptyState({
  characterName,
}: {
  characterName: string;
  agentReady?: boolean;
  onOpenSettings?: () => void;
}) {
  return (
    <p className="pointer-events-none text-center text-[13px] text-ink-3">
      Say hello to {characterName}
    </p>
  );
}
