import { useEffect, useState } from "react";
import {
  getAgentSetupStatus,
  installAgentSetup,
  type AgentSetupStatusResponse,
} from "../../api/tauri";
import { ACP_AGENT_PRESETS, type AcpAgentPresetId } from "../../lib/agentPresets";
import { Button, ExternalIcon, Pill, Surface } from "../ui";

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
  const agent = status?.agent;
  const usingSystem = agent?.install_source === "system";
  const usingManaged = agent?.install_source === "managed";
  const usingNpx = agent?.install_source === "npx";

  return (
    <Surface tone="surface" elevation="soft" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">
          {friendly ? "Agent on your system" : "Agent CLI"}
        </span>
        {loading && <span className="text-xs text-ink-3">Checking…</span>}
      </div>

      {status && !loading && agent && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={agent.ready} label={agent.ready ? `${title} ready` : `${title} needed`} />
            {usingSystem && <StatusPill ok label="System PATH" />}
            {usingManaged && <StatusPill ok label="Meuxe fallback" />}
            {usingNpx && <StatusPill ok label="via npx" />}
            <StatusPill ok={status.prerequisites.node_available} label="Node.js" />
            {status.prerequisites.node_version && (
              <span className="text-[11px] text-ink-3">{status.prerequisites.node_version}</span>
            )}
          </div>

          <p className="text-sm leading-snug text-ink-2">{agent.detail}</p>

          {friendly && !agent.ready && (
            <p className="text-sm leading-snug text-ink-3">
              Install the CLI globally now, or tap Finish and Meuxe will run the same global npm install for you.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!status.prerequisites.node_available && (
              <Button
                size="sm"
                variant="secondary"
                trailing={<ExternalIcon className="h-3.5 w-3.5" />}
                onClick={() => window.open("https://nodejs.org/en/download", "_blank")}
              >
                Install Node.js
              </Button>
            )}
            {status.prerequisites.node_available && !agent.ready && (
              <Button size="sm" variant="primary" loading={installing} onClick={runInstall}>
                Install globally (npm)
              </Button>
            )}
            {status.prerequisites.node_available && agent.ready && usingSystem && (
              <span className="text-xs font-semibold text-sage-700">Using your global install</span>
            )}
            {status.prerequisites.node_available && agent.ready && !usingSystem && (
              <Button size="sm" variant="soft" loading={installing} onClick={runInstall}>
                Install globally (npm)
              </Button>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-clay-700">{error}</p>}
    </Surface>
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
    <Pill tone={muted ? "neutral" : ok ? "sage" : "honey"} dot>
      {label}
    </Pill>
  );
}
