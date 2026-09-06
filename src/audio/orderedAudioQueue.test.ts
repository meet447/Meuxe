import { describe, expect, it } from "vitest";
import { OrderedAudioQueue } from "./orderedAudioQueue";

const task = (index: number) => ({
  index,
  text: `sentence-${index}`,
  expression: `expr-${index}`,
});

describe("OrderedAudioQueue", () => {
  it("restores order after 1, 2, 0 audio arrival", () => {
    const queue = new OrderedAudioQueue();
    queue.begin("r1");
    [0, 1, 2].forEach((index) => queue.addSentence("r1", task(index)));
    queue.addAudio("r1", 1, "a1");
    queue.addAudio("r1", 2, "a2");
    expect(queue.peekNext()).toEqual({ kind: "wait" });

    queue.addAudio("r1", 0, "a0");
    expect(queue.peekNext()).toMatchObject({ kind: "play", index: 0 });
    queue.advance("r1", 0);
    expect(queue.peekNext()).toMatchObject({ kind: "play", index: 1 });
    queue.advance("r1", 1);
    expect(queue.peekNext()).toMatchObject({ kind: "play", index: 2 });
  });

  it("skips a failed middle sentence and exposes the next ready audio", () => {
    const queue = new OrderedAudioQueue();
    queue.begin("r1");
    [0, 1, 2].forEach((index) => queue.addSentence("r1", task(index)));
    queue.addAudio("r1", 0, "a0");
    queue.failAudio("r1", 1);
    queue.addAudio("r1", 2, "a2");

    queue.advance("r1", 0);
    expect(queue.peekNext()).toEqual({
      kind: "skip",
      requestId: "r1",
      index: 1,
      task: task(1),
    });
    queue.advance("r1", 1);
    expect(queue.peekNext()).toMatchObject({ kind: "play", index: 2 });
  });

  it("ignores stale events after a new request begins", () => {
    const queue = new OrderedAudioQueue();
    queue.begin("old");
    queue.addSentence("old", task(0));
    queue.begin("new");

    expect(queue.addSentence("old", task(0))).toBe("ignored");
    expect(queue.addAudio("old", 0, "stale")).toBe("ignored");
    expect(queue.failAudio("old", 0)).toBe("ignored");
    expect(queue.markTextDone("old")).toBe("ignored");
    expect(queue.peekNext()).toEqual({ kind: "wait" });
  });

  it("accepts audio before sentence without playing incomplete metadata", () => {
    const queue = new OrderedAudioQueue();
    queue.begin("r1");
    queue.addAudio("r1", 0, "a0");
    expect(queue.peekNext()).toEqual({ kind: "wait" });
    queue.addSentence("r1", task(0));
    expect(queue.peekNext()).toMatchObject({ kind: "play", index: 0, audio: "a0" });
  });

  it("keeps the first terminal result when duplicate events conflict", () => {
    const failed = new OrderedAudioQueue();
    failed.begin("r1");
    failed.addSentence("r1", task(0));
    failed.failAudio("r1", 0);
    failed.addAudio("r1", 0, "late-success");
    expect(failed.peekNext()).toMatchObject({ kind: "skip", index: 0 });

    const ready = new OrderedAudioQueue();
    ready.begin("r1");
    ready.addSentence("r1", task(0));
    ready.addAudio("r1", 0, "first-success");
    ready.failAudio("r1", 0);
    expect(ready.peekNext()).toMatchObject({ kind: "play", audio: "first-success" });
  });

  it("separates text done from audio complete and emits complete once", () => {
    const queue = new OrderedAudioQueue();
    queue.begin("r1");
    queue.addSentence("r1", task(0));
    queue.markTextDone("r1");
    expect(queue.peekNext()).toEqual({ kind: "wait" });

    queue.failAudio("r1", 0);
    queue.advance("r1", 0);
    expect(queue.peekNext()).toEqual({ kind: "complete", requestId: "r1" });
    queue.acknowledgeComplete("r1");
    expect(queue.peekNext()).toEqual({ kind: "wait" });
  });

  it("fails pending entries when the chat errors", () => {
    const queue = new OrderedAudioQueue();
    queue.begin("r1");
    queue.addSentence("r1", task(0));
    queue.failPendingAndMarkDone("r1");
    expect(queue.peekNext()).toMatchObject({ kind: "skip", index: 0 });
  });

  it("completes an empty response after text done", () => {
    const queue = new OrderedAudioQueue();
    queue.begin("r1");
    queue.markTextDone("r1");
    expect(queue.peekNext()).toEqual({ kind: "complete", requestId: "r1" });
  });
});
