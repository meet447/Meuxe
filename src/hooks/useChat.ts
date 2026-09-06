import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { sendChat, cancelChat, confirmToolCall } from "../api/tauri";
import type { ChatTimelineItem, MemorySnapshot, ToolCallStatus } from "../types";

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
  state_update: MemorySnapshot | null;
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

interface TextChunkPayload {
  request_id: string;
  text: string;
}

interface CancelledPayload {
  request_id: string;
}

interface ToolCallStartPayload {
  request_id: string;
  tool_call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

interface ToolCallResultPayload {
  request_id: string;
  tool_call_id: string;
  tool_name: string;
  result: string;
  success: boolean;
}

interface ToolConfirmPayload {
  request_id: string;
  tool_call_id: string;
  permission_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  description: string;
  options: { id: string; name: string; kind: string }[];
}

const cleanExpressionTags = (text: string) =>
  text
    .replace(/<<\/?[^>]*>>\s*/g, "")
    .replace(/\[(?:expression:\s*)?[a-zA-Z0-9_\-]+\]\s*/g, "");

const TURN_NOTE_KEYS = new Set([
  "remember",
  "moment",
  "mood",
  "closeness",
  "open_threads",
  "closed_threads",
]);

function stripTrailingTurnNotesJson(text: string): string {
  const end = text.lastIndexOf("}");
  if (end === -1) return text;
  const start = text.lastIndexOf("{", end);
  if (start === -1) return text;
  const after = text.slice(end + 1).trim();
  if (after !== "" && after !== "```") return text;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const keys = Object.keys(value);
    if (
      keys.length >= 2 &&
      keys.every((key) => TURN_NOTE_KEYS.has(key))
    ) {
      return text.slice(0, start).replace(/```json\s*$/i, "").replace(/```\s*$/, "").trimEnd();
    }
  } catch {
    /* not JSON */
  }
  return text;
}

