import { describe, expect, it } from "vitest";
import {
  CHAT_TIMELINE_WINDOW,
  shouldShowEarlierControl,
  sliceWindow,
} from "./chatTimelineWindow";

describe("sliceWindow", () => {
  it("returns all items when under the window size", () => {
    const items = [1, 2, 3];
    expect(sliceWindow(items, CHAT_TIMELINE_WINDOW)).toEqual({
      visible: items,
      hiddenCount: 0,
    });
  });

  it("returns the most recent items and a hidden count", () => {
    const items = Array.from({ length: 75 }, (_, index) => index + 1);
    const result = sliceWindow(items, CHAT_TIMELINE_WINDOW);
    expect(result.hiddenCount).toBe(15);
    expect(result.visible).toHaveLength(60);
    expect(result.visible[0]).toBe(16);
    expect(result.visible[result.visible.length - 1]).toBe(75);
  });
});

describe("shouldShowEarlierControl", () => {
  it("is true only when older items remain hidden", () => {
    expect(shouldShowEarlierControl(15, 75, 60)).toBe(true);
    expect(shouldShowEarlierControl(0, 40, 60)).toBe(false);
    expect(shouldShowEarlierControl(5, 60, 60)).toBe(false);
  });
});
