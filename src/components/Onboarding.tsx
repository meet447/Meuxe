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
import { AgentPresetCard } from "./agents/AgentPresetCard";
import { AgentSetupPanel } from "./agents/AgentSetupPanel";
import { MeuxeMark } from "./ui/MeuxeMark";
import { PickTile } from "./ui/PickTile";

interface TTSPreset {
  name: string;
  needs_key: boolean;
}

interface Voice {
  id: string;
  name: string;
}

interface Model {
  id: string;
  type: string;
  model_file: string;
  path: string;
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

const TTS_PRESETS: Record<string, TTSPreset> = {
  tiktok: { name: "TikTok", needs_key: false },
  elevenlabs: { name: "ElevenLabs", needs_key: true },
  openai_tts: { name: "OpenAI TTS", needs_key: true },
};

const VIBES = [
  { id: "Cheerful", title: "Cheerful", emoji: "☀️", hint: "Bright and uplifting" },
  { id: "Chill", title: "Chill", emoji: "🌊", hint: "Relaxed and steady" },
  { id: "Tsundere", title: "Tsundere", emoji: "💢", hint: "Sharp, then soft" },
  { id: "Gothic", title: "Gothic", emoji: "🌙", hint: "Moody and elegant" },
  { id: "Mysterious", title: "Mysterious", emoji: "🕯️", hint: "Hard to read" },
  { id: "Sassy", title: "Sassy", emoji: "💋", hint: "Witty and bold" },
  { id: "Wise", title: "Wise", emoji: "📖", hint: "Thoughtful" },
  { id: "Energetic", title: "Energetic", emoji: "⚡", hint: "High momentum" },
];

const RELATIONSHIP_STYLES = [
  { id: "Gentle", title: "Gentle", emoji: "🫶", hint: "Safe and patient" },
  { id: "Teasing", title: "Teasing", emoji: "😏", hint: "Banter and chemistry" },
  { id: "Protective", title: "Protective", emoji: "🛡️", hint: "Loyal and steady" },
  { id: "Devoted", title: "Devoted", emoji: "💞", hint: "Deep attachment" },
  { id: "Chaotic", title: "Chaotic", emoji: "🎭", hint: "Spark and surprise" },
];

const SPEECH_STYLES = [
  { id: "Poetic", title: "Poetic", emoji: "✨", hint: "Lyrical" },
  { id: "Playful", title: "Playful", emoji: "🎈", hint: "Lively" },
  { id: "Calm", title: "Calm", emoji: "🍃", hint: "Measured" },
  { id: "Sharp", title: "Sharp", emoji: "🗡️", hint: "Precise" },
  { id: "Intimate", title: "Intimate", emoji: "🌸", hint: "Close and personal" },
];

const STEPS = ["Welcome", "About You", "Companion", "Voice", "Connect AI"];

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
  "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";
const headingClass = "text-2xl sm:text-3xl font-bold text-slate-900 mb-2 tracking-tight";
const descriptionClass = "text-slate-500 text-sm sm:text-[15px] mb-6 leading-relaxed max-w-lg";

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

  const ttsPresets = TTS_PRESETS;

  const [form, setForm] = useState<FormData>({
    user: { name: "", about: "" },
    agent: { preset: "opencode", program: "", args: "" },
    tts: { provider: "tiktok", api_key: "", voice: "jp_001" },
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
      .then((data) => setModels(data as Model[]))
      .catch(console.error);
  }, []);

