/** ACP CLI agent presets (shared by Onboarding + Settings). */

export type AcpAgentPresetId = "claude" | "codex" | "custom";

export const ACP_AGENT_PRESETS: Record<
  AcpAgentPresetId,
  { title: string; blurb: string }
> = {
  claude: {
    title: "Claude Code",
    blurb: "Anthropic's coding agent — sign in with the CLI on your machine.",
  },
  codex: {
    title: "Codex",
    blurb: "OpenAI Codex agent via the official CLI.",
  },
  custom: {
    title: "Custom agent",
    blurb: "Any ACP-compatible command you run locally.",
  },
};

export const ACP_AGENT_PRESET_IDS: AcpAgentPresetId[] = ["claude", "codex", "custom"];
