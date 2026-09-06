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
import { DEFAULT_TTS_VOICE } from "../lib/ttsPresets";
import type { ModelInfo } from "../types";
import { CompanionAvatarPreview } from "./onboarding/CompanionAvatarPreview";
import { ModelPicker } from "./onboarding/ModelPicker";
import {
  Button,
  ChevronDownIcon,
  ChoiceCard,
  CloseIcon,
  cn,
  Field,
  IconButton,
  Input,
  Notice,
  Select,
  Surface,
  Textarea,
  UploadIcon,
  VibeGlyph,
  WandIcon,
} from "./ui";

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
  const [voice, setVoice] = useState(DEFAULT_TTS_VOICE);
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
        setVoice(cfg.tts?.voice || DEFAULT_TTS_VOICE);
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
            availableModels.some((model) => model.id === current)
              ? current
              : defaultModelId(availableModels),
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
    <div className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
        onClick={resetAndClose}
      />
      <Surface
        radius="sheet"
        tone="surface"
        elevation="pop"
        className="relative z-[101] flex max-h-[92vh] w-full max-w-5xl animate-pop-in flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-7 pb-4 pt-6">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight text-ink">Add a companion</h2>
            <p className="mt-1 text-sm text-ink-2">
              Name them, pick a look, and tune their personality. They use your current voice settings.
            </p>
          </div>
          <IconButton label="Close" size="sm" onClick={resetAndClose}>
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-6 px-7 lg:grid-cols-[minmax(240px,340px)_1fr] lg:gap-8">
            <div className="lg:sticky lg:top-0 lg:self-start">
              <CompanionAvatarPreview
                model={previewModel}
                companionName={name}
                vibeLabel={selectedVibePack?.title}
              />
            </div>

            <div className="min-w-0 space-y-6">
              <Field label="Companion name">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should they be called?"
                />
              </Field>

              <Field
                label="Look"
                hint="Live2D or 3D VRM. The preview updates as you choose."
              >
                {models.length > 0 ? (
                  <ModelPicker models={models} selectedId={modelId} onSelect={setModelId} />
                ) : (
                  <Notice tone="neutral">No models detected yet. Import one below.</Notice>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leading={<UploadIcon className="h-4 w-4" />}
                    loading={importing === "live2d"}
                    disabled={importing !== null}
                    onClick={() => handleImportModel("live2d")}
                  >
                    Import Live2D
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    leading={<UploadIcon className="h-4 w-4" />}
                    loading={importing === "vrm"}
                    disabled={importing !== null}
                    onClick={() => handleImportModel("vrm")}
                  >
                    Import VRM
                  </Button>
                </div>
                {importMessage ? (
                  <Notice tone="success" className="mt-3">
                    {importMessage}
                  </Notice>
                ) : null}
              </Field>

              <Field label="Personality">
                <div className="grid grid-cols-2 gap-2.5">
                  {COMPANION_VIBE_PACKS.map((pack) => (
                    <ChoiceCard
                      key={pack.id}
                      compact
                      selected={vibe === pack.id}
                      onClick={() => selectVibePack(pack.id)}
                      leading={<VibeGlyph id={pack.id} />}
                      title={pack.title}
                      description={pack.subtitle}
                    />
                  ))}
                </div>
              </Field>

              <Surface tone="well" elevation="none" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-ink"
                >
                  Advanced personality
                  <ChevronDownIcon
                    className={cn(
                      "h-4 w-4 text-ink-3 transition-transform",
                      advancedOpen && "rotate-180",
                    )}
                  />
                </button>
                {advancedOpen ? (
                  <div className="space-y-4 border-t border-line px-5 pb-5 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Relationship">
                        <Select
                          value={relationshipStyle}
                          onChange={(e) => setRelationshipStyle(e.target.value)}
                        >
                          {RELATIONSHIP_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Speech style">
                        <Select
                          value={speechStyle}
                          onChange={(e) => setSpeechStyle(e.target.value)}
                        >
                          {SPEECH_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Personality draft">
                      <Textarea
                        value={personality}
                        onChange={(e) => {
                          setPersonalityTouched(true);
                          setPersonality(e.target.value);
                        }}
                        rows={8}
                      />
                      <Button
                        size="sm"
                        variant="soft"
                        leading={<WandIcon className="h-4 w-4" />}
                        className="mt-3"
                        onClick={() => {
                          setPersonalityTouched(false);
                          setPersonality(buildCompanionPersonalityDraft(draftInput));
                        }}
                      >
                        Regenerate from presets
                      </Button>
                    </Field>
                  </div>
                ) : null}
              </Surface>

              {error ? <Notice tone="danger">{error}</Notice> : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 bg-well/50 px-7 py-5">
          <Button variant="secondary" size="lg" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={saving}
            disabled={!name.trim() || !personality.trim()}
            onClick={handleCreate}
          >
            Create companion
          </Button>
        </div>
      </Surface>
    </div>
  );
}
