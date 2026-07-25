import { useState } from "react";
import type { AcpAgentPresetId } from "../../lib/agentPresets";
import { AGENT_PRESET_ICON_SRC } from "../../lib/agentIcons";

function FallbackGlyph({ id, className }: { id: AcpAgentPresetId; className: string }) {
  if (id === "custom") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-6-6h12" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function AgentPresetIcon({
  id,
  size = "md",
}: {
  id: AcpAgentPresetId;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);

  const dim =
    size === "sm" ? "h-10 w-10 rounded-2xl" : size === "lg" ? "h-14 w-14 rounded-[1.25rem]" : "h-12 w-12 rounded-2xl";
  const imgPad = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-9 w-9";
  const glyph = size === "sm" ? "h-5 w-5" : size === "lg" ? "h-7 w-7" : "h-6 w-6";

  const showImage = !failed;

  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-slate-200/90 bg-white shadow-sm ${dim}`}
      aria-hidden
    >
      {showImage ? (
        <img
          src={AGENT_PRESET_ICON_SRC[id]}
          alt=""
          className={`${imgPad} object-contain`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[inherit] bg-slate-100 text-slate-500">
          <FallbackGlyph id={id} className={glyph} />
        </div>
      )}
    </div>
  );
}
