import { useState } from "react";
import type { AcpAgentPresetId } from "../../lib/agentPresets";
import { AGENT_PRESET_ICON_SRC } from "../../lib/agentIcons";
import { SparkIcon, TerminalIcon } from "../ui/icons";
import { cn } from "../ui/cn";

export function AgentPresetIcon({
  id,
  size = "md",
  bare = false,
}: {
  id: AcpAgentPresetId;
  size?: "sm" | "md" | "lg";
  bare?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const dim =
    size === "sm"
      ? "h-10 w-10 rounded-[13px]"
      : size === "lg"
        ? "h-14 w-14 rounded-[18px]"
        : "h-12 w-12 rounded-[15px]";
  const imgPad = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-9 w-9";
  const glyph = size === "sm" ? "h-5 w-5" : size === "lg" ? "h-7 w-7" : "h-6 w-6";

  const showImage = !failed;

  const Fallback = id === "custom" ? TerminalIcon : SparkIcon;

  if (bare) {
    if (showImage) {
      return (
        <img
          src={AGENT_PRESET_ICON_SRC[id]}
          alt=""
          className={cn(imgPad, "object-contain")}
          onError={() => setFailed(true)}
        />
      );
    }
    return <Fallback className={cn(glyph, "text-ink-3")} />;
  }

  return (
    <div
      className={cn(
        "squircle flex shrink-0 items-center justify-center bg-surface-2 shadow-soft",
        dim,
      )}
      aria-hidden
    >
      {showImage ? (
        <img
          src={AGENT_PRESET_ICON_SRC[id]}
          alt=""
          className={cn(imgPad, "object-contain")}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[inherit] bg-well text-ink-3">
          <Fallback className={glyph} />
        </div>
      )}
    </div>
  );
}
