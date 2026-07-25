/** ACP CLI agent presets (shared by Onboarding + Settings). */

export type AcpAgentPresetId = "opencode" | "claude" | "codex" | "custom";

export const ACP_AGENT_PRESETS: Record<
  AcpAgentPresetId,
  { title: string; tagline: string; blurb: string }
> = {
  opencode: {
    title: "OpenCode",
    tagline: "Open-source CLI agent",
    blurb: "Runs as opencode acp. Install the OpenCode CLI or use Meuxe’s installer.",
  },
  claude: {
    title: "Claude Code",
    tagline: "Anthropic’s coding agent",
    blurb: "ACP adapter via npx. Sign in in the terminal when prompted.",
  },
  codex: {
    title: "Codex",
    tagline: "OpenAI coding agent",
    blurb: "ACP adapter via npx @agentclientprotocol/codex-acp.",
  },
  custom: {
    title: "Custom",
    tagline: "Your own ACP command",
    blurb: "Any ACP-compatible program on your machine.",
  },
};

export const ACP_AGENT_PRESET_IDS: AcpAgentPresetId[] = [
  "opencode",
  "claude",
  "codex",
  "custom",
];
