import { toolkitBySlug, toolkitDisplayName } from "./composioToolkits";

export interface ToolVisualMeta {
  label: string;
  color: string;
  toolkitSlug?: string;
  iconPath?: string;
}

const LOCAL_COMPOSIO_TOOLS: Record<string, ToolVisualMeta> = {
  composio_sync_github_readme: {
    label: "Sync GitHub README",
    color: "slate",
    toolkitSlug: "github",
    iconPath:
      "M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.12-1.46-1.12-1.46-.92-.63.07-.62.07-.62 1.02.07 1.56 1.05 1.56 1.05.9 1.55 2.36 1.1 2.94.84.09-.66.35-1.1.64-1.35-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0112 6.8c.85.004 1.71.11 2.51.32 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.16.58.67.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z",
  },
  composio_sync_gmail: {
    label: "Sync Gmail",
    color: "red",
    toolkitSlug: "gmail",
    iconPath:
      "M4 6h16v12H4V6zm2 2v8h12V8l-6 4-6-4zm0-2l6 4 6-4H6z",
  },
};

const TOOLKIT_PREFIXES: Array<{ prefix: string; slug: string }> = [
  { prefix: "GITHUB_", slug: "github" },
  { prefix: "GMAIL_", slug: "gmail" },
  { prefix: "SLACK_", slug: "slack" },
  { prefix: "NOTION_", slug: "notion" },
  { prefix: "GOOGLECALENDAR_", slug: "googlecalendar" },
  { prefix: "GOOGLEDRIVE_", slug: "googledrive" },
  { prefix: "LINEAR_", slug: "linear" },
  { prefix: "JIRA_", slug: "jira" },
  { prefix: "DISCORD_", slug: "discord" },
  { prefix: "TRELLO_", slug: "trello" },
  { prefix: "ASANA_", slug: "asana" },
  { prefix: "DROPBOX_", slug: "dropbox" },
];

function humanizeToolSlug(toolName: string): string {
  return toolName
    .replace(/^[A-Z]+_/, "")
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function resolveComposioToolMeta(toolName: string): ToolVisualMeta | null {
  if (LOCAL_COMPOSIO_TOOLS[toolName]) {
    return LOCAL_COMPOSIO_TOOLS[toolName];
  }

  if (toolName.startsWith("composio_")) {
    const slug = toolName.slice("composio_".length).toUpperCase();
    const prefixMatch = TOOLKIT_PREFIXES.find((entry) => slug.startsWith(entry.prefix));
    if (prefixMatch) {
      const toolkit = toolkitBySlug(prefixMatch.slug);
      return {
        label: `${toolkit?.name ?? toolkitDisplayName(prefixMatch.slug)} · ${humanizeToolSlug(slug)}`,
        color: toolkit?.color ?? "slate",
        toolkitSlug: prefixMatch.slug,
      };
    }
  }

  const normalized = toolName.toUpperCase();
  const prefixMatch = TOOLKIT_PREFIXES.find((entry) => normalized.startsWith(entry.prefix));
  if (!prefixMatch) {
    return null;
  }

  const toolkit = toolkitBySlug(prefixMatch.slug);
  return {
    label: `${toolkit?.name ?? toolkitDisplayName(prefixMatch.slug)} · ${humanizeToolSlug(normalized)}`,
    color: toolkit?.color ?? "slate",
    toolkitSlug: prefixMatch.slug,
  };
}
