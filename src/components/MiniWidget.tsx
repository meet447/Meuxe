import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useWindow } from "../hooks/useWindow";
import { MicButton } from "./MicButton";
import type { ToolCallStatus } from "./ToolCallBubble";

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
  onToolConfirm: (requestId: string, approved: boolean) => void;
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
  pendingConfirmation,
  openComposerTrigger = 0,
}: MiniWidgetProps) {
  const { expand } = useWindow();
  const pointerStateRef = useRef<{ x: number; y: number; dragged: boolean; active: boolean }>({
    x: 0, y: 0, dragged: false, active: false,
  });
  const [input, setInput] = useState("");
  const [sizePresetIndex, setSizePresetIndex] = useState(1);
  const [dockVisible, setDockVisible] = useState(false);
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
        void getCurrentWindow().setSize(new LogicalSize(MINI_WINDOW_PRESETS[1].width, MINI_WINDOW_PRESETS[1].height));
        setSizePresetIndex(1);
      }
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
    try { await getCurrentWindow().startDragging(); } catch {}
  };

  const handlePointerUpCapture = () => {
    pointerStateRef.current = { x: 0, y: 0, dragged: false, active: false };
  };

  const applyWindowPreset = async (nextIndex: number) => {
    const preset = MINI_WINDOW_PRESETS[nextIndex];
    setSizePresetIndex(nextIndex);
    try { await getCurrentWindow().setSize(new LogicalSize(preset.width, preset.height)); } catch {}
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

  const handleExpand = async () => { await expand(); };

  const focusInput = () => {
    if (sizePresetIndex === 0) {
      void applyWindowPreset(1);
    }
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

  const showUtilities = dockVisible || listening || isStreaming || pendingConfirmation || caption;

  const showThinkingStatus =
    !caption && (isStreaming || (speechSessionActive && !speaking));

  return (
    <div
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={handlePointerUpCapture}
      onMouseEnter={() => setDockVisible(true)}
      onMouseLeave={() => setDockVisible(false)}
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

      {/* Status pill — top right, subtle */}
      {(listening || showThinkingStatus || (speaking && !caption)) && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 shadow-sm backdrop-blur-xl pointer-events-none">
          <span className={`h-1.5 w-1.5 rounded-full ${
            listening ? "bg-red-500 animate-ping"
              : showThinkingStatus ? "bg-blue-400 animate-pulse"
              : "bg-blue-400 animate-ping"
          }`} />
          <span>{listening ? "Listening" : showThinkingStatus ? "Thinking" : "Speaking"}</span>
        </div>
      )}

      {/* Spoken sentence subtitle */}
      {caption && !pendingTool && (
        <div className="absolute bottom-[4.75rem] left-3 right-3 z-10 pointer-events-none">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            {captionSpeaker && (
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{captionSpeaker}</p>
            )}
            <p className="text-[13px] leading-snug text-slate-800">{caption}</p>
          </div>
        </div>
      )}

      {/* Tool confirmation overlay — compact card */}
      {pendingTool && (
        <div
          className="absolute bottom-[4.75rem] left-3 right-3 z-20"
          data-mini-interactive="true"
        >
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 backdrop-blur-xl shadow-md px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-amber-800">
                Allow {pendingTool.toolName.replace(/_/g, " ")}?
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onToolConfirm(pendingTool.requestId, true)}
                className="flex-1 py-1.5 text-[11px] font-semibold bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors shadow-sm"
              >
                Allow
              </button>
              <button
                onClick={() => onToolConfirm(pendingTool.requestId, false)}
                className="flex-1 py-1.5 text-[11px] font-semibold bg-white text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Deny
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom input + utilities */}
      <div
        className="absolute bottom-3 left-1/2 z-30 flex w-[min(92vw,340px)] -translate-x-1/2 flex-col gap-2"
        data-mini-interactive="true"
      >
        <div
          className={`flex items-center justify-between px-1 transition-opacity duration-200 ${
            showUtilities ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={cycleWindowSize}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            title="Window size"
          >
            {MINI_WINDOW_PRESETS[sizePresetIndex].label}
          </button>
          <button
            type="button"
            onClick={handleExpand}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            title="Open full app"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3H5a2 2 0 00-2 2v3m16 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M5 16v3a2 2 0 002 2h3" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-1.5 shadow-sm ring-1 ring-slate-100 focus-within:ring-slate-200"
        >
          <MicButton listening={listening} onToggle={onMicToggle} variant="stage" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={focusInput}
            placeholder="Type a message..."
            className="companion-chat-input min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-slate-800 outline-none ring-0 placeholder:text-slate-400 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-30"
            title="Send"
          >
            {isStreaming ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
