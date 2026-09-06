import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatTimelineItem } from "../types";
import { openExternalUrl } from "../lib/openExternal";
import { MicButton } from "./MicButton";
import { ToolCallBubble } from "./ToolCallBubble";
import {
  AsciiAccent,
  Dots,
  Mascot,
  Pill,
  SendIcon,
  Spinner,
} from "./ui";

interface Props {
  timeline: ChatTimelineItem[];
  loading: boolean;
  streamingText: string;
  characterName: string;
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  listening: boolean;
  onMicToggle: () => void;
  ttsLoading?: boolean;
  speaking?: boolean;
  onToolConfirm?: (permissionId: string, approved: boolean) => void;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Timeline only: for sidebar layout with external input bar */
  hideInput?: boolean;
  appearance?: "light" | "dark";
}

// Markdown component config: shared between messages and streaming
const ALLOWED_LINK_PROTOCOLS = /^(https?:|mailto:)/i;

function SafeMarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const safeHref = href?.trim() ?? "";
  const isAllowed = ALLOWED_LINK_PROTOCOLS.test(safeHref);

  if (!isAllowed) {
    return <span>{children}</span>;
  }

  return (
    <a
      href={safeHref}
      className="text-accent-600 underline decoration-accent-300 underline-offset-2 hover:text-accent-700"
      onClick={(event) => {
        event.preventDefault();
        void openExternalUrl(safeHref);
      }}
    >
      {children}
    </a>
  );
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-ink-2">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-1 text-ink">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1 text-ink">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <div className="my-2 overflow-hidden rounded-card bg-well">
          <div className="px-4 py-1 font-mono text-[10px] text-ink-4">
            {className?.replace("language-", "") || "code"}
          </div>
          <pre className="overflow-x-auto px-4 pb-3 font-mono text-[13px] leading-relaxed text-ink-2">
            <code>{children}</code>
          </pre>
        </div>
      );
    }
    return (
      <code className="rounded-[6px] bg-well px-1.5 py-0.5 font-mono text-[13px] text-ink-2">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-accent-200 pl-3 my-2 text-ink-2 italic">
      {children}
    </blockquote>
  ),
  a: SafeMarkdownLink,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold text-ink mb-2 mt-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-bold text-ink mb-1.5 mt-2.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold text-ink mb-1 mt-2 first:mt-0">{children}</h3>
  ),
  hr: () => <hr className="my-3 border-line" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="bg-well px-3 py-1.5 text-left font-semibold text-ink-2 border-b border-line">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-1.5 border-b border-line text-ink-2">{children}</td>
  ),
};

const MarkdownContent = memo(({ content }: { content: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as any}>
    {content}
  </ReactMarkdown>
));

// ⚡ Bolt: Destructuring props to primitives ensures React.memo's shallow comparison
// works properly. Previously, passing a newly created `msg` object on every render
// defeated memoization, causing O(N) re-renders of the chat history on every token.
const MessageBubble = memo(function MessageBubble({
  role,
  text,
  expression,
  characterName,
  dark = false,
}: {
  role: "user" | "assistant";
  text: string;
  expression?: string;
  characterName: string;
  dark?: boolean;
}) {
  const isUser = role === "user";

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}
    >
      <div
        className={`max-w-[88%] rounded-card px-4 py-3 ${
          isUser
            ? dark
              ? "rounded-tr-[10px] bg-accent-300 text-ink"
              : "rounded-tr-[10px] bg-peach-100 text-ink"
            : dark
              ? "rounded-tl-[10px] bg-white/10 text-white/90 shadow-soft"
              : "rounded-tl-[10px] bg-surface-2 shadow-soft text-ink"
        }`}
      >
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className={`text-[12px] font-semibold ${dark ? "text-white/60" : "text-ink-3"}`}>
              {characterName}
            </span>
            {expression && expression !== "neutral" && (
              <Pill size="xs">{expression}</Pill>
            )}
          </div>
        )}
        <div className={`text-[14px] leading-relaxed break-words ${isUser && dark ? "text-white" : ""}`}>
          {isUser ? (
            <p>{text}</p>
          ) : (
            <MarkdownContent content={text} />
          )}
        </div>
      </div>
    </div>
  );
});

