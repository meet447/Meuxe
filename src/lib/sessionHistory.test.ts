import { describe, expect, it } from "vitest";
import { sessionMessagesToChat } from "./sessionHistory";
import type { SessionMessage } from "../types";

describe("sessionMessagesToChat", () => {
  it("maps user and assistant rows to chat messages", () => {
    const rows: SessionMessage[] = [
      { ts: "2026-01-01T00:00:00Z", role: "user", content: "Hi" },
      { ts: "2026-01-01T00:00:01Z", role: "assistant", content: "Hello" },
    ];
    expect(sessionMessagesToChat(rows)).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("skips system messages", () => {
    const rows: SessionMessage[] = [
      { ts: "2026-01-01T00:00:00Z", role: "system", content: "ignored" },
      { ts: "2026-01-01T00:00:01Z", role: "user", content: "Hi" },
    ];
    expect(sessionMessagesToChat(rows)).toEqual([{ role: "user", content: "Hi" }]);
  });
});
