import { ACP_AGENT_PRESETS, type AcpAgentPresetId } from "../../lib/agentPresets";
import { ChoiceCard } from "../ui";
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
    <ChoiceCard
      selected={selected}
      onClick={onSelect}
      compact={compact}
      leading={<AgentPresetIcon id={id} size="sm" bare />}
      title={preset.title}
      description={preset.tagline}
    />
  );
}
