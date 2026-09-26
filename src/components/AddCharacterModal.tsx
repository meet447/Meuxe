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
import { displayNameForModelId, lookLabelForModelId, MARKETPLACE_LISTINGS } from "../lib/marketplaceCatalog";
import { DEFAULT_TTS_VOICE } from "../lib/ttsPresets";
import type { AppConfig, ModelInfo } from "../types";
import { CompanionAvatarPreview } from "./onboarding/CompanionAvatarPreview";
import { ModelMarketplace } from "./marketplace/ModelMarketplace";
import {
  BackIcon,
  Button,
  ChevronRightIcon,
  ChoiceCard,
  CloseIcon,
  Field,
  IconButton,
  Input,
  Notice,
  Pill,
  Select,
  StepDots,
  Surface,
  Textarea,
  VibeGlyph,
  WandIcon,
} from "./ui";

const RELATIONSHIP_OPTIONS = ["Gentle", "Teasing", "Protective", "Devoted", "Chaotic"] as const;
const SPEECH_OPTIONS = ["Poetic", "Playful", "Calm", "Sharp", "Intimate"] as const;

const STEPS = ["Name", "Look", "Personality"] as const;
const STEP_HEADINGS = ["What should they be called?", "Pick their look", "How they come across"];
const STEP_SUBTITLES = [
  "They'll use your current voice settings. You can change that later in Settings.",
  "Choose an installed look, install a free one, or import your own files.",
  "Pick a vibe, then read what we'll tell them about themselves.",
];

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
  /** Don't mount Live2D/VRM until the user picks a look — avoids burning the WebGL context on the default Haru. */
  const [livePreviewArmed, setLivePreviewArmed] = useState(false);
  const [personality, setPersonality] = useState("");
  const [personalityTouched, setPersonalityTouched] = useState(false);
  const [step, setStep] = useState(0);
  const [draftEditing, setDraftEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState<null | "live2d" | "vrm">(null);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setStep(0);

    getConfig()
      .then((cfg: AppConfig) => {
        setUserName(cfg.user?.name || "");
        setUserAbout(cfg.user?.about || "");
        setVoice(cfg.tts?.voice || DEFAULT_TTS_VOICE);
      })
      .catch((err) => {
        console.error("Failed to load config for character creation:", err);
      });

    listModels()
      .then((data) => {
        const availableModels = data;
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
    setLivePreviewArmed(false);
  }, [open]);

  useEffect(() => {
    if ((step === 1 || step === 2) && modelId) {
      setLivePreviewArmed(true);
    }
  }, [step, modelId]);

  const selectLook = (id: string) => {
    setModelId(id);
    setLivePreviewArmed(true);
  };

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
    if (!livePreviewArmed || !selectedModel) return null;
    return {
      id: selectedModel.id,
      type: selectedModel.type,
      path: selectedModel.path,
      animations: selectedModel.animations,
    };
  }, [livePreviewArmed, selectedModel]);

  const previewThumbnailUrl = useMemo(() => {
    if (!modelId) return null;
    return MARKETPLACE_LISTINGS.find((listing) => listing.id === modelId)?.thumbnailUrl ?? null;
  }, [modelId]);

  const selectedVibePack = COMPANION_VIBE_PACKS.find((pack) => pack.id === vibe);

  const selectVibePack = (packId: string) => {
    const pack = COMPANION_VIBE_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    setVibe(pack.id);
    setRelationshipStyle(pack.relationship_style);
    setSpeechStyle(pack.speech_style);
  };

  const canProceed =
    step === 0
      ? Boolean(name.trim())
      : step === 1
        ? Boolean(modelId)
        : Boolean(personality.trim());

  const handleImportModel = async (kind: "live2d" | "vrm") => {
    setImporting(kind);
    setError("");
    setImportMessage("");

    try {
      const imported = kind === "live2d" ? await importLive2DModel() : await importVRMModel();
      if (!imported) {
        return;
      }

      const refreshed = await listModels();
      setModels(refreshed);
      if (imported.id) {
        selectLook(imported.id);
        setImportMessage(`Imported ${displayNameForModelId(imported.id)} and selected it.`);
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
    setLivePreviewArmed(false);
    setPersonalityTouched(false);
    setStep(0);
    setDraftEditing(false);
    setImportMessage("");
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
      const message =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Could not create the character. Please try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (!canProceed) return;
    setStep((s) => Math.min(s + 1, 2));
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resetAndClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
        className="relative z-[101] flex h-[min(800px,92vh)] w-full max-w-4xl animate-fade-in flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-7 pb-3 pt-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[22px] font-bold tracking-tight text-ink">Add a companion</h2>
              <StepDots count={3} current={step} />
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              Step {step + 1} of 3 · {STEPS[step]}
            </p>
            <h3 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">{STEP_HEADINGS[step]}</h3>
            <p className="mt-1 text-sm text-ink-2">{STEP_SUBTITLES[step]}</p>
          </div>
          <IconButton label="Close" size="sm" onClick={resetAndClose}>
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {step === 0 ? (
            <div className="h-full overflow-y-auto px-7 py-6 scrollbar-thin">
              <div className="mx-auto w-full max-w-[480px]">
                <Field
                  label="Companion name"
                  hint="This is how they appear in chat and in your companions list."
                >
                  <Input
                    type="text"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Mira"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canProceed) goNext();
                    }}
                  />
                </Field>
                {error ? <Notice tone="danger">{error}</Notice> : null}
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-rows-1 gap-6 px-7 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:gap-8">
              <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain pb-2 pr-1 scrollbar-thin">
                <div className="lg:hidden">
                  <CompanionAvatarPreview
                    model={previewModel}
                    companionName={name}
                    vibeLabel={selectedVibePack?.title}
                    thumbnailUrl={previewThumbnailUrl}
                    className="mb-4 h-[180px]"
                  />
                </div>

                {step === 1 ? (
                  <>
                    <p className="mb-3 text-sm text-ink-2">
                      Selected: {lookLabelForModelId(modelId, selectedModel?.type)}
                    </p>
                    <ModelMarketplace
                      compact
                      installedModels={models}
                      selectedId={modelId}
                      onSelect={selectLook}
                      onInstalled={async (model) => {
                        const refreshed = await listModels();
                        setModels(refreshed);
                        selectLook(model.id);
                        setImportMessage(`Installed ${displayNameForModelId(model.id)} and selected it.`);
                      }}
                      onImportLive2D={() => handleImportModel("live2d")}
                      onImportVRM={() => handleImportModel("vrm")}
                      importing={importing}
                    />
                    {importMessage ? (
                      <Notice tone="success" className="mt-3">
                        {importMessage}
                      </Notice>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Field label="Vibe" className="mb-3">
                      <div className="grid grid-cols-2 gap-2">
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

                    <div className="mb-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Relationship" className="mb-0">
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
                      <Field label="Speech style" className="mb-0">
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

                    <Field
                      label="Personality draft"
                      hint="Built from your picks. Edit it if you want something more specific."
                      className="mb-0 min-h-0 flex-1"
                    >
                      {draftEditing ? (
                        <>
                          <Textarea
                            value={personality}
                            onChange={(e) => {
                              setPersonalityTouched(true);
                              setPersonality(e.target.value);
                            }}
                            rows={8}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-3"
                            onClick={() => setDraftEditing(false)}
                          >
                            Done editing
                          </Button>
                        </>
                      ) : (
                        <>
                          <Surface tone="well" elevation="none" className="overflow-hidden">
                            <pre className="max-h-48 min-h-36 overflow-y-auto whitespace-pre-wrap p-4 font-sans text-xs leading-relaxed text-ink-2 scrollbar-thin">
                              {personality}
                            </pre>
                          </Surface>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDraftEditing(true)}
                            >
                              Edit draft
                            </Button>
                            {personalityTouched ? (
                              <>
                                <Pill tone="honey">Edited</Pill>
                                <Button
                                  variant="soft"
                                  size="sm"
                                  leading={<WandIcon className="h-4 w-4" />}
                                  onClick={() => {
                                    setPersonalityTouched(false);
                                    setPersonality(buildCompanionPersonalityDraft(draftInput));
                                  }}
                                >
                                  Regenerate from picks
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </>
                      )}
                    </Field>
                  </>
                )}

                {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
              </div>

              <div className="hidden min-h-0 lg:block">
                <CompanionAvatarPreview
                  model={previewModel}
                  companionName={name}
                  vibeLabel={selectedVibePack?.title}
                  thumbnailUrl={previewThumbnailUrl}
                  className="h-full min-h-0 rounded-panel"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 bg-well/50 px-7 py-5">
          <div>
            {step === 0 ? (
              <Button variant="secondary" size="lg" onClick={resetAndClose}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="lg"
                leading={<BackIcon className="h-4 w-4" />}
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
          </div>
          <div>
            {step < 2 ? (
              <Button
                variant="primary"
                size="lg"
                className="min-w-[160px]"
                trailing={<ChevronRightIcon className="h-4 w-4" />}
                disabled={!canProceed}
                onClick={goNext}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="min-w-[160px]"
                loading={saving}
                disabled={!canProceed}
                onClick={handleCreate}
              >
                Create companion
              </Button>
            )}
          </div>
        </div>
      </Surface>
    </div>
  );
}
