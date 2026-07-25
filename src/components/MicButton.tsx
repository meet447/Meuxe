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
      className={`rounded-full transition-all duration-200 ${
        stage ? "p-2" : "p-2.5"
      } ${
        listening
          ? stage
            ? "bg-red-500/20 text-red-400 mic-pulse-ring"
            : "bg-red-100 text-red-500 mic-pulse-ring shadow-sm shadow-red-500/20 scale-110"
          : stage
            ? "text-white/50 hover:bg-white/10 hover:text-white"
            : "text-slate-400 hover:text-blue-500 hover:bg-blue-50 hover:scale-110 active:scale-95"
      }`}
      title={listening ? "Stop listening" : "Start voice input"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
        <path d="M17 11a1 1 0 10-2 0 3 3 0 01-6 0 1 1 0 10-2 0 5 5 0 004 4.9V19H9a1 1 0 100 2h6a1 1 0 100-2h-2v-3.1A5 5 0 0017 11z" />
      </svg>
    </button>
  );
}
