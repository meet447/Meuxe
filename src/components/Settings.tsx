import { useState, useEffect } from "react";
import type { JSX } from "react";
import { ModelSettings } from "./ModelSettings";
import { MemoryStatePanel } from "./MemoryStatePanel";
import {
  getConfig,
  saveConfig,
  testLlm,
  getVoices,
  listTools,
  getComposioStatus,
  saveComposioConfig,
  authorizeComposioToolkit,
  refreshComposioToolkit,
} from "../api/tauri";
import { ComposioToolkitPicker } from "./ComposioToolkitPicker";
import { DEFAULT_ENABLED_COMPOSIO_TOOLKITS } from "../lib/composioToolkits";
import { LLM_PRESETS, llmPresetEntries } from "../lib/llmPresets";
import type { ComposioToolkitStatus } from "../types";

interface Voice {
  id: string;
  name: string;
}

interface TTSPreset {
  name: string;
  needs_key: boolean;
}

type SettingsPage = null | "profile" | "llm" | "tts" | "search" | "integrations" | "privacy" | "tools" | "expressions" | "memory";

const LLM_PRESET_LIST = llmPresetEntries();

const TTS_PRESETS: Record<string, TTSPreset> = {
  tiktok: { name: "TikTok TTS", needs_key: false },
  elevenlabs: { name: "ElevenLabs", needs_key: true },
};

const ProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
);
const BrainIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
);
const SpeakerIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
);
const MaskIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
);
const ToolsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const ArchiveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 12h10M5 16h8M4 4h16v16H4z" /></svg>
);
const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l7 4v5c0 4.5-2.8 7.7-7 9-4.2-1.3-7-4.5-7-9V7l7-4z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4" /></svg>
);
const PlugIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7l10 10M8 16l-2 2m10-10l2-2M8 8l-2 2 8 8 2-2M9 3v4m6 10v4" /></svg>
);

const MENU_ITEMS: { id: SettingsPage & string; label: string; description: string; icon: () => JSX.Element }[] = [
  { id: "profile", label: "Your Profile", description: "Name and about yourself", icon: ProfileIcon },
  { id: "llm", label: "LLM Provider", description: "Optional remote or local model endpoint", icon: BrainIcon },
  { id: "tts", label: "Voice & TTS", description: "Optional voice provider and key", icon: SpeakerIcon },
  { id: "search", label: "Web Search", description: "Optional search provider keys", icon: SearchIcon },
  { id: "integrations", label: "Integrations", description: "Composio and external source keys", icon: PlugIcon },
  { id: "privacy", label: "Local-First Privacy", description: "What stays local and what leaves", icon: ShieldIcon },
  { id: "tools", label: "Agent Tools", description: "Enable or disable tools the agent can use", icon: ToolsIcon },
  { id: "expressions", label: "Expression Mapping", description: "Map emotions to model expressions", icon: MaskIcon },
  { id: "memory", label: "Memory", description: "Inspect local memories", icon: ArchiveIcon },
];

