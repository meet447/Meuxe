import { useEffect, useState, useRef } from "react";
import type { ChatMessage } from "../types";
import { Dots } from "./ui";

interface Props {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
}

interface VisibleMessage {
  key: string;
  role: "user" | "assistant";
  text: string;
  fading: boolean;
}

const FADE_AFTER_MS = 8000;
const MAX_VISIBLE = 3;

export function MiniFloatingMessages({ messages, streamingText, isStreaming }: Props) {
  const [visible, setVisible] = useState<VisibleMessage[]>([]);
  const fadeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastCountRef = useRef(0);

  // When new messages arrive, show them and set up fade timers
  useEffect(() => {
    const count = messages.length;
    if (count <= lastCountRef.current && count > 0) {
      lastCountRef.current = count;
      return;
    }
    lastCountRef.current = count;

    const recent = messages.slice(-MAX_VISIBLE);
    const newVisible: VisibleMessage[] = recent.map((msg, i) => ({
      key: `msg-${count - recent.length + i}`,
      role: msg.role,
      text: msg.text,
      fading: false,
    }));

    setVisible(newVisible);

    // Clear old timers
    for (const timer of fadeTimers.current.values()) {
      clearTimeout(timer);
    }
    fadeTimers.current.clear();

    if (newVisible.length > 0) {
      // Batch set fade timers for the new messages
      const keysToFade = new Set(newVisible.map((m) => m.key));

      const timer = setTimeout(() => {
        setVisible((prev) =>
          prev.map((m) => (keysToFade.has(m.key) ? { ...m, fading: true } : m)),
        );

        // Remove after fade animation completes
        const removeTimer = setTimeout(() => {
          setVisible((prev) => prev.filter((m) => !keysToFade.has(m.key)));
        }, 500);

        fadeTimers.current.set("remove-batch", removeTimer);
      }, FADE_AFTER_MS);

      fadeTimers.current.set("fade-batch", timer);
    }

    return () => {
      for (const timer of fadeTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, [messages.length]);

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "..." : text;

  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-col gap-1.5">
      {visible.map((msg) => (
        <div
          key={msg.key}
          className={`transition-all duration-500 ${
            msg.fading ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"
          } ${msg.role === "user" ? "self-end" : "self-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-card px-3 py-1.5 text-[11px] leading-relaxed shadow-soft backdrop-blur ${
              msg.role === "user"
                ? "rounded-tr-[10px] bg-peach-100/95 text-ink"
                : "rounded-tl-[10px] bg-surface-2/95 text-ink"
            }`}
          >
            {truncate(msg.text, 100)}
          </div>
        </div>
      ))}

      {/* Streaming preview */}
      {isStreaming && streamingText && (
        <div className="self-start opacity-90 transition-all duration-200">
          <div className="max-w-[85%] rounded-card rounded-tl-[10px] bg-surface-2/95 px-3 py-1.5 text-[11px] leading-relaxed text-ink shadow-soft backdrop-blur">
            {truncate(streamingText, 80)}
            <span className="ml-1 inline-flex align-middle">
              <Dots size="sm" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
