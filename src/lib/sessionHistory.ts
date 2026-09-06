import type { SessionMessage } from "../types";

export interface HistoryChatMessage {
  role: "user" | "assistant";
  content: string;
  expression?: string;
}

/** Map persisted session rows into the shape expected by `useChat().setMessages`. */
export function sessionMessagesToChat(messages: SessionMessage[]): HistoryChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") {
      return [];
    }
    return [{ role: message.role, content: message.content }];
  });
}
