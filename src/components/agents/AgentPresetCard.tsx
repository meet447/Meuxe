import { ACP_AGENT_PRESETS, type AcpAgentPresetId } from "../../lib/agentPresets";
import { AgentPresetIcon } from "./AgentPresetIcon";

export function AgentPresetCard({
  id,
  selected,
  onSelect,
  compact,
}: {
  id: AcpAgentPresetId;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const preset = ACP_AGENT_PRESETS[id];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all ${
        selected
          ? "border-violet-400 bg-violet-50/90 shadow-sm shadow-violet-500/10 ring-1 ring-violet-200/80"
          : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-sm"
      } ${compact ? "" : "sm:p-4"}`}
    >
      <AgentPresetIcon id={id} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className={`font-semibold ${selected ? "text-violet-900" : "text-slate-800"}`}>
          {preset.title}
        </div>
        <div
          className={`mt-0.5 text-xs leading-snug ${selected ? "text-violet-700/85" : "text-slate-500"}`}
        >
          {preset.tagline}
        </div>
      </div>
      {selected && (
        <div className="mt-1 text-violet-500">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}
