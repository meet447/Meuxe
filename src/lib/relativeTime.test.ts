import { describe, it, expect } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = new Date("2026-09-05T12:00:00Z");

describe("relativeTime", () => {
  it("returns just now for under a minute", () => {
    expect(relativeTime(30, NOW)).toBe("just now");
    expect(relativeTime("2026-09-05T11:59:30Z", NOW)).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(relativeTime(90, NOW)).toBe("1 minute ago");
    expect(relativeTime(300, NOW)).toBe("5 minutes ago");
    expect(relativeTime("2026-09-05T11:55:00Z", NOW)).toBe("5 minutes ago");
  });

  it("returns hours ago", () => {
    expect(relativeTime(3600, NOW)).toBe("1 hour ago");
    expect(relativeTime(7200, NOW)).toBe("2 hours ago");
    expect(relativeTime("2026-09-05T09:00:00Z", NOW)).toBe("3 hours ago");
  });

  it("returns yesterday", () => {
    expect(relativeTime(86400, NOW)).toBe("yesterday");
    expect(relativeTime("2026-09-04T12:00:00Z", NOW)).toBe("yesterday");
  });

  it("returns days ago", () => {
    expect(relativeTime(172800, NOW)).toBe("2 days ago");
    expect(relativeTime("2026-09-02T12:00:00Z", NOW)).toBe("3 days ago");
  });

  it("returns weeks ago", () => {
    expect(relativeTime(604800, NOW)).toBe("1 week ago");
    expect(relativeTime(1209600, NOW)).toBe("2 weeks ago");
    expect(relativeTime("2026-08-15T12:00:00Z", NOW)).toBe("3 weeks ago");
  });
});
