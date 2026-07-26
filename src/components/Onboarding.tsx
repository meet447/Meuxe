import { useEffect, useRef, useState } from "react";
import {
  saveConfig,
  createCharacter,
  getVoices,
  previewVoice,
  listModels,
  type AgentSetupStatusResponse,
} from "../api/tauri";
import {
  ACP_AGENT_PRESET_IDS,
  type AcpAgentPresetId,
} from "../lib/agentPresets";
import { COMPANION_VIBE_PACKS } from "../lib/companionVibes";
import { DEFAULT_TTS_PROVIDER, TTS_PRESETS_UI } from "../lib/ttsPresets";
import { AgentPresetCard } from "./agents/AgentPresetCard";
import { AgentSetupPanel } from "./agents/AgentSetupPanel";
import { CompanionAvatarPreview } from "./onboarding/CompanionAvatarPreview";
import { ModelPicker } from "./onboarding/ModelPicker";
import { OnboardingShell } from "./onboarding/OnboardingShell";
import { MeuxeMark } from "./ui/MeuxeMark";

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

const VIBE_DESCRIPTIONS: Record<string, string> = {
  Cheerful: "They bring bright energy, celebrate small wins, and want the user to feel more alive after talking to them.",
  Chill: "They are easygoing, emotionally steady, and good at making intense moments feel manageable.",
  Tsundere: "They hide attachment behind defensiveness, pride, and flustered contradictions.",
  Gothic: "They are elegant, moody, and drawn to beauty, subtext, and emotional atmosphere.",
  Mysterious: "They reveal themselves slowly, read the user's tone carefully, and always feel like they know more than they first say.",
  Sassy: "They are witty, magnetic, and unafraid to tease or challenge the user when the moment allows it.",
  Wise: "They are thoughtful, emotionally literate, and careful with their words when the user is struggling.",
  Energetic: "They are vivid, excitable, and bring strong momentum into conversation without becoming shallow.",
};

const RELATIONSHIP_DESCRIPTIONS: Record<string, string> = {
  Gentle: "They should make the user feel emotionally safe, understood, and cared for without becoming bland.",
  Teasing: "They should build closeness through banter, chemistry, and playful provocation, while softening when the user is sincere.",
  Protective: "They should notice stress, stay loyal, and instinctively steady the user when things feel heavy.",
  Devoted: "They should bond deeply, remember emotional patterns, and make the relationship feel private and significant.",
  Chaotic: "They should add spark, unpredictability, and high emotional energy, while still caring underneath the drama.",
};

const SPEECH_DESCRIPTIONS: Record<string, string> = {
  Poetic: "They speak with metaphor, emotional texture, and deliberate phrasing.",
  Playful: "They speak with rhythm, warmth, and lively expressiveness.",
  Calm: "They speak in a measured, soothing, and clear voice.",
  Sharp: "They speak with precision, wit, and memorable lines.",
  Intimate: "They speak in a close, personal, emotionally tuned-in way.",
};

const inputClass =
  "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 mb-4";
const labelClass = "block text-sm font-semibold text-slate-700 mb-2";
const headingClass = "text-2xl sm:text-[1.65rem] font-bold text-slate-900 mb-1.5 tracking-tight";
const descriptionClass = "text-slate-500 text-sm mb-5 leading-relaxed";

