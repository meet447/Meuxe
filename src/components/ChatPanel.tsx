import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatTimelineItem } from "../types";
import { MicButton } from "./MicButton";
import { ToolCallBubble } from "./ToolCallBubble";

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
  onToolConfirm?: (requestId: string, approved: boolean) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

// Markdown component config — shared between messages and streaming
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-slate-800">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-slate-600">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-1 text-slate-700">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1 text-slate-700">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <div className="my-2 rounded-xl overflow-hidden">
          <div className="bg-slate-800 px-4 py-0.5 flex items-center">
            <span className="text-[10px] text-slate-400 font-mono uppercase">
              {className?.replace("language-", "") || "code"}
            </span>
          </div>
          <pre className="bg-slate-900 text-slate-200 px-4 py-3 overflow-x-auto text-[13px] leading-relaxed">
            <code>{children}</code>
          </pre>
        </div>
      );
    }
    return (
      <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md text-[13px] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-3 border-blue-300 pl-3 my-2 text-slate-600 italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} className="text-blue-500 hover:text-blue-600 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold text-slate-800 mb-2 mt-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-bold text-slate-800 mb-1.5 mt-2.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold text-slate-800 mb-1 mt-2 first:mt-0">{children}</h3>
  ),
  hr: () => <hr className="my-3 border-slate-200/60" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-[13px] border border-slate-200 rounded-lg overflow-hidden">
        {children}
      </table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="bg-slate-50 px-3 py-1.5 text-left font-semibold text-slate-700 border-b border-slate-200">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-1.5 border-b border-slate-100 text-slate-600">{children}</td>
  ),
};

const MarkdownContent = memo(({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={markdownComponents as any}
  >
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
}: {
  role: "user" | "assistant";
  text: string;
  expression?: string;
  characterName: string;
}) {
  const isUser = role === "user";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
      {isUser && (
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 px-2">
          You
        </span>
      )}
      <div
        className={`max-w-[88%] rounded-3xl px-5 py-3 ${
          isUser
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-lg shadow-md shadow-blue-500/20"
            : "bg-white text-slate-700 rounded-tl-lg border border-slate-100 shadow-sm"
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] text-blue-500 font-semibold tracking-wide uppercase">
              {characterName}
            </span>
            {expression && expression !== "neutral" && (
              <span className="text-[10px] text-slate-400 font-normal capitalize bg-slate-50 px-2 py-0.5 rounded-full">
                {expression}
              </span>
            )}
          </div>
        )}
        <div className={`text-[14px] leading-relaxed break-words ${isUser ? "text-white/95" : "text-slate-700"}`}>
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
  onSend,
  onTypingChange,
  listening,
  onMicToggle,
  inputRef,
}: {
  isProcessing: boolean;
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  listening: boolean;
  onMicToggle: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
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
    <div className="w-full bg-white/90 backdrop-blur-md pb-4 pt-2 border-t border-slate-100/50">
      <form onSubmit={handleSubmit} className="px-4 flex items-center gap-2">
        <div className="flex-1 relative group">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Say something..."
            className="w-full bg-slate-50 hover:bg-slate-100/80 text-slate-700 rounded-2xl pl-5 pr-12 py-3 text-[14px] outline-none transition-all placeholder-slate-400 border border-slate-100 disabled:opacity-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-200"
            disabled={isProcessing}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <MicButton listening={listening} onToggle={onMicToggle} />
          </div>
        </div>
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none text-white rounded-2xl w-11 h-11 flex items-center justify-center transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0"
        >
          {isProcessing ? (
            <span className="w-4 h-4 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
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
  inputRef: externalInputRef,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline, streamingText]);

  const isProcessing = loading || ttsLoading;
  // ⚡ Bolt: Cache array iteration over timeline to prevent O(N) evaluation on every keystroke/streaming token
  const hasRunningTool = useMemo(() => timeline.some(
    (item) => item.kind === "tool" && item.call.status === "running",
  ), [timeline]);

  const hasAnyTool = useMemo(() => timeline.some((item) => item.kind === "tool"), [timeline]);

  // ⚡ Bolt: Memoize the mapping of history elements to prevent deep recreation
  // and O(N) rendering passes of all past messages while text streams rapidly.
  const renderedMessages = useMemo(() => timeline.map((item) => {
    if (item.kind === "tool") {
      return (
        <ToolCallBubble
          key={item.id}
          call={item.call}
          onConfirm={onToolConfirm}
        />
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
      />
    );
  }), [timeline, characterName, onToolConfirm]);

  return (
    <div className="flex-1 flex flex-col bg-transparent relative h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {timeline.length === 0 && !streamingText && (
          <div className="text-slate-400 text-center mt-16 flex flex-col items-center">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-300 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">Say hello to {characterName}!</p>
            <p className="text-xs text-slate-400 mt-1">Ask me anything or give me a task</p>
          </div>
        )}

        {renderedMessages}

        {/* Streaming text — always the latest assistant turn */}
        {streamingText && (
          <div className="flex flex-col items-start animate-in fade-in duration-150">
            <div className="max-w-[88%] rounded-3xl rounded-tl-lg px-5 py-3 bg-white border border-slate-100 shadow-sm text-slate-700">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] text-blue-500 font-semibold tracking-wide uppercase">
                  {characterName}
                </span>
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:0.15s]" />
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:0.3s]" />
                </span>
              </div>
              <div className="text-[14px] leading-relaxed">
                <MarkdownContent content={streamingText} />
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator — after tools finish, before the next assistant reply */}
        {loading && !streamingText && !hasRunningTool && (
          <div className="flex justify-start animate-in fade-in duration-200">
            <div className="bg-white border border-slate-100 shadow-sm rounded-3xl rounded-tl-lg px-5 py-4">
              <div className="flex items-center gap-3 text-slate-400">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400/60 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-blue-400/60 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-blue-400/60 animate-bounce" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {hasAnyTool ? "Continuing" : "Thinking"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TTS Generating indicator */}
        {ttsLoading && !loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 shadow-sm rounded-3xl rounded-tl-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                </div>
                <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Speaking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-6" />
      </div>

      {/* Status Bar */}
      {(speaking || ttsLoading) && (
        <div className="px-4 py-1.5 bg-blue-50/60 backdrop-blur-sm border-t border-blue-100/40 flex items-center justify-between text-[10px] text-blue-600/70 font-medium uppercase tracking-widest z-10">
          <div className="flex items-center gap-2">
            {speaking && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />}
            <span>{speaking ? "Playing audio" : "Generating voice"}</span>
          </div>
          <span className="opacity-70">{characterName}</span>
        </div>
      )}

      {/* Input Form */}
      <ChatInput
        isProcessing={isProcessing}
        onSend={onSend}
        onTypingChange={onTypingChange}
        listening={listening}
        onMicToggle={onMicToggle}
        inputRef={inputRef as React.RefObject<HTMLInputElement | null>}
      />
    </div>
  );
}
