/** ACP CLI agent presets (shared by Onboarding + Settings). */

export type AcpAgentPresetId = "opencode" | "claude" | "codex" | "custom";

export const ACP_AGENT_PRESETS: Record<
  AcpAgentPresetId,
  { title: string; tagline: string; blurb: string }
> = {
  opencode: {
    title: "OpenCode",
    tagline: "Free and open source",
    blurb: "Installs with one command. No account needed to start.",
  },
  claude: {
    title: "Claude Code",
    tagline: "By Anthropic",
    blurb: "Uses your Claude subscription. Sign in in the terminal when prompted.",
  },
  codex: {
    title: "Codex",
    tagline: "By OpenAI",
    blurb: "Uses your OpenAI account. Sign in when prompted.",
  },
  custom: {
    title: "Custom",
    tagline: "Bring your own",
    blurb: "Point Meuxe at any compatible assistant already on your machine.",
  },
};

export const ACP_AGENT_PRESET_IDS: AcpAgentPresetId[] = [
  "opencode",
  "claude",
  "codex",
  "custom",
];
