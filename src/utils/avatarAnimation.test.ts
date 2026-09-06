import { describe, expect, it } from "vitest";
import {
  computeLevel,
  createBlinkScheduler,
  createLipSyncDriver,
} from "./avatarAnimation";

describe("createBlinkScheduler", () => {
  it("blinks within [min,max] interval and returns to 0 after durationMs", () => {
    let t = 0;
    const randomValues = [0.5, 0.5, 0.5, 0.5];
    const scheduler = createBlinkScheduler({
      minIntervalMs: 1000,
      maxIntervalMs: 2000,
      durationMs: 100,
      random: () => randomValues.shift() ?? 0.5,
    });

    scheduler.reset(0);

    let sawBlink = false;
    let blinkStart = 0;

    for (let step = 0; step < 5000; step += 10) {
      t = step;
      const weight = scheduler.update(t);
      if (weight > 0 && !sawBlink) {
        sawBlink = true;
        blinkStart = t;
        expect(t).toBeGreaterThanOrEqual(1000);
        expect(t).toBeLessThanOrEqual(2000);
      }
      if (sawBlink && t >= blinkStart + 100) {
        expect(weight).toBe(0);
        break;
      }
    }

    expect(sawBlink).toBe(true);
  });
});

describe("createLipSyncDriver", () => {
  it("rises with attack, decays with release, and clamps 0..1", () => {
    const driver = createLipSyncDriver({ attack: 0.5, release: 0.2, gain: 1, floor: 0 });

    let level = 0;
    for (let i = 0; i < 20; i++) {
      const prev = level;
      level = driver.update(1, 16);
      expect(level).toBeGreaterThanOrEqual(prev);
      expect(level).toBeLessThanOrEqual(1);
    }
    expect(level).toBeGreaterThan(0.9);

    for (let i = 0; i < 30; i++) {
      level = driver.update(0, 16);
      expect(level).toBeLessThanOrEqual(1);
      expect(level).toBeGreaterThanOrEqual(0);
    }
    expect(level).toBeLessThan(0.2);
  });
});

describe("computeLevel", () => {
  it("returns 0 for a silent buffer", () => {
    const analyser = {
      getByteTimeDomainData(arr: Uint8Array) {
        arr.fill(128);
      },
    } as AnalyserNode;
    const buffer = new Uint8Array(128);
    expect(computeLevel(analyser, buffer)).toBe(0);
  });

  it("returns ~1 for a full-scale square wave", () => {
    const analyser = {
      getByteTimeDomainData(arr: Uint8Array) {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i % 2 === 0 ? 255 : 0;
        }
      },
    } as AnalyserNode;
    const buffer = new Uint8Array(128);
    expect(computeLevel(analyser, buffer)).toBeCloseTo(1, 1);
  });
});