  useEffect(() => {
    getVoices(form.tts.provider)
      .then((data) => {
        setVoices(data);
        if (data.length > 0 && !data.find((v: Voice) => v.id === form.tts.voice)) {
          updateForm("tts", "voice", data[0].id);
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
        setPreviewError("No audio returned from TTS provider");
        return;
      }
      const blob = new Blob([new Uint8Array(data)], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url));
      audioRef.current = audio;
      await audio.play();
    } catch (err: any) {
      const msg = err?.message || String(err) || "Voice preview failed";
      setPreviewError(msg);
      console.error("Voice preview failed:", err);
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
        return (
          form.companion.name.trim() !== "" &&
          form.companion.vibe !== "" &&
          form.companion.relationship_style !== "" &&
          form.companion.speech_style !== ""
        );
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
      setError("Something went wrong while creating your companion. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-blue-50 via-white to-indigo-50 relative">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-300/20 blur-[100px]" />
        <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-300/20 blur-[120px]" />
      </div>

      <div className="min-h-full flex flex-col items-center justify-center p-6 py-12">
        <div className="w-full max-w-3xl z-10 relative">
          {step < 5 && (
            <div className="mb-8">
              <div className="flex items-center justify-center gap-1 sm:gap-2">
                {STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-1 sm:gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all ${
                          i === step
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 scale-105"
                            : i < step
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-white/80 text-slate-400 border border-slate-200/80"
                        }`}
                      >
                        {i < step ? "✓" : i + 1}
                      </div>
                      <span
                        className={`hidden sm:block text-[10px] font-semibold uppercase tracking-wide ${
                          i === step ? "text-indigo-600" : i < step ? "text-indigo-400" : "text-slate-400"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`mb-4 sm:mb-5 h-0.5 w-6 sm:w-10 rounded-full ${i < step ? "bg-indigo-300" : "bg-slate-200"}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="backdrop-blur-3xl bg-white/95 rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 p-6 sm:p-10 ring-1 ring-slate-100/80">
            {step === 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5 mb-6">
                  <MeuxeMark className="h-14 w-14 shrink-0" />
                  <div>
                    <h2 className={headingClass}>Your desktop companion</h2>
                    <p className={descriptionClass}>
                      Meuxe is a character who remembers you—voice, expressions, and memory on your machine. You pick the CLI agent that thinks behind the scenes.
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { emoji: "💬", title: "Talk & bond", sub: "Personality that grows" },
                    { emoji: "🎭", title: "Live avatar", sub: "Expressions & voice" },
                    { emoji: "🔒", title: "Local first", sub: "Memory stays here" },
                  ].map((f) => (
                    <div
                      key={f.title}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                    >
                      <span className="text-xl">{f.emoji}</span>
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
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>About you</h2>
                <p className={descriptionClass}>So your companion knows who they&apos;re talking to. Stored only on this device.</p>

                <label className={labelClass}>Your name</label>
                <input
                  type="text"
                  value={form.user.name}
                  onChange={(e) => updateForm("user", "name", e.target.value)}
                  placeholder="What should they call you?"
                  className={inputClass}
                />

                <label className={labelClass}>A few details <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  value={form.user.about}
                  onChange={(e) => updateForm("user", "about", e.target.value)}
                  placeholder="Hobbies, work, what you want from them…"
                  rows={3}
                  className={`${inputClass} resize-none mb-2 rounded-2xl`}
                />
              </div>
            )}

            {step === 4 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Connect their mind</h2>
                <p className={descriptionClass}>
                  Meuxe handles face, memory, and voice. Pick the coding agent on your machine (ACP).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
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
                    <label className={labelClass}>Command</label>
                    <input
                      type="text"
                      value={form.agent.program}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          agent: { ...prev.agent, program: e.target.value },
                        }))
                      }
                      placeholder="e.g. python my_agent.py"
                      className={inputClass}
                    />
                    <label className={labelClass}>Arguments (optional)</label>
                    <input
                      type="text"
                      value={form.agent.args}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          agent: { ...prev.agent, args: e.target.value },
                        }))
                      }
                      placeholder="space-separated flags"
                      className={inputClass}
                    />
                  </>
                )}

                {form.agent.preset !== "custom" && (
                  <div className="mb-4">
                    <AgentSetupPanel preset={form.agent.preset} onStatusChange={handleAgentSetupStatus} />
                  </div>
                )}

                <p className="text-xs text-slate-500 leading-relaxed">
                  Sign in in the terminal if your agent asks. Meuxe injects persona and memory before each reply.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Their voice</h2>
                <p className={descriptionClass}>Pick a voice provider and sample before you continue.</p>

                <label className={labelClass}>TTS Provider</label>
                <div className="flex flex-wrap gap-3 mb-6">
                  {Object.entries(ttsPresets).map(([id, preset]) => (
                    <button
                      key={id}
                      onClick={() => updateForm("tts", "provider", id)}
                      className={`px-4 py-3 rounded-2xl text-[14px] font-semibold border transition-all ${
                        form.tts.provider === id
                          ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                <div className="animate-in fade-in duration-300">
                  {ttsPresets[form.tts.provider]?.needs_key && (
                    <>
                      <label className={labelClass}>API Key</label>
                      <input
                        type="password"
                        value={form.tts.api_key}
                        onChange={(e) => updateForm("tts", "api_key", e.target.value)}
                        placeholder="Paste your API key"
                        className={inputClass}
                      />
                    </>
                  )}

                  <label className={labelClass}>Voice</label>
                  <div className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                      <select
                        value={form.tts.voice}
                        onChange={(e) => updateForm("tts", "voice", e.target.value)}
                        className={`${inputClass} appearance-none cursor-pointer mb-0`}
                      >
                        {voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                    <button
                      onClick={playSample}
                      disabled={previewing}
                      className="px-6 rounded-2xl bg-white border border-slate-200 text-blue-600 text-[15px] font-semibold hover:bg-slate-50 hover:border-blue-200 shadow-sm transition-all disabled:opacity-50"
                    >
                      {previewing ? "Loading..." : "Play Sample"}
                    </button>
                    {previewError && (
                      <p className="text-red-500 text-xs mt-1">{previewError}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Design your companion</h2>
                <p className={descriptionClass}>Name them and choose the vibe. Meuxe builds their persona from these picks.</p>

                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={form.companion.name}
                  onChange={(e) => updateForm("companion", "name", e.target.value)}
                  placeholder="Companion name"
                  className={inputClass}
                />

                <label className={labelClass}>Vibe</label>
                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  {VIBES.map((vibe) => (
                    <PickTile
                      key={vibe.id}
                      emoji={vibe.emoji}
                      title={vibe.title}
                      hint={vibe.hint}
                      selected={form.companion.vibe === vibe.id}
                      onClick={() => updateForm("companion", "vibe", vibe.id)}
                    />
                  ))}
                </div>

                <label className={labelClass}>Relationship</label>
                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  {RELATIONSHIP_STYLES.map((style) => (
                    <PickTile
                      key={style.id}
                      emoji={style.emoji}
                      title={style.title}
                      hint={style.hint}
                      selected={form.companion.relationship_style === style.id}
                      onClick={() => updateForm("companion", "relationship_style", style.id)}
                    />
                  ))}
                </div>

                <label className={labelClass}>How they speak</label>
                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  {SPEECH_STYLES.map((style) => (
                    <PickTile
                      key={style.id}
                      emoji={style.emoji}
                      title={style.title}
                      hint={style.hint}
                      selected={form.companion.speech_style === style.id}
                      onClick={() => updateForm("companion", "speech_style", style.id)}
                    />
                  ))}
                </div>

                <label className={labelClass}>Avatar</label>
                {models.length > 0 ? (
                  <div className="relative mb-2">
                    <select
                      value={form.companion.model_id}
                      onChange={(e) => updateForm("companion", "model_id", e.target.value)}
                      className={`${inputClass} appearance-none cursor-pointer mb-0`}
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.id} ({model.type})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-slate-600 text-sm">
                    Default avatar (haru). Add models under <code className="text-xs">models/live2d/</code> to unlock more.
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="text-center py-10 animate-in fade-in zoom-in-95 duration-500">
                <MeuxeMark className="h-16 w-16 mx-auto mb-5" />
                <h2 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">You&apos;re all set</h2>
                <p className="text-slate-500 text-[15px] max-w-md mx-auto leading-relaxed">
                  <span className="font-semibold text-indigo-600">{form.companion.name}</span> is ready on your desktop.
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">
                {error}
              </div>
            )}

            {step < 5 && (
              <div className="flex justify-between mt-10 space-x-4">
                <button
                  onClick={() => setStep(step - 1)}
                  disabled={step === 0}
                  className={`w-1/3 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 text-[15px] font-medium transition-all ${
                    step === 0 ? "opacity-0 pointer-events-none" : "hover:bg-slate-50 hover:border-slate-300 shadow-sm"
                  }`}
                >
                  Back
                </button>
                {step < 4 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!canProceed()}
                    className="flex-1 py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5 transition-all active:translate-y-0"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    onClick={handleFinish}
                    disabled={!canProceed() || submitting}
                    className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[15px] font-semibold hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5 transition-all active:translate-y-0"
                  >
                    {submitting ? "Building companion..." : "Finish"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
