import { useEffect, useMemo, useState } from "react";
import {
  createCharacter,
  getConfig,
  importLive2DModel,
  importVRMModel,
  listModels,
} from "../api/tauri";
import { buildCompanionPersonalityDraft } from "../lib/companionCharacterDraft";
import { COMPANION_VIBE_PACKS } from "../lib/companionVibes";
import type { ModelInfo } from "../types";
import { CompanionAvatarPreview } from "./onboarding/CompanionAvatarPreview";
import { ModelPicker } from "./onboarding/ModelPicker";

const inputClass =
  "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";

const RELATIONSHIP_OPTIONS = ["Gentle", "Teasing", "Protective", "Devoted", "Chaotic"] as const;
const SPEECH_OPTIONS = ["Poetic", "Playful", "Calm", "Sharp", "Intimate"] as const;

function defaultModelId(models: ModelInfo[]): string {
  if (models.some((m) => m.id === "haru")) return "haru";
  if (models.some((m) => m.id === "utsuwa")) return "utsuwa";
  return models[0]?.id ?? "haru";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
          setModelId((current) =>
            availableModels.some((model) => model.id === current) ? current : defaultModelId(availableModels),
          );
        }
      })
      .catch((err) => {
        console.error("Failed to load models for character creation:", err);
        setModels([]);
      });

    setImportMessage("");
  }, [open]);

  const draftInput = useMemo(
    () => ({
      companionName: name,
      userName,
      userAbout,
      vibe,
      relationshipStyle,
      speechStyle,
    }),
    [name, userName, userAbout, vibe, relationshipStyle, speechStyle],
  );

  useEffect(() => {
    if (personalityTouched && personality.trim()) return;
    setPersonality(buildCompanionPersonalityDraft(draftInput));
  }, [draftInput, personalityTouched, personality]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId) || null,
    [models, modelId],
  );

  const previewModel = useMemo(() => {
    if (!selectedModel) return null;
    return {
      id: selectedModel.id,
      type: selectedModel.type,
      path: selectedModel.path,
      animations: selectedModel.animations,
    };
  }, [selectedModel]);

  const selectedVibePack = COMPANION_VIBE_PACKS.find((pack) => pack.id === vibe);

  const selectVibePack = (packId: string) => {
    const pack = COMPANION_VIBE_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    setVibe(pack.id);
    setRelationshipStyle(pack.relationship_style);
    setSpeechStyle(pack.speech_style);
  };

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
    setModelId("haru");
    setPersonalityTouched(false);
    setAdvancedOpen(false);
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
        modelId: modelId || defaultModelId(models),
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={resetAndClose} />
      <div className="relative z-[101] flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 shadow-[0_20px_80px_rgba(15,23,42,0.18)] ring-1 ring-slate-100/80">
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5 shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800">Add Character</h2>
            <p className="mt-1 text-sm text-slate-500">Name them, pick a look, tune personality—uses your current voice settings.</p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-red-500"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(240px,340px)_1fr] lg:gap-8">
            <div className="lg:sticky lg:top-0 lg:self-start">
              <CompanionAvatarPreview
                model={previewModel}
                companionName={name}
                vibeLabel={selectedVibePack?.title}
              />
            </div>

            <div className="space-y-6 min-w-0">
              <div>
                <label className={labelClass}>Companion name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should they be called?"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Look</label>
                <p className="mb-3 text-xs text-slate-500">Live2D or 3D VRM—preview updates as you choose.</p>
                {models.length > 0 ? (
                  <ModelPicker models={models} selectedId={modelId} onSelect={setModelId} />
                ) : (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                    No models detected yet. Import one below.
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleImportModel("live2d")}
                    disabled={importing !== null}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {importing === "live2d" ? "Importing…" : "Import Live2D"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportModel("vrm")}
                    disabled={importing !== null}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {importing === "vrm" ? "Importing…" : "Import VRM"}
                  </button>
                </div>
                {importMessage ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {importMessage}
                  </div>
                ) : null}
              </div>

              <div>
                <label className={labelClass}>Personality</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {COMPANION_VIBE_PACKS.map((pack) => {
                    const selected = vibe === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => selectVibePack(pack.id)}
                        className={`flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition-all ${
                          selected
                            ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200/80 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <span className="text-xl">{pack.emoji}</span>
                        <div className="min-w-0">
                          <div className={`text-sm font-semibold ${selected ? "text-blue-900" : "text-slate-800"}`}>
                            {pack.title}
                          </div>
                          <div className={`text-xs ${selected ? "text-blue-600/85" : "text-slate-400"}`}>
                            {pack.subtitle}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-slate-700">Advanced personality</span>
                  <span className="text-xs text-slate-400">{advancedOpen ? "Hide" : "Show"}</span>
                </button>
                {advancedOpen ? (
                  <div className="space-y-4 border-t border-slate-200/80 px-5 pb-5 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Relationship
                        </label>
                        <select
                          value={relationshipStyle}
                          onChange={(e) => setRelationshipStyle(e.target.value)}
                          className={`${inputClass} cursor-pointer appearance-none`}
                        >
                          {RELATIONSHIP_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Speech style
                        </label>
                        <select
                          value={speechStyle}
                          onChange={(e) => setSpeechStyle(e.target.value)}
                          className={`${inputClass} cursor-pointer appearance-none`}
                        >
                          {SPEECH_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Personality draft
                      </label>
                      <textarea
                        value={personality}
                        onChange={(e) => {
                          setPersonalityTouched(true);
                          setPersonality(e.target.value);
                        }}
                        rows={8}
                        className={`${inputClass} resize-none rounded-3xl`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPersonalityTouched(false);
                          setPersonality(buildCompanionPersonalityDraft(draftInput));
                        }}
                        className="mt-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm transition-all hover:-translate-y-0.5"
                      >
                        Regenerate from presets
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100/80 bg-white/90 px-6 py-5">
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-[14px] font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !name.trim() || !personality.trim()}
            className="rounded-2xl bg-blue-600 px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create character"}
          </button>
        </div>
      </div>
    </div>
  );
}
