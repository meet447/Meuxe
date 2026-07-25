import { useState, useEffect } from "react";
import type { JSX } from "react";
import { ModelSettings } from "./ModelSettings";
import { MemoryStatePanel } from "./MemoryStatePanel";
import {
  getConfig,
  saveConfig,
  resetAllAppData,
  resetOnboarding,
  getVoices,
} from "../api/tauri";
import { ComposioIntegrationsPanel } from "./ComposioIntegrationsPanel";
import { ACP_AGENT_PRESET_IDS, ACP_AGENT_PRESETS } from "../lib/agentPresets";
interface Voice {
  id: string;
  name: string;
}

interface TTSPreset {
  name: string;
  needs_key: boolean;
}

type SettingsPage = null | "profile" | "llm" | "tts" | "search" | "integrations" | "privacy" | "expressions" | "memory";

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
  { id: "privacy", label: "Privacy", description: "What stays on your device", icon: ShieldIcon },
  { id: "memory", label: "Memory", description: "What your companion remembers", icon: ArchiveIcon },
  { id: "tts", label: "Voice", description: "How they sound when they speak", icon: SpeakerIcon },
  { id: "llm", label: "CLI Agent", description: "Claude Code, Codex, or custom ACP", icon: BrainIcon },
  { id: "expressions", label: "Expressions", description: "Emotions on their avatar", icon: MaskIcon },
  { id: "search", label: "Web Search (advanced)", description: "Optional search API keys", icon: SearchIcon },
  { id: "integrations", label: "Integrations (advanced)", description: "Optional Gmail, GitHub, and other apps", icon: PlugIcon },
];

const inputClass = "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";
const buttonClass = "w-full py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all active:translate-y-0";

function LocalFirstNotice({ variant = "blue" }: { variant?: "blue" | "emerald" | "amber" }) {
  const colors = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  };
  return (
    <div className={`mb-6 rounded-[1.5rem] border px-5 py-4 text-sm leading-relaxed ${colors[variant]}`}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em]">Local-first boundary</div>
      Memories, chat history, character files, and relationship state stay on this device. Only prompts, tool requests, speech text, or search queries needed for enabled external services leave the machine.
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

