import { useEffect, useRef, useState } from "react";
import {
  saveConfig,
  createCharacter,
  getVoices,
  previewVoice,
  listModels,
  installAgentSetup,
  type AgentSetupStatusResponse,
} from "../api/tauri";
import {
  ACP_AGENT_PRESET_IDS,
  type AcpAgentPresetId,
} from "../lib/agentPresets";
import { COMPANION_VIBE_PACKS } from "../lib/companionVibes";
import { buildCompanionPersonalityDraft } from "../lib/companionCharacterDraft";
import { DEFAULT_TTS_PROVIDER, DEFAULT_TTS_VOICE, TTS_PRESETS_UI } from "../lib/ttsPresets";
import { AgentPresetCard } from "./agents/AgentPresetCard";
import { AgentSetupPanel } from "./agents/AgentSetupPanel";
import { CompanionAvatarPreview } from "./onboarding/CompanionAvatarPreview";
import { ModelPicker } from "./onboarding/ModelPicker";
import { OnboardingShell } from "./onboarding/OnboardingShell";
import {
  BackIcon,
  Button,
  ChatIcon,
  ChevronRightIcon,
  ChoiceCard,
  FaceIcon,
  Field,
  Input,
  LockIcon,
  Notice,
  PlayIcon,
  Select,
  SparkIcon,
  SpeakerIcon,
  Textarea,
  VibeGlyph,
} from "./ui";

interface Voice {
  id: string;
  name: string;
}

interface Model {
  id: string;
  type: string;
  model_file: string;
  path: string;
  animations?: { name: string; path: string }[];
}

interface FormData {
  user: { name: string; about: string };
  agent: {
    preset: AcpAgentPresetId;
    program: string;
    args: string;
  };
  tts: { provider: string; api_key: string; voice: string };
  companion: {
    name: string;
    personality: string;
    vibe: string;
    relationship_style: string;
    speech_style: string;
    model_id: string;
  };
}