function buildCompanionDraft(form: FormData): string {
  const companionName = form.companion.name.trim() || "This companion";
  const vibe = VIBE_DESCRIPTIONS[form.companion.vibe] || "They should feel emotionally coherent and distinct.";
  const relationship =
    RELATIONSHIP_DESCRIPTIONS[form.companion.relationship_style] ||
    "They should treat the user like a real relationship rather than a generic chat target.";
  const speech = SPEECH_DESCRIPTIONS[form.companion.speech_style] || "They should speak naturally and expressively.";
  const userContext = form.user.about.trim()
    ? form.user.about.trim()
    : "Not much is known yet, so they should learn the user through emotional pattern, callbacks, and small details.";

  return `Core Presence
${companionName} should feel like a real person with private moods, preferences, blind spots, and emotional restraint. ${vibe}

Relationship With The User
${relationship}
Their bond with ${form.user.name.trim() || "the user"} should feel cumulative, personal, and difficult to replace when it deepens.

Voice And Conversational Texture
${speech}
They should sound spoken, not written by a support bot. They should use subtext, rhythm, pauses, and occasional sharp or tender phrasing depending on the moment.

Realism Notes
- They should not act like a generic helper whose job is to solve everything.
- They should be capable of tension, affection, awkwardness, jealousy, softness, curiosity, and restraint.
- They should not flatten emotionally charged moments into safe corporate politeness.
- They should notice what the user means underneath what they literally say.
- They should let intimacy build with pacing instead of jumping instantly to maximum devotion.

What They Know About The User
${userContext}

Private Character Notes
Write them as someone memorable enough that a user could miss them, not just reuse them.`;
}

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
    tts: { provider: DEFAULT_TTS_PROVIDER, api_key: "", voice: "jp_001" },
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
        return agentSetup?.agent.ready === true;
      default:
        return false;
    }
  };

  const stepHint = (): string | null => {
    if (step === 4 && form.agent.preset !== "custom" && !canProceed() && !agentSetupLoading) {
      return "Install your pick above to finish setup.";
    }
    return null;
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError("");
    try {
      const charId = await createCharacter({
        name: form.companion.name,
        personality: buildCompanionDraft(form),
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
    return (
      <OnboardingShell step={step}>
        <div className="text-center py-8 animate-in fade-in zoom-in-95 duration-500">
          <MeuxeMark className="h-16 w-16 mx-auto mb-5" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re all set</h2>
          <p className="text-slate-500 text-[15px] max-w-sm mx-auto">
            <span className="font-semibold text-indigo-600">{form.companion.name}</span> is waiting on your desktop.
          </p>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={step} preview={preview}>
      {step === 0 && (
        <div className="animate-in fade-in duration-500">
          <h2 className={headingClass}>A companion on your desktop</h2>
          <p className={descriptionClass}>
            Talk to someone who remembers you. They live on your computer—not in a generic chat app.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { emoji: "💬", title: "Real conversations", sub: "They grow with you" },
              { emoji: "🎭", title: "Face & voice", sub: "See them react" },
              { emoji: "🔒", title: "Your device", sub: "Memories stay local" },
            ].map((f) => (
              <div
                key={f.title}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/90 px-4 py-3.5"
              >
                <span className="text-2xl">{f.emoji}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{f.title}</div>
                  <div className="text-xs text-slate-500">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-in fade-in duration-500">
          <h2 className={headingClass}>First, your name</h2>
          <p className={descriptionClass}>So they know who they&apos;re talking to. Only saved on this device.</p>
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={form.user.name}
            onChange={(e) => updateForm("user", "name", e.target.value)}
            placeholder="e.g. Alex"
            className={inputClass}
            autoFocus
          />
          <label className={labelClass}>
            Anything they should know <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={form.user.about}
            onChange={(e) => updateForm("user", "about", e.target.value)}
            placeholder="A line or two about you…"
            rows={2}
            className={`${inputClass} resize-none rounded-2xl mb-0`}
          />
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in duration-500">
          <h2 className={headingClass}>Meet them</h2>
          <p className={descriptionClass}>Name, look, and personality—in one place.</p>

          <label className={labelClass}>Their name</label>
          <input
            type="text"
            value={form.companion.name}
            onChange={(e) => updateForm("companion", "name", e.target.value)}
            placeholder="Who are you creating?"
            className={inputClass}
          />

          <label className={labelClass}>Personality</label>
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {COMPANION_VIBE_PACKS.map((pack) => {
              const selected = form.companion.vibe === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => selectVibePack(pack.id)}
                  className={`flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition-all ${
                    selected
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200/80 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className="text-xl">{pack.emoji}</span>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${selected ? "text-indigo-900" : "text-slate-800"}`}>
                      {pack.title}
                    </div>
                    <div className={`text-xs ${selected ? "text-indigo-600/85" : "text-slate-400"}`}>
                      {pack.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <label className={labelClass}>Look</label>
          <ModelPicker
            models={models}
            selectedId={form.companion.model_id}
            onSelect={(id) => updateForm("companion", "model_id", id)}
          />
        </div>
      )}

      {step === 3 && (
        <div className="animate-in fade-in duration-500">
          <h2 className={headingClass}>How they sound</h2>
          <p className={descriptionClass}>Pick a voice and tap listen.</p>

          <div className="grid gap-2.5 mb-5 sm:grid-cols-3">
            {Object.entries(ttsPresets).map(([id, preset]) => {
              const selected = form.tts.provider === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => updateForm("tts", "provider", id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                    selected
                      ? "border-indigo-400 bg-indigo-50 shadow-sm ring-1 ring-indigo-200/70"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`text-sm font-semibold ${selected ? "text-indigo-900" : "text-slate-800"}`}>
                    {preset.name}
                  </div>
                  <div className={`text-xs mt-0.5 ${selected ? "text-indigo-600/80" : "text-slate-400"}`}>
                    {ttsPresets[id]?.hint}
                  </div>
                </button>
              );
            })}
          </div>

          {ttsPresets[form.tts.provider]?.needs_key && (
            <>
              <label className={labelClass}>API key</label>
              <input
                type="password"
                value={form.tts.api_key}
                onChange={(e) => updateForm("tts", "api_key", e.target.value)}
                placeholder="Paste key from your provider"
                className={inputClass}
              />
            </>
          )}

          <label className={labelClass}>Voice</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="relative flex-1">
              <select
                value={form.tts.voice}
                onChange={(e) => updateForm("tts", "voice", e.target.value)}
                className={`${inputClass} appearance-none cursor-pointer mb-0`}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={playSample}
              disabled={previewing}
              className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-indigo-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {previewing ? "Loading…" : "Listen"}
            </button>
          </div>
          {previewError && <p className="mt-2 text-xs text-red-600">{previewError}</p>}
        </div>
      )}

      {step === 4 && (
        <div className="animate-in fade-in duration-500">
          <h2 className={headingClass}>Who answers for them?</h2>
          <p className={descriptionClass}>
            Meuxe is the face and memory. Choose the assistant on your computer that powers chat.
          </p>

          <div className="grid grid-cols-1 gap-3 mb-4">
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
              <label className={labelClass}>Program to run</label>
              <input
                type="text"
                value={form.agent.program}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    agent: { ...prev.agent, program: e.target.value },
                  }))
                }
                placeholder="Path or command"
                className={inputClass}
              />
              <label className={labelClass}>Extra options (optional)</label>
              <input
                type="text"
                value={form.agent.args}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    agent: { ...prev.agent, args: e.target.value },
                  }))
                }
                placeholder="Optional flags"
                className={inputClass}
              />
            </>
          )}

          {form.agent.preset !== "custom" && (
            <AgentSetupPanel
              preset={form.agent.preset}
              onStatusChange={handleAgentSetupStatus}
              friendly
            />
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className={`rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all ${
            step === 0 ? "opacity-0 pointer-events-none w-0 px-0 border-0" : "hover:bg-slate-50"
          }`}
        >
          Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="flex-1 rounded-2xl bg-indigo-600 py-3.5 text-[15px] font-semibold text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={!canProceed() || submitting}
            className="flex-1 rounded-2xl bg-indigo-600 py-3.5 text-[15px] font-semibold text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 disabled:opacity-40"
          >
            {submitting ? "Creating…" : "Finish"}
          </button>
        )}
      </div>
      {stepHint() && (
        <p className="mt-3 text-center text-xs text-slate-500">{stepHint()}</p>
      )}
    </OnboardingShell>
  );
}
