import type { ReactNode } from "react";

function CornerButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-md transition-all shadow-sm ${
        active
          ? "border-blue-200 bg-white/90 text-blue-600 ring-1 ring-blue-100"
          : "border-slate-200/80 bg-white/75 text-slate-600 hover:bg-white hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

export function StageCornerToolbar({
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
    <>
      <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-2 sm:left-5 sm:top-5">
        <div className="pointer-events-auto flex flex-col gap-2">
          <CornerButton title="Chat history" onClick={onHistoryToggle} active={historyOpen}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </CornerButton>
          <CornerButton title="Mini mode" onClick={onMini}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m-4 12h2a2 2 0 002-2v-2M9 9h6v6H9z" />
            </svg>
          </CornerButton>
          <CornerButton title="Characters" onClick={onCharacters} active={charSelectOpen}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </CornerButton>
        </div>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col gap-2 sm:right-5 sm:top-5">
        <div className="pointer-events-auto flex flex-col gap-2">
          <CornerButton title="Settings" onClick={onSettings} active={settingsOpen}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </CornerButton>
          <div
            className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/75 shadow-sm backdrop-blur-md"
            title="Avatar framing"
          >
            <button
              type="button"
              onClick={() => onFramingChange("full")}
              className={`px-2 py-2 text-[10px] font-bold tracking-wide transition-colors ${
                framing === "full"
                  ? "bg-blue-500 text-white"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              FULL
            </button>
            <button
              type="button"
              onClick={() => onFramingChange("half")}
              className={`border-t border-slate-200/80 px-2 py-2 text-[10px] font-bold tracking-wide transition-colors ${
                framing === "half"
                  ? "bg-blue-500 text-white"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              HALF
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
