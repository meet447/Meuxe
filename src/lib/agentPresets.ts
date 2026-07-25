/** ACP CLI agent presets (shared by Onboarding + Settings). */

export type AcpAgentPresetId = "opencode" | "claude" | "codex" | "custom";

export const ACP_AGENT_PRESETS: Record<
  AcpAgentPresetId,
  { title: string; blurb: string }
> = {
  opencode: {
    title: "OpenCode",
    blurb: "Open-source coding agent — runs as opencode acp (install the opencode CLI first).",
  },
  claude: {
    title: "Claude Code",
    blurb: "Anthropic adapter via npx @agentclientprotocol/claude-agent-acp — sign in with the CLI.",
  },
  codex: {
    title: "Codex",
    blurb: "OpenAI Codex via npx @agentclientprotocol/codex-acp.",
  },
  custom: {
    title: "Custom agent",
    blurb: "Any ACP-compatible command on your machine.",
  },
};

export const ACP_AGENT_PRESET_IDS: AcpAgentPresetId[] = [
  "opencode",
  "claude",
  "codex",
  "custom",
];
