import { useRef, useCallback, useEffect } from "react";

export interface AudioLevels {
  volume: number;      // 0-1, overall loudness
  mouthOpen: number;   // 0-1, how open the mouth should be
  mouthForm: number;   // -1 to 1, mouth shape (narrow vs wide)
}

const SILENT: AudioLevels = { volume: 0, mouthOpen: 0, mouthForm: 0 };

export function useAudioAnalyser() {
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothVolumeRef = useRef(0);
  const smoothFormRef = useRef(0);

  const connectAudio = useCallback((audioElement: HTMLAudioElement) => {
    // Don't reconnect the same element
    if (connectedElementRef.current === audioElement) return;

    // Clean up previous source (but keep context + analyser)
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }

    // Create AudioContext once
    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }
    const ctx = contextRef.current;

    // Create analyser once
    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    // Connect new audio element
    const source = ctx.createMediaElementSource(audioElement);
    source.connect(analyserRef.current);
    sourceRef.current = source;
    connectedElementRef.current = audioElement;

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }
  }, []);

  const getAudioLevels = useCallback((): AudioLevels => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyser || !dataArray) return SILENT;

    analyser.getByteFrequencyData(dataArray);

    const binCount = dataArray.length; // 128 bins

    // Split frequency spectrum into bands
    // Low: 0-10 (bass, ~0-340Hz): jaw movement
    // Mid: 10-40 (mids, ~340-1360Hz): vowel formants
    // High: 40-80 (highs, ~1360-2720Hz): consonants, sibilance

    let lowSum = 0, midSum = 0, highSum = 0;
    for (let i = 0; i < binCount; i++) {
      const val = dataArray[i];
      if (i < 10) lowSum += val;
      else if (i < 40) midSum += val;
      else if (i < 80) highSum += val;
    }

    const lowAvg = lowSum / 10 / 255;
    const midAvg = midSum / 30 / 255;
    const highAvg = highSum / 40 / 255;

    // Overall volume: weighted toward mid frequencies (voice range)
    const rawVolume = lowAvg * 0.2 + midAvg * 0.6 + highAvg * 0.2;

    // Apply volume curve: boost quiet speech, cap loud
    const scaledVolume = Math.min(1, Math.pow(rawVolume * 2.5, 0.7));

    // Smooth volume for mouth open (lerp)
    smoothVolumeRef.current += (scaledVolume - smoothVolumeRef.current) * 0.4;
    const mouthOpen = smoothVolumeRef.current;

    // Mouth form from frequency balance:
    // More highs = wider mouth (ee, ss sounds) → positive
    // More lows = rounder mouth (oo, ah sounds) → negative
    const formRaw = (highAvg - lowAvg) * 2;
    smoothFormRef.current += (formRaw - smoothFormRef.current) * 0.3;
    const mouthForm = Math.max(-1, Math.min(1, smoothFormRef.current));

    return {
      volume: scaledVolume,
      mouthOpen: Math.max(0, Math.min(1, mouthOpen)),
      mouthForm,
    };
  }, []);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    connectedElementRef.current = null;
    smoothVolumeRef.current = 0;
    smoothFormRef.current = 0;
  }, []);

  // Clean up AudioContext on unmount
  useEffect(() => {
    return () => {
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      contextRef.current?.close();
    };
  }, []);

  return { connectAudio, getAudioLevels, disconnect };
}
