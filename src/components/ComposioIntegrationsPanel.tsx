import { useCallback, useEffect, useState } from "react";
import {
  authorizeComposioToolkit,
  getComposioStatus,
  getConfig,
  refreshComposioToolkit,
  saveComposioConfig,
} from "../api/tauri";
import { ComposioToolkitPicker } from "./ComposioToolkitPicker";
import { DEFAULT_ENABLED_COMPOSIO_TOOLKITS } from "../lib/composioToolkits";
import { openExternalUrl } from "../lib/openExternal";
import type { ComposioToolkitStatus } from "../types";

const inputClass =
  "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";
const buttonClass =
  "w-full py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all active:translate-y-0";

interface Props {
  optionalHint?: string;
}

export function ComposioIntegrationsPanel({ optionalHint }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [enabledToolkits, setEnabledToolkits] = useState<string[]>(DEFAULT_ENABLED_COMPOSIO_TOOLKITS);
  const [statuses, setStatuses] = useState<ComposioToolkitStatus[]>([]);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  useEffect(() => {
    getConfig()
      .then((cfg: any) => {
        const key = cfg.composio?.api_key;
        const hasKey = typeof key === "string" && key.length > 0 && !key.includes("...");
        setApiKeySaved(hasKey);
        setEnabledToolkits(
          cfg.composio?.enabled_toolkits?.length
            ? cfg.composio.enabled_toolkits
            : DEFAULT_ENABLED_COMPOSIO_TOOLKITS,
        );
      })
      .catch(console.error);
  }, []);

  const refreshStatuses = useCallback(async () => {
    if (!apiKeySaved) {
      setStatuses([]);
      return;
    }
    setLoadingStatuses(true);
    setError(null);
    try {
      const data = await getComposioStatus();
      setStatuses((data as ComposioToolkitStatus[]) || []);
    } catch (err) {
      console.error("Failed to load Composio status:", err);
      setError(err instanceof Error ? err.message : "Failed to load connected services");
      setStatuses([]);
    } finally {
      setLoadingStatuses(false);
    }
  }, [apiKeySaved]);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  const handleSaveApiKey = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("Enter your Composio API key before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveComposioConfig(trimmed, enabledToolkits);
      setApiKeySaved(true);
      setApiKey("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      await refreshStatuses();
    } catch (err) {
      console.error("Failed to save Composio API key:", err);
      setError(err instanceof Error ? err.message : "Failed to save Composio API key");
    } finally {
      setSaving(false);
    }
  };

  const handleAuthorize = async (slug: string) => {
    if (!apiKeySaved) {
      setError("Save your Composio API key first.");
      return;
    }
    setBusySlug(slug);
    setSaving(true);
    setError(null);
    try {
      const result = (await authorizeComposioToolkit(slug)) as {
        redirect_url?: string;
        redirectUrl?: string;
      };
      const url = result.redirect_url || result.redirectUrl || null;
      setRedirectUrl(url);

      if (url) {
        await openExternalUrl(url);
      } else {
        setError("Composio did not return an OAuth link. Check your API key and try again.");
      }

      if (!enabledToolkits.includes(slug)) {
        const next = [...enabledToolkits, slug];
        setEnabledToolkits(next);
        await saveComposioConfig(null, next);
      }
      await refreshStatuses();
    } catch (err) {
      console.error("Composio authorize failed:", err);
      const message =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Failed to start connection";
      setError(message);
    } finally {
      setBusySlug(null);
      setSaving(false);
    }
  };

  const handleRefresh = async (slug: string) => {
    if (!apiKeySaved) return;
    setBusySlug(slug);
    setSaving(true);
    setError(null);
    try {
      await refreshComposioToolkit(slug);
      await refreshStatuses();
    } catch (err) {
      console.error("Composio refresh failed:", err);
      const message =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Failed to refresh connection";
      setError(message);
    } finally {
      setBusySlug(null);
      setSaving(false);
    }
  };

  const toggleToolkit = (slug: string) => {
    setEnabledToolkits((prev) => {
      const next = prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug];
      if (apiKeySaved) {
        void saveComposioConfig(null, next);
      }
      return next;
    });
  };

  return (
    <div>
      {optionalHint && (
        <p className="mb-6 text-sm leading-relaxed text-slate-500">{optionalHint}</p>
      )}

      <label className={labelClass}>Composio API Key</label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={apiKeySaved ? "Saved — paste a new key to replace" : "Paste your Composio API key"}
        className={inputClass}
      />
      <button type="button" onClick={handleSaveApiKey} disabled={saving} className={buttonClass}>
        {saving ? "Saving..." : savedFlash ? "API Key Saved!" : apiKeySaved ? "Update API Key" : "Save API Key"}
      </button>

      {apiKeySaved ? (
        <div className="animate-in fade-in duration-300">
          <div className="mb-4 flex items-center justify-between pl-1">
            <label className={labelClass}>Connected Services</label>
            <button
              type="button"
              onClick={() => void refreshStatuses()}
              disabled={loadingStatuses || saving}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40"
            >
              {loadingStatuses ? "Loading..." : "Refresh all"}
            </button>
          </div>
          <p className="-mt-3 mb-4 text-xs leading-relaxed text-slate-500 pl-1">
            Enable a service, press Connect, finish OAuth in your browser, then press Refresh. Connected services can be used in chat (for example, “check my mail”).
          </p>
          <ComposioToolkitPicker
            enabledToolkits={enabledToolkits}
            statuses={statuses}
            busySlug={busySlug}
            actionsDisabled={saving}
            onToggle={toggleToolkit}
            onConnect={(slug) => void handleAuthorize(slug)}
            onRefresh={(slug) => void handleRefresh(slug)}
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Save your Composio API key to load Gmail, GitHub, and other integrations.
        </p>
      )}

      {redirectUrl && (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
            Connect link ready
          </div>
          <p className="mt-2 text-sm text-blue-700">
            Open this link, finish OAuth in the browser, then return here and press Refresh on the service card.
          </p>
          <button
            type="button"
            onClick={() => void openExternalUrl(redirectUrl)}
            className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white"
          >
            Open Connect Link Again
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
