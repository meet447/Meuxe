import { useState, useEffect } from "react";
import type { JSX } from "react";
import { ModelSettings } from "./ModelSettings";
import { MemoryStatePanel } from "./MemoryStatePanel";
import {
  getConfig,
  saveConfig,
  resetAllAppData,
  resetOnboarding,
} from "../api/tauri";
import { getVoices } from "../lib/ttsClient";
import {
  DEFAULT_TTS_PROVIDER,
  DEFAULT_TTS_VOICE,
  TTS_PRESETS_UI,
  resolvedTtsProvider,
} from "../lib/ttsPresets";
import { AgentSection } from "./settings/AgentSection";
import { AvatarViewportSettings } from "./settings/AvatarViewportSettings";
import { TtsSection } from "./settings/TtsSection";
import { UpdatesSection } from "./settings/UpdatesSection";
import { WhisperDownloadCard } from "./voice/WhisperDownloadCard";
import { useVoice } from "../hooks/useVoice";
import type { AcpAgentPresetId } from "../lib/agentPresets";
import {
  AppWindowIcon,
  AsciiAccent,
  Button,
  CloseIcon,
  Dots,
  FaceIcon,
  Field,
  FrameIcon,
  IconButton,
  Input,
  KeyCombo,
  MeuxeMark,
  MemoryIcon,
  Notice,
  Pill,
  SectionTitle,
  ShieldIcon,
  SparkIcon,
  SpeakerIcon,
  Surface,
  Textarea,
  UserIcon,
  cn,
} from "./ui";
import type { AppConfig, Voice } from "../types";

type SettingsPage = "profile" | "llm" | "tts" | "privacy" | "updates" | "expressions" | "memory" | "avatar";

const SETTINGS_TTS_PRESETS: Record<string, { name: string; needs_key: boolean; hint?: string }> = {
  tiktok: TTS_PRESETS_UI.tiktok,
  system: TTS_PRESETS_UI.system,
  elevenlabs: TTS_PRESETS_UI.elevenlabs,
  openai_tts: TTS_PRESETS_UI.openai_tts,
};

const PAGE_META: Record<SettingsPage, { title: string; description: string }> = {
  llm: {
    title: "Agent",
    description: "Your companion thinks with an assistant already on your computer. Meuxe adds their personality, memory, voice, and face.",
  },
  tts: {
    title: "Voice",
    description: "Choose how your companion sounds. Meuxe TTS is free and ready; system and studio voices are optional.",
  },
  avatar: {
    title: "Avatar on screen",
    description: "Zoom and background for the main stage.",
  },
  expressions: {
    title: "Expressions",
    description: "Map emotions to model expressions and animations, including shared VRM defaults.",
  },
  memory: {
    title: "Memory",
    description: "How your companion feels about you, and what they remember.",
  },
  profile: {
    title: "Your profile",
    description: "Name and about yourself.",
  },
  updates: {
    title: "App updates",
    description: "Keep Meuxe up to date with the latest improvements and fixes.",
  },
  privacy: {
    title: "Privacy & data",
    description: "What stays on your device and what uses the network.",
  },
};

type NavItem = { id: SettingsPage; label: string; icon: (props: { className?: string }) => JSX.Element };

const COMPANION_NAV: NavItem[] = [
  { id: "llm", label: "Agent", icon: SparkIcon },
  { id: "tts", label: "Voice", icon: SpeakerIcon },
  { id: "avatar", label: "Avatar on screen", icon: FrameIcon },
  { id: "expressions", label: "Expressions", icon: FaceIcon },
  { id: "memory", label: "Memory", icon: MemoryIcon },
];

const YOU_NAV: NavItem[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "privacy", label: "Privacy & data", icon: ShieldIcon },
  { id: "updates", label: "App updates", icon: AppWindowIcon },
];

function PrivacyCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "sage" | "accent" | "honey";
}) {
  return (
    <Surface tone="raised" className="p-5">
      <Pill tone={tone} className="mb-3">
        {title}
      </Pill>
      <ul className="space-y-2 text-sm text-ink-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition",
        active ? "bg-surface-2 text-ink shadow-soft" : "text-ink-2 hover:bg-well",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px]", active ? "text-accent-600" : "text-ink-3")} />
      {item.label}
    </button>
  );
}

