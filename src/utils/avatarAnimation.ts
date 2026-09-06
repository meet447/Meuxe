/** Renderer-agnostic blink, lip-sync, and speaking-head helpers for VRM and Live2D. */

export type BlinkCurve = "triangle" | "ease-hold";

export interface BlinkSchedulerOptions {
  minIntervalMs: number;
  maxIntervalMs: number;
  durationMs: number;
  /** Chance (0–1) of scheduling a quick follow-up blink after one completes. */
  doubleBlinkChance?: number;
  doubleBlinkGapMinMs?: number;
  doubleBlinkGapMaxMs?: number;
  curve?: BlinkCurve;
  random?: () => number;
}

export interface BlinkScheduler {
  /** Eye-close weight: 0 = fully open, 1 = fully closed. */
  update(nowMs: number): number;
  reset(nowMs: number): void;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function blinkWeightForProgress(progress: number, curve: BlinkCurve): number {
  if (curve === "triangle") {
    const phase = progress * 2;
    return phase <= 1 ? phase : 2 - phase;
  }

  if (progress < 0.3) {
    return 1 - easeOutCubic(progress / 0.3);
  }
  if (progress < 0.5) {
    return 1;
  }
  if (progress < 1) {
    return easeOutCubic((progress - 0.5) / 0.5);
  }
  return 0;
}

export function createBlinkScheduler(options: BlinkSchedulerOptions): BlinkScheduler {
  const random = options.random ?? Math.random;
  const curve = options.curve ?? "triangle";
  const doubleBlinkChance = options.doubleBlinkChance ?? 0;
  const gapMin = options.doubleBlinkGapMinMs ?? 150;
  const gapMax = options.doubleBlinkGapMaxMs ?? gapMin;

  let nextBlinkAtMs = 0;
  let blinkStartMs = 0;
  let blinking = false;
  let awaitingDoubleBlink = false;

  function scheduleAfterBlink(nowMs: number) {
    if (awaitingDoubleBlink) {
      nextBlinkAtMs = nowMs + gapMin + random() * (gapMax - gapMin);
      awaitingDoubleBlink = false;
      return;
    }
    const delay =
      options.minIntervalMs + random() * (options.maxIntervalMs - options.minIntervalMs);
    if (random() < doubleBlinkChance) {
      awaitingDoubleBlink = true;
    }
    nextBlinkAtMs = nowMs + delay;
  }

  function reset(nowMs: number) {
    nextBlinkAtMs =
      nowMs + options.minIntervalMs + random() * (options.maxIntervalMs - options.minIntervalMs);
    blinkStartMs = 0;
    blinking = false;
    awaitingDoubleBlink = false;
  }

  function update(nowMs: number): number {
    if (!blinking) {
      if (nowMs < nextBlinkAtMs) {
        return 0;
      }
      blinking = true;
      blinkStartMs = nowMs;
    }

    const elapsed = nowMs - blinkStartMs;
    const progress = elapsed / options.durationMs;

    if (progress >= 1) {
      blinking = false;
      scheduleAfterBlink(nowMs);
      return 0;
    }

    return blinkWeightForProgress(progress, curve);
  }

  return {
    update,
    reset,
  };
}

export interface LipSyncDriverOptions {
  /** Smoothing factor when the target level rises (matches per-frame lerp factor). */
  attack: number;
  /** Smoothing factor when the target level falls. */
  release: number;
  gain?: number;
  floor?: number;
}

export interface LipSyncDriver {
  update(rmsOrLevel: number, dtMs: number): number;
  reset(): void;
}

export function createLipSyncDriver(options: LipSyncDriverOptions): LipSyncDriver {
  const gain = options.gain ?? 1;
  const floor = options.floor ?? 0;
  let value = 0;

  function update(rmsOrLevel: number, _dtMs: number): number {
    const target = Math.max(floor, Math.min(1, rmsOrLevel * gain));
    const factor = target > value ? options.attack : options.release;
    value += (target - value) * factor;
    value = Math.max(0, Math.min(1, value));
    return value;
  }

  function reset() {
    value = 0;
  }

  return { update, reset };
}

/** Read time-domain analyser data and return normalized RMS in 0..1. */
export function computeLevel(analyser: AnalyserNode, buffer: Uint8Array): number {
  analyser.getByteTimeDomainData(buffer as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = (buffer[i] - 128) / 128;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / buffer.length);
  return Math.min(1, rms * Math.SQRT2);
}

export interface SpeakingSwayParams {
  yFreq: number;
  yAmp: number;
  xFreq: number;
  xAmp: number;
  xSecondaryFreq?: number;
  xSecondaryAmp?: number;
  ySecondaryFreq?: number;
  ySecondaryAmp?: number;
  zFreq?: number;
  zAmp?: number;
}

export interface SpeakingSway {
  x: number;
  y: number;
  z: number;
}

/** Shared sine-based speaking head motion (elapsed time in seconds). */
export function speakingHeadSway(elapsedSec: number, params: SpeakingSwayParams): SpeakingSway {
  const xSecondaryFreq = params.xSecondaryFreq ?? 0;
  const xSecondaryAmp = params.xSecondaryAmp ?? 0;
  const ySecondaryFreq = params.ySecondaryFreq ?? 0;
  const ySecondaryAmp = params.ySecondaryAmp ?? 0;
  const zFreq = params.zFreq ?? 0;
  const zAmp = params.zAmp ?? 0;

  return {
    x:
      Math.sin(elapsedSec * params.xFreq) * params.xAmp +
      Math.sin(elapsedSec * xSecondaryFreq) * xSecondaryAmp,
    y:
      Math.sin(elapsedSec * params.yFreq) * params.yAmp +
      Math.cos(elapsedSec * ySecondaryFreq) * ySecondaryAmp,
    z: Math.sin(elapsedSec * zFreq) * zAmp,
  };
}
