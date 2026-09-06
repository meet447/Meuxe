import type { AgentSetupStatusResponse } from "../../api/tauri";
import { ACP_AGENT_PRESET_IDS, type AcpAgentPresetId } from "../../lib/agentPresets";
import { AgentPresetCard } from "../agents/AgentPresetCard";
import { AgentSetupPanel } from "../agents/AgentSetupPanel";
import { ChoiceCard, Field, Input, SectionTitle } from "../ui";

export interface AgentSectionValue {
  preset: AcpAgentPresetId;
  program: string;
  args: string;
  auto_approve_tools: boolean;
}

type Props = {
  value: AgentSectionValue;
  onChange: (next: AgentSectionValue) => void;
  onAgentSetupStatus?: (
    status: AgentSetupStatusResponse | null,
    loading: boolean,
    error?: string,
  ) => void;
  friendly?: boolean;
  showToolPermissions?: boolean;
};

export function AgentSection({
  value,
  onChange,
  onAgentSetupStatus,
  friendly = false,
  showToolPermissions = true,
}: Props) {
  const patch = <K extends keyof AgentSectionValue>(field: K, fieldValue: AgentSectionValue[K]) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="space-y-6">
      <div className={friendly ? "mb-4 grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3"}>
        {ACP_AGENT_PRESET_IDS.map((id) => (
          <AgentPresetCard
            key={id}
            id={id}
            selected={value.preset === id}
            onSelect={() => patch("preset", id)}
          />
        ))}
      </div>

      {value.preset === "custom" && (
        <>
          <Field label={friendly ? "Program to run" : "Command"}>
            <Input
              type="text"
              value={value.program}
              onChange={(event) => patch("program", event.target.value)}
              placeholder={friendly ? "Path or command" : "e.g. python my_agent.py"}
            />
          </Field>
          <Field label={friendly ? "Extra options" : "Arguments (optional)"} optional={friendly}>
            <Input
              type="text"
              value={value.args}
              onChange={(event) => patch("args", event.target.value)}
              placeholder={friendly ? "Optional flags" : "space-separated flags"}
            />
          </Field>
        </>
      )}

      {value.preset !== "custom" && (
        <AgentSetupPanel
          preset={value.preset}
          onStatusChange={onAgentSetupStatus}
          friendly={friendly}
        />
      )}

      {showToolPermissions && (
        <Field
          label="Tool permissions"
          hint="Agents ask before reading files or running commands. Choose whether Meuxe answers for you."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard
              compact
              selected={value.auto_approve_tools}
              onClick={() => patch("auto_approve_tools", true)}
              title="Allow automatically"
              description="Smoother chats; the companion can help without interruptions."
            />
            <ChoiceCard
              compact
              selected={!value.auto_approve_tools}
              onClick={() => patch("auto_approve_tools", false)}
              title="Ask me each time"
              description="Every tool request shows an Allow / Deny prompt in the chat."
            />
          </div>
        </Field>
      )}
    </div>
  );
}