export function cleanCompanionDisplayText(text: string) {
  return stripTrailingTurnNotesJson(
    cleanExpressionTags(text)
      .replace(/<<<meuxe[\s\S]*?(>>>|$)/g, "")
      .trim(),
  ).trim();
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
  const activeRequestIdRef = useRef<string | null>(null);

  const onSentenceRef = useRef<((data: SentencePayload) => void) | null>(null);
  const onAudioRef = useRef<((data: AudioPayload) => void) | null>(null);
  const onAudioFailedRef = useRef<((data: AudioFailedPayload) => void) | null>(null);
  const onDoneRef = useRef<((data: DonePayload) => void) | null>(null);
  const onErrorRef = useRef<((requestId: string) => void) | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);
  const audioUnlistenersRef = useRef<UnlistenFn[]>([]);
  const streamingRafRef = useRef<number | null>(null);
  const streamingDirtyRef = useRef(false);

  const scheduleStreamingTextUpdate = useCallback(() => {
    streamingDirtyRef.current = true;
    if (streamingRafRef.current !== null) return;
    streamingRafRef.current = requestAnimationFrame(() => {
      streamingRafRef.current = null;
      if (!streamingDirtyRef.current) return;
      streamingDirtyRef.current = false;
      setStreamingText(cleanCompanionDisplayText(displayTextRef.current));
    });
  }, []);

  const flushStreamingText = useCallback(() => {
    if (streamingRafRef.current !== null) {
      cancelAnimationFrame(streamingRafRef.current);
      streamingRafRef.current = null;
    }
    streamingDirtyRef.current = false;
    setStreamingText(cleanCompanionDisplayText(displayTextRef.current));
  }, []);

  const toolCalls = useMemo(
    () =>
      timeline
        .filter((item): item is Extract<ChatTimelineItem, { kind: "tool" }> => item.kind === "tool")
        .map((item) => item.call),
    [timeline],
  );

  const tearDownListeners = useCallback((keepAudio = false) => {
    // Audio listeners outlive the turn so late TTS chunks still play; dedupe so a
    // kept listener is never unlistened twice.
    const toRemove = new Set(unlistenersRef.current);
    if (!keepAudio) {
      for (const unlisten of audioUnlistenersRef.current) toRemove.add(unlisten);
      audioUnlistenersRef.current = [];
    } else {
      for (const unlisten of audioUnlistenersRef.current) toRemove.delete(unlisten);
    }
    for (const unlisten of toRemove) {
      unlisten();
    }
    unlistenersRef.current = keepAudio ? audioUnlistenersRef.current : [];
  }, []);

  const commitStreamingSegment = useCallback(() => {
    const text = cleanCompanionDisplayText(displayTextRef.current).trim();
    displayTextRef.current = "";
    if (streamingRafRef.current !== null) {
      cancelAnimationFrame(streamingRafRef.current);
      streamingRafRef.current = null;
    }
    streamingDirtyRef.current = false;
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
      const index = prev.findIndex(
        (item) => item.kind === "tool" && item.call.toolCallId === call.toolCallId,
      );
      if (index === -1) {
        return [...prev, { id: call.toolCallId, kind: "tool", call }];
      }
      const next = [...prev];
      next[index] = { id: call.toolCallId, kind: "tool", call };
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async (permissionId: string, approved: boolean) => {
    setTimeline((prev) =>
      prev.map((item) => {
        if (item.kind !== "tool" || item.call.permissionId !== permissionId) return item;
        return {
          ...item,
          call: {
            ...item.call,
            status: approved ? "running" : "failed",
            result: approved ? undefined : "Denied by user",
          },
        };
      }),
    );
    try {
      await confirmToolCall(permissionId, approved);
    } catch (err) {
      console.error("Tool confirm error:", err);
      setTimeline((prev) =>
        prev.map((item) => {
          if (item.kind !== "tool" || item.call.permissionId !== permissionId) return item;
          return {
            ...item,
            call: {
              ...item.call,
              status: "failed",
              result: "Failed to send confirmation",
            },
          };
        }),
      );
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!isStreaming) return;
    try {
      await cancelChat();
    } catch (err) {
      console.error("Cancel chat error:", err);
    }
  }, [isStreaming]);

  const send = useCallback(
    async (characterId: string, message: string, requestId: string) => {
      if (isStreaming) return;

      activeRequestIdRef.current = requestId;
      segmentCounterRef.current = 0;
      displayTextRef.current = "";
      lastExpressionRef.current = "neutral";

      setTimeline((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, kind: "user", text: message },
      ]);
      setStreamingText("");
      setIsStreaming(true);

      tearDownListeners();

      const handleCancelled = (payload: CancelledPayload) => {
        if (payload.request_id !== requestId) return;
        flushStreamingText();
        commitStreamingSegment();
        setIsStreaming(false);
        activeRequestIdRef.current = null;
        tearDownListeners();
      };

      const handleDone = (payload: DonePayload) => {
        if (payload.request_id !== requestId) return;
        flushStreamingText();
        commitStreamingSegment();
        setIsStreaming(false);
        activeRequestIdRef.current = null;
        onDoneRef.current?.(payload);
        tearDownListeners(true);
      };

      const handleError = (payload: ChatErrorPayload) => {
        if (payload.request_id !== requestId) return;
        console.error("Chat error:", payload.message);
        onErrorRef.current?.(requestId);
        flushStreamingText();
        commitStreamingSegment();
        setIsStreaming(false);
        activeRequestIdRef.current = null;
        tearDownListeners();
      };

      const [
        unlistenText,
        unlistenSentence,
        unlistenAudio,
        unlistenAudioFailed,
        unlistenToolStart,
        unlistenToolResult,
        unlistenToolConfirm,
        unlistenDone,
        unlistenError,
        unlistenCancelled,
      ] = await Promise.all([
        listen<TextChunkPayload>("chat:text-chunk", (event) => {
          if (event.payload.request_id !== requestId) return;
          displayTextRef.current += event.payload.text;
          scheduleStreamingTextUpdate();
        }),
        listen<SentencePayload>("chat:sentence", (event) => {
          if (event.payload.request_id !== requestId) return;
          lastExpressionRef.current = event.payload.expression;
          onSentenceRef.current?.(event.payload);
        }),
        listen<AudioPayload>("chat:audio", (event) => {
          if (event.payload.request_id !== requestId) return;
          onAudioRef.current?.(event.payload);
        }),
        listen<AudioFailedPayload>("chat:audio-failed", (event) => {
          if (event.payload.request_id !== requestId) return;
          onAudioFailedRef.current?.(event.payload);
        }),
        listen<ToolCallStartPayload>("chat:tool-call-start", (event) => {
          const { request_id, tool_call_id, tool_name, arguments: args } = event.payload;
          if (request_id !== requestId) return;
          commitStreamingSegment();
          upsertToolCall({
            requestId: request_id,
            toolCallId: tool_call_id,
            toolName: tool_name,
            arguments: args,
            status: "running",
          });
        }),
        listen<ToolCallResultPayload>("chat:tool-call-result", (event) => {
          const { request_id, tool_call_id, result, success } = event.payload;
          if (request_id !== requestId) return;
          setTimeline((prev) =>
            prev.map((item) => {
              if (item.kind !== "tool" || item.call.toolCallId !== tool_call_id) return item;
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
        }),
        listen<ToolConfirmPayload>("chat:tool-confirm", (event) => {
          const {
            request_id,
            tool_call_id,
            permission_id,
            tool_name,
            arguments: args,
            description,
          } = event.payload;
          if (request_id !== requestId) return;
          commitStreamingSegment();
          upsertToolCall({
            requestId: request_id,
            toolCallId: tool_call_id,
            permissionId: permission_id,
            toolName: tool_name,
            arguments: args,
            description,
            status: "awaiting_confirmation",
          });
        }),
        listen<DonePayload>("chat:done", (event) => handleDone(event.payload)),
        listen<ChatErrorPayload>("chat:error", (event) => handleError(event.payload)),
        listen<CancelledPayload>("chat:cancelled", (event) => handleCancelled(event.payload)),
      ]);

      unlistenersRef.current = [
        unlistenText,
        unlistenSentence,
        unlistenDone,
        unlistenError,
        unlistenToolStart,
        unlistenToolResult,
        unlistenToolConfirm,
        unlistenCancelled,
      ];
      audioUnlistenersRef.current = [unlistenAudio, unlistenAudioFailed];

      try {
        await sendChat(characterId, message, requestId);
      } catch (err) {
        // The command itself failed (no chat:error will follow), so unwind here.
        handleError({
          request_id: requestId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [isStreaming, commitStreamingSegment, upsertToolCall, tearDownListeners, scheduleStreamingTextUpdate, flushStreamingText],
  );

  useEffect(() => {
    return () => {
      if (streamingRafRef.current !== null) {
        cancelAnimationFrame(streamingRafRef.current);
      }
      tearDownListeners();
    };
  }, [tearDownListeners]);

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
    setMessages,
    timeline,
    streamingText,
    isStreaming,
    send,
    cancel,
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    toolCalls,
    handleConfirm,
  };
}
