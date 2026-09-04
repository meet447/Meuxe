import type { ToolCallStatus } from "./ToolCallBubble";
import { CheckIcon, Pill } from "./ui";

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

function statusTone(status: ToolCallStatus["status"]) {
  switch (status) {
    case "running":
      return { tone: "honey" as const, pulse: true, dot: true };
    case "completed":
      return { tone: "sage" as const, pulse: false, dot: false };
    case "failed":
      return { tone: "clay" as const, pulse: false, dot: false };
    case "awaiting_confirmation":
      return { tone: "honey" as const, pulse: true, dot: true };
    default:
      return { tone: "neutral" as const, pulse: false, dot: false };
  }
}

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
        const { tone, pulse, dot } = statusTone(tc.status);
        const isConfirm = tc.status === "awaiting_confirmation";

        return (
          <Pill
            key={tc.requestId}
            tone={tone}
            dot={dot}
            pulse={pulse}
            size="xs"
            className={`pointer-events-auto shadow-soft backdrop-blur ${
              isConfirm ? "bg-honey-50/95" : "bg-surface-2/95"
            }`}
          >
            {label}
            {tc.status === "completed" && (
              <CheckIcon className="ml-0.5 h-2.5 w-2.5 text-sage-500" strokeWidth={2.4} />
            )}
          </Pill>
        );
      })}

      {/* Voice confirmation hint */}
      {pendingConfirmation && (
        <div className="mt-1 w-full text-center">
          <Pill tone="honey" dot pulse size="xs" className="bg-honey-50/95 shadow-soft backdrop-blur">
            Say &quot;yes&quot; to allow or &quot;no&quot; to deny
          </Pill>
        </div>
      )}
    </div>
  );
}
