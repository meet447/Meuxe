import {
  AsciiAccent,
  ChatIcon,
  CropIcon,
  IconButton,
  MeuxeMark,
  MiniIcon,
  PeopleIcon,
  SettingsIcon,
} from "../ui";

export function Sidebar({
  historyOpen,
  onHistoryToggle,
  onMini,
  onSettings,
  settingsOpen,
  onCharacters,
  charSelectOpen,
  framing,
  onFramingChange,
}: {
  historyOpen: boolean;
  onHistoryToggle: () => void;
  onMini: () => void;
  onSettings: () => void;
  settingsOpen: boolean;
  onCharacters: () => void;
  charSelectOpen: boolean;
  framing: "full" | "half";
  onFramingChange: (framing: "full" | "half") => void;
}) {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center py-2">
      <MeuxeMark bare className="mb-2 h-10 w-10" />

      <div className="flex flex-col items-center gap-1">
        <IconButton
          label="Conversation"
          variant="ghost"
          size="md"
          active={historyOpen}
          onClick={onHistoryToggle}
        >
          <ChatIcon />
        </IconButton>
        <IconButton
          label="Companions"
          variant="ghost"
          size="md"
          active={charSelectOpen}
          onClick={onCharacters}
        >
          <PeopleIcon />
        </IconButton>
        <IconButton label="Mini mode" variant="ghost" size="md" onClick={onMini}>
          <MiniIcon />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-3">
        <AsciiAccent rows={10} cols={3} density={0.8} />
      </div>

      <div className="flex flex-col items-center gap-1">
        <IconButton
          label={framing === "full" ? "Half body" : "Full body"}
          variant="ghost"
          size="md"
          active={framing === "half"}
          onClick={() => onFramingChange(framing === "full" ? "half" : "full")}
        >
          <CropIcon />
        </IconButton>
        <IconButton
          label="Settings"
          variant="ghost"
          size="md"
          active={settingsOpen}
          onClick={onSettings}
        >
          <SettingsIcon />
        </IconButton>
      </div>
    </nav>
  );
}
