import { vi } from "vitest";

export class FakeAudio {
  static instances: FakeAudio[] = [];

  src: string;
  crossOrigin = "";
  muted = false;
  currentTime = 0;
  paused = true;
  oncanplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play = vi.fn(async () => {
    this.paused = false;
    this.oncanplay?.();
  });

  pause = vi.fn(() => {
    this.paused = true;
  });

  load = vi.fn();

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  finish() {
    this.onended?.();
  }

  fail() {
    this.onerror?.();
  }

  static reset() {
    FakeAudio.instances = [];
  }
}

export function installFakeAudio() {
  vi.stubGlobal("Audio", FakeAudio);
}
