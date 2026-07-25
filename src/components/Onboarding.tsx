import { useEffect, useMemo, useRef, useState } from "react";
import {
  saveConfig,
  createCharacter,
  getVoices,
  previewVoice,
  listModels,
  getAgentSetupStatus,
  installAgentSetup,
  type AgentSetupStatusResponse,
} from "../api/tauri";
import {
  ACP_AGENT_PRESET_IDS,
  ACP_AGENT_PRESETS,
  type AcpAgentPresetId,
} from "../lib/agentPresets";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [personalityTouched, setPersonalityTouched] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [agentSetup, setAgentSetup] = useState<AgentSetupStatusResponse | null>(null);
  const [agentSetupLoading, setAgentSetupLoading] = useState(false);
  const [agentInstalling, setAgentInstalling] = useState(false);
  const [agentSetupError, setAgentSetupError] = useState("");

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
      setAgentSetupError("");
      return;
    }
    let cancelled = false;
    setAgentSetupLoading(true);
    setAgentSetupError("");
    getAgentSetupStatus(form.agent.preset)
      .then((status) => {
        if (!cancelled) setAgentSetup(status);
      })
      .catch((err) => {
        if (!cancelled) {
          setAgentSetupError(err?.message || String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setAgentSetupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, form.agent.preset]);

  const runAgentInstall = async () => {
    if (form.agent.preset === "custom") return;
    setAgentInstalling(true);
    setAgentSetupError("");
    try {
      const status = await installAgentSetup(form.agent.preset);
      setAgentSetup(status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAgentSetupError(msg);
    } finally {
      setAgentInstalling(false);
    }
  };

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
        return (
          form.companion.name.trim() !== "" &&
          form.companion.personality.trim() !== "" &&
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
        <div className="w-full max-w-2xl z-10 relative">
          {step < 5 && (
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
                <h2 className={headingClass}>Meet your companion</h2>
                <p className={descriptionClass}>
                  Meuxe is a character on your desktop who remembers you, grows with you, and can help with everyday life—not a settings panel or a coding demo.
                </p>

                <div className="grid gap-4 mb-8">
                  <div className="rounded-[1.8rem] border border-blue-100 bg-blue-50 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 mb-2">Someone to talk to</div>
                    <p className="text-sm leading-relaxed text-blue-800">Pick a personality, see them react, and build a relationship that continues between sessions.</p>
                  </div>
                  <div className="rounded-[1.8rem] border border-emerald-100 bg-emerald-50 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 mb-2">Your data stays local</div>
                    <p className="text-sm leading-relaxed text-emerald-800">Memories, chat history, and relationship state live on this device. You choose if and when to connect cloud AI or voice services.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>A little about you</h2>
                <p className={descriptionClass}>
                  Your companion will remember what you share here. Be honest—they&apos;re built to respond to a real person, not a generic user profile.
                </p>

                <div className="mb-8 rounded-[1.8rem] border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 text-sm leading-relaxed text-slate-600">
                  Everything in this step stays on your computer unless you later connect cloud AI or voice services in Settings.
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

            {step === 4 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Connect their mind</h2>
                <p className={descriptionClass}>
                  Meuxe is the face, memory, and voice. Choose the CLI agent on your machine that does the thinking—Claude Code, Codex, or your own ACP agent.
                </p>

                <label className={labelClass}>Agent</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  {ACP_AGENT_PRESET_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          agent: { ...prev.agent, preset: id },
                        }))
                      }
                      className={`rounded-[1.4rem] border px-4 py-4 text-left transition-all ${
                        form.agent.preset === id
                          ? "border-violet-400 bg-violet-50 text-violet-800 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <div className="text-[14px] font-semibold">{ACP_AGENT_PRESETS[id].title}</div>
                      <div
                        className={`mt-1 text-[12px] leading-relaxed ${
                          form.agent.preset === id ? "text-violet-700/80" : "text-slate-400"
                        }`}
                      >
                        {ACP_AGENT_PRESETS[id].blurb}
                      </div>
                    </button>
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
                  <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/90 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
                      Setup check
                    </div>
                    {agentSetupLoading && (
                      <p className="text-sm text-slate-500">Checking Node.js and agent…</p>
                    )}
                    {agentSetup && !agentSetupLoading && (
                      <div className="space-y-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              agentSetup.agent.ready
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {ACP_AGENT_PRESETS[form.agent.preset].title} ACP adapter{" "}
                            {agentSetup.agent.ready ? "ready" : "not installed"}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              agentSetup.prerequisites.node_available
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            Node.js {agentSetup.prerequisites.node_available ? "ready" : "missing"}
                          </span>
                          {agentSetup.prerequisites.node_version && (
                            <span className="text-xs text-slate-500">{agentSetup.prerequisites.node_version}</span>
                          )}
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              agentSetup.prerequisites.npx_available
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            npx {agentSetup.prerequisites.npx_available ? "ready" : "missing"}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{agentSetup.agent.detail}</p>
                        <div className="flex flex-wrap gap-2">
                          {!agentSetup.prerequisites.node_available && (
                            <button
                              type="button"
                              onClick={() => window.open("https://nodejs.org/en/download", "_blank")}
                              className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50"
                            >
                              Get Node.js
                            </button>
                          )}
                          {agentSetup.prerequisites.node_available && !agentSetup.agent.ready && (
                              <button
                                type="button"
                                onClick={runAgentInstall}
                                disabled={agentInstalling}
                                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                              >
                                {agentInstalling ? "Installing…" : `Install ${ACP_AGENT_PRESETS[form.agent.preset].title}`}
                              </button>
                            )}
                          {agentSetup.prerequisites.node_available &&
                            agentSetup.agent.ready &&
                            !agentSetup.agent.managed_install && (
                              <button
                                type="button"
                                onClick={runAgentInstall}
                                disabled={agentInstalling}
                                className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                              >
                                {agentInstalling ? "Installing…" : "Install into Meuxe folder"}
                              </button>
                            )}
                          {agentSetup.agent.ready && agentSetup.agent.managed_install && (
                            <span className="text-xs font-semibold text-emerald-700">Installed for Meuxe</span>
                          )}
                        </div>
                      </div>
                    )}
                    {agentSetupError && (
                      <p className="mt-2 text-sm text-red-600">{agentSetupError}</p>
                    )}
                    <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                      Meuxe uses the Agent Client Protocol (ACP) built into the app. Your agent runs as a local CLI; we install adapters into your Meuxe data folder when you tap Install.
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-5 py-4 text-sm leading-relaxed text-violet-900/90">
                  After setup, sign in to your agent in the terminal if it asks. Meuxe injects persona and memory into companion-home before each reply.
                </div>
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

            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className={headingClass}>Create your companion</h2>
                <p className={descriptionClass}>
                  Shape how they feel and speak. These choices feed their long-term memory and relationship with you—not just the first message.
                </p>

                <div className="mb-7 rounded-[1.8rem] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 text-sm leading-relaxed text-slate-600">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 mb-2">They remember you</div>
                  Meuxe keeps local memory and relationship state so conversations feel continuous, not reset every time you open the app.
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

            {step === 5 && (
              <div className="text-center py-12 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-gradient-to-tr from-green-400 to-emerald-400 text-white shadow-lg shadow-green-500/30 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
                  {"\u2713"}
                </div>
                <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">Your companion is ready</h2>
                <p className="text-slate-500 text-[16px] max-w-md mx-auto leading-relaxed">
                  <span className="font-semibold text-blue-600">{form.companion.name}</span> is ready. Take a breath—they&apos;re waiting for you.
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
