import { useState, memo } from "react";
import { ComposioToolkitIcon, toolkitColorClasses } from "./ComposioToolkitIcon";
import { resolveComposioToolMeta } from "../lib/composioToolMeta";
import type { ToolCallStatus } from "../types";

interface ConfirmRequest {
  requestId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  description: string;
}

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  read_file:       { icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Read File", color: "blue" },
  write_file:      { icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", label: "Write File", color: "indigo" },
  list_directory:  { icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z", label: "List Directory", color: "amber" },
  summarize_file:  { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", label: "Summarize", color: "purple" },
  find_files:      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", label: "Find Files", color: "cyan" },
  move_file:       { icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4", label: "Move File", color: "orange" },
  delete_file:     { icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16", label: "Delete File", color: "red" },
  run_command:     { icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", label: "Run Command", color: "green" },
  open_application:{ icon: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14", label: "Open App", color: "violet" },
  open_url:        { icon: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14", label: "Open URL", color: "blue" },
  organize_desktop:{ icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z", label: "Organize Desktop", color: "emerald" },
  edit_file:       { icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", label: "Edit File", color: "amber" },
  system_info:     { icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z", label: "System Info", color: "cyan" },
  web_search:      { icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9", label: "Web Search", color: "teal" },
};

const COLOR_CLASSES: Record<string, { bg: string; text: string }> = {
  blue: { bg: "bg-blue-100", text: "text-blue-600" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600" },
  amber: { bg: "bg-amber-100", text: "text-amber-600" },
  purple: { bg: "bg-purple-100", text: "text-purple-600" },
  cyan: { bg: "bg-cyan-100", text: "text-cyan-600" },
  orange: { bg: "bg-orange-100", text: "text-orange-600" },
  red: { bg: "bg-red-100", text: "text-red-600" },
  green: { bg: "bg-green-100", text: "text-green-600" },
  violet: { bg: "bg-violet-100", text: "text-violet-600" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
  teal: { bg: "bg-teal-100", text: "text-teal-600" },
  slate: { bg: "bg-slate-100", text: "text-slate-600" },
  sky: { bg: "bg-sky-100", text: "text-sky-600" },
  rose: { bg: "bg-rose-100", text: "text-rose-600" },
};

function resolveToolMeta(toolName: string) {
  const builtin = TOOL_META[toolName];
  if (builtin) {
    return { ...builtin, toolkitSlug: undefined as string | undefined };
  }

  const composio = resolveComposioToolMeta(toolName);
  if (composio) {
    const palette = composio.toolkitSlug
      ? toolkitColorClasses(composio.toolkitSlug)
      : COLOR_CLASSES[composio.color] ?? COLOR_CLASSES.slate;
    return {
      icon: composio.iconPath,
      label: composio.label,
      color: composio.color,
      toolkitSlug: composio.toolkitSlug,
      palette,
    };
  }

  return {
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    label: toolName.replace(/_/g, " "),
    color: "slate",
    toolkitSlug: undefined as string | undefined,
    palette: COLOR_CLASSES.slate,
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
    bg: "bg-blue-50",
    border: "border-blue-100",
    badge: "bg-blue-100 text-blue-700",
    badgeText: "Running",
  },
  completed: {
    bg: "bg-emerald-50/50",
    border: "border-emerald-100",
    badge: "bg-emerald-100 text-emerald-700",
    badgeText: "Done",
  },
  failed: {
    bg: "bg-red-50/50",
    border: "border-red-100",
    badge: "bg-red-100 text-red-700",
    badgeText: "Failed",
  },
  awaiting_confirmation: {
    bg: "bg-amber-50/50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    badgeText: "Needs Approval",
  },
};

export const ToolCallBubble = memo(function ToolCallBubble({
  call,
  onConfirm,
}: {
  call: ToolCallStatus;
  onConfirm?: (requestId: string, approved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = resolveToolMeta(call.toolName);
  const palette = meta.palette ?? COLOR_CLASSES[meta.color] ?? COLOR_CLASSES.slate;
  const statusCfg = STATUS_CONFIG[call.status];
  const argsPreview = formatArgs(call.arguments);
  const hasResult = call.result && call.result.length > 0;

  return (
    <div className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className={`w-full max-w-[90%] rounded-2xl overflow-hidden border ${statusCfg.border} ${statusCfg.bg} transition-colors`}>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer select-none hover:bg-black/[0.02] transition-colors"
          onClick={() => hasResult && setExpanded(!expanded)}
        >
          <div className={`w-7 h-7 rounded-lg ${palette.bg} flex items-center justify-center flex-shrink-0`}>
            {call.status === "running" ? (
              <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : meta.toolkitSlug ? (
              <ComposioToolkitIcon slug={meta.toolkitSlug} className="w-3.5 h-3.5" />
            ) : (
              <svg className={`w-3.5 h-3.5 ${palette.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={meta.icon} />
              </svg>
            )}
          </div>

          <ToolCallLabel meta={meta} statusCfg={statusCfg} argsPreview={argsPreview} />

          {hasResult && (
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>

        {expanded && hasResult && (
          <div className="px-3.5 pb-3 border-t border-slate-200/40">
            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap mt-2 max-h-48 overflow-y-auto font-mono leading-relaxed scrollbar-thin scrollbar-thumb-slate-200">
              {call.result!.length > 2000
                ? call.result!.slice(0, 2000) + "\n\n... (truncated)"
                : call.result}
            </pre>
          </div>
        )}

        {call.status === "awaiting_confirmation" && onConfirm && (
          <div className="px-3.5 pb-3 flex gap-2">
            <button
              onClick={() => onConfirm(call.requestId, true)}
              className="flex-1 py-2 text-[12px] font-semibold bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors shadow-sm"
            >
              Allow
            </button>
            <button
              onClick={() => onConfirm(call.requestId, false)}
              className="flex-1 py-2 text-[12px] font-semibold bg-white text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Deny
            </button>
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
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-slate-700">{meta.label}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusCfg.badge}`}>
          {statusCfg.badgeText}
        </span>
      </div>
      {argsPreview && (
        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">{argsPreview}</p>
      )}
    </div>
  );
}

export type { ConfirmRequest };
export type { ToolCallStatus } from "../types";
