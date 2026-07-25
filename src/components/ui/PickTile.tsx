export function PickTile({
  emoji,
  title,
  hint,
  selected,
  onClick,
}: {
  emoji: string;
  title: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all ${
        selected
          ? "border-blue-400 bg-blue-50 shadow-sm shadow-blue-500/10 ring-1 ring-blue-200/70"
          : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
          selected ? "bg-white shadow-sm" : "bg-slate-50"
        }`}
      >
        {emoji}
      </span>
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${selected ? "text-blue-800" : "text-slate-800"}`}>{title}</div>
        {hint && (
          <div className={`text-xs leading-snug ${selected ? "text-blue-600/80" : "text-slate-400"}`}>{hint}</div>
        )}
      </div>
    </button>
  );
}
