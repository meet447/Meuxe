import { useCallback, useEffect, useMemo, useState } from "react";
import { listLlmModels } from "../api/tauri";

const inputClass =
  "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";

interface LlmModelFieldProps {
  value: string;
  onChange: (model: string) => void;
  baseUrl: string;
  apiKey?: string;
  providerId?: string;
  needsKey?: boolean;
  onInvalidateTest?: () => void;
}

export function LlmModelField({
  value,
  onChange,
  baseUrl,
  apiKey = "",
  providerId,
  needsKey = true,
  onInvalidateTest,
}: LlmModelFieldProps) {
  const [remoteModels, setRemoteModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);

  const fetchModels = useCallback(async () => {
    const url = baseUrl.trim();
    if (!url) {
      setRemoteModels(null);
      setFetchError(null);
      return;
    }

    setLoading(true);
    setFetchError(null);
    try {
      const models = await listLlmModels({
        base_url: url,
        api_key: apiKey,
        provider: providerId,
      });
      setRemoteModels(models);
    } catch (err) {
      setRemoteModels(null);
      const message = err instanceof Error ? err.message : "Could not load models from provider";
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, baseUrl, providerId]);

  useEffect(() => {
    setManualEntry(false);
  }, [baseUrl, providerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchModels();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fetchModels]);

  const options = useMemo(() => {
    const ids = new Set(remoteModels ?? []);
    if (value) ids.add(value);
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [remoteModels, value]);

  const showSelect = !manualEntry && options.length > 0;

  const handleChange = (next: string) => {
    onChange(next);
    onInvalidateTest?.();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between pl-1">
        <label className="block text-sm font-semibold text-slate-700 tracking-wide">Model</label>
        <button
          type="button"
          onClick={() => void fetchModels()}
          disabled={loading || !baseUrl.trim()}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40"
        >
          {loading ? "Loading models..." : "Refresh models"}
        </button>
      </div>

      {showSelect ? (
        <select
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className={inputClass}
        >
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="e.g. gpt-4o"
          className={inputClass}
        />
      )}

      {fetchError && (
        <p className="-mt-3 mb-4 text-xs text-slate-500">
          {needsKey && !apiKey.trim()
            ? "Enter an API key (or save one) to load models from the provider, or type a model ID manually."
            : fetchError}
        </p>
      )}

      {options.length > 0 && (
        <button
          type="button"
          onClick={() => setManualEntry((prev) => !prev)}
          className="-mt-2 mb-5 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          {manualEntry ? "Choose from provider list" : "Enter model ID manually"}
        </button>
      )}
    </div>
  );
}
