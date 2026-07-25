import { ChatInputBar } from "../ChatPanel";
import type { RefObject } from "react";

type ChatInputBarProps = {
  isProcessing: boolean;
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  listening: boolean;
  onMicToggle: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function FloatingChatInput(props: ChatInputBarProps) {
  return (
    <div
      className="w-full max-w-xl rounded-[1.35rem] bg-white/80 p-2 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/90 backdrop-blur-xl"
    >
      <ChatInputBar {...props} floating />
    </div>
  );
}
