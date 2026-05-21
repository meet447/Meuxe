import { useEffect, useMemo, useRef, useState } from "react";
import {
  saveConfig,
  createCharacter,
  getVoices,
  testLlm,
  previewVoice,
  listModels,
  getComposioStatus,
  saveComposioConfig,
  authorizeComposioToolkit,
  refreshComposioToolkit,
} from "../api/tauri";
import { ComposioToolkitPicker } from "./ComposioToolkitPicker";
import { DEFAULT_ENABLED_COMPOSIO_TOOLKITS } from "../lib/composioToolkits";
import { LLM_PRESETS, llmPresetEntries } from "../lib/llmPresets";
import type { ComposioToolkitStatus } from "../types";

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
  llm: { provider: string; base_url: string; api_key: string; model: string };
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
  { id: "Cheerful", title: "Cheerful", blurb: "Radiant, encouraging, and emotionally bright." },
  { id: "Chill", title: "Chill", blurb: "Relaxed, grounded, and easy to stay around." },
  { id: "Tsundere", title: "Tsundere", blurb: "Defensive on the surface, soft underneath." },
  { id: "Gothic", title: "Gothic", blurb: "Elegant, moody, and aesthetically intense." },
  { id: "Mysterious", title: "Mysterious", blurb: "Elusive, observant, and hard to read." },
  { id: "Sassy", title: "Sassy", blurb: "Quick-witted, flirty, and a little dangerous." },
  { id: "Wise", title: "Wise", blurb: "Steady, reflective, and emotionally mature." },
  { id: "Energetic", title: "Energetic", blurb: "Fast, vivid, excitable, and full of momentum." },
];

const RELATIONSHIP_STYLES = [
  { id: "Gentle", title: "Gentle", blurb: "Comforting, patient, and safe to return to." },
  { id: "Teasing", title: "Teasing", blurb: "Chemistry through banter, wit, and playful pressure." },
  { id: "Protective", title: "Protective", blurb: "Attentive to your stress and quietly loyal." },
  { id: "Devoted", title: "Devoted", blurb: "Deeply attached, intimate, and hard to replace." },
  { id: "Chaotic", title: "Chaotic", blurb: "Lively, surprising, and emotionally high-voltage." },
];

const SPEECH_STYLES = [
  { id: "Poetic", title: "Poetic", blurb: "Evocative, textured, and a little dramatic." },
  { id: "Playful", title: "Playful", blurb: "Lively, bright, and naturally expressive." },
  { id: "Calm", title: "Calm", blurb: "Measured, soothing, and steady under pressure." },
  { id: "Sharp", title: "Sharp", blurb: "Clever, clean, and memorable." },
  { id: "Intimate", title: "Intimate", blurb: "Close, emotionally tuned-in, and personal." },
];

const STEPS = ["Local-First", "About You", "LLM Provider", "Voice & TTS", "Integrations", "Build Companion"];

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
const headingClass = "text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-3 tracking-tight";
const descriptionClass = "text-slate-500 text-[15px] mb-8 leading-relaxed";

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

