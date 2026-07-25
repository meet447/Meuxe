import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudio, installFakeAudio } from "../test/fakeAudio";
import { useAudioQueue } from "./useAudioQueue";

vi.mock("./useAudioAnalyser", () => ({
  useAudioAnalyser: () => ({
    connectAudio: vi.fn(),
    disconnect: vi.fn(),
    getAudioLevels: vi.fn(() => ({ volume: 0, frequencies: [] })),
  }),
}));

const sentence = (index: number) => ({
  index,
  expression: `expr-${index}`,
  text: `sentence-${index}`,
});

describe("useAudioQueue", () => {
  beforeEach(() => {
    FakeAudio.reset();
    installFakeAudio();
  });

  it("skips a failed middle sentence and plays index 2", async () => {
    const { result } = renderHook(() => useAudioQueue());

    act(() => {
      result.current.beginRequest("r1");
      [0, 1, 2].forEach((index) => result.current.addSentence("r1", sentence(index)));
      result.current.addAudio("r1", 0, "a0");
      result.current.failAudio("r1", 1);
      result.current.addAudio("r1", 2, "a2");
    });

    await act(async () => {
      FakeAudio.instances[0].finish();
    });

    expect(FakeAudio.instances[1].src).toContain("a2");
  });

  it("ignores old audio and pauses active playback on begin", () => {
    const { result } = renderHook(() => useAudioQueue());

    act(() => {
      result.current.beginRequest("old");
      result.current.addSentence("old", sentence(0));
      result.current.addAudio("old", 0, "old-audio");
    });
    act(() => result.current.beginRequest("new"));

    expect(FakeAudio.instances[0].pause).toHaveBeenCalledOnce();
    act(() => result.current.addAudio("old", 0, "late-old-audio"));
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("advances after browser audio playback errors", async () => {
    const { result } = renderHook(() => useAudioQueue());

    act(() => {
      result.current.beginRequest("r1");
      result.current.addSentence("r1", sentence(0));
      result.current.addSentence("r1", sentence(1));
      result.current.addAudio("r1", 0, "a0");
      result.current.addAudio("r1", 1, "a1");
    });
    await act(async () => {
      FakeAudio.instances[0].fail();
    });

    expect(FakeAudio.instances[1].src).toContain("a1");
  });

  it("emits audio done once after text and all audio finish", async () => {
    const onAudioDone = vi.fn();
    const { result } = renderHook(() => useAudioQueue());

    act(() => {
      result.current.setOnAudioDone(onAudioDone);
      result.current.beginRequest("r1");
      result.current.addSentence("r1", sentence(0));
      result.current.addAudio("r1", 0, "a0");
      result.current.markTextDone("r1");
    });
    await act(async () => {
      FakeAudio.instances[0].finish();
    });

    expect(onAudioDone).toHaveBeenCalledOnce();
    expect(onAudioDone).toHaveBeenCalledWith("r1");
    act(() => result.current.markTextDone("r1"));
    expect(onAudioDone).toHaveBeenCalledOnce();
  });

  it("fails pending audio and completes after a chat error", () => {
    const onAudioDone = vi.fn();
    const { result } = renderHook(() => useAudioQueue());

    act(() => {
      result.current.setOnAudioDone(onAudioDone);
      result.current.beginRequest("r1");
      result.current.addSentence("r1", sentence(0));
      result.current.failRequest("r1");
    });

    expect(onAudioDone).toHaveBeenCalledWith("r1");
    expect(FakeAudio.instances).toHaveLength(0);
  });
});