const FEATURE_TILES = [
  { icon: ChatIcon, title: "Real conversations", sub: "They grow with you" },
  { icon: FaceIcon, title: "Face & voice", sub: "See them react" },
  { icon: LockIcon, title: "Your device", sub: "Memories stay local" },
] as const;

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [agentSetup, setAgentSetup] = useState<AgentSetupStatusResponse | null>(null);
  const [agentSetupLoading, setAgentSetupLoading] = useState(false);

  const ttsPresets = TTS_PRESETS_UI;

  const [form, setForm] = useState<FormData>({
    user: { name: "", about: "" },
    agent: { preset: "opencode", program: "", args: "" },
    tts: { provider: DEFAULT_TTS_PROVIDER, api_key: "", voice: DEFAULT_TTS_VOICE },
    companion: {
      name: "",
      personality: "",
      vibe: "Wise",
      relationship_style: "Gentle",
      speech_style: "Calm",
      model_id: "haru",
    },
  });

  useEffect(() => {
    listModels()
      .then((data) => {
        const list = data as Model[];
        setModels(list);
        if (list.length > 0 && !list.some((m) => m.id === form.companion.model_id)) {
          setForm((prev) => ({
            ...prev,
            companion: { ...prev.companion, model_id: list[0].id },
          }));
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    getVoices(form.tts.provider)
      .then((data) => {
        setVoices(data);
        if (data.length > 0 && !data.find((v: Voice) => v.id === form.tts.voice)) {
          setForm((prev) => ({
            ...prev,
            tts: { ...prev.tts, voice: data[0].id },
          }));
        }
      })
      .catch(console.error);
  }, [form.tts.provider]);

  useEffect(() => {
    if (step !== 4 || form.agent.preset === "custom") {
      setAgentSetup(null);
      setAgentSetupLoading(false);
    }
  }, [step, form.agent.preset]);

  const handleAgentSetupStatus = (status: AgentSetupStatusResponse | null, loading: boolean) => {
    setAgentSetup(status);
    setAgentSetupLoading(loading);
  };

  const updateForm = (section: keyof FormData, field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const selectVibePack = (packId: string) => {
    const pack = COMPANION_VIBE_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    setForm((prev) => ({
      ...prev,
      companion: {
        ...prev.companion,
        vibe: pack.id,
        relationship_style: pack.relationship_style,
        speech_style: pack.speech_style,
      },
    }));
  };

  const selectedPreviewModel = models.find((m) => m.id === form.companion.model_id) ?? null;
  const selectedVibePack = COMPANION_VIBE_PACKS.find((p) => p.id === form.companion.vibe);

  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const playSample = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewError("");
    setPreviewing(true);
    try {
      const data = await previewVoice(form.tts.provider, form.tts.voice, form.tts.api_key || undefined);
      if (!data || data.length === 0) {
        setPreviewError("Could not load a sample");
        return;
      }
      const blob = new Blob([new Uint8Array(data)], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url));
      audioRef.current = audio;
      await audio.play();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return true;
      case 1:
        return form.user.name.trim() !== "";
      case 2:
        return form.companion.name.trim() !== "" && form.companion.vibe !== "";
      case 3:
        return form.tts.voice !== "";
      case 4:
        if (form.agent.preset === "custom") {
          return form.agent.program.trim() !== "";
        }
        if (agentSetupLoading) return false;
        if (agentSetup?.agent.ready) return true;
        return agentSetup?.prerequisites.node_available === true;
      default:
        return false;
    }
  };

  const stepHint = (): string | null => {
    if (step === 4 && form.agent.preset !== "custom" && !canProceed() && !agentSetupLoading) {
      return "Install Node.js above to finish setup.";
    }
    if (
      step === 4 &&
      form.agent.preset !== "custom" &&
      !agentSetupLoading &&
      agentSetup &&
      !agentSetup.agent.ready &&
      agentSetup.prerequisites.node_available
    ) {
      return "Finish will install the assistant globally if it is not on your system yet.";
    }
    return null;
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError("");
    try {
      if (form.agent.preset !== "custom" && agentSetup && !agentSetup.agent.ready) {
        const installed = await installAgentSetup(form.agent.preset);
        setAgentSetup(installed);
        if (!installed.agent.ready) {
          setError(installed.agent.detail || "Could not install the assistant. Try Install above, then finish again.");
          setSubmitting(false);
          return;
        }
      }

      const charId = await createCharacter({
        name: form.companion.name,
        personality: buildCompanionPersonalityDraft({
          companionName: form.companion.name,
          userName: form.user.name,
          userAbout: form.user.about,
          vibe: form.companion.vibe,
          relationshipStyle: form.companion.relationship_style,
          speechStyle: form.companion.speech_style,
        }),
        modelId: form.companion.model_id,
        voice: form.tts.voice,
        vibe: form.companion.vibe,
        relationshipStyle: form.companion.relationship_style,
        speechStyle: form.companion.speech_style,
        userName: form.user.name,
        userAbout: form.user.about,
      });

      await saveConfig({
        user: form.user,
        agent: {
          preset: form.agent.preset,
          program: form.agent.program,
          args: form.agent.args.trim() ? form.agent.args.trim().split(/\s+/) : [],
        },
        tts: {
          provider: form.tts.provider,
          api_key: form.tts.api_key || null,
          voice: form.tts.voice,
        },
        active_character: charId,
        onboarding_complete: true,
      });

      setStep(5);
      setTimeout(onComplete, 2200);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  const preview = (
    <CompanionAvatarPreview
      model={selectedPreviewModel}
      companionName={form.companion.name}
      vibeLabel={selectedVibePack?.title}
    />
  );

  if (step === 5) {
    const companionName = form.companion.name.trim() || "Your companion";
    return (
      <OnboardingShell step={step}>
        <div className="flex flex-col items-center gap-6">
          <div className="flex w-full items-center gap-3 rounded-card bg-accent-200 px-4 py-3 text-ink">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/60">
              <SparkIcon className="h-4 w-4" />
            </span>
            <p className="flex-1 text-sm font-semibold">
              {companionName} is waiting on your desktop
            </p>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-3" />
          </div>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="min-w-[160px]"
            onClick={onComplete}
          >
            Get started
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={step} preview={preview}>
      {step === 0 && (
        <>
          <div className="flex items-center gap-3 rounded-card bg-accent-200 px-4 py-3 text-ink">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/60">
              <SparkIcon className="h-4 w-4" />
            </span>
            <p className="flex-1 text-sm font-semibold">Set up takes about two minutes</p>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-3" />
          </div>
          <ul className="mt-6 grid grid-cols-3 gap-4">
            {FEATURE_TILES.map((f) => (
              <li key={f.title} className="text-center">
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-[10px] bg-well text-ink">
                  <f.icon className="h-4 w-4" />
                </span>
                <div className="mt-2 text-sm font-semibold text-ink">{f.title}</div>
                <div className="mt-0.5 text-xs text-ink-3">{f.sub}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 1 && (
        <>
          <Field label="Name">
            <Input
              type="text"
              value={form.user.name}
              onChange={(e) => updateForm("user", "name", e.target.value)}
              placeholder="e.g. Alex"
              autoFocus
            />
          </Field>
          <Field label="Anything they should know" optional className="mt-4">
            <Textarea
              value={form.user.about}
              onChange={(e) => updateForm("user", "about", e.target.value)}
              placeholder="A line or two about you…"
              rows={2}
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Their name">
            <Input
              type="text"
              value={form.companion.name}
              onChange={(e) => updateForm("companion", "name", e.target.value)}
              placeholder="Who are you creating?"
            />
          </Field>

          <Field label="Personality" className="mt-4">
            <div className="grid grid-cols-2 gap-2.5">
              {COMPANION_VIBE_PACKS.map((pack) => (
                <ChoiceCard
                  key={pack.id}
                  selected={form.companion.vibe === pack.id}
                  onClick={() => selectVibePack(pack.id)}
                  leading={<VibeGlyph id={pack.id} />}
                  title={pack.title}
                  description={pack.subtitle}
                  compact
                />
              ))}
            </div>
          </Field>

          <Field label="Look" className="mt-4 mb-0">
            <ModelPicker
              models={models}
              selectedId={form.companion.model_id}
              onSelect={(id) => updateForm("companion", "model_id", id)}
            />
          </Field>
        </>
      )}

      {step === 3 && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {Object.entries(ttsPresets).map(([id, preset]) => (
              <ChoiceCard
                key={id}
                selected={form.tts.provider === id}
                onClick={() => updateForm("tts", "provider", id)}
                leading={<SpeakerIcon />}
                title={preset.name}
                description={preset.hint}
                compact
              />
            ))}
          </div>

          {ttsPresets[form.tts.provider]?.needs_key && (
            <Field label="API key">
              <Input
                type="password"
                value={form.tts.api_key}
                onChange={(e) => updateForm("tts", "api_key", e.target.value)}
                placeholder="Paste key from your voice service"
              />
            </Field>
          )}

          <Field label="Voice" error={previewError || undefined} className="mb-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Select
                wrapperClassName="flex-1"
                value={form.tts.voice}
                onChange={(e) => updateForm("tts", "voice", e.target.value)}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
              <Button
                variant="soft"
                leading={<PlayIcon className="h-4 w-4" />}
                loading={previewing}
                onClick={playSample}
                className="shrink-0"
              >
                Listen
              </Button>
            </div>
          </Field>
        </>
      )}

      {step === 4 && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3">
            {ACP_AGENT_PRESET_IDS.map((id) => (
              <AgentPresetCard
                key={id}
                id={id}
                selected={form.agent.preset === id}
                onSelect={() =>
                  setForm((prev) => ({
                    ...prev,
                    agent: { ...prev.agent, preset: id },
                  }))
                }
              />
            ))}
          </div>

          {form.agent.preset === "custom" && (
            <>
              <Field label="Program to run">
                <Input
                  type="text"
                  value={form.agent.program}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      agent: { ...prev.agent, program: e.target.value },
                    }))
                  }
                  placeholder="Path or command"
                />
              </Field>
              <Field label="Extra options" optional>
                <Input
                  type="text"
                  value={form.agent.args}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      agent: { ...prev.agent, args: e.target.value },
                    }))
                  }
                  placeholder="Optional flags"
                />
              </Field>
            </>
          )}

          {form.agent.preset !== "custom" && (
            <AgentSetupPanel
              preset={form.agent.preset}
              onStatusChange={handleAgentSetupStatus}
              friendly
            />
          )}
        </>
      )}

      {error && (
        <Notice tone="danger" className="mt-4">{error}</Notice>
      )}

      <div className="mt-10 flex items-center justify-between">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            leading={<BackIcon className="h-4 w-4" />}
            onClick={() => setStep(step - 1)}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="min-w-[160px]"
            trailing={<ChevronRightIcon className="h-4 w-4" />}
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="min-w-[160px]"
            trailing={<ChevronRightIcon className="h-4 w-4" />}
            onClick={handleFinish}
            disabled={!canProceed() || submitting}
            loading={submitting}
          >
            {submitting ? "Creating…" : "Finish"}
          </Button>
        )}
      </div>
      {stepHint() && (
        <p className="mt-3 text-center text-xs text-ink-3">{stepHint()}</p>
      )}
    </OnboardingShell>
  );
}
