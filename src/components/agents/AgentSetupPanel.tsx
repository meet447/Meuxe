import { useEffect, useState } from "react";
import {
  getAgentSetupStatus,
  installAgentSetup,
  type AgentSetupStatusResponse,
} from "../../api/tauri";
import { ACP_AGENT_PRESETS, type AcpAgentPresetId } from "../../lib/agentPresets";

export function AgentSetupPanel({
  preset,
  onStatusChange,
  friendly,
}: {
  preset: AcpAgentPresetId;
  onStatusChange?: (status: AgentSetupStatusResponse | null, loading: boolean) => void;
  /** Shorter, non-technical copy for onboarding */
  friendly?: boolean;
}) {
  const [status, setStatus] = useState<AgentSetupStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preset === "custom") {
      setStatus(null);
      setError("");
      onStatusChange?.(null, false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    onStatusChange?.(null, true);
    getAgentSetupStatus(preset)
      .then((s) => {
        if (!cancelled) {
          setStatus(s);
          onStatusChange?.(s, false);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preset]);

  const runInstall = async () => {
    setInstalling(true);
    setError("");
    try {
      const s = await installAgentSetup(preset);
      setStatus(s);
      onStatusChange?.(s, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  };

  if (preset === "custom") return null;

  const title = ACP_AGENT_PRESETS[preset].title;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600">
          {friendly ? "Quick setup" : "Setup"}
        </span>
        {loading && <span className="text-xs text-slate-400">Checking…</span>}
      </div>

      {status && !loading && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={status.agent.ready} label={status.agent.ready ? `${title} ready` : `${title} needed`} />
            <StatusPill ok={status.prerequisites.node_available} label="Node.js" />
            {status.prerequisites.node_version && (
              <span className="text-[11px] text-slate-400">{status.prerequisites.node_version}</span>
            )}
            <StatusPill ok={status.prerequisites.npx_available} label="npx" muted={!status.prerequisites.npx_available} />
          </div>

          {!status.agent.ready && !friendly && (
            <p className="text-sm text-slate-600 leading-snug">{status.agent.detail}</p>
          )}
          {!status.agent.ready && friendly && (
            <p className="text-sm text-slate-600 leading-snug">
              Tap install once — we&apos;ll set this up in your Meuxe folder.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!status.prerequisites.node_available && (
              <button
                type="button"
                onClick={() => window.open("https://nodejs.org/en/download", "_blank")}
                className="rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50"
              >
                Install Node.js
              </button>
            )}
            {status.prerequisites.node_available && !status.agent.ready && (
              <button
                type="button"
                onClick={runInstall}
                disabled={installing}
                className="rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {installing ? "Installing…" : `Install ${title}`}
              </button>
            )}
            {status.prerequisites.node_available && status.agent.ready && !status.agent.managed_install && (
              <button
                type="button"
                onClick={runInstall}
                disabled={installing}
                className="rounded-xl border border-violet-200 bg-white px-3.5 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
              >
                {installing ? "Installing…" : "Install into Meuxe folder"}
              </button>
            )}
            {status.agent.ready && status.agent.managed_install && (
              <span className="text-xs font-semibold text-emerald-700">Ready in Meuxe folder</span>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function StatusPill({
  ok,
  label,
  muted,
}: {
  ok: boolean;
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        ok ? "bg-emerald-100 text-emerald-800" : muted ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-900"
      }`}
    >
      {label}
    </span>
  );
}
