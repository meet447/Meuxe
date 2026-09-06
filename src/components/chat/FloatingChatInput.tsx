import { useEffect, useRef, useState, useCallback, memo } from "react";
import type { RefObject } from "react";
import { Pill, SendIcon, Spinner } from "../ui";
import { MicButton } from "../MicButton";

type Props = {
  isProcessing: boolean;
  isStreaming?: boolean;
  onSend: (text: string) => void;
  onCancel?: () => void;
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
  isStreaming,
  onSend,
  onCancel,
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
    <div className="pointer-events-auto flex w-full max-w-xl flex-col items-center gap-2">
      {caption && (
        <div className="w-full rounded-card bg-surface-2/95 px-4 py-3 shadow-soft backdrop-blur">
          {captionSpeaker && (
            <p className="mb-1 text-xs font-semibold text-ink-3">{captionSpeaker}</p>
          )}
          <p className="text-[15px] leading-snug text-ink">{caption}</p>
        </div>
      )}
      {statusLabel && (
        <Pill tone="honey" dot pulse>
          {statusLabel}
        </Pill>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center gap-1 rounded-full bg-surface-2 p-1.5 shadow-float"
      >
        <MicButton listening={listening} onToggle={onMicToggle} variant="stage" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
          disabled={isProcessing}
          className="companion-chat-input min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-4 focus:outline-none focus-visible:outline-none disabled:opacity-50"
        />
        <button
          type={isStreaming && onCancel ? "button" : "submit"}
          onClick={isStreaming && onCancel ? onCancel : undefined}
          disabled={isStreaming ? false : isProcessing || !input.trim()}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all ${
            isStreaming && onCancel
              ? "bg-clay-500 text-white hover:bg-clay-600"
              : "bg-ink text-white hover:bg-ink-2 disabled:opacity-30"
          }`}
          title={isStreaming && onCancel ? "Stop" : "Send"}
        >
          {isStreaming && onCancel ? (
            <span className="block h-3 w-3 rounded-[2px] bg-white" />
          ) : isProcessing ? (
            <Spinner className="h-4 w-4 border-white/40 border-t-white" />
          ) : (
            <SendIcon className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
      </form>
    </div>
  );
});
