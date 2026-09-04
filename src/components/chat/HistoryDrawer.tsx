import type { ReactNode } from "react";
import { CloseIcon, IconButton } from "../ui";

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
  if (!open) return null;

  return (
    <aside className="squircle flex w-[380px] shrink-0 flex-col overflow-hidden rounded-panel bg-surface shadow-soft animate-rise-in">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <CloseIcon className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  );
}
