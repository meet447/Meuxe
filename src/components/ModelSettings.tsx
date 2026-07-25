import { useState, useEffect, memo } from "react";
import {
  getExpressions,
  getModelExpressions,
  getSupportedExpressions,
  saveExpressions,
} from "../api/tauri";

interface Props {
  modelId: string;
  onPreviewExpression: (expr: string) => void;
  onSaved?: () => void;
  onClose: () => void;
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
  onClose,
}: Props) {
  const [globalExpressions, setGlobalExpressions] = useState<string[]>([]);
  const [modelExpressions, setModelExpressions] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activePreview, setActivePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId) return;

    getSupportedExpressions()
      .then((exprs) => setGlobalExpressions(exprs.length > 0 ? exprs : FALLBACK_EXPRESSIONS))
      .catch((err) => {
        console.error("Failed to load supported expressions:", err);
        setGlobalExpressions(FALLBACK_EXPRESSIONS);
      });

    // Fetch model's available expressions from the model3.json file
    getModelExpressions(modelId)
      .then((exprs) => {
        setModelExpressions(exprs);
      })
      .catch((err) => {
        console.error("Failed to load model expressions:", err);
        setModelExpressions([]);
      });

    // Get saved mapping
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
    try {
      await saveExpressions(modelId, mapping);
      onSaved?.();
    } catch (err) {
      console.error("Failed to save expressions:", err);
    }
    setSaving(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent relative h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-white z-10">
        <h2 className="text-[16px] font-bold text-slate-800 tracking-tight">Expression Mapping</h2>
        <p className="text-xs text-slate-400 mt-1 font-medium">Model: <span className="text-blue-500">{modelId || "none"}</span></p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {/* Model expressions preview */}
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase mb-3">
            Model Expressions ({modelExpressions.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {modelExpressions.map((expr) => (
              <button
                key={expr}
                onClick={() => handlePreview(expr)}
                className={`text-[13px] px-3 py-1.5 rounded-full font-medium transition-all ${
                  activePreview === expr
                    ? "bg-blue-500 text-white shadow-md shadow-blue-500/20 ring-2 ring-blue-500/30"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
                }`}
              >
                {expr}
              </button>
            ))}
            {modelExpressions.length === 0 && (
              <span className="text-xs text-slate-500 italic bg-slate-50 px-3 py-1.5 rounded-full">No expressions found</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-3 italic flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Click a badge above to preview it on the model
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 w-full" />

        {/* Mapping table */}
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase mb-3">
            Global to Model Mapping
          </div>
          <div className="space-y-2">
            {globalExpressions.map((globalName) => (
              <div
                key={globalName}
                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100 transition-colors hover:bg-slate-50"
              >
                <div className="w-24 shrink-0 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-[13px] text-slate-700 font-semibold capitalize">
                    {globalName}
                  </span>
                </div>
                <span className="text-slate-300 text-sm">{"\u2192"}</span>
                <select
                  value={mapping[globalName] || ""}
                  onChange={(e) => handleMappingChange(globalName, e.target.value)}
                  className="flex-1 bg-white text-slate-700 text-[13px] rounded-xl px-3 py-2 border border-slate-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm shadow-slate-200/20"
                >
                  <option value="">-- select --</option>
                  {modelExpressions.map((expr) => (
                    <option key={expr} value={expr}>
                      {expr}
                    </option>
                  ))}
                </select>
                {/* Preview the mapped expression */}
                {mapping[globalName] && (
                  <button
                    onClick={() => handlePreview(mapping[globalName])}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      activePreview === mapping[globalName]
                        ? "bg-blue-100 text-blue-600"
                        : "bg-white text-slate-400 border border-slate-200 hover:text-blue-500 hover:bg-slate-50"
                    }`}
                    title="Preview this expression"
                  >
                    {"\u25B6"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 bg-white/80 backdrop-blur-md border-t border-slate-100/80 flex gap-3 z-10">
        <button
          onClick={onClose}
          className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 rounded-2xl text-[14px] font-semibold shadow-sm transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white shadow-md shadow-blue-500/20 rounded-2xl px-5 py-3 text-[14px] font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          {saving ? "Saving..." : "Save Mapping"}
        </button>
      </div>
    </div>
  );
});
