import { MicIcon, cn } from "./ui";

interface Props {
  listening: boolean;
  onToggle: () => void;
  variant?: "default" | "stage";
}

export function MicButton({ listening, onToggle, variant = "default" }: Props) {
  const stage = variant === "stage";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={listening ? "Stop listening" : "Start voice input"}
      className={cn(
        "flex items-center justify-center rounded-full transition-all",
        stage ? "h-9 w-9" : "h-10 w-10",
        listening
          ? "bg-peach-100 text-peach-500 animate-listen-ring"
          : "text-ink-3 hover:bg-well hover:text-ink",
      )}
      title={listening ? "Stop listening" : "Start voice input"}
    >
      <MicIcon className="h-5 w-5" />
    </button>
  );
}