const PERMISSION_STYLES: Record<string, { label: string; color: string }> = {
  Safe: { label: "Safe", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  Cautious: { label: "Cautious", color: "text-amber-600 bg-amber-50 border-amber-200" },
  Dangerous: { label: "Dangerous", color: "text-red-600 bg-red-50 border-red-200" },
};

function ToolsPage({ onBack }: { onBack: () => void }) {
  const [tools, setTools] = useState<{ name: string; description: string; permission: string; enabled: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listTools()
      .then((data) => {
        setTools(data);
        const initial: Record<string, boolean> = {};
        for (const t of data) {
          initial[t.name] = t.enabled;
        }
        setToggles(initial);
      })
      .catch((err) => console.error("Failed to load tools:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (name: string) => {
    setToggles((prev) => ({ ...prev, [name]: !prev[name] }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const disabledTools = Object.entries(toggles)
      .filter(([, enabled]) => !enabled)
      .map(([name]) => name);

    try {
      await saveConfig({ disabled_tools: disabledTools } as any);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save tool config:", err);
    }
    setSaving(false);
  };

  const enabledCount = Object.values(toggles).filter(Boolean).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shadow-blue-900/5 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center text-slate-500 hover:text-blue-500 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Agent Tools</h2>
          <p className="text-sm text-slate-400 mt-0.5">{enabledCount} of {tools.length} enabled</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="flex gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce" />
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-6">
            {tools.map((tool) => {
              const enabled = toggles[tool.name] ?? true;
              const perm = PERMISSION_STYLES[tool.permission] || PERMISSION_STYLES.Safe;
              return (
                <div
                  key={tool.name}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                    enabled
                      ? "bg-white border-slate-100 shadow-sm"
                      : "bg-slate-50/50 border-slate-100/50 opacity-60"
                  }`}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(tool.name)}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                      enabled ? "bg-blue-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        enabled ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-700">
                        {tool.name.replace(/_/g, " ")}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${perm.color}`}>
                        {perm.label}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-400 mt-0.5 truncate">{tool.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all active:translate-y-0"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
          </button>
        </>
      )}
    </div>
  );
}

const inputClass = "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";
const buttonClass = "w-full py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all active:translate-y-0";
const secondaryBtnClass = "w-full py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 text-[15px] font-medium hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 transition-all mb-3";

function LocalFirstNotice({ variant = "blue" }: { variant?: "blue" | "emerald" | "amber" }) {
  const colors = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  };
  return (
    <div className={`mb-6 rounded-[1.5rem] border px-5 py-4 text-sm leading-relaxed ${colors[variant]}`}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em]">Local-first boundary</div>
      Memory, chat history, character files, vault exports, and relationship state stay on this device. Only prompts, tool requests, audio text, or search queries needed for enabled external services leave the machine.
    </div>
  );
}

function PrivacyCard({ title, items, tone }: { title: string; items: string[]; tone: "emerald" | "blue" | "amber" }) {
  const toneClass = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  }[tone];
  return (
    <section className={`rounded-[1.75rem] border px-5 py-5 ${toneClass}`}>
      <h3 className="text-lg font-bold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Settings({ onClose, characterId, characterName, modelId, onPreviewExpression, onConversationCleared }: {
  onClose: () => void;
  characterId?: string;
  characterName: string;
  modelId?: string;
  onPreviewExpression?: (expr: string) => void;
  onConversationCleared?: () => void;
}) {
  const [page, setPage] = useState<SettingsPage>(null);
  const [config, setConfig] = useState<any>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const isMac = navigator.platform.toUpperCase().includes("MAC");

  // Derive configured status from the config object itself
  const [configuredLlm, setConfiguredLlm] = useState<Record<string, { configured: boolean; model: string }>>({});
  const [configuredTts, setConfiguredTts] = useState<Record<string, { configured: boolean; voice: string }>>({});

  const [userName, setUserName] = useState("");
  const [userAbout, setUserAbout] = useState("");
  const [llmProvider, setLlmProvider] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [ttsProvider, setTtsProvider] = useState("tiktok");
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoice, setTtsVoice] = useState("jp_001");
  const [searchProvider, setSearchProvider] = useState("duckduckgo");
  const [serpApiKey, setSerpApiKey] = useState("");
  const [exaApiKey, setExaApiKey] = useState("");
  const [composioApiKey, setComposioApiKey] = useState("");
  const [composioToolkits, setComposioToolkits] = useState<string[]>(DEFAULT_ENABLED_COMPOSIO_TOOLKITS);
  const [composioStatus, setComposioStatus] = useState<ComposioToolkitStatus[]>([]);
  const [composioRedirectUrl, setComposioRedirectUrl] = useState<string | null>(null);

  const deriveConfigured = (cfg: any) => {
    // Derive which providers are configured from stored config
    const llmConfigured: Record<string, { configured: boolean; model: string }> = {};
    const ttsConfigured: Record<string, { configured: boolean; voice: string }> = {};

    if (cfg?.llm_providers) {
      for (const [id, prov] of Object.entries(cfg.llm_providers as Record<string, any>)) {
        llmConfigured[id] = { configured: true, model: prov.model || "" };
      }
    }
    // Current active LLM is always configured
    if (cfg?.llm?.provider) {
      llmConfigured[cfg.llm.provider] = {
        configured: true,
        model: cfg.llm.model || "",
      };
    }

    if (cfg?.tts_providers) {
      for (const [id, prov] of Object.entries(cfg.tts_providers as Record<string, any>)) {
        ttsConfigured[id] = { configured: true, voice: (prov as any).voice || "" };
      }
    }
    if (cfg?.tts?.provider) {
      ttsConfigured[cfg.tts.provider] = {
        configured: true,
        voice: cfg.tts.voice || "",
      };
    }

    setConfiguredLlm(llmConfigured);
    setConfiguredTts(ttsConfigured);
  };

  useEffect(() => {
    getConfig()
      .then((cfg: any) => {
        setConfig(cfg);
        deriveConfigured(cfg);

        setUserName(cfg.user?.name || "");
        setUserAbout(cfg.user?.about || "");
        setLlmProvider(cfg.llm?.provider || "");
        setLlmApiKey("");
        setLlmModel(cfg.llm?.model || "");
        setLlmBaseUrl(cfg.llm?.base_url || "");
        setTtsProvider(cfg.tts?.provider || "tiktok");
        setTtsApiKey("");
        setTtsVoice(cfg.tts?.voice || "jp_001");
        setSearchProvider(cfg.search?.provider || "duckduckgo");
        setSerpApiKey("");
        setExaApiKey("");
        setComposioApiKey("");
        setComposioToolkits(
          cfg.composio?.enabled_toolkits?.length
            ? cfg.composio.enabled_toolkits
            : DEFAULT_ENABLED_COMPOSIO_TOOLKITS,
        );
        void getComposioStatus().then((data: any) => setComposioStatus(data || [])).catch(() => setComposioStatus([]));
      })
      .catch((err) => console.error("Failed to load config:", err));
  }, []);

  useEffect(() => {
    getVoices(ttsProvider)
      .then(setVoices)
      .catch(console.error);
  }, [ttsProvider]);

  const selectPreset = (id: string) => {
    const preset = LLM_PRESETS[id];
    if (!preset) return;
    setLlmProvider(id);
    setTestResult(null);
    setLlmApiKey("");

    // If this provider was previously configured, restore its saved config
    const saved = config?.llm_providers?.[id];
    if (saved) {
      setLlmBaseUrl(saved.base_url || preset.base_url);
      setLlmModel(saved.model || preset.default_model);
    } else {
      setLlmBaseUrl(preset.base_url);
      setLlmModel(preset.default_model);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await testLlm({
        base_url: llmBaseUrl,
        api_key: llmApiKey || "",
        model: llmModel,
      });
      setTestResult({ success: true });
    } catch (err: any) {
      setTestResult({ success: false, error: err?.toString() || "Connection failed" });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const update: any = {
      user: { name: userName, about: userAbout },
      llm: { provider: llmProvider, base_url: llmBaseUrl, model: llmModel },
      tts: { provider: ttsProvider, voice: ttsVoice },
      search: { provider: searchProvider },
    };
    if (llmApiKey) update.llm.api_key = llmApiKey;
    if (ttsApiKey) update.tts.api_key = ttsApiKey;
    if (serpApiKey) update.search.serp_api_key = serpApiKey;
    if (exaApiKey) update.search.exa_api_key = exaApiKey;

    try {
      await saveConfig(update);

      // Refresh config to update configured status
      const freshConfig: any = await getConfig();
      setConfig(freshConfig);
      deriveConfigured(freshConfig);
    } catch (err) {
      console.error("Failed to save config:", err);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveComposio = async () => {
    setSaving(true);
    try {
      await saveComposioConfig(composioApiKey.trim() || null, composioToolkits);
      const freshConfig: any = await getConfig();
      setConfig(freshConfig);
      void getComposioStatus().then((data: any) => setComposioStatus(data || []));
      setComposioApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save Composio config:", err);
    } finally {
      setSaving(false);
    }
  };

  const refreshComposioStatuses = async () => {
    const data: any = await getComposioStatus();
    setComposioStatus(data || []);
  };

  const handleAuthorizeComposio = async (toolkit: string) => {
    setSaving(true);
    try {
      const result: any = await authorizeComposioToolkit(toolkit);
      setComposioRedirectUrl(result.redirect_url || null);
      await refreshComposioStatuses();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to authorize Composio toolkit:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshComposio = async (toolkit: string) => {
    setSaving(true);
    try {
      await refreshComposioToolkit(toolkit);
      await refreshComposioStatuses();
    } catch (err) {
      console.error("Failed to refresh Composio toolkit:", err);
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="p-8 text-slate-400">Loading settings...</div>;

  // ========== SUB-PAGE HEADER ==========
  const SubHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-4 mb-8">
      <button
        onClick={() => setPage(null)}
        className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shadow-blue-900/5 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center text-slate-500 hover:text-blue-500 transition-all"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
    </div>
  );

  // ========== MENU LIST ==========
  if (page === null) {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Settings</h2>
            <p className="mt-1 text-sm text-slate-400">Local by default. Add only the external services you want.</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shadow-blue-900/5 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center text-slate-500 hover:text-red-500 transition-all">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div className="mb-6 rounded-[2rem] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-blue-50 px-5 py-5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Local-first setup</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Your vault, character profiles, sessions, and relationship state are local. External keys only enable selected capabilities: LLM responses, TTS audio, web search, and Composio integrations.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">LLM</div>
              <div className="mt-1 text-sm font-bold text-slate-700">{config.llm?.provider || "not set"}</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">TTS</div>
              <div className="mt-1 text-sm font-bold text-slate-700">{config.tts?.provider || "not set"}</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Search</div>
              <div className="mt-1 text-sm font-bold text-slate-700">{config.search?.provider || "duckduckgo"}</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Composio</div>
              <div className="mt-1 text-sm font-bold text-slate-700">{config.composio?.api_key ? "configured" : "not set"}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="w-full flex items-center gap-5 px-5 py-4 rounded-3xl border border-slate-100/80 bg-white shadow-sm shadow-blue-900/5 hover:border-blue-100 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-blue-50 flex items-center justify-center text-slate-500 group-hover:text-blue-500 transition-colors shadow-sm">
                <item.icon />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{item.label}</div>
                <div className="text-sm text-slate-400 mt-1">{item.description}</div>
              </div>
              <svg className="w-5 h-5 text-slate-300 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 16 16"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ========== PROFILE PAGE ==========
  if (page === "profile") {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Your Profile" />

        <label className={labelClass}>Your Name</label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="What should your companion call you?"
          className={inputClass}
        />

        <label className={labelClass}>About Yourself</label>
        <textarea
          value={userAbout}
          onChange={(e) => setUserAbout(e.target.value)}
          placeholder="Tell your companion about yourself -- interests, what you do, what you enjoy..."
          rows={5}
          className={`${inputClass} resize-none mb-8 rounded-3xl`}
        />

        <button
          onClick={handleSave}
          disabled={saving}
          className={buttonClass}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Profile"}
        </button>

        {/* Keyboard Shortcuts */}
        <div className="mt-10">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 pl-1">Keyboard Shortcuts</h3>
          <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {[
              { keys: isMac ? "Cmd + Shift + E" : "Ctrl + Shift + E", action: "Toggle mini mode", context: "Global — works from any app" },
              { keys: isMac ? "Cmd + Shift + Space" : "Ctrl + Shift + Space", action: "Open text input", context: "Global — mini mode" },
              { keys: isMac ? "Cmd + Shift + M" : "Ctrl + Shift + M", action: "Toggle microphone", context: "Global — mini mode" },
              { keys: "Escape", action: "Close text input", context: "Mini mode" },
            ].map((shortcut, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-slate-50" : ""}`}
              >
                <div className="flex-1">
                  <span className="text-[13px] text-slate-700">{shortcut.action}</span>
                  <span className="text-[11px] text-slate-400 ml-2">{shortcut.context}</span>
                </div>
                <div className="flex gap-1">
                  {shortcut.keys.split(" + ").map((key, j) => (
                    <span key={j}>
                      {j > 0 && <span className="text-slate-300 text-[11px] mx-0.5">+</span>}
                      <kbd className="inline-block px-2 py-0.5 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ========== LLM PAGE ==========
  if (page === "llm") {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="LLM Provider" />
        <LocalFirstNotice variant={LLM_PRESETS[llmProvider]?.needs_key === false ? "emerald" : "blue"} />

        <label className={labelClass}>Provider</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
          {LLM_PRESET_LIST.map(([id, preset]) => (
            <button
              key={id}
              onClick={() => selectPreset(id)}
              className={`relative px-4 py-3 rounded-2xl text-[13px] font-semibold border transition-all ${
                llmProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                  : configuredLlm[id]?.configured
                    ? "border-green-200 bg-green-50/30 text-slate-600 hover:border-green-300 hover:shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                {preset.name}
                {preset.needs_key === false && <span className="text-[10px] text-emerald-600 font-bold">Local</span>}
                {configuredLlm[id]?.configured && llmProvider !== id && (
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
              </span>
              {configuredLlm[id]?.configured && llmProvider !== id && (
                <span className="block text-[10px] text-green-600/70 font-medium mt-0.5">Configured</span>
              )}
            </button>
          ))}
        </div>

        {llmProvider && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {LLM_PRESETS[llmProvider]?.needs_key !== false && (
              <>
                <label className={labelClass}>API Key</label>
                <input
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => { setLlmApiKey(e.target.value); setTestResult(null); }}
                  placeholder="Paste your API key (blank to keep current)"
                  className={inputClass}
                />
              </>
            )}
            {LLM_PRESETS[llmProvider]?.needs_key === false && (
              <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                This provider runs through a local OpenAI-compatible endpoint. No API key is stored or sent.
              </div>
            )}

            <label className={labelClass}>Model</label>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => { setLlmModel(e.target.value); setTestResult(null); }}
              placeholder="e.g. gpt-4o"
              className={inputClass}
            />

            {llmProvider === "custom" && (
              <>
                <label className={labelClass}>Base URL</label>
                <input
                  type="text"
                  value={llmBaseUrl}
                  onChange={(e) => { setLlmBaseUrl(e.target.value); setTestResult(null); }}
                  placeholder="https://api.example.com/v1"
                  className={inputClass}
                />
              </>
            )}

            <button
              onClick={testConnection}
              disabled={testing}
              className={secondaryBtnClass}
            >
              {testing ? "Testing Connection..." : "Test Connection"}
            </button>

            {testResult && (
              <div className={`mb-6 px-5 py-4 rounded-2xl text-sm font-medium ${
                testResult.success
                  ? "bg-green-50 text-green-700 border border-green-200/50 shadow-sm"
                  : "bg-red-50 text-red-700 border border-red-200/50 shadow-sm"
              }`}>
                {testResult.success ? "Connected successfully!" : testResult.error || "Connection failed"}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className={buttonClass}
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ========== TTS PAGE ==========
  if (page === "tts") {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Voice & TTS" />
        <LocalFirstNotice variant={TTS_PRESETS[ttsProvider]?.needs_key ? "blue" : "emerald"} />

        <label className={labelClass}>Provider</label>
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(TTS_PRESETS).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => setTtsProvider(id)}
              className={`px-4 py-3 rounded-2xl text-[13px] font-semibold border transition-all ${
                ttsProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                  : configuredTts[id]?.configured
                    ? "border-green-200 bg-green-50/30 text-slate-600 hover:border-green-300 hover:shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {preset.name}
                {!preset.needs_key && <span className="text-[10px] text-emerald-600 font-bold">No key</span>}
                {configuredTts[id]?.configured && ttsProvider !== id && (
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {TTS_PRESETS[ttsProvider]?.needs_key && (
            <>
              <label className={labelClass}>API Key</label>
              <input
                type="password"
                value={ttsApiKey}
                onChange={(e) => setTtsApiKey(e.target.value)}
                placeholder="Paste your API key (blank to keep current)"
                className={inputClass}
              />
            </>
          )}
          {!TTS_PRESETS[ttsProvider]?.needs_key && (
            <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              This voice option does not require a key. Audio generation may still use the selected provider implementation when you ask the companion to speak.
            </div>
          )}

          <label className={labelClass}>Voice</label>
          <div className="relative mb-8">
            <select
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className={`${inputClass} appearance-none cursor-pointer mb-0`}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={buttonClass}
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
          </button>
        </div>
      </div>
    );
  }

  // ========== WEB SEARCH PAGE ==========
  if (page === "search") {
    const SEARCH_PRESETS: Record<string, { name: string; description: string; needsKey: boolean }> = {
      duckduckgo: { name: "DuckDuckGo", description: "Free, no API key needed", needsKey: false },
      serpapi: { name: "SerpAPI", description: "Google results via serpapi.com", needsKey: true },
      exa: { name: "Exa", description: "AI-powered search via exa.ai", needsKey: true },
    };

    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Web Search" />
        <LocalFirstNotice variant={searchProvider === "duckduckgo" ? "emerald" : "blue"} />

        <label className={labelClass}>Search Provider</label>
        <div className="space-y-2 mb-6">
          {Object.entries(SEARCH_PRESETS).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => setSearchProvider(id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left border transition-all ${
                searchProvider === id
                  ? "border-blue-400 bg-blue-50 shadow-sm shadow-blue-500/10"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <div className="flex-1">
                <div className={`text-[14px] font-semibold ${searchProvider === id ? "text-blue-700" : "text-slate-700"}`}>
                  {preset.name}
                </div>
                <div className="text-[12px] text-slate-400 mt-0.5">{preset.description}</div>
              </div>
              {searchProvider === id && (
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              )}
            </button>
          ))}
        </div>

        {searchProvider === "serpapi" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <label className={labelClass}>SerpAPI Key</label>
            <input
              type="password"
              value={serpApiKey}
              onChange={(e) => setSerpApiKey(e.target.value)}
              placeholder="Paste your SerpAPI key (blank to keep current)"
              className={inputClass}
            />
            <p className="text-[12px] text-slate-400 -mt-3 mb-5 pl-1">
              Get your key at <span className="text-blue-500">serpapi.com</span> — 100 free searches/month
            </p>
          </div>
        )}

        {searchProvider === "exa" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <label className={labelClass}>Exa API Key</label>
            <input
              type="password"
              value={exaApiKey}
              onChange={(e) => setExaApiKey(e.target.value)}
              placeholder="Paste your Exa API key (blank to keep current)"
              className={inputClass}
            />
            <p className="text-[12px] text-slate-400 -mt-3 mb-5 pl-1">
              Get your key at <span className="text-blue-500">exa.ai</span> — AI-powered neural search
            </p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className={buttonClass}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
        </button>
      </div>
    );
  }

  // ========== TOOLS PAGE ==========
  if (page === "integrations") {
    const toggleToolkit = (slug: string) => {
      setComposioToolkits((prev) =>
        prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug],
      );
    };

    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Integrations" />
        <LocalFirstNotice variant="amber" />

        <div className="mb-6 rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Composio</div>
          <h3 className="mt-2 text-lg font-bold text-slate-800">OAuth and connected sources</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Composio is optional. Enable the services you want, connect them with OAuth, and sync read-only GitHub or Gmail context into the local memory vault through authenticated Composio tools.
          </p>

          <label className={`${labelClass} mt-5`}>Composio API Key</label>
          <input
            type="password"
            value={composioApiKey}
            onChange={(e) => setComposioApiKey(e.target.value)}
            placeholder="Paste Composio API key (blank to keep current)"
            className={inputClass}
          />

          <label className={labelClass}>Connected Services</label>
          <div className="mb-6">
            <ComposioToolkitPicker
              enabledToolkits={composioToolkits}
              statuses={composioStatus}
              onToggle={toggleToolkit}
              onConnect={(slug) => void handleAuthorizeComposio(slug)}
              onRefresh={(slug) => void handleRefreshComposio(slug)}
            />
          </div>

          {composioRedirectUrl && (
            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Connect link ready</div>
              <p className="mt-2 text-sm text-blue-700">Open this link, finish OAuth in the browser, then return here and press Refresh.</p>
              <button
                onClick={() => window.open(composioRedirectUrl, "_blank", "noopener,noreferrer")}
                className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white"
              >
                Open Connect Link
              </button>
            </div>
          )}

          <button onClick={handleSaveComposio} disabled={saving} className={buttonClass}>
            {saving ? "Saving..." : saved ? "Saved!" : "Save Integrations"}
          </button>
        </div>
      </div>
    );
  }

  if (page === "privacy") {
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Local-First Privacy" />
        <div className="space-y-4">
          <PrivacyCard title="Always local" items={["SQLite memory vault", "Markdown vault projection", "Character files", "Session history", "Relationship state", "Imported notes/transcripts"]} tone="emerald" />
          <PrivacyCard title="Leaves only when enabled" items={["LLM prompts and retrieved memory snippets", "TTS text sent for speech generation", "Search queries sent to selected search provider", "Composio toolkit requests for connected sources"]} tone="blue" />
          <PrivacyCard title="Never store in plaintext intentionally" items={["API keys are masked in settings reads", "Blank key fields preserve existing values", "Generated exports are local files you control"]} tone="amber" />
        </div>
      </div>
    );
  }

  // ========== TOOLS PAGE ==========
  if (page === "tools") {
    return <ToolsPage onBack={() => setPage(null)} />;
  }

  // ========== EXPRESSIONS PAGE ==========
  if (page === "expressions") {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-0">
          <SubHeader title="Expression Mapping" />
        </div>
        {modelId ? (
          <ModelSettings
            modelId={modelId}
            onPreviewExpression={onPreviewExpression || (() => {})}
            onClose={() => setPage(null)}
          />
        ) : (
          <div className="p-6 text-sm text-slate-400">No model loaded -- select a character first.</div>
        )}
      </div>
    );
  }

  if (page === "memory") {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-0">
          <SubHeader title="Memory" />
        </div>
        <MemoryStatePanel
          characterId={characterId}
          characterName={characterName}
          onConversationCleared={onConversationCleared}
        />
      </div>
    );
  }

  return null;
}
