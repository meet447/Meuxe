import type { ToolCallStatus } from "./ToolCallBubble";

const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading",
  write_file: "Writing",
  list_directory: "Listing",
  summarize_file: "Summarizing",
  find_files: "Searching",
  move_file: "Moving",
  delete_file: "Deleting",
  run_command: "Running",
  open_application: "Opening",
  open_url: "Opening",
  organize_desktop: "Organizing",
  clipboard_read: "Clipboard",
  clipboard_write: "Clipboard",
};

function resolveToolLabel(toolName: string): string {
  if (TOOL_LABELS[toolName]) {
    return TOOL_LABELS[toolName];
  }
  return toolName.replace(/_/g, " ");
}

const STATUS_DOTS: Record<string, string> = {
  running: "bg-blue-400 animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  awaiting_confirmation: "bg-amber-400 animate-pulse",
};

interface Props {
  toolCalls: ToolCallStatus[];
  pendingConfirmation: boolean;
}

export function MiniToolPills({ toolCalls, pendingConfirmation }: Props) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="absolute bottom-14 left-2 right-2 z-15 flex flex-wrap gap-1 pointer-events-none">
      {toolCalls.map((tc) => {
        const label = resolveToolLabel(tc.toolName);
        const dotClass = STATUS_DOTS[tc.status] || "bg-slate-400";
        const isConfirm = tc.status === "awaiting_confirmation";

        return (
          <div
            key={tc.requestId}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold backdrop-blur-xl shadow-sm pointer-events-auto ${
              isConfirm
                ? "bg-amber-500/80 text-white border border-amber-400/50"
                : "bg-white/75 text-slate-600 border border-white/40"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            <span>{label}</span>
            {tc.status === "completed" && (
              <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        );
      })}

      {/* Voice confirmation hint */}
      {pendingConfirmation && (
        <div className="w-full mt-1 text-center">
          <span className="inline-block rounded-full bg-amber-500/80 text-white text-[10px] font-semibold px-3 py-1 backdrop-blur-xl shadow-sm animate-pulse">
            Say "yes" to allow or "no" to deny
          </span>
        </div>
      )}
    </div>
  );
}
