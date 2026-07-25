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
  statusLabel?: string | null;
  caption?: string | null;
  captionSpeaker?: string;
};

export const FloatingChatInput = memo(function FloatingChatInput({
  isProcessing,
  onSend,
  onTypingChange,
  listening,
  onMicToggle,
  inputRef,
  statusLabel,
  caption,
  captionSpeaker,
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
      {caption && (
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
          {captionSpeaker && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{captionSpeaker}</p>
          )}
          <p className="text-center text-[15px] leading-snug text-slate-800">{caption}</p>
        </div>
      )}
      {statusLabel && (
        <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur-md">
          {statusLabel}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center gap-1 rounded-full border border-slate-200/90 bg-white/90 py-1 pl-1 pr-1.5 shadow-[0_8px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl ring-1 ring-slate-100 focus-within:ring-1 focus-within:ring-slate-100"
      >
        <MicButton listening={listening} onToggle={onMicToggle} variant="stage" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
          disabled={isProcessing}
          className="companion-chat-input min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-slate-800 outline-none ring-0 placeholder:text-slate-400 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:opacity-30"
          title="Send"
        >
          {isProcessing ? (
            <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
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
