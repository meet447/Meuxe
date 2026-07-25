import type { ReactNode } from "react";

export function ChatHistorySidebar({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex shrink-0 flex-col border-r border-slate-200/80 bg-white/80 backdrop-blur-md transition-[width] duration-300 ease-out ${
        open ? "w-[min(100%,340px)] sm:w-[360px]" : "w-12"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-2.5 sm:px-3">
        {open ? (
          <>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 pl-1">History</span>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="Hide history"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="mx-auto rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
            title="Show chat history"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}
