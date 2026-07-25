import type { AcpAgentPresetId } from "./agentPresets";

/**
 * Bundled favicons (sourced from official sites at build time).
 * opencode → opencode.ai, claude → claude.ai, codex → openai.com, custom → agentclientprotocol.com
 */
export const AGENT_PRESET_ICON_SRC: Record<AcpAgentPresetId, string> = {
  opencode: "/agents/opencode.png",
  claude: "/agents/claude.png",
  codex: "/agents/codex.png",
  custom: "/agents/custom.png",
};
