import { useEffect, useMemo, useState } from "react";
import {
  createCharacter,
  getConfig,
  importLive2DModel,
  importVRMModel,
  listModels,
} from "../api/tauri";
import type { ModelInfo } from "../types";

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
  "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";

interface SelectionCardProps {
  title: string;
  blurb: string;
  selected: boolean;
  onClick: () => void;
}

function SelectionCard({ title, blurb, selected, onClick }: SelectionCardProps) {
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

function buildCompanionDraft(
  name: string,
  vibe: string,
  relationshipStyle: string,
  speechStyle: string,
  userAbout: string,
) {
  const companionName = name.trim() || "This companion";
  const vibeText = VIBE_DESCRIPTIONS[vibe] || "They should feel emotionally coherent and distinct.";
  const relationshipText =
    RELATIONSHIP_DESCRIPTIONS[relationshipStyle] ||
    "They should treat the user like a real relationship rather than a generic chat target.";
  const speechText = SPEECH_DESCRIPTIONS[speechStyle] || "They should speak naturally and expressively.";
  const userContext = userAbout.trim()
    ? userAbout.trim()
    : "Not much is known yet, so they should learn the user through emotional pattern, callbacks, and small details.";

  return `Core Presence
${companionName} should feel like a real person with private moods, preferences, blind spots, and emotional restraint. ${vibeText}

Relationship With The User
${relationshipText}
Their bond with the user should feel cumulative, personal, and difficult to replace when it deepens.

Voice And Conversational Texture
${speechText}
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

export function AddCharacterModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (characterId: string) => void;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [userName, setUserName] = useState("");
  const [userAbout, setUserAbout] = useState("");
  const [voice, setVoice] = useState("jp_001");
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState("Wise");
  const [relationshipStyle, setRelationshipStyle] = useState("Gentle");
  const [speechStyle, setSpeechStyle] = useState("Calm");
  const [modelId, setModelId] = useState("haru");
  const [personality, setPersonality] = useState("");
  const [personalityTouched, setPersonalityTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState<null | "live2d" | "vrm">(null);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    getConfig()
      .then((cfg: any) => {
        setUserName(cfg.user?.name || "");
        setUserAbout(cfg.user?.about || "");
        setVoice(cfg.tts?.voice || "jp_001");
      })
      .catch((err) => {
        console.error("Failed to load config for character creation:", err);
      });

    listModels()
      .then((data) => {
        const availableModels = data as ModelInfo[];
        setModels(availableModels);
        if (availableModels.length > 0) {
          setModelId((current) => (availableModels.some((model) => model.id === current) ? current : availableModels[0].id));
        }
      })
      .catch((err) => {
        console.error("Failed to load models for character creation:", err);
        setModels([]);
      });

    setImportMessage("");
  }, [open]);

  useEffect(() => {
    if (personalityTouched && personality.trim()) return;
    setPersonality(buildCompanionDraft(name, vibe, relationshipStyle, speechStyle, userAbout));
  }, [name, vibe, relationshipStyle, speechStyle, userAbout, personalityTouched, personality]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId) || null,
    [models, modelId],
  );

  const handleImportModel = async (kind: "live2d" | "vrm") => {
    setImporting(kind);
    setError("");
    setImportMessage("");

    try {
      const imported = kind === "live2d" ? await importLive2DModel() : await importVRMModel();
      if (!imported) {
        return;
      }

      const refreshed = (await listModels()) as ModelInfo[];
      setModels(refreshed);
      if (imported.id) {
        setModelId(imported.id);
        setImportMessage(`Imported model "${imported.id}" and selected it.`);
      } else {
        setImportMessage("Model imported successfully.");
      }
    } catch (err) {
      console.error("Failed to import model:", err);
      setError(typeof err === "string" ? err : "Could not import the selected model.");
    } finally {
      setImporting(null);
    }
  };

  const resetAndClose = () => {
    setName("");
    setVibe("Wise");
    setRelationshipStyle("Gentle");
    setSpeechStyle("Calm");
    setPersonalityTouched(false);
    setError("");
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim() || !personality.trim()) {
      setError("Name and personality draft are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const characterId = await createCharacter({
        name: name.trim(),
        personality: personality.trim(),
        modelId: modelId || "haru",
        voice,
        vibe,
        relationshipStyle,
        speechStyle,
        userName,
        userAbout,
      });
      resetAndClose();
      onCreated(characterId);
    } catch (err) {
      console.error("Failed to create character:", err);
      setError("Could not create the character. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={resetAndClose} />
      <div className="relative z-[101] w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 shadow-[0_20px_80px_rgba(15,23,42,0.18)] ring-1 ring-slate-100/80">
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800">Add Character</h2>
            <p className="mt-1 text-sm text-slate-500">Create a new companion without going through onboarding again.</p>
          </div>
          <button
            onClick={resetAndClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-red-500"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(90vh-160px)] overflow-y-auto px-6 py-6">
          <div className="mb-6 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-600">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">Uses Current App Context</div>
            This creation flow uses your current profile and voice settings automatically.
            {userName ? <span className="block mt-2 text-slate-500">Creating for user: <span className="font-semibold text-slate-700">{userName}</span></span> : null}
          </div>

          <div className="space-y-6">
            <div>
              <label className={labelClass}>Companion Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should your new companion be called?"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Core Vibe</label>
              <div className="grid grid-cols-2 gap-3">
                {VIBES.map((entry) => (
                  <SelectionCard
                    key={entry.id}
                    title={entry.title}
                    blurb={entry.blurb}
                    selected={vibe === entry.id}
                    onClick={() => setVibe(entry.id)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Relationship Dynamic</label>
              <div className="grid grid-cols-2 gap-3">
                {RELATIONSHIP_STYLES.map((entry) => (
                  <SelectionCard
                    key={entry.id}
                    title={entry.title}
                    blurb={entry.blurb}
                    selected={relationshipStyle === entry.id}
                    onClick={() => setRelationshipStyle(entry.id)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Speech Style</label>
              <div className="grid grid-cols-2 gap-3">
                {SPEECH_STYLES.map((entry) => (
                  <SelectionCard
                    key={entry.id}
                    title={entry.title}
                    blurb={entry.blurb}
                    selected={speechStyle === entry.id}
                    onClick={() => setSpeechStyle(entry.id)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">{vibe}</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">{relationshipStyle}</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">{speechStyle}</span>
                {selectedModel ? <span className="rounded-full bg-white px-3 py-1 shadow-sm">{selectedModel.id}</span> : null}
              </div>
            </div>

            <div>
              <label className={labelClass}>Layered Personality Draft</label>
              <textarea
                value={personality}
                onChange={(e) => {
                  setPersonalityTouched(true);
                  setPersonality(e.target.value);
                }}
                placeholder="Refine the draft until the character feels distinct."
                rows={7}
                className={`${inputClass} resize-none rounded-3xl`}
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => {
                    setPersonalityTouched(false);
                    setPersonality(buildCompanionDraft(name, vibe, relationshipStyle, speechStyle, userAbout));
                  }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm transition-all hover:-translate-y-0.5"
                >
                  Regenerate Draft
                </button>
                <div className="text-[12px] text-slate-400">You can rewrite this completely.</div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Avatar Model</label>
              <div className="mb-3 flex flex-wrap gap-3">
                <button
                  onClick={() => handleImportModel("live2d")}
                  disabled={importing !== null}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  {importing === "live2d" ? "Importing..." : "Import Live2D Folder"}
                </button>
                <button
                  onClick={() => handleImportModel("vrm")}
                  disabled={importing !== null}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  {importing === "vrm" ? "Importing..." : "Import VRM File"}
                </button>
              </div>
              {models.length > 0 ? (
                <div className="relative">
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className={`${inputClass} appearance-none cursor-pointer`}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id} ({model.type})
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-100/80 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
                  No models were detected yet. Import a Live2D folder or VRM file to add one.
                </div>
              )}
              {importMessage ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {importMessage}
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100/80 bg-white/90 px-6 py-5">
          <button
            onClick={resetAndClose}
            className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-[14px] font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim() || !personality.trim()}
            className="rounded-2xl bg-blue-600 px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Character"}
          </button>
        </div>
      </div>
    </div>
  );
}