// Extracted to isolate frequent state updates (text input) from the main chat list.
// This prevents O(N) re-renders of all MessageBubble and ToolCallBubble components on every keystroke.
const ChatInput = memo(function ChatInput({
  isProcessing,
  isStreaming,
  onSend,
  onCancel,
  onTypingChange,
  listening,
  onMicToggle,
  inputRef,
  floating = false,
}: {
  isProcessing: boolean;
  isStreaming?: boolean;
  onSend: (text: string) => void;
  onCancel?: () => void;
  onTypingChange: (isTyping: boolean) => void;
  listening: boolean;
  onMicToggle: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  floating?: boolean;
}) {
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
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 1500);
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isProcessing) return;
      onTypingChange(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onSend(input.trim());
      setInput("");
      inputRef.current?.focus();
    },
    [input, isProcessing, onSend, onTypingChange, inputRef],
  );

  return (
    <div className={floating ? "w-full" : "w-full bg-transparent pb-2 pt-1"}>
      <form
        onSubmit={handleSubmit}
        className={`flex items-center gap-1 rounded-full bg-surface-2 p-1.5 ${
          floating ? "shadow-float" : "shadow-soft"
        } ${floating ? "px-1" : "mx-4"}`}
      >
        <MicButton listening={listening} onToggle={onMicToggle} variant="stage" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Say something..."
          className="companion-chat-input min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-4 disabled:opacity-50"
          disabled={isProcessing}
        />
        <button
          type={isStreaming && onCancel ? "button" : "submit"}
          onClick={isStreaming && onCancel ? onCancel : undefined}
          disabled={isStreaming ? false : isProcessing || !input.trim()}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
            isStreaming && onCancel
              ? "bg-clay-500 text-white hover:bg-clay-600"
              : "bg-ink text-white hover:bg-ink-2 disabled:opacity-30"
          }`}
          title={isStreaming && onCancel ? "Stop" : "Send"}
        >
          {isStreaming && onCancel ? (
            <span className="block h-3 w-3 rounded-[2px] bg-white" />
          ) : isProcessing ? (
            <Spinner />
          ) : (
            <SendIcon className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
      </form>
    </div>
  );
});

function timelineItemToMessage(item: ChatTimelineItem): ChatMessage | null {
  if (item.kind === "tool") return null;
  if (item.kind === "user") {
    return { role: "user", text: item.text };
  }
  return { role: "assistant", text: item.text, expression: item.expression };
}

export const ChatInputBar = ChatInput;

export function ChatPanel({
  timeline,
  loading,
  streamingText,
  characterName,
  onSend,
  onTypingChange,
  listening,
  onMicToggle,
  ttsLoading = false,
  speaking = false,
  onToolConfirm,
  onCancel,
  inputRef: externalInputRef,
  hideInput = false,
  appearance = "light",
}: Props) {
  const dark = appearance === "dark";
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  useEffect(() => {
    if (!streamingText) return;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    });
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, [streamingText]);

  const isProcessing = loading || ttsLoading;

  // ⚡ Bolt: Wrap O(N) array operations on the timeline in useMemo to prevent
  // traversing the entire history on every single streaming text update.
  const { hasRunningTool, hasAnyTool } = useMemo(() => {
    return {
      hasRunningTool: timeline.some(
        (item) => item.kind === "tool" && item.call.status === "running",
      ),
      hasAnyTool: timeline.some((item) => item.kind === "tool"),
    };
  }, [timeline]);

  // ⚡ Bolt: Memoize the mapping of the timeline to prevent O(N) React element
  // recreation on every streaming token update.
  const renderedTimeline = useMemo(() => {
    return timeline.map((item) => {
      if (item.kind === "tool") {
        return (
          <ToolCallBubble key={item.id} call={item.call} onConfirm={onToolConfirm} />
        );
      }

      const msg = timelineItemToMessage(item);
      if (!msg) return null;
      return (
        <MessageBubble
          key={item.id}
          role={msg.role}
          text={msg.text}
          expression={msg.expression}
          characterName={characterName}
          dark={dark}
        />
      );
    });
  }, [timeline, onToolConfirm, characterName, dark]);

  return (
    <div className="flex-1 flex flex-col bg-transparent relative h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 scrollbar-thin">
        {timeline.length === 0 && !streamingText && (
          <div className="mt-16 flex flex-col items-center text-center">
            <Mascot mood="neutral" className="h-16 w-16" />
            <p className="mt-4 text-sm font-semibold text-ink">Say hello to {characterName}</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-3">
              Share what&apos;s on your mind: a small update, a worry, or just because you want to talk.
            </p>
            <AsciiAccent rows={3} cols={18} density={0.7} className="mt-4" />
          </div>
        )}

        {renderedTimeline}

        {/* Streaming text: always the latest assistant turn */}
        {streamingText && (
          <div className="flex flex-col items-start animate-in fade-in duration-150">
            <div
              className={`max-w-[88%] rounded-card rounded-tl-[10px] px-4 py-3 ${
                dark
                  ? "bg-white/10 text-white/90 shadow-soft"
                  : "bg-surface-2 shadow-soft text-ink"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`text-[12px] font-semibold ${dark ? "text-white/60" : "text-ink-3"}`}>
                  {characterName}
                </span>
                <Dots size="sm" />
              </div>
              <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">
                {streamingText}
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator: after tools finish, before the next assistant reply */}
        {loading && !streamingText && !hasRunningTool && (
          <div className="flex justify-start animate-in fade-in duration-200">
            <div
              className={`max-w-[88%] rounded-card rounded-tl-[10px] px-4 py-3 ${
                dark ? "bg-white/10 shadow-soft" : "bg-surface-2 shadow-soft"
              }`}
            >
              <div className="flex items-center gap-3">
                <Dots />
                <span className="text-xs font-medium text-ink-3">
                  {hasAnyTool ? "Continuing" : "Thinking"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Voice generating indicator */}
        {ttsLoading && !loading && (
          <div className="flex justify-start">
            <div
              className={`max-w-[88%] rounded-card rounded-tl-[10px] px-4 py-3 ${
                dark ? "bg-white/10 shadow-soft" : "bg-surface-2 shadow-soft"
              }`}
            >
              <Pill tone="accent" dot pulse>
                Speaking…
              </Pill>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-6" />
      </div>

      {/* Status Bar */}
      {(speaking || ttsLoading) && !hideInput && (
        <div className="flex items-center gap-2 px-4 py-1.5">
          <Pill tone="accent" dot pulse>
            {speaking ? "Speaking" : "Generating voice"}
          </Pill>
          <span className="text-xs text-ink-3">{characterName}</span>
        </div>
      )}

      {!hideInput && (
        <ChatInput
          isProcessing={isProcessing}
          isStreaming={loading}
          onSend={onSend}
          onCancel={onCancel}
          onTypingChange={onTypingChange}
          listening={listening}
          onMicToggle={onMicToggle}
          inputRef={inputRef as React.RefObject<HTMLInputElement | null>}
        />
      )}
    </div>
  );
}
