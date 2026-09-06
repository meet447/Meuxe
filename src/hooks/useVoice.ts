import { useState, useCallback, useRef, useEffect } from "react";
import { transcribeVoice, transcribeVoiceLocal } from "../api/tauri";

const SAMPLE_RATE = 16000;

// VAD constants
const SILENCE_THRESHOLD = 0.012;
const SILENCE_MS = 1200;
const MIN_SPEECH_CHUNKS = 4;

function float32ToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(i * 4, samples[i], true);
  }
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    // @ts-expect-error Typescript doesn't know that apply handles typed arrays directly without spreading in modern JS engines
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function pickRecordingMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  for (const mimeType of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read voice blob"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read voice blob"));
    reader.readAsDataURL(blob);
  });
}

export function useVoice() {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const onResultRef = useRef<((text: string) => void) | null>(null);

  const pcmContextRef = useRef<AudioContext | null>(null);
  const pcmScriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmGainNodeRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmStreamRef = useRef<MediaStream | null>(null);

  const speechDetectedRef = useRef(false);
  const speechChunkCountRef = useRef(0);
  const lastLoudTimeRef = useRef(0);

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopPcmCapture = useCallback(() => {
    if (pcmScriptNodeRef.current) {
      pcmScriptNodeRef.current.onaudioprocess = null;
      pcmScriptNodeRef.current.disconnect();
    }
    pcmSourceRef.current?.disconnect();
    pcmGainNodeRef.current?.disconnect();
    pcmContextRef.current?.close().catch(() => {});
    pcmStreamRef.current?.getTracks().forEach((track) => track.stop());
    pcmScriptNodeRef.current = null;
    pcmSourceRef.current = null;
    pcmGainNodeRef.current = null;
    pcmContextRef.current = null;
    pcmStreamRef.current = null;
    pcmChunksRef.current = [];
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      return;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopMediaTracks();
    stopPcmCapture();
    mediaRecorderRef.current = null;
    setListening(false);
  }, [stopMediaTracks, stopPcmCapture]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      stopMediaTracks();
      stopPcmCapture();
      setListening(false);
    };
  }, [stopMediaTracks, stopPcmCapture]);

  const startSpeechRecognitionFallback = useCallback(
    (onResult: (text: string) => void) => {
      const SpeechRecognitionCtor =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        console.error("Speech recognition not supported");
        return;
      }

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
        setListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event?.error ?? "unknown");
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    },
    []
  );

  const startListening = useCallback(
    async (onResult: (text: string) => void) => {
      if (listening) return;

      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        startSpeechRecognitionFallback(onResult);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        speechDetectedRef.current = false;
        speechChunkCountRef.current = 0;
        lastLoudTimeRef.current = Date.now();

        pcmStreamRef.current = stream;
        pcmChunksRef.current = [];

        const pcmCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        pcmContextRef.current = pcmCtx;

        const source = pcmCtx.createMediaStreamSource(stream);
        pcmSourceRef.current = source;

        const scriptNode = pcmCtx.createScriptProcessor(4096, 1, 1);
        pcmScriptNodeRef.current = scriptNode;

        const gainNode = pcmCtx.createGain();
        gainNode.gain.value = 0;
        pcmGainNodeRef.current = gainNode;

        let autoStopped = false;

        scriptNode.onaudioprocess = (e) => {
          if (autoStopped) return;
          const input = e.inputBuffer.getChannelData(0);
          pcmChunksRef.current.push(new Float32Array(input));

          const volume = rms(input);
          const now = Date.now();

          if (volume >= SILENCE_THRESHOLD) {
            speechChunkCountRef.current++;
            if (speechChunkCountRef.current >= MIN_SPEECH_CHUNKS) {
              speechDetectedRef.current = true;
            }
            lastLoudTimeRef.current = now;
          } else if (speechDetectedRef.current && now - lastLoudTimeRef.current >= SILENCE_MS) {
            autoStopped = true;
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state !== "inactive"
            ) {
              mediaRecorderRef.current.stop();
            }
          }
        };

        source.connect(scriptNode);
        scriptNode.connect(gainNode);
        gainNode.connect(pcmCtx.destination);

        const mimeType = pickRecordingMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;
        recordedChunksRef.current = [];
        onResultRef.current = onResult;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          stopMediaTracks();
          stopPcmCapture();
          mediaRecorderRef.current = null;
          setListening(false);
        };

        recorder.onstop = async () => {
          const chunks = recordedChunksRef.current;
          recordedChunksRef.current = [];
          stopMediaTracks();
          stopPcmCapture();
          mediaRecorderRef.current = null;
          setListening(false);

          if (chunks.length === 0) return;

          try {
            const pcmData = mergePcmChunks();
            if (pcmData.length > SAMPLE_RATE / 2) {
              const pcmBase64 = float32ToBase64(pcmData);
              const text = await transcribeVoiceLocal(pcmBase64);
              if (text.trim()) {
                onResultRef.current?.(text.trim());
                return;
              }
            }
          } catch (err) {
            console.warn("Local whisper failed, falling back to API:", err);
          }

          try {
            const blob = new Blob(chunks, {
              type: recorder.mimeType || mimeType || "audio/webm",
            });
            const audioBase64 = await blobToBase64(blob);
            const transcript = await transcribeVoice(
              audioBase64,
              blob.type || recorder.mimeType || mimeType || "audio/webm",
            );
            if (transcript.trim()) {
              onResultRef.current?.(transcript.trim());
            }
          } catch (err) {
            console.error("Voice transcription error:", err);
          }
        };

        function mergePcmChunks(): Float32Array {
          const allChunks = pcmChunksRef.current;
          pcmChunksRef.current = [];
          const totalLength = allChunks.reduce((sum, c) => sum + c.length, 0);
          const merged = new Float32Array(totalLength);
          let offset = 0;
          for (const chunk of allChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          return merged;
        }

        recorder.start();
        setListening(true);
      } catch (err) {
        console.error("Microphone access failed, trying speech recognition fallback:", err);
        stopMediaTracks();
        stopPcmCapture();
        mediaRecorderRef.current = null;
        startSpeechRecognitionFallback(onResult);
      }
    },
    [listening, startSpeechRecognitionFallback, stopMediaTracks, stopPcmCapture]
  );

  return {
    listening,
    startListening,
    stopListening,
  };
}