export function Settings({ onClose, characterId, characterName, modelId, onPreviewExpression, onExpressionsSaved, onConversationCleared, onResetAll, onResetOnboarding }: {
  onClose: () => void;
  characterId?: string;
  characterName: string;
  modelId?: string;
  onPreviewExpression?: (expr: string) => void;
  onExpressionsSaved?: () => void;
  onConversationCleared?: () => void;
  onResetAll?: () => void;
  onResetOnboarding?: () => void;
}) {
  const [page, setPage] = useState<SettingsPage>(null);
  const [config, setConfig] = useState<any>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isMac = navigator.platform.toUpperCase().includes("MAC");

  const [configuredTts, setConfiguredTts] = useState<Record<string, { configured: boolean; voice: string }>>({});

  const [userName, setUserName] = useState("");
  const [userAbout, setUserAbout] = useState("");
  const [ttsProvider, setTtsProvider] = useState("tiktok");
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoice, setTtsVoice] = useState("jp_001");
  const [searchProvider, setSearchProvider] = useState("duckduckgo");
  const [serpApiKey, setSerpApiKey] = useState("");
  const [exaApiKey, setExaApiKey] = useState("");
  const [agentPreset, setAgentPreset] = useState("opencode");
  const [agentProgram, setAgentProgram] = useState("");
  const [agentArgs, setAgentArgs] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  const [onboardingResetError, setOnboardingResetError] = useState<string | null>(null);

  const deriveConfigured = (cfg: any) => {
    const ttsConfigured: Record<string, { configured: boolean; voice: string }> = {};

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

    setConfiguredTts(ttsConfigured);
  };

  useEffect(() => {
    getConfig()
      .then((cfg: any) => {
        setConfig(cfg);
        deriveConfigured(cfg);

        setUserName(cfg.user?.name || "");
        setUserAbout(cfg.user?.about || "");
        setTtsProvider(cfg.tts?.provider || "tiktok");
        setTtsApiKey("");
        setTtsVoice(cfg.tts?.voice || "jp_001");
        setSearchProvider(cfg.search?.provider || "duckduckgo");
        setSerpApiKey("");
        setExaApiKey("");
        setAgentPreset(cfg.agent?.preset || "opencode");
        setAgentProgram(cfg.agent?.program || "");
        setAgentArgs((cfg.agent?.args || []).join(" "));
      })
      .catch((err) => console.error("Failed to load config:", err));
  }, []);

  useEffect(() => {
    getVoices(ttsProvider)
      .then(setVoices)
      .catch(console.error);
  }, [ttsProvider]);

  const handleSave = async () => {
    setSaving(true);
    const update: any = {
      user: { name: userName, about: userAbout },
      tts: { provider: ttsProvider, voice: ttsVoice },
      search: { provider: searchProvider },
      agent: {
        preset: agentPreset,
        program: agentProgram,
        args: agentArgs.trim() ? agentArgs.trim().split(/\s+/) : [],
      },
    };
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
            Your memories, character profiles, chat history, and relationship state stay on this device. External keys only enable what you turn on: AI replies, voice, web search, and optional app integrations.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Agent</div>
              <div className="mt-1 text-sm font-bold text-slate-700">
                {ACP_AGENT_PRESETS[(config.agent?.preset as keyof typeof ACP_AGENT_PRESETS) || "opencode"]?.title ||
                  config.agent?.preset ||
                  "not set"}
              </div>
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
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Integrations</div>
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
        <SubHeader title="CLI Agent" />
        <p className="text-slate-500 text-[15px] mb-8 leading-relaxed max-w-xl">
          Chat always runs through your local ACP agent. Meuxe supplies persona, memory, voice, and avatar; the agent supplies reasoning and tools.
        </p>

        <label className={labelClass}>Agent preset</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {ACP_AGENT_PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setAgentPreset(id)}
              className={`rounded-[1.4rem] border px-4 py-4 text-left transition-all ${
                agentPreset === id
                  ? "border-violet-400 bg-violet-50 text-violet-800 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <div className="text-sm font-semibold">{ACP_AGENT_PRESETS[id].title}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-500">{ACP_AGENT_PRESETS[id].blurb}</div>
            </button>
          ))}
        </div>

        {agentPreset === "custom" && (
          <>
            <label className={labelClass}>Command</label>
            <input
              type="text"
              value={agentProgram}
              onChange={(e) => setAgentProgram(e.target.value)}
              placeholder="e.g. python my_agent.py"
              className={inputClass}
            />
            <label className={labelClass}>Arguments (optional)</label>
            <input
              type="text"
              value={agentArgs}
              onChange={(e) => setAgentArgs(e.target.value)}
              placeholder="space-separated flags"
              className={inputClass}
            />
          </>
        )}

        <p className="text-xs text-slate-500 leading-relaxed mb-6">
          Persona and memory context are written to companion-home before each turn. Install the CLI and sign in on your machine first.
        </p>

        <button onClick={handleSave} disabled={saving} className={buttonClass}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save agent"}
        </button>
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
    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Integrations" />
        <LocalFirstNotice variant="amber" />

        <div className="mb-6 min-w-0 rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Composio</div>
          <h3 className="mt-2 text-lg font-bold text-slate-800">OAuth and connected sources</h3>
          <ComposioIntegrationsPanel
            optionalHint="Optional. Save your integration API key first, then connect services with OAuth. Connected Gmail and GitHub accounts can be used in chat (for example, “check my mail”)."
          />
        </div>
      </div>
    );
  }

  if (page === "privacy") {
    const handleResetAll = async () => {
      if (!confirmReset) {
        setConfirmReset(true);
        setResetError(null);
        return;
      }

      setResetting(true);
      setResetError(null);
      try {
        await resetAllAppData();
        onResetAll?.();
      } catch (err) {
        console.error("Reset failed:", err);
        setResetError(err instanceof Error ? err.message : "Reset failed. Please try again.");
        setConfirmReset(false);
      } finally {
        setResetting(false);
      }
    };

    const handleResetOnboarding = async () => {
      setResettingOnboarding(true);
      setOnboardingResetError(null);
      try {
        await resetOnboarding();
        onResetOnboarding?.();
      } catch (err) {
        console.error("Onboarding reset failed:", err);
        setOnboardingResetError(err instanceof Error ? err.message : "Could not reset onboarding.");
      } finally {
        setResettingOnboarding(false);
      }
    };

    return (
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Local-First Privacy" />
        <div className="space-y-4">
          <PrivacyCard title="Always local" items={["Memory database and exports", "Character persona files", "Chat session history", "Relationship state", "Imported notes and transcripts"]} tone="emerald" />
          <PrivacyCard title="Leaves only when enabled" items={["LLM prompts and retrieved memory snippets", "TTS text sent for speech generation", "Search queries sent to selected search provider", "Connected app requests (Gmail, GitHub, etc.)"]} tone="blue" />
          <PrivacyCard title="Never store in plaintext intentionally" items={["API keys are masked in settings reads", "Blank key fields preserve existing values", "Generated exports are local files you control"]} tone="amber" />

          <section className="rounded-[1.75rem] border border-violet-200 bg-violet-50 px-5 py-5 text-violet-900">
            <h3 className="text-lg font-bold">Run onboarding again</h3>
            <p className="mt-2 text-sm leading-relaxed text-violet-800/90">
              Reopen the first-run setup to change your companion, voice, or CLI agent. Your chat history, memories, and API keys stay on this device.
            </p>
            {onboardingResetError && (
              <p className="mt-3 rounded-2xl border border-violet-300 bg-white/70 px-4 py-3 text-sm font-medium text-violet-900">
                {onboardingResetError}
              </p>
            )}
            <button
              type="button"
              onClick={handleResetOnboarding}
              disabled={resettingOnboarding}
              className="mt-4 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:opacity-50"
            >
              {resettingOnboarding ? "Opening onboarding…" : "Run onboarding again"}
            </button>
          </section>

          <section className="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-5 text-red-800">
            <h3 className="text-lg font-bold">Reset everything</h3>
            <p className="mt-2 text-sm leading-relaxed text-red-700/90">
              Deletes your profile, companions, chat history, saved memories, API keys, integrations, and settings, then returns you to onboarding. Imported Live2D and VRM models stay on disk.
            </p>
            {resetError && (
              <p className="mt-3 rounded-2xl border border-red-300 bg-white/70 px-4 py-3 text-sm font-medium text-red-700">
                {resetError}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleResetAll}
                disabled={resetting}
                className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-red-600/20 transition-all hover:bg-red-700 disabled:opacity-50"
              >
                {resetting ? "Resetting..." : confirmReset ? "Yes, reset everything" : "Reset and start over"}
              </button>
              {confirmReset && !resetting && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset(false);
                    setResetError(null);
                  }}
                  className="rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 transition-all hover:bg-red-100/50"
                >
                  Cancel
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    );
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
            onSaved={onExpressionsSaved}
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
