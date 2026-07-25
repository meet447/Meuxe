import type { ReactNode } from "react";

export function HistoryDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close history"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex w-[min(100vw,360px)] flex-col border-r border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white/90">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </aside>
    </>
  );
}
