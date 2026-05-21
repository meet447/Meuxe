import { ComposioToolkitIcon, toolkitColorClasses } from "./ComposioToolkitIcon";
import { COMPOSIO_TOOLKITS } from "../lib/composioToolkits";
import type { ComposioToolkitStatus } from "../types";

interface Props {
  enabledToolkits: string[];
  statuses?: ComposioToolkitStatus[];
  onToggle: (slug: string) => void;
  onConnect?: (slug: string) => void;
  onRefresh?: (slug: string) => void;
  busySlug?: string | null;
  actionsDisabled?: boolean;
}

export function ComposioToolkitPicker({
  enabledToolkits,
  statuses = [],
  onToggle,
  onConnect,
  onRefresh,
  busySlug = null,
  actionsDisabled = false,
}: Props) {
  const statusBySlug = new Map(statuses.map((status) => [status.slug, status]));

  return (
    <div className="flex flex-col gap-3">
      {COMPOSIO_TOOLKITS.map((toolkit) => (
        <ToolkitCard
          key={toolkit.slug}
          enabled={enabledToolkits.includes(toolkit.slug)}
          toolkit={toolkit}
          connected={Boolean(statusBySlug.get(toolkit.slug)?.connected)}
          status={statusBySlug.get(toolkit.slug)}
          colors={toolkitColorClasses(toolkit.slug)}
          busy={busySlug === toolkit.slug}
          actionsDisabled={actionsDisabled}
          onToggle={onToggle}
          onConnect={onConnect}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

function ToolkitCard({
  enabled,
  toolkit,
  connected,
  status,
  colors,
  busy,
  actionsDisabled,
  onToggle,
  onConnect,
  onRefresh,
}: {
  enabled: boolean;
  toolkit: (typeof COMPOSIO_TOOLKITS)[number];
  connected: boolean;
  status?: ComposioToolkitStatus;
  colors: { bg: string; text: string };
  busy: boolean;
  actionsDisabled: boolean;
  onToggle: (slug: string) => void;
  onConnect?: (slug: string) => void;
  onRefresh?: (slug: string) => void;
}) {
  const showActions = enabled && (onConnect || onRefresh);

  return (
    <div
      className={`w-full min-w-0 rounded-2xl border px-4 py-4 transition-all ${
        enabled ? "border-blue-300 bg-blue-50/70 shadow-sm" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <ComposioToolkitIcon slug={toolkit.slug} withBackground />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{toolkit.name}</span>
            {connected && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Connected
              </span>
            )}
          </div>
          {!connected && status?.status && (
            <p className="mt-1 text-[11px] font-medium leading-snug text-amber-600">
              {status.status}
            </p>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{toolkit.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(toolkit.slug)}
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
            enabled ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-500"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>

      {showActions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/80 pt-3">
          {onConnect && (
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onConnect(toolkit.slug)}
              className={`rounded-full border px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50 ${colors.bg} ${colors.text} border-transparent`}
            >
              {busy ? "Opening..." : connected ? "Reconnect" : "Connect"}
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onRefresh(toolkit.slug)}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 disabled:opacity-50"
            >
              {busy ? "Checking..." : "Refresh"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
