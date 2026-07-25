import { useEffect, useRef, useState, useCallback, memo } from "react";
import type { RefObject } from "react";
import { MicButton } from "../MicButton";

type Props = {
  isProcessing: boolean;
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  listening: boolean;
  onMicToggle: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  moodLabel?: string;
  statusLabel?: string | null;
};

export const FloatingChatInput = memo(function FloatingChatInput({
  isProcessing,
  onSend,
  onTypingChange,
  listening,
  onMicToggle,
  inputRef,
  moodLabel = "Just normal",
  statusLabel,
}: Props) {
  const [input, setInput] = useState("");
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    onTypingChange(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => onTypingChange(false), 1500);
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isProcessing) return;
      onTypingChange(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onSend(input.trim());
      setInput("");
      inputRef.current?.focus();
    },
    [input, isProcessing, onSend, onTypingChange, inputRef],
  );

  return (
    <div className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-2">
      {statusLabel && (
        <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/60 backdrop-blur-md">
          {statusLabel}
        </div>
      )}
      <div
        className="rounded-full border border-white/10 bg-zinc-800/55 px-3 py-1.5 text-sm text-white/70 backdrop-blur-xl"
        title="Companion mood"
      >
        — {moodLabel}
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center gap-1 rounded-full border border-white/10 bg-zinc-900/70 py-1 pl-1 pr-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <MicButton listening={listening} onToggle={onMicToggle} variant="stage" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
          disabled={isProcessing}
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-all hover:bg-white/25 disabled:opacity-30"
          title="Send"
        >
          {isProcessing ? (
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
});
