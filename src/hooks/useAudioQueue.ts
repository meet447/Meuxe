import { useRef, useCallback, useState, useEffect } from "react";
import { OrderedAudioQueue } from "../audio/orderedAudioQueue";
import type { SentenceTask } from "../audio/orderedAudioQueue";
import { useAudioAnalyser } from "./useAudioAnalyser";

export type { SentenceTask } from "../audio/orderedAudioQueue";

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

let audioUnlocked = false;

/** Call from a user gesture so WebKit will play later TTS chunks. */
export function unlockAudioPlayback() {
  if (audioUnlocked || typeof Audio === "undefined") return;
  const probe = new Audio(SILENT_WAV);
  probe.muted = true;
  const attempt = probe.play();
  if (attempt) {
    void attempt
      .then(() => {
        probe.pause();
        audioUnlocked = true;
      })
      .catch(() => {
        /* next gesture will retry */
      });
  }
}

function captionHoldMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(4000, Math.max(1400, words * 280));
}

interface CurrentPlayback {
  audio: HTMLAudioElement;
  finish: () => void;
}

export function useAudioQueue() {
  const [speaking, setSpeaking] = useState(false);
  const [speakingSentence, setSpeakingSentence] = useState<string | null>(null);
  const [speechSessionActive, setSpeechSessionActive] = useState(false);
  const queueRef = useRef(new OrderedAudioQueue());
  const playingRef = useRef(false);
  const currentPlaybackRef = useRef<CurrentPlayback | null>(null);
  const onExpressionChangeRef = useRef<((expr: string) => void) | null>(null);
  const onAudioDoneRef = useRef<((requestId: string) => void) | null>(null);
  const neutralExpressionRef = useRef("neutral");
  const { connectAudio, getAudioLevels, disconnect } = useAudioAnalyser();

  const connectRef = useRef(connectAudio);
  const disconnectRef = useRef(disconnect);
  useEffect(() => {
    connectRef.current = connectAudio;
  }, [connectAudio]);
  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  const playAudioChunk = useCallback((audioData: string): Promise<void> => {
    return new Promise((resolve) => {
      disconnectRef.current();

      const blobUrl = `data:audio/mp3;base64,${audioData}`;
      const audio = new Audio(blobUrl);
      audio.crossOrigin = "anonymous";
      let resumeListenersAttached = false;
      let settled = false;

      const removeResumeListeners = () => {
        if (!resumeListenersAttached) return;
        document.removeEventListener("pointerdown", resumePlay);
        document.removeEventListener("keydown", resumePlay);
        resumeListenersAttached = false;
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        removeResumeListeners();
        disconnectRef.current();
        audio.oncanplay = null;
        audio.onended = null;
        audio.onerror = null;
        audio.src = "";
        audio.load();
        if (currentPlaybackRef.current?.audio === audio) {
          currentPlaybackRef.current = null;
        }
        resolve();
      };

      currentPlaybackRef.current = { audio, finish };

      audio.oncanplay = () => {
        connectRef.current(audio);
      };
      audio.onended = finish;
      audio.onerror = finish;

      const resumePlay = () => {
        removeResumeListeners();
        audio.play().catch((error) => {
          console.warn("[AudioQueue] Resume play failed:", error);
          finish();
        });
      };

      const waitForInteraction = () => {
        if (resumeListenersAttached) return;
        resumeListenersAttached = true;
        document.addEventListener("pointerdown", resumePlay, { once: true });
        document.addEventListener("keydown", resumePlay, { once: true });
      };

      const tryPlay = () =>
        audio.play().catch((error) => {
          console.warn("[AudioQueue] Autoplay blocked, trying muted fallback:", error);
          unlockAudioPlayback();
          audio.muted = true;
          audio.play().then(() => {
            audio.currentTime = 0;
            audio.muted = false;
          }).catch((fallbackError) => {
            console.warn("[AudioQueue] Muted autoplay fallback failed:", fallbackError);
            audio.muted = false;
            waitForInteraction();
          });
        });

      tryPlay();
    });
  }, []);

  const stopCurrentAudio = useCallback(() => {
    const current = currentPlaybackRef.current;
    if (!current) return;
    current.audio.pause();
    current.finish();
  }, []);

  const processQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;

    try {
      while (true) {
        const action = queueRef.current.peekNext();
        if (action.kind === "wait") break;
        if (action.kind === "complete") {
          queueRef.current.acknowledgeComplete(action.requestId);
          setSpeechSessionActive(false);
          onAudioDoneRef.current?.(action.requestId);
          break;
        }
        if (action.kind === "skip") {
          if (action.task) {
            setSpeaking(true);
            setSpeakingSentence(action.task.text);
            onExpressionChangeRef.current?.(action.task.expression);
            const holdMs =
              import.meta.env.MODE === "test" ? 0 : captionHoldMs(action.task.text);
            if (holdMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, holdMs));
            }
            if (queueRef.current.activeRequestId() !== action.requestId) break;
          }
          queueRef.current.advance(action.requestId, action.index);
          continue;
        }

        setSpeaking(true);
        setSpeakingSentence(action.task.text);
        onExpressionChangeRef.current?.(action.task.expression);
        await playAudioChunk(action.audio);
        if (queueRef.current.activeRequestId() !== action.requestId) break;
        queueRef.current.advance(action.requestId, action.index);
      }
    } finally {
      playingRef.current = false;
      setSpeaking(false);
      // Keep the last caption and face until the next user turn. Resetting to
      // idle here made the avatar go blank the instant TTS (or the no-TTS hold)
      // finished, which is how most replies look in the desktop app.
      if (queueRef.current.peekNext().kind !== "wait") {
        queueMicrotask(() => processQueueRef.current());
      }
    }
  }, [playAudioChunk]);

  const processQueueRef = useRef(processQueue);
  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const processAcceptedMutation = useCallback((result: "accepted" | "ignored") => {
    if (result === "accepted") processQueueRef.current();
    return result;
  }, []);

  const beginRequest = useCallback((requestId: string) => {
    stopCurrentAudio();
    queueRef.current.begin(requestId);
    setSpeaking(false);
    setSpeakingSentence(null);
    setSpeechSessionActive(true);
    processQueueRef.current();
  }, [stopCurrentAudio]);

  const addSentence = useCallback((requestId: string, task: SentenceTask) => {
    return processAcceptedMutation(queueRef.current.addSentence(requestId, task));
  }, [processAcceptedMutation]);

  const addAudio = useCallback((requestId: string, index: number, audio: string) => {
    return processAcceptedMutation(queueRef.current.addAudio(requestId, index, audio));
  }, [processAcceptedMutation]);

  const failAudio = useCallback((requestId: string, index: number) => {
    return processAcceptedMutation(queueRef.current.failAudio(requestId, index));
  }, [processAcceptedMutation]);

  const markTextDone = useCallback((requestId: string) => {
    return processAcceptedMutation(queueRef.current.markTextDone(requestId));
  }, [processAcceptedMutation]);

  const failRequest = useCallback((requestId: string) => {
    const result = processAcceptedMutation(queueRef.current.failPendingAndMarkDone(requestId));
    if (result === "accepted") {
      setSpeechSessionActive(false);
    }
    return result;
  }, [processAcceptedMutation]);

  const clearQueue = useCallback(() => {
    stopCurrentAudio();
    queueRef.current.clear();
    setSpeaking(false);
    setSpeakingSentence(null);
    setSpeechSessionActive(false);
    onExpressionChangeRef.current?.(neutralExpressionRef.current);
  }, [stopCurrentAudio]);

  useEffect(() => () => {
    stopCurrentAudio();
    queueRef.current.clear();
  }, [stopCurrentAudio]);

  const setOnExpressionChange = useCallback((cb: (expr: string) => void) => {
    onExpressionChangeRef.current = cb;
  }, []);

  const setOnAudioDone = useCallback((cb: (requestId: string) => void) => {
    onAudioDoneRef.current = cb;
  }, []);

  const setNeutralExpression = useCallback((expr: string) => {
    neutralExpressionRef.current = expr;
  }, []);

  return {
    speaking,
    speakingSentence,
    speechSessionActive,
    beginRequest,
    addSentence,
    addAudio,
    failAudio,
    markTextDone,
    failRequest,
    clearQueue,
    getAudioLevels,
    setOnExpressionChange,
    setOnAudioDone,
    setNeutralExpression,
  };
}
