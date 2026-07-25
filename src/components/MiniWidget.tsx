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
  const [composerOpen, setComposerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (composerOpen) inputRef.current?.focus();
  }, [composerOpen]);

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

  // Auto-close composer when streaming finishes
  useEffect(() => {
    if (!isStreaming && composerOpen && !input.trim()) {
      setComposerOpen(false);
    }
  }, [isStreaming]);

  const composerOpenRef = useRef(false);
  composerOpenRef.current = composerOpen;

  // Open composer when triggered externally (via global shortcut in App.tsx)
  useEffect(() => {
    if (openComposerTrigger > 0) {
      if (sizePresetIndex === 0) {
        void getCurrentWindow().setSize(new LogicalSize(MINI_WINDOW_PRESETS[1].width, MINI_WINDOW_PRESETS[1].height));
        setSizePresetIndex(1);
      }
      setComposerOpen(true);
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
    setComposerOpen(false);
  };

  const handleExpand = async () => { await expand(); };

  const openComposer = () => {
    if (!composerOpen && sizePresetIndex === 0) {
      void applyWindowPreset(1);
    }
    setComposerOpen(true);
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setComposerOpen(false);
      setInput("");
    }
  };

  const pendingTool = pendingConfirmation
    ? toolCalls.find((tc) => tc.status === "awaiting_confirmation")
    : null;

  const showDock = dockVisible || composerOpen || listening || isStreaming || pendingConfirmation || caption;

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

      {/* Spoken sentence subtitle — above dock */}
      {caption && !composerOpen && !pendingTool && (
        <div className="absolute bottom-16 left-2 right-2 z-10 pointer-events-none">
          <div className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur-sm">
            {captionSpeaker && (
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{captionSpeaker}</p>
            )}
            <p className="text-[12px] leading-snug text-slate-800">{caption}</p>
          </div>
        </div>
      )}

      {/* Tool confirmation overlay — compact card */}
      {pendingTool && (
        <div
          className="absolute bottom-16 left-2 right-2 z-20"
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

      {/* Composer — popup input, appears on keyboard shortcut or button click */}
      {composerOpen && (
        <form
          data-mini-interactive="true"
          onSubmit={handleSubmit}
          className="absolute bottom-16 left-1/2 z-30 flex w-[min(90vw,320px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/80 bg-white/90 p-2 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 outline-none placeholder:text-slate-400 focus:bg-white"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </form>
      )}

      {/* Dock — hover to reveal, contains chat/mic/size/expand */}
      <div
        className={`absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-2 py-1.5 shadow-sm backdrop-blur-xl transition-all duration-300 ${
          showDock ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        data-mini-interactive="true"
      >
        {/* Size cycle */}
        <button
          type="button"
          onClick={cycleWindowSize}
          className="rounded-full bg-white/80 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-all hover:bg-white hover:text-slate-700"
          title="Cycle window size"
        >
          {MINI_WINDOW_PRESETS[sizePresetIndex].label}
        </button>

        {/* Text chat toggle */}
        <button
          type="button"
          onClick={() => composerOpen ? setComposerOpen(false) : openComposer()}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
            isStreaming
              ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
              : composerOpen
              ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
              : "bg-white/80 text-slate-600 hover:bg-white hover:text-slate-800"
          }`}
          title="Text chat (/ or Cmd+K)"
        >
          {isStreaming ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 6l2.4-3.2A8.96 8.96 0 013 11a9 9 0 1118 0 9 9 0 01-9 9 8.96 8.96 0 01-4.6-1.2L3 20z" />
            </svg>
          )}
        </button>

        {/* Mic */}
        <div className="rounded-full bg-white/80">
          <MicButton listening={listening} onToggle={onMicToggle} />
        </div>

        {/* Expand */}
        <button
          type="button"
          onClick={handleExpand}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-600 transition-all hover:bg-white hover:text-slate-800"
          title="Open full app"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3H5a2 2 0 00-2 2v3m16 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M5 16v3a2 2 0 002 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
