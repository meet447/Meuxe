import type { AcpAgentPresetId } from "../../lib/agentPresets";

const tileClass: Record<AcpAgentPresetId, string> = {
  opencode: "from-slate-800 to-slate-900 text-white shadow-slate-900/25",
  claude: "from-[#d97757] to-[#c45c3e] text-white shadow-orange-500/25",
  codex: "from-emerald-600 to-teal-700 text-white shadow-emerald-600/25",
  custom: "from-violet-500 to-indigo-600 text-white shadow-violet-500/25",
};

export function AgentPresetIcon({
  id,
  size = "md",
}: {
  id: AcpAgentPresetId;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "h-10 w-10 rounded-2xl" : size === "lg" ? "h-14 w-14 rounded-[1.25rem]" : "h-12 w-12 rounded-2xl";
  const glyph = size === "sm" ? "h-5 w-5" : size === "lg" ? "h-7 w-7" : "h-6 w-6";

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br shadow-md ${dim} ${tileClass[id]}`}
      aria-hidden
    >
      {id === "opencode" && (
        <svg className={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />
        </svg>
      )}
      {id === "claude" && (
        <svg className={glyph} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2c.4 3.2 2.4 5.8 5.2 7.1-2.8 1.3-4.8 3.9-5.2 7.1-.4-3.2-2.4-5.8-5.2-7.1C9.6 7.8 11.6 5.2 12 2z" />
        </svg>
      )}
      {id === "codex" && (
        <svg className={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8h12M6 12h8M6 16h10" />
          <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="2" />
        </svg>
      )}
      {id === "custom" && (
        <svg className={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      )}
    </div>
  );
}
