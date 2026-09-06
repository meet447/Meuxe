import { useState, memo, type ComponentType } from "react";
import type { ToolCallStatus } from "../types";
import {
  AppWindowIcon,
  ArrowRightIcon,
  Button,
  ChevronDownIcon,
  CpuIcon,
  EditIcon,
  ExternalIcon,
  FileIcon,
  FolderIcon,
  FrameIcon,
  GlobeIcon,
  NoteIcon,
  Pill,
  SearchIcon,
  SparkIcon,
  Spinner,
  TerminalIcon,
  TrashIcon,
  type IconProps,
} from "./ui";

type IconComponent = ComponentType<IconProps>;

const TOOL_META: Record<string, { icon: IconComponent; label: string }> = {
  read_file: { icon: FileIcon, label: "Read File" },
  write_file: { icon: EditIcon, label: "Write File" },
  edit_file: { icon: EditIcon, label: "Edit File" },
  list_directory: { icon: FolderIcon, label: "List Directory" },
  summarize_file: { icon: NoteIcon, label: "Summarize" },
  find_files: { icon: SearchIcon, label: "Find Files" },
  move_file: { icon: ArrowRightIcon, label: "Move File" },
  delete_file: { icon: TrashIcon, label: "Delete File" },
  run_command: { icon: TerminalIcon, label: "Run Command" },
  open_application: { icon: AppWindowIcon, label: "Open App" },
  open_url: { icon: ExternalIcon, label: "Open URL" },
  organize_desktop: { icon: FrameIcon, label: "Organize Desktop" },
  system_info: { icon: CpuIcon, label: "System Info" },
  web_search: { icon: GlobeIcon, label: "Web Search" },
};

function resolveToolMeta(toolName: string) {
  const builtin = TOOL_META[toolName];
  if (builtin) {
    return { ...builtin, toolkitSlug: undefined as string | undefined };
  }

  return {
    icon: SparkIcon,
    label: toolName.replace(/_/g, " "),
    toolkitSlug: undefined as string | undefined,
  };
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  if (entries.length === 1) {
    const val = String(entries[0][1]);
    return val.length > 60 ? val.slice(0, 60) + "..." : val;
  }
  return entries
    .map(([k, v]) => {
      const val = String(v);
      return `${k}: ${val.length > 40 ? val.slice(0, 40) + "..." : val}`;
    })
    .join(", ");
}

const STATUS_CONFIG = {
  running: {
    bg: "bg-surface-2",
    badge: (
      <Pill tone="honey" dot pulse>
        Running
      </Pill>
    ),
  },
  completed: {
    bg: "bg-surface-2",
    badge: (
      <Pill tone="sage">
        Done
      </Pill>
    ),
  },
  failed: {
    bg: "bg-clay-50",
    badge: (
      <Pill tone="clay">
        Failed
      </Pill>
    ),
  },
  awaiting_confirmation: {
    bg: "bg-honey-50",
    badge: (
      <Pill tone="honey" dot>
        Needs approval
      </Pill>
    ),
  },
};

export const ToolCallBubble = memo(function ToolCallBubble({
  call,
  onConfirm,
}: {
  call: ToolCallStatus;
  onConfirm?: (permissionId: string, approved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = resolveToolMeta(call.toolName);
  const statusCfg = STATUS_CONFIG[call.status];
  const argsPreview = formatArgs(call.arguments);
  const hasResult = call.result && call.result.length > 0;
  const Icon = meta.icon;

  return (
    <div className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div
        className={`w-full max-w-[90%] overflow-hidden rounded-card shadow-soft ${statusCfg.bg} transition-colors`}
      >
        <button
          type="button"
          aria-expanded={expanded}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 cursor-pointer select-none hover:bg-black/[0.02] transition-colors text-left"
          onClick={() => hasResult && setExpanded(!expanded)}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-well text-ink-2">
            {call.status === "running" ? (
              <Spinner className="h-3.5 w-3.5 text-accent-500" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
          </div>

          <ToolCallLabel meta={meta} statusCfg={statusCfg} argsPreview={argsPreview} />

          {hasResult && (
            <ChevronDownIcon
              className={`h-4 w-4 shrink-0 text-ink-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          )}
        </button>

        {expanded && hasResult && (
          <div className="px-3.5 pb-3">
            <pre className="mt-2 max-h-48 overflow-y-auto rounded-[12px] bg-well p-3 font-mono text-[11px] leading-relaxed text-ink-2 whitespace-pre-wrap scrollbar-thin">
              {call.result!.length > 2000
                ? call.result!.slice(0, 2000) + "\n\n... (truncated)"
                : call.result}
            </pre>
          </div>
        )}

        {call.status === "awaiting_confirmation" && onConfirm && call.permissionId && (
          <div className="flex gap-2 px-3.5 pb-3">
            <Button size="sm" variant="primary" className="flex-1" onClick={() => onConfirm(call.permissionId!, true)}>
              Allow
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => onConfirm(call.permissionId!, false)}>
              Deny
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

function ToolCallLabel({
  meta,
  statusCfg,
  argsPreview,
}: {
  meta: ReturnType<typeof resolveToolMeta>;
  statusCfg: (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG];
  argsPreview: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-ink">{meta.label}</span>
        {statusCfg.badge}
      </div>
      {argsPreview && (
        <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{argsPreview}</p>
      )}
    </div>
  );
}

export type { ToolCallStatus } from "../types";
