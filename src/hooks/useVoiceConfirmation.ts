import { useEffect, useRef, useCallback } from "react";
import type { ToolCallStatus } from "../components/ToolCallBubble";

const APPROVE_KEYWORDS = [
  "yes", "yeah", "yep", "yup", "ok", "okay",
  "sure", "go ahead", "proceed", "allow",
  "do it", "approve", "confirmed", "go for it",
  "that's fine", "fine", "alright", "right",
];

const DENY_KEYWORDS = [
  "no", "nah", "nope", "deny", "cancel",
  "stop", "don't", "reject", "abort",
  "not allowed", "negative", "decline",
];

function matchesKeyword(transcript: string, keywords: string[]): boolean {
  const lower = transcript.toLowerCase().trim();
  return keywords.some((kw) => lower.includes(kw));
}

interface UseVoiceConfirmationOptions {
  pendingConfirmation: ToolCallStatus | null;
  onConfirm: (requestId: string, approved: boolean) => void;
  startListening: (onResult: (text: string) => void) => void;
  stopListening: () => void;
  listening: boolean;
}

export function useVoiceConfirmation({
  pendingConfirmation,
  onConfirm,
  startListening,
  stopListening,
  listening,
}: UseVoiceConfirmationOptions) {
  const isConfirmListeningRef = useRef(false);
  const prevPendingRef = useRef<string | null>(null);

  const handleVoiceResult = useCallback(
    (transcript: string) => {
      if (!pendingConfirmation) return;

      const approved = matchesKeyword(transcript, APPROVE_KEYWORDS);
      const denied = matchesKeyword(transcript, DENY_KEYWORDS);

      if (approved) {
        console.log("[voice-confirm] approved via:", transcript);
        onConfirm(pendingConfirmation.requestId, true);
        isConfirmListeningRef.current = false;
      } else if (denied) {
        console.log("[voice-confirm] denied via:", transcript);
        onConfirm(pendingConfirmation.requestId, false);
        isConfirmListeningRef.current = false;
      } else {
        console.log("[voice-confirm] no match, ignoring:", transcript);
        // Start listening again for another attempt
        setTimeout(() => {
          if (pendingConfirmation && !listening) {
            startListening(handleVoiceResult);
            isConfirmListeningRef.current = true;
          }
        }, 500);
      }
    },
    [pendingConfirmation, onConfirm, startListening, listening],
  );

  // Auto-start listening when a new confirmation appears
  useEffect(() => {
    const currentId = pendingConfirmation?.requestId ?? null;
    const prevId = prevPendingRef.current;

    if (currentId && currentId !== prevId) {
      // New confirmation appeared: auto-start listening
      if (!listening) {
        console.log("[voice-confirm] auto-starting listen for:", currentId);
        startListening(handleVoiceResult);
        isConfirmListeningRef.current = true;
      }
    }

    if (!currentId && prevId) {
      // Confirmation resolved: stop if we were listening for it
      if (isConfirmListeningRef.current) {
        stopListening();
        isConfirmListeningRef.current = false;
      }
    }

    prevPendingRef.current = currentId;
  }, [pendingConfirmation?.requestId, listening, startListening, stopListening, handleVoiceResult]);

  return {
    isConfirmListening: isConfirmListeningRef.current,
  };
}