export function Settings({
  onClose,
  characterId,
  characterName,
  modelId,
  onPreviewExpression,
  onExpressionsSaved,
  onConversationCleared,
  onResetAll,
  onResetOnboarding,
  avatarZoom,
  avatarBackground,
  onAvatarZoomChange,
  onAvatarResetView,
  onAvatarBackgroundChange,
}: {
  onClose: () => void;
  characterId?: string;
  characterName: string;
  modelId?: string;
  onPreviewExpression?: (expr: string) => void;
  onExpressionsSaved?: () => void;
  onConversationCleared?: () => void;
  onResetAll?: () => void;
  onResetOnboarding?: () => void;
  avatarZoom?: number;
  avatarBackground?: string;
  onAvatarZoomChange?: (zoom: number) => void;
  onAvatarResetView?: () => void;
  onAvatarBackgroundChange?: (bg: string) => void;
}) {
  const [page, setPage] = useState<SettingsPage>("llm");
  const {
    needsWhisperDownload,
    downloadProgress,
    downloading,
    downloadWhisper,
    error: whisperError,
  } = useVoice();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isMac = navigator.platform.toUpperCase().includes("MAC");

  const [configuredTts, setConfiguredTts] = useState<Record<string, { configured: boolean; voice: string }>>({});

  const [userName, setUserName] = useState("");
  const [userAbout, setUserAbout] = useState("");
  const [ttsProvider, setTtsProvider] = useState(DEFAULT_TTS_PROVIDER);
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoice, setTtsVoice] = useState(DEFAULT_TTS_VOICE);
  const [agentPreset, setAgentPreset] = useState("opencode");
  const [agentProgram, setAgentProgram] = useState("");
  const [agentArgs, setAgentArgs] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [autoApproveTools, setAutoApproveTools] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  const [onboardingResetError, setOnboardingResetError] = useState<string | null>(null);

  const deriveConfigured = (cfg: AppConfig) => {
    const ttsConfigured: Record<string, { configured: boolean; voice: string }> = {};

    if (cfg.tts_providers) {
      for (const [id, prov] of Object.entries(cfg.tts_providers)) {
        ttsConfigured[id] = { configured: true, voice: prov.voice || "" };
      }
    }
    if (cfg.tts?.provider) {
      ttsConfigured[cfg.tts.provider] = {
        configured: true,
        voice: cfg.tts.voice || "",
      };
    }

    setConfiguredTts(ttsConfigured);
  };

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setConfig(cfg);
        deriveConfigured(cfg);

        setUserName(cfg.user?.name || "");
        setUserAbout(cfg.user?.about || "");
        setTtsProvider(resolvedTtsProvider(cfg.tts?.provider));
        setTtsApiKey("");
        setTtsVoice(
          resolvedTtsProvider(cfg.tts?.provider) === "system"
            ? (cfg.tts?.voice || "")
            : (cfg.tts?.voice || DEFAULT_TTS_VOICE),
        );
        setAgentPreset(cfg.agent?.preset || "opencode");
        setAgentProgram(cfg.agent?.program || "");
        setAgentModel(cfg.agent?.model || "");
        setAgentArgs((cfg.agent?.args || []).join(" "));
        setAutoApproveTools(cfg.agent?.auto_approve_tools ?? false);
      })
      .catch((err) => console.error("Failed to load config:", err));
  }, []);

  useEffect(() => {
    getVoices(ttsProvider)
      .then(setVoices)
      .catch(console.error);
  }, [ttsProvider]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const update: Partial<AppConfig> = {
      user: { name: userName, about: userAbout },
      tts: { provider: ttsProvider, voice: ttsVoice },
      agent: {
        preset: agentPreset,
        model: agentModel,
        program: agentProgram,
        args: agentArgs.trim() ? agentArgs.trim().split(/\s+/) : [],
        auto_approve_tools: autoApproveTools,
      },
    };
    if (ttsApiKey && update.tts) {
      update.tts = { ...update.tts, api_key: ttsApiKey };
    }
    try {
      await saveConfig(update);

      const freshConfig = await getConfig();
      setConfig(freshConfig);
      deriveConfigured(freshConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save config:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

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

  const meta = PAGE_META[page];

  const renderPageContent = () => {
    if (page === "updates") return <UpdatesSection />;

    if (page === "avatar") {
      if (avatarZoom != null && avatarBackground && onAvatarZoomChange && onAvatarBackgroundChange) {
        return (
          <AvatarViewportSettings
            zoom={avatarZoom}
            background={avatarBackground}
            onZoomChange={onAvatarZoomChange}
            onResetView={onAvatarResetView}
            onBackgroundChange={onAvatarBackgroundChange}
          />
        );
      }
      return <Notice tone="neutral">Avatar controls are not available in this view.</Notice>;
    }

    if (!config) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Dots />
          <p className="text-sm text-ink-3">Loading settings…</p>
        </div>
      );
    }

    if (page === "profile") {
      return (
        <div className="space-y-6">
          <Field label="Your name">
            <Input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="What should your companion call you?"
            />
          </Field>

          <Field label="About yourself">
            <Textarea
              value={userAbout}
              onChange={(e) => setUserAbout(e.target.value)}
              placeholder="Tell your companion about yourself: interests, what you do, what you enjoy..."
              rows={5}
            />
          </Field>

          <div className="flex items-center gap-3">
            <Button variant="primary" loading={saving} onClick={handleSave}>
              Save profile
            </Button>
            {saved && (
              <Pill tone="sage" dot>
                Saved
              </Pill>
            )}
          </div>

          <div className="pt-4">
            <SectionTitle>Keyboard shortcuts</SectionTitle>
            <Surface tone="raised" elevation="soft" className="divide-y divide-line/70">
              {[
                {
                  keys: isMac ? "Cmd + Shift + E" : "Ctrl + Shift + E",
                  action: "Toggle mini mode",
                  context: "Works from any app",
                },
                {
                  keys: isMac ? "Cmd + Shift + Space" : "Ctrl + Shift + Space",
                  action: "Open text input",
                  context: "Mini mode, works from any app",
                },
                {
                  keys: isMac ? "Cmd + Shift + M" : "Ctrl + Shift + M",
                  action: "Toggle microphone",
                  context: "Mini mode, works from any app",
                },
                { keys: "Escape", action: "Close text input", context: "Mini mode" },
              ].map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1">
                    <span className="text-[13px] text-ink">{shortcut.action}</span>
                    <span className="ml-2 text-xs text-ink-3">{shortcut.context}</span>
                  </div>
                  <KeyCombo combo={shortcut.keys} />
                </div>
              ))}
            </Surface>
          </div>
        </div>
      );
    }

    if (page === "llm") {
      return (
        <div className="space-y-6">
          <AgentSection
            value={{
              preset: (agentPreset as AcpAgentPresetId) || "opencode",
              program: agentProgram,
              args: agentArgs,
              model: agentModel,
              auto_approve_tools: autoApproveTools,
            }}
            onChange={(next) => {
              setAgentPreset(next.preset);
              setAgentProgram(next.program);
              setAgentArgs(next.args);
              setAgentModel(next.model ?? "");
              setAutoApproveTools(next.auto_approve_tools);
            }}
          />

          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save agent
          </Button>
        </div>
      );
    }

    if (page === "tts") {
      return (
        <div className="space-y-6">
          <TtsSection
            value={{
              provider: ttsProvider,
              api_key: ttsApiKey,
              voice: ttsVoice,
            }}
            onChange={(next) => {
              setTtsProvider(next.provider);
              setTtsApiKey(next.api_key);
              setTtsVoice(next.voice);
            }}
            voices={voices}
            presets={SETTINGS_TTS_PRESETS}
            configuredProviders={configuredTts}
            showLocalFirstNotice
          />

          {(needsWhisperDownload || downloading) && (
            <WhisperDownloadCard
              progress={downloadProgress}
              error={whisperError}
              downloading={downloading}
              onDownload={() => {
                void downloadWhisper();
              }}
            />
          )}

          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save configuration
          </Button>
        </div>
      );
    }

    if (page === "privacy") {
      return (
        <div className="space-y-4">
          <PrivacyCard
            title="Stays on your device"
            items={[
              "Memories and chat history",
              "Character personality and mood",
              "Your profile",
              "System voice, if you choose it",
              "Microphone transcription after the speech model is downloaded",
            ]}
            tone="sage"
          />
          <PrivacyCard
            title="Uses the network when you choose"
            items={[
              "Meuxe TTS (the default voice)",
              "Your chat assistant, and anything that assistant does online",
              "ElevenLabs or OpenAI voices, only if you turn them on",
              "One-time speech model download from Hugging Face when you first use the mic",
              "Optional in-app updates from GitHub Releases",
            ]}
            tone="accent"
          />
          <PrivacyCard
            title="Keys & files"
            items={[
              "API keys stay in a local config file (owner-only on macOS and Linux)",
              "Exports are files you control",
            ]}
            tone="honey"
          />

          <Surface tone="well" elevation="none" className="p-5">
            <h3 className="text-sm font-semibold text-ink">Run onboarding again</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Reopen the first-run setup to change your companion, voice, or assistant. Your chat history, memories,
              and API keys stay on this device.
            </p>
            {onboardingResetError && (
              <Notice tone="danger" className="mt-3">
                {onboardingResetError}
              </Notice>
            )}
            <Button
              variant="secondary"
              loading={resettingOnboarding}
              onClick={handleResetOnboarding}
              className="mt-4"
            >
              Run onboarding again
            </Button>
          </Surface>

          <Surface tone="raised" className="p-5 ring-1 ring-clay-200/70">
            <h3 className="text-sm font-semibold text-clay-700">Reset everything</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Deletes your profile, companions, chat history, saved memories, API keys, and settings, then returns you
              to onboarding. Imported Live2D and VRM models stay on disk.
            </p>
            {resetError && (
              <Notice tone="danger" className="mt-3">
                {resetError}
              </Notice>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button variant="danger" loading={resetting} onClick={handleResetAll}>
                {confirmReset ? "Yes, reset everything" : "Reset and start over"}
              </Button>
              {confirmReset && !resetting && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmReset(false);
                    setResetError(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </Surface>
        </div>
      );
    }

    if (page === "expressions") {
      if (!modelId) {
        return <Notice tone="neutral">Pick a companion first to tune their expressions.</Notice>;
      }
      return (
        <ModelSettings
          modelId={modelId}
          onPreviewExpression={onPreviewExpression || (() => {})}
          onSaved={onExpressionsSaved}
        />
      );
    }

    if (page === "memory") {
      return (
        <MemoryStatePanel
          characterId={characterId}
          characterName={characterName}
          onConversationCleared={onConversationCleared}
        />
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-[120] flex animate-fade-in items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <Surface
        radius="sheet"
        tone="surface"
        elevation="pop"
        className="relative flex h-[min(760px,92vh)] w-full max-w-4xl animate-pop-in overflow-hidden"
      >
        <nav className="flex w-60 shrink-0 flex-col bg-well/60 p-4">
          <div className="flex items-center gap-2.5 px-3 pb-2">
            <MeuxeMark className="h-8 w-8" />
            <span className="text-[15px] font-bold text-ink">Settings</span>
          </div>

          <p className="px-3 pb-1 pt-4 text-[11px] font-semibold text-ink-4">Companion</p>
          <div className="space-y-0.5">
            {COMPANION_NAV.map((item) => (
              <NavButton key={item.id} item={item} active={page === item.id} onSelect={() => setPage(item.id)} />
            ))}
          </div>

          <p className="px-3 pb-1 pt-4 text-[11px] font-semibold text-ink-4">You</p>
          <div className="space-y-0.5">
            {YOU_NAV.map((item) => (
              <NavButton key={item.id} item={item} active={page === item.id} onSelect={() => setPage(item.id)} />
            ))}
          </div>

          <div className="mt-auto pt-6">
            <AsciiAccent rows={3} cols={20} density={0.8} fade="both" />
            <p className="mt-2 text-[11px] text-ink-4">Local-first · nothing leaves this device unless you choose.</p>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 px-8 pb-4 pt-7">
            <div>
              <h2 className="text-[22px] font-bold tracking-tight text-ink">{meta.title}</h2>
              <p className="mt-1 text-sm text-ink-2">{meta.description}</p>
            </div>
            <IconButton label="Close" size="sm" variant="ghost" onClick={onClose}>
              <CloseIcon className="h-4 w-4" />
            </IconButton>
          </header>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-8 pb-8">
            {saveError && (
              <Notice tone="danger" className="mb-4">{saveError}</Notice>
            )}
            {renderPageContent()}
          </div>
        </div>
      </Surface>
    </div>
  );
}
