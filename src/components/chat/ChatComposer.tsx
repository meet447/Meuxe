import {
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { MicButton } from "../MicButton";
import { SendIcon, Spinner, Textarea } from "../ui";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  voice?: {
    isRecording: boolean;
    onToggle: () => void;
    supported?: boolean;
  };
  compact?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onTypingChange?: (isTyping: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  placeholder = "Say something...",
  voice,
  compact = false,
  autoFocus = false,
  inputRef,
  onTypingChange,
  onFocus,
  onBlur,
  className = "",
}: ChatComposerProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? internalRef;
  const composingRef = useRef(false);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 120 : 160)}px`;
  }, [value, compact, textareaRef]);

  const notifyTyping = useCallback(
    (typing: boolean) => {
      onTypingChange?.(typing);
    },
    [onTypingChange],
  );

  const handleChange = (next: string) => {
    onChange(next);
    notifyTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => notifyTyping(false), 1500);
  };

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled || isStreaming) return;
    notifyTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onSend(text);
    onChange("");
    textareaRef.current?.focus();
  }, [value, disabled, isStreaming, notifyTyping, onChange, onSend, textareaRef]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isStreaming && onStop) {
      onStop();
      return;
    }
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || composingRef.current) return;
    event.preventDefault();
    if (isStreaming && onStop) {
      onStop();
      return;
    }
    submit();
  };

  const showStop = isStreaming && !!onStop;
  const sendDisabled = showStop ? false : disabled || !value.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-end gap-1 rounded-full bg-surface-2 p-1.5 shadow-float ${className}`}
    >
      {voice?.supported !== false && voice ? (
        <MicButton listening={voice.isRecording} onToggle={voice.onToggle} variant="stage" />
      ) : null}
      <Textarea
        ref={textareaRef}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message"
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className={`companion-chat-input min-h-[2.5rem] min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none ring-0 focus:ring-0 disabled:opacity-50 ${
          compact ? "max-h-[120px]" : "max-h-[160px]"
        }`}
      />
      <button
        type={showStop ? "button" : "submit"}
        aria-label={showStop ? "Stop" : "Send"}
        title={showStop ? "Stop" : "Send"}
        disabled={sendDisabled}
        onClick={showStop ? onStop : undefined}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
          showStop
            ? "bg-clay-500 text-white hover:bg-clay-600"
            : "bg-ink text-white hover:bg-ink-2 disabled:opacity-30"
        }`}
      >
        {showStop ? (
          <span className="block h-3 w-3 rounded-[2px] bg-white" />
        ) : disabled ? (
          <Spinner className="h-4 w-4 border-white/40 border-t-white" />
        ) : (
          <SendIcon className="h-4 w-4" strokeWidth={2} />
        )}
      </button>
    </form>
  );
}
