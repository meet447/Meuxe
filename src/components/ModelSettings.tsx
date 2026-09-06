import { useState, useEffect, memo } from "react";
import {
  getExpressions,
  getModelExpressions,
  getSupportedExpressions,
  saveExpressions,
} from "../api/tauri";
import {
  Button,
  Hint,
  IconButton,
  InfoIcon,
  Pill,
  PlayIcon,
  SectionTitle,
  Select,
  Notice,
} from "./ui";

interface Props {
  modelId: string;
  onPreviewExpression: (expr: string) => void;
  onSaved?: () => void;
}

const FALLBACK_EXPRESSIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "excited",
  "embarrassed",
  "thinking",
  "blush",
  "smirk",
  "scared",
  "disgusted",
];

export const ModelSettings = memo(function ModelSettings({
  modelId,
  onPreviewExpression,
  onSaved,
}: Props) {
  const [globalExpressions, setGlobalExpressions] = useState<string[]>([]);
  const [modelExpressions, setModelExpressions] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId) return;

    getSupportedExpressions()
      .then((exprs) => setGlobalExpressions(exprs.length > 0 ? exprs : FALLBACK_EXPRESSIONS))
      .catch((err) => {
        console.error("Failed to load supported expressions:", err);
        setGlobalExpressions(FALLBACK_EXPRESSIONS);
      });

    getModelExpressions(modelId)
      .then((exprs) => {
        setModelExpressions(exprs);
      })
      .catch((err) => {
        console.error("Failed to load model expressions:", err);
        setModelExpressions([]);
      });

    getExpressions(modelId)
      .then((saved) => {
        setMapping(saved || {});
      })
      .catch(() => setMapping({}));
  }, [modelId]);

  const handlePreview = (expr: string) => {
    setActivePreview(activePreview === expr ? null : expr);
    onPreviewExpression(expr);
  };

  const handleMappingChange = (globalName: string, modelExpr: string) => {
    setMapping((prev) => ({
      ...prev,
      [globalName]: modelExpr,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveExpressions(modelId, mapping);
      onSaved?.();
    } catch (err) {
      console.error("Failed to save expressions:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save expressions. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-3">
        Model: <span className="font-mono text-ink-2">{modelId || "none"}</span>
      </p>

      <div>
        <SectionTitle>Model expressions ({modelExpressions.length})</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {modelExpressions.map((expr) => (
            <button
              key={expr}
              type="button"
              onClick={() => handlePreview(expr)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                activePreview === expr
                  ? "bg-ink text-white shadow-soft"
                  : "bg-well text-ink-2 hover:bg-well-2"
              }`}
            >
              {expr}
            </button>
          ))}
          {modelExpressions.length === 0 && <Pill>No expressions found</Pill>}
        </div>
        <Hint className="mt-3 flex items-center gap-1">
          <InfoIcon className="h-3.5 w-3.5" />
          Click a badge above to preview it on the model
        </Hint>
      </div>

      <div>
        <SectionTitle>Global to model mapping</SectionTitle>
        <div className="space-y-2">
          {globalExpressions.map((globalName) => (
            <div
              key={globalName}
              className="flex items-center gap-3 rounded-card bg-surface-2 p-3 shadow-soft"
            >
              <div className="flex w-24 shrink-0 items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                <span className="text-[13px] font-semibold capitalize text-ink">{globalName}</span>
              </div>
              <span className="text-sm text-ink-4">{"\u2192"}</span>
              <Select
                wrapperClassName="flex-1"
                className="py-2 text-[13px]"
                value={mapping[globalName] || ""}
                onChange={(e) => handleMappingChange(globalName, e.target.value)}
              >
                <option value="">-- select --</option>
                {modelExpressions.map((expr) => (
                  <option key={expr} value={expr}>
                    {expr}
                  </option>
                ))}
              </Select>
              {mapping[globalName] && (
                <IconButton
                  label="Preview"
                  size="sm"
                  variant={activePreview === mapping[globalName] ? "soft" : "secondary"}
                  onClick={() => handlePreview(mapping[globalName])}
                >
                  <PlayIcon className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button variant="primary" fullWidth loading={saving} onClick={handleSave}>
        Save mapping
      </Button>
      {saveError && (
        <Notice tone="danger" className="mt-3">{saveError}</Notice>
      )}
    </div>
  );
});
