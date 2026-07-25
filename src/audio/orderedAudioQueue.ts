export interface SentenceTask {
  index: number;
  expression: string;
  text: string;
}

type AudioStatus = "pending" | "ready" | "failed";

interface QueueEntry {
  task?: SentenceTask;
  audio?: string;
  status: AudioStatus;
}

export type QueueDecision =
  | { kind: "wait" }
  | { kind: "skip"; requestId: string; index: number }
  | {
      kind: "play";
      requestId: string;
      index: number;
      task: SentenceTask;
      audio: string;
    }
  | { kind: "complete"; requestId: string };

type MutationResult = "accepted" | "ignored";

export class OrderedAudioQueue {
  private requestId: string | null = null;
  private readonly entries = new Map<number, QueueEntry>();
  private nextToPlay = 0;
  private textDone = false;
  private completionAcknowledged = false;

  begin(requestId: string) {
    this.requestId = requestId;
    this.entries.clear();
    this.nextToPlay = 0;
    this.textDone = false;
    this.completionAcknowledged = false;
  }

  clear() {
    this.requestId = null;
    this.entries.clear();
    this.nextToPlay = 0;
    this.textDone = false;
    this.completionAcknowledged = false;
  }

  activeRequestId() {
    return this.requestId;
  }

  addSentence(requestId: string, task: SentenceTask): MutationResult {
    if (!this.isActive(requestId)) return "ignored";

    const entry = this.entryFor(task.index);
    entry.task = task;
    return "accepted";
  }

  addAudio(requestId: string, index: number, audio: string): MutationResult {
    if (!this.isActive(requestId)) return "ignored";

    const entry = this.entryFor(index);
    if (entry.status === "pending") {
      entry.audio = audio;
      entry.status = "ready";
    }
    return "accepted";
  }

  failAudio(requestId: string, index: number): MutationResult {
    if (!this.isActive(requestId)) return "ignored";

    const entry = this.entryFor(index);
    if (entry.status === "pending") {
      entry.status = "failed";
    }
    return "accepted";
  }

  markTextDone(requestId: string): MutationResult {
    if (!this.isActive(requestId)) return "ignored";
    this.textDone = true;
    return "accepted";
  }

  failPendingAndMarkDone(requestId: string): MutationResult {
    if (!this.isActive(requestId)) return "ignored";

    for (const entry of this.entries.values()) {
      if (entry.status === "pending") entry.status = "failed";
    }
    this.textDone = true;
    return "accepted";
  }

  peekNext(): QueueDecision {
    if (this.requestId === null) return { kind: "wait" };

    const entry = this.entries.get(this.nextToPlay);
    if (entry?.status === "failed") {
      return { kind: "skip", requestId: this.requestId, index: this.nextToPlay };
    }
    if (entry?.status === "ready" && entry.task && entry.audio !== undefined) {
      return {
        kind: "play",
        requestId: this.requestId,
        index: this.nextToPlay,
        task: entry.task,
        audio: entry.audio,
      };
    }
    if (this.textDone && this.entries.size === 0 && !this.completionAcknowledged) {
      return { kind: "complete", requestId: this.requestId };
    }
    return { kind: "wait" };
  }

  advance(requestId: string, index: number): MutationResult {
    if (!this.isActive(requestId) || index !== this.nextToPlay || !this.entries.has(index)) {
      return "ignored";
    }

    this.entries.delete(index);
    this.nextToPlay += 1;
    return "accepted";
  }

  acknowledgeComplete(requestId: string): MutationResult {
    if (!this.isActive(requestId)) return "ignored";
    this.completionAcknowledged = true;
    return "accepted";
  }

  private isActive(requestId: string) {
    return this.requestId !== null && requestId === this.requestId;
  }

  private entryFor(index: number) {
    let entry = this.entries.get(index);
    if (!entry) {
      entry = { status: "pending" };
      this.entries.set(index, entry);
    }
    return entry;
  }
}