function SelectionCard({
  title,
  blurb,
  selected,
  onClick,
}: {
  title: string;
  blurb: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[1.4rem] border px-4 py-4 text-left transition-all ${
        selected
          ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <div className="text-[14px] font-semibold">{title}</div>
      <div className={`mt-1 text-[12px] leading-relaxed ${selected ? "text-blue-600/80" : "text-slate-400"}`}>{blurb}</div>
    </button>
  );
}

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [personalityTouched, setPersonalityTouched] = useState(false);
  const [composioApiKey, setComposioApiKey] = useState("");
  const [composioToolkits, setComposioToolkits] = useState<string[]>(DEFAULT_ENABLED_COMPOSIO_TOOLKITS);
  const [composioStatus, setComposioStatus] = useState<ComposioToolkitStatus[]>([]);
  const [composioRedirectUrl, setComposioRedirectUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const llmPresets = LLM_PRESETS;
  const llmPresetList = llmPresetEntries();
  const ttsPresets = TTS_PRESETS;

  const [form, setForm] = useState<FormData>({
    user: { name: "", about: "" },
    llm: { provider: "", base_url: "", api_key: "", model: "" },
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
    void getComposioStatus()
      .then((data) => setComposioStatus((data as ComposioToolkitStatus[]) || []))
      .catch(() => setComposioStatus([]));
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
    if (personalityTouched && form.companion.personality.trim()) return;
    setForm((prev) => ({
      ...prev,
      companion: {
        ...prev.companion,
        personality: buildCompanionDraft(prev),
      },
    }));
  }, [
    form.user.about,
    form.companion.name,
    form.companion.vibe,
    form.companion.relationship_style,
    form.companion.speech_style,
    personalityTouched,
  ]);

  const updateForm = (section: keyof FormData, field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const selectLLMPreset = (presetId: string) => {
    const preset = llmPresets[presetId];
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      llm: {
        provider: presetId,
        base_url: preset.base_url,
        api_key: prev.llm.api_key,
        model: preset.default_model,
      },
    }));
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await testLlm({
        base_url: form.llm.base_url,
        api_key: form.llm.api_key || "",
        model: form.llm.model,
      });
      setTestResult({ success: true, message: "Connected successfully!" });
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || String(err) || "Connection failed" });
    }
    setTesting(false);
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
        return form.user.name.trim() !== "" && form.user.about.trim() !== "";
      case 2:
        return form.llm.provider !== "" && form.llm.model !== "" && testResult?.success === true;
      case 3:
        return form.tts.voice !== "";
      case 4:
        return true;
      case 5:
        return (
          form.companion.name.trim() !== "" &&
          form.companion.personality.trim() !== "" &&
          form.companion.vibe !== "" &&
          form.companion.relationship_style !== "" &&
          form.companion.speech_style !== ""
        );
      default:
        return false;
    }
  };

  const selectedModel = useMemo(
    () => models.find((model) => model.id === form.companion.model_id) || null,
    [models, form.companion.model_id],
  );

  const handleFinish = async () => {
    setSubmitting(true);
    setError("");
    try {
      const charId = await createCharacter({
        name: form.companion.name,
        personality: form.companion.personality,
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
        llm: {
          provider: form.llm.provider,
          base_url: form.llm.base_url,
          api_key: form.llm.api_key || null,
          model: form.llm.model,
        },
        tts: {
          provider: form.tts.provider,
          api_key: form.tts.api_key || null,
          voice: form.tts.voice,
        },
        active_character: charId,
        onboarding_complete: true,
      });

      if (composioApiKey.trim() || composioToolkits.length > 0) {
        await saveComposioConfig(composioApiKey.trim() || null, composioToolkits);
      }

      setStep(6);
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
        <div className="w-full max-w-2xl z-10 relative">
          {step < 6 && (
            <div className="flex items-center justify-center gap-2 mb-10">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                      i === step
                        ? "bg-blue-500 text-white shadow-md shadow-blue-500/30 scale-110"
                        : i < step
                          ? "bg-blue-100 text-blue-600"
                          : "bg-white/60 text-slate-400 border border-slate-200/50"
                    }`}
                  >
                    {i < step ? "\u2713" : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-10 h-1 rounded-full transition-all duration-300 ${i < step ? "bg-blue-400/80" : "bg-white/60 border border-slate-100/50"}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="backdrop-blur-3xl bg-white/90 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] shadow-blue-900/5 border border-white p-10 ring-1 ring-slate-100/50">
            {step === 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Local-first by default</h2>
                <p className={descriptionClass}>
                  MeuxCompanion keeps the companion brain on your machine first: memories, relationship state, character files, sessions, and vault exports are local data you control.
                </p>

                <div className="grid gap-4 mb-8">
                  <div className="rounded-[1.8rem] border border-emerald-100 bg-emerald-50 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 mb-2">Stays on this device</div>
                    <p className="text-sm leading-relaxed text-emerald-700">SQLite memory vault, Markdown vault files, relationship state, character profile, imported notes, and chat history.</p>
                  </div>
                  <div className="rounded-[1.8rem] border border-blue-100 bg-blue-50 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 mb-2">Leaves only when you enable it</div>
                    <p className="text-sm leading-relaxed text-blue-700">LLM prompts, TTS text, web search queries, and connected-source requests for integrations like Composio.</p>
                  </div>
                  <div className="rounded-[1.8rem] border border-amber-100 bg-amber-50 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 mb-2">You choose services</div>
                    <p className="text-sm leading-relaxed text-amber-700">Use local Ollama/LM Studio where possible, or add API keys for remote LLM/TTS/search providers. Blank key fields preserve existing keys later.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Set up your private companion</h2>
                <p className={descriptionClass}>
                  Your companion now has local memory, evolving relationship state, and a layered character profile. Start by giving it enough context to care about you like a person, not a prompt.
                </p>

                <div className="mb-8 rounded-[1.8rem] border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 text-sm leading-relaxed text-slate-600">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 mb-2">Local-First</div>
                  Memories, relationship state, and session history stay on this machine in local files. The backend is the source of truth for any client you connect later.
                </div>

                <label className={labelClass}>Your Name</label>
                <input
                  type="text"
                  value={form.user.name}
                  onChange={(e) => updateForm("user", "name", e.target.value)}
                  placeholder="What should your companion call you?"
                  className={inputClass}
                />

                <label className={labelClass}>About Yourself</label>
                <textarea
                  value={form.user.about}
                  onChange={(e) => updateForm("user", "about", e.target.value)}
                  placeholder="Interests, what you do, what kind of support or chemistry you like, what matters to you..."
                  rows={5}
                  className={`${inputClass} resize-none mb-2 rounded-3xl`}
                />
              </div>
            )}

            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Connect the brain</h2>
                <p className={descriptionClass}>Choose the model that will drive your companion. Local endpoints keep inference on-device; remote providers receive the prompt context needed to reply.</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                  {llmPresetList.map(([id, preset]) => (
                    <button
                      key={id}
                      onClick={() => selectLLMPreset(id)}
                      className={`px-4 py-3.5 rounded-2xl text-[14px] font-semibold border transition-all ${
                        form.llm.provider === id
                          ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      {preset.name}
                      {!preset.needs_key && <span className="ml-2 text-[10px] text-emerald-600">Local/no key</span>}
                    </button>
                  ))}
                </div>

                {form.llm.provider && (
                  <div className="animate-in fade-in duration-300">
                    {llmPresets[form.llm.provider]?.needs_key !== false && (
                      <>
                        <label className={labelClass}>API Key</label>
                        <input
                          type="password"
                          value={form.llm.api_key}
                          onChange={(e) => {
                            updateForm("llm", "api_key", e.target.value);
                            setTestResult(null);
                          }}
                          placeholder="Paste your API key"
                          className={inputClass}
                        />
                      </>
                    )}

                    <label className={labelClass}>Model</label>
                    <input
                      type="text"
                      value={form.llm.model}
                      onChange={(e) => {
                        updateForm("llm", "model", e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="e.g. gpt-4o"
                      className={inputClass}
                    />

                    {form.llm.provider === "custom" && (
                      <>
                        <label className={labelClass}>Base URL</label>
                        <input
                          type="text"
                          value={form.llm.base_url}
                          onChange={(e) => {
                            updateForm("llm", "base_url", e.target.value);
                            setTestResult(null);
                          }}
                          placeholder="https://api.example.com/v1"
                          className={inputClass}
                        />
                      </>
                    )}

                    <button
                      onClick={testConnection}
                      disabled={testing}
                      className="w-full py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 text-[15px] font-medium hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 transition-all mb-4"
                    >
                      {testing ? "Testing..." : "Test Connection"}
                    </button>

                    {testResult && (
                      <div
                        className={`px-5 py-4 rounded-2xl text-[15px] font-medium animate-in fade-in ${
                          testResult.success
                            ? "bg-green-50 text-green-700 border border-green-200/50 shadow-sm"
                            : "bg-red-50 text-red-700 border border-red-200/50 shadow-sm"
                        }`}
                      >
                        {testResult.success ? "Connected successfully!" : testResult.error || "Connection failed"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Choose the voice</h2>
                <p className={descriptionClass}>This is the voice your companion will use. Text for speech is sent only to the TTS provider you choose.</p>

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

            {step === 4 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Connect optional sources</h2>
                <p className={descriptionClass}>
                  Link services through Composio if you want GitHub READMEs, Gmail context, or other toolkits available in chat later. You can skip this and configure integrations anytime in Settings.
                </p>

                <label className={labelClass}>Composio API Key</label>
                <input
                  type="password"
                  value={composioApiKey}
                  onChange={(e) => setComposioApiKey(e.target.value)}
                  placeholder="Optional — paste your Composio API key"
                  className={inputClass}
                />

                <ComposioToolkitPicker
                  enabledToolkits={composioToolkits}
                  statuses={composioStatus}
                  compact
                  onToggle={(slug) =>
                    setComposioToolkits((prev) =>
                      prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug],
                    )
                  }
                  onConnect={async (slug) => {
                    try {
                      const result: any = await authorizeComposioToolkit(slug);
                      setComposioRedirectUrl(result.redirect_url || null);
                      const data = await getComposioStatus();
                      setComposioStatus((data as ComposioToolkitStatus[]) || []);
                    } catch (err) {
                      console.error("Composio authorize failed:", err);
                    }
                  }}
                  onRefresh={async (slug) => {
                    try {
                      await refreshComposioToolkit(slug);
                      const data = await getComposioStatus();
                      setComposioStatus((data as ComposioToolkitStatus[]) || []);
                    } catch (err) {
                      console.error("Composio refresh failed:", err);
                    }
                  }}
                />

                {composioRedirectUrl && (
                  <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Connect link ready</div>
                    <p className="mt-2 text-sm text-blue-700">Open this link, finish OAuth, then return and press Refresh on the service card.</p>
                    <button
                      type="button"
                      onClick={() => window.open(composioRedirectUrl, "_blank", "noopener,noreferrer")}
                      className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white"
                    >
                      Open Connect Link
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Build your companion</h2>
                <p className={descriptionClass}>
                  This step now creates a layered character profile: soul, style, rules, and user context. Pick the emotional shape first, then fine-tune the written draft.
                </p>

                <div className="mb-7 rounded-[1.8rem] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 text-sm leading-relaxed text-slate-600">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 mb-2">Memory + State Aware</div>
                  Your companion will keep local memory and relationship state after onboarding. These choices shape how that future memory feels, not just the first prompt.
                </div>

                <label className={labelClass}>Companion Name</label>
                <input
                  type="text"
                  value={form.companion.name}
                  onChange={(e) => updateForm("companion", "name", e.target.value)}
                  placeholder="What should your companion be called?"
                  className={inputClass}
                />

                <label className={labelClass}>Core Vibe</label>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {VIBES.map((vibe) => (
                    <SelectionCard
                      key={vibe.id}
                      title={vibe.title}
                      blurb={vibe.blurb}
                      selected={form.companion.vibe === vibe.id}
                      onClick={() => updateForm("companion", "vibe", vibe.id)}
                    />
                  ))}
                </div>

                <label className={labelClass}>Relationship Dynamic</label>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {RELATIONSHIP_STYLES.map((style) => (
                    <SelectionCard
                      key={style.id}
                      title={style.title}
                      blurb={style.blurb}
                      selected={form.companion.relationship_style === style.id}
                      onClick={() => updateForm("companion", "relationship_style", style.id)}
                    />
                  ))}
                </div>

                <label className={labelClass}>Speech Style</label>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {SPEECH_STYLES.map((style) => (
                    <SelectionCard
                      key={style.id}
                      title={style.title}
                      blurb={style.blurb}
                      selected={form.companion.speech_style === style.id}
                      onClick={() => updateForm("companion", "speech_style", style.id)}
                    />
                  ))}
                </div>

                <div className="mb-6 rounded-[1.7rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">{form.companion.vibe}</span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">{form.companion.relationship_style}</span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">{form.companion.speech_style}</span>
                    {selectedModel && <span className="rounded-full bg-white px-3 py-1 shadow-sm">{selectedModel.id}</span>}
                  </div>
                </div>

                <label className={labelClass}>Layered Personality Draft</label>
                <textarea
                  value={form.companion.personality}
                  onChange={(e) => {
                    setPersonalityTouched(true);
                    updateForm("companion", "personality", e.target.value);
                  }}
                  placeholder="Refine the auto-generated draft until it feels like a real person."
                  rows={7}
                  className={`${inputClass} resize-none rounded-3xl`}
                />

                <div className="flex justify-between items-center mb-6">
                  <button
                    onClick={() => {
                      setPersonalityTouched(false);
                      setForm((prev) => ({
                        ...prev,
                        companion: { ...prev.companion, personality: buildCompanionDraft(prev) },
                      }));
                    }}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm transition-all hover:-translate-y-0.5"
                  >
                    Regenerate Draft
                  </button>
                  <div className="text-[12px] text-slate-400">You can still rewrite this completely.</div>
                </div>

                <label className={labelClass}>Avatar Model</label>
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
                  <div className="px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100/80 text-slate-600 text-sm mb-2 shadow-sm font-medium">
                    Using default model.
                    <span className="block text-[13px] text-slate-400 font-normal mt-1.5 leading-relaxed">
                      Add models to `models/live2d/` or `models/vrm/` and restart to expand your choices.
                    </span>
                  </div>
                )}
              </div>
            )}

            {step === 6 && (
              <div className="text-center py-12 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-gradient-to-tr from-green-400 to-emerald-400 text-white shadow-lg shadow-green-500/30 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
                  {"\u2713"}
                </div>
                <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">Your companion is ready</h2>
                <p className="text-slate-500 text-[16px] max-w-md mx-auto leading-relaxed">
                  <span className="font-semibold text-blue-600">{form.companion.name}</span> has been created with a layered profile, local memory, and evolving relationship state. Loading them now...
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">
                {error}
              </div>
            )}

            {step < 6 && (
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
                {step < 5 ? (
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
