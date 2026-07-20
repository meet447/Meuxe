import { useState, useRef, useCallback, useMemo } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { sendChat, confirmToolCall } from "../api/tauri";
import type { ChatTimelineItem, ToolCallStatus } from "../types";

interface Message {
  role: "user" | "assistant";
  content: string;
  expression?: string;
}

interface SentencePayload {
  request_id: string;
  index: number;
  text: string;
  expression: string;
}

interface AudioPayload {
  request_id: string;
  index: number;
  data: string;
}

interface DonePayload {
  request_id: string;
  state_update: unknown;
}

interface AudioFailedPayload {
  request_id: string;
  index: number;
  reason: "provider_error" | "timeout";
  message: string;
}

interface ChatErrorPayload {
  request_id: string;
  message: string;
}

interface ToolCallStartPayload {
  request_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

interface ToolCallResultPayload {
  request_id: string;
  tool_name: string;
  result: string;
  success: boolean;
}

interface ToolConfirmPayload {
  request_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  description: string;
}

const cleanExpressionTags = (text: string) =>
  text
    .replace(/<<\/?[^>]*>>\s*/g, "")
    .replace(/\[(?:expression:\s*)?[a-zA-Z0-9_\-]+\]\s*/g, "");

function timelineToMessages(items: ChatTimelineItem[]): Message[] {
  return items.flatMap((item) => {
    if (item.kind === "tool") return [];
    return [
      {
        role: item.kind,
        content: item.text,
        expression: item.kind === "assistant" ? item.expression : undefined,
      },
    ];
  });
}

function messagesToTimeline(messages: Message[]): ChatTimelineItem[] {
  return messages.map((message, index) => {
    if (message.role === "user") {
      return { id: `user-${index}`, kind: "user", text: message.content };
    }
    return {
      id: `assistant-${index}`,
      kind: "assistant",
      text: message.content,
      expression: message.expression,
    };
  });
}

export function useChat() {
  const [timeline, setTimeline] = useState<ChatTimelineItem[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const displayTextRef = useRef("");
  const lastExpressionRef = useRef("neutral");
  const segmentCounterRef = useRef(0);

  const onSentenceRef = useRef<((data: SentencePayload) => void) | null>(null);
  const onAudioRef = useRef<((data: AudioPayload) => void) | null>(null);
  const onAudioFailedRef = useRef<((data: AudioFailedPayload) => void) | null>(null);
  const onDoneRef = useRef<((data: DonePayload) => void) | null>(null);
  const onErrorRef = useRef<((requestId: string) => void) | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const messages = useMemo(() => timelineToMessages(timeline), [timeline]);

  const toolCalls = useMemo(
    () =>
      timeline
        .filter((item): item is Extract<ChatTimelineItem, { kind: "tool" }> => item.kind === "tool")
        .map((item) => item.call),
    [timeline],
  );

  const commitStreamingSegment = useCallback(() => {
    const text = cleanExpressionTags(displayTextRef.current).trim();
    displayTextRef.current = "";
    setStreamingText("");

    if (!text) return;

    const expression =
      lastExpressionRef.current !== "neutral" ? lastExpressionRef.current : undefined;
    const segmentId = segmentCounterRef.current++;
    setTimeline((prev) => [
      ...prev,
      {
        id: `assistant-${segmentId}`,
        kind: "assistant",
        text,
        expression,
      },
    ]);
  }, []);

  const upsertToolCall = useCallback((call: ToolCallStatus) => {
    setTimeline((prev) => {
      const index = prev.findIndex((item) => item.kind === "tool" && item.id === call.requestId);
      if (index === -1) {
        return [...prev, { id: call.requestId, kind: "tool", call }];
      }
      const next = [...prev];
      next[index] = { id: call.requestId, kind: "tool", call };
      return next;
    });
  }, []);

  const handleConfirm = useCallback(
    async (requestId: string, approved: boolean) => {
      await confirmToolCall(requestId, approved);
      setTimeline((prev) =>
        prev.map((item) => {
          if (item.kind !== "tool" || item.id !== requestId) return item;
          return {
            ...item,
            call: {
              ...item.call,
              status: approved ? ("running" as const) : ("failed" as const),
              result: approved ? undefined : "User denied this action.",
            },
          };
        }),
      );
    },
    [],
  );

  const send = useCallback(
    async (characterId: string, message: string, requestId: string) => {
      if (isStreaming) return;

      segmentCounterRef.current = 0;
      displayTextRef.current = "";
      lastExpressionRef.current = "neutral";

      setTimeline((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, kind: "user", text: message },
      ]);
      setStreamingText("");
      setIsStreaming(true);

      for (const unlisten of unlistenersRef.current) {
        unlisten();
      }
      unlistenersRef.current = [];

      const unlistenText = await listen<{ text: string }>(
        "chat:text-chunk",
        (event) => {
          displayTextRef.current += event.payload.text;
          setStreamingText(cleanExpressionTags(displayTextRef.current));
        },
      );

      const unlistenSentence = await listen<SentencePayload>(
        "chat:sentence",
        (event) => {
          lastExpressionRef.current = event.payload.expression;
          onSentenceRef.current?.(event.payload);
        },
      );

      const unlistenAudio = await listen<AudioPayload>("chat:audio", (event) => {
        onAudioRef.current?.(event.payload);
      });

      const unlistenAudioFailed = await listen<AudioFailedPayload>(
        "chat:audio-failed",
        (event) => {
          onAudioFailedRef.current?.(event.payload);
        },
      );

      const unlistenToolStart = await listen<ToolCallStartPayload>(
        "chat:tool-call-start",
        (event) => {
          const { request_id, tool_name, arguments: args } = event.payload;
          commitStreamingSegment();
          upsertToolCall({
            requestId: request_id,
            toolName: tool_name,
            arguments: args,
            status: "running",
          });
        },
      );

      const unlistenToolResult = await listen<ToolCallResultPayload>(
        "chat:tool-call-result",
        (event) => {
          const { request_id, result, success } = event.payload;
          setTimeline((prev) =>
            prev.map((item) => {
              if (item.kind !== "tool" || item.id !== request_id) return item;
              return {
                ...item,
                call: {
                  ...item.call,
                  status: success ? "completed" : "failed",
                  result,
                },
              };
            }),
          );
        },
      );

      const unlistenToolConfirm = await listen<ToolConfirmPayload>(
        "chat:tool-confirm",
        (event) => {
          const { request_id, tool_name, arguments: args } = event.payload;
          commitStreamingSegment();
          upsertToolCall({
            requestId: request_id,
            toolName: tool_name,
            arguments: args,
            status: "awaiting_confirmation",
          });
        },
      );

      const unlistenDone = await listen<DonePayload>("chat:done", (event) => {
        if (event.payload.request_id !== requestId) return;
        commitStreamingSegment();
        setIsStreaming(false);
        onDoneRef.current?.(event.payload);
        unlistenText();
        unlistenSentence();
        unlistenDone();
        unlistenError();
        unlistenToolStart();
        unlistenToolResult();
        unlistenToolConfirm();
        unlistenersRef.current = [unlistenAudio, unlistenAudioFailed];
      });

      const unlistenError = await listen<ChatErrorPayload>("chat:error", (event) => {
        if (event.payload.request_id !== requestId) return;
        console.error("Chat error:", event.payload.message);
        onErrorRef.current?.(requestId);
        commitStreamingSegment();
        setIsStreaming(false);
        for (const u of unlistenersRef.current) {
          u();
        }
        unlistenersRef.current = [];
      });

      unlistenersRef.current = [
        unlistenText,
        unlistenSentence,
        unlistenAudio,
        unlistenAudioFailed,
        unlistenDone,
        unlistenError,
        unlistenToolStart,
        unlistenToolResult,
        unlistenToolConfirm,
      ];

      await sendChat(characterId, message, requestId);
    },
    [isStreaming, commitStreamingSegment, upsertToolCall],
  );

  const setMessages = useCallback((next: Message[]) => {
    segmentCounterRef.current = next.length;
    setTimeline(messagesToTimeline(next));
    setStreamingText("");
  }, []);

  const setOnSentence = useCallback((cb: (data: SentencePayload) => void) => {
    onSentenceRef.current = cb;
  }, []);

  const setOnAudio = useCallback((cb: (data: AudioPayload) => void) => {
    onAudioRef.current = cb;
  }, []);

  const setOnAudioFailed = useCallback((cb: (data: AudioFailedPayload) => void) => {
    onAudioFailedRef.current = cb;
  }, []);

  const setOnDone = useCallback((cb: (data: DonePayload) => void) => {
    onDoneRef.current = cb;
  }, []);

  const setOnError = useCallback((cb: (requestId: string) => void) => {
    onErrorRef.current = cb;
  }, []);

  return {
    messages,
    setMessages,
    timeline,
    streamingText,
    isStreaming,
    send,
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    toolCalls,
    handleConfirm,
  };
}
