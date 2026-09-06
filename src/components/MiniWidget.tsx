import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useWindow } from "../hooks/useWindow";
import { MicButton } from "./MicButton";
import type { ToolCallStatus } from "./ToolCallBubble";
import {
  Button,
  ExpandIcon,
  IconButton,
  Pill,
  SendIcon,
  Spinner,
  Surface,
} from "./ui";

interface MiniWidgetProps {
  avatarComponent: ReactNode;
  listening: boolean;
  speaking: boolean;
  isStreaming: boolean;
  speechSessionActive: boolean;
  caption?: string | null;
  captionSpeaker?: string;
  toolCalls: ToolCallStatus[];
  onSend: (text: string) => void;
  onMicToggle: () => void;
  onToolConfirm: (permissionId: string, approved: boolean) => void;
  onCancel?: () => void;
  pendingConfirmation: boolean;
  openComposerTrigger?: number; // increment to open composer from outside
}

const MINI_WINDOW_PRESETS = [
  { label: "S", width: 260, height: 400 },
  { label: "M", width: 300, height: 460 },
  { label: "L", width: 340, height: 540 },
  { label: "XL", width: 380, height: 620 },
] as const;

export function MiniWidget({
  avatarComponent,
  listening,
  speaking,
  isStreaming,
  speechSessionActive,
  caption,
  captionSpeaker,
  toolCalls,
  onSend,
  onMicToggle,
  onToolConfirm,
  onCancel,
  pendingConfirmation,
  openComposerTrigger = 0,
}: MiniWidgetProps) {
  const { expand } = useWindow();
  const pointerStateRef = useRef<{ x: number; y: number; dragged: boolean; active: boolean }>({
    x: 0,
    y: 0,
    dragged: false,
    active: false,
  });
  const [input, setInput] = useState("");
  const [sizePresetIndex, setSizePresetIndex] = useState(1);
  const [bottomDockHover, setBottomDockHover] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync preset with actual window size on mount
  useEffect(() => {
    const syncPresetWithWindow = async () => {
      try {
        const size = await getCurrentWindow().innerSize();
        const idx = MINI_WINDOW_PRESETS.findIndex(
          (p) => Math.abs(p.width - size.width) <= 20 && Math.abs(p.height - size.height) <= 20,
        );
        if (idx >= 0) setSizePresetIndex(idx);
      } catch {}
    };
    void syncPresetWithWindow();
  }, []);

  // Open composer when triggered externally (via global shortcut in App.tsx)
  useEffect(() => {
    if (openComposerTrigger > 0) {
      if (sizePresetIndex === 0) {
        void getCurrentWindow().setSize(
          new LogicalSize(MINI_WINDOW_PRESETS[1].width, MINI_WINDOW_PRESETS[1].height),
        );
        setSizePresetIndex(1);
      }
      setBottomDockHover(true);
      inputRef.current?.focus();
    }
  }, [openComposerTrigger]);

  // Drag handling
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element && target.closest("[data-mini-interactive='true']");

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) {
      pointerStateRef.current.active = false;
      return;
    }
    pointerStateRef.current = { x: event.clientX, y: event.clientY, dragged: false, active: true };
  };

  const handlePointerMoveCapture = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (!state.active || state.dragged) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 6) return;
    state.dragged = true;
    try {
      await getCurrentWindow().startDragging();
    } catch {}
  };

  const handlePointerUpCapture = () => {
    pointerStateRef.current = { x: 0, y: 0, dragged: false, active: false };
  };

  const applyWindowPreset = async (nextIndex: number) => {
    const preset = MINI_WINDOW_PRESETS[nextIndex];
    setSizePresetIndex(nextIndex);
    try {
      await getCurrentWindow().setSize(new LogicalSize(preset.width, preset.height));
    } catch {}
  };

  const cycleWindowSize = () => {
    void applyWindowPreset((sizePresetIndex + 1) % MINI_WINDOW_PRESETS.length);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setInput("");
  };

  const handleExpand = async () => {
    await expand();
  };

  const focusInput = () => {
    if (sizePresetIndex === 0) {
      void applyWindowPreset(1);
    }
    setBottomDockHover(true);
    inputRef.current?.focus();
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setInput("");
      inputRef.current?.blur();
    }
  };

  const pendingTool = pendingConfirmation
    ? toolCalls.find((tc) => tc.status === "awaiting_confirmation")
    : null;

  const showBottomChrome = bottomDockHover || inputFocused || input.trim().length > 0;

  const showThinkingStatus = !caption && (isStreaming || (speechSessionActive && !speaking));

  return (
    <div
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={handlePointerUpCapture}
      onKeyDown={handleRootKeyDown}
      tabIndex={-1}
      className="relative"
      style={{
        width: "100vw",
        height: "100vh",
        cursor: "default",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {/* Avatar canvas */}
      {avatarComponent}

      {/* Status pill: top right, subtle */}
      {(listening || showThinkingStatus || (speaking && !caption)) && (
        <div className="pointer-events-none absolute right-3 top-3 z-20">
          <Pill
            tone={listening ? "peach" : showThinkingStatus ? "honey" : "accent"}
            dot
            pulse
            className="bg-surface-2/95 shadow-soft"
          >
            {listening ? "Listening" : showThinkingStatus ? "Thinking" : "Speaking"}
          </Pill>
        </div>
      )}

      {/* Spoken sentence subtitle */}
      {caption && !pendingTool && (
        <div className="pointer-events-none absolute bottom-[4.75rem] left-3 right-3 z-10">
          <div className="rounded-card bg-surface-2/95 px-3.5 py-2.5 shadow-float backdrop-blur">
            {captionSpeaker && (
              <p className="mb-0.5 text-[11px] font-semibold text-ink-3">{captionSpeaker}</p>
            )}
            <p className="text-[13px] leading-snug text-ink">{caption}</p>
          </div>
        </div>
      )}

      {/* Tool confirmation overlay: compact card */}
      {pendingTool && (
        <div
          className="absolute bottom-[4.75rem] left-3 right-3 z-20"
          data-mini-interactive="true"
        >
          <Surface tone="raised" elevation="float" className="bg-honey-50/95 px-3.5 py-3 backdrop-blur">
            <div className="mb-2 flex items-center gap-2">
              <Pill tone="honey" dot pulse size="xs">
                Needs approval
              </Pill>
              <span className="text-[12px] font-semibold text-ink">
                Allow {pendingTool.toolName.replace(/_/g, " ")}?
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                className="flex-1"
                onClick={() => onToolConfirm(pendingTool.permissionId!, true)}
              >
                Allow
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => onToolConfirm(pendingTool.permissionId!, false)}
              >
                Deny
              </Button>
            </div>
          </Surface>
        </div>
      )}

      {/* Bottom hover zone: input + utilities appear on hover (or while typing / focused) */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 flex justify-center pb-3 pt-12"
        data-mini-interactive="true"
        onMouseEnter={() => setBottomDockHover(true)}
        onMouseLeave={() => {
          if (!inputFocused && !input.trim()) setBottomDockHover(false);
        }}
      >
        <div
          className={`flex w-[min(92vw,340px)] flex-col gap-2 transition-opacity duration-200 ${
            showBottomChrome ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="flex items-center justify-between px-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-w-9 px-2.5 text-[11px] font-bold"
              onClick={cycleWindowSize}
              title="Window size"
            >
              {MINI_WINDOW_PRESETS[sizePresetIndex].label}
            </Button>
            <IconButton label="Open full app" size="sm" variant="secondary" onClick={handleExpand}>
              <ExpandIcon className="h-4 w-4" />
            </IconButton>
          </div>

          <form
            onSubmit={handleSubmit}
            className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface-2 p-1.5 shadow-float"
          >
            <MicButton listening={listening} onToggle={onMicToggle} variant="stage" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => {
                focusInput();
                setInputFocused(true);
              }}
              onBlur={() => setInputFocused(false)}
              placeholder="Type a message..."
              className="companion-chat-input min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-4 disabled:opacity-50"
              disabled={isStreaming}
            />
            <button
              type={isStreaming && onCancel ? "button" : "submit"}
              onClick={isStreaming && onCancel ? onCancel : undefined}
              disabled={isStreaming ? false : !input.trim()}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                isStreaming && onCancel
                  ? "bg-clay-500 text-white hover:bg-clay-600"
                  : "bg-ink text-white hover:bg-ink-2 disabled:opacity-30"
              }`}
              title={isStreaming && onCancel ? "Stop" : "Send"}
            >
              {isStreaming ? (
                onCancel ? (
                  <span className="block h-3 w-3 rounded-[2px] bg-white" />
                ) : (
                  <Spinner />
                )
              ) : (
                <SendIcon className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
