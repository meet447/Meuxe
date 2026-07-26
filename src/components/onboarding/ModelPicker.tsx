import type { PreviewModel } from "./CompanionAvatarPreview";

export function ModelPicker({
  models,
  selectedId,
  onSelect,
}: {
  models: PreviewModel[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const labelFor = (model: PreviewModel) => {
    if (model.id === "haru") return "Haru";
    if (model.id === "utsuwa") return "Utsuwa";
    return model.id;
  };

  const typeLabel = (type: string) => (type === "vrm" ? "3D VRM" : "Live2D");
  if (models.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Using the default avatar. You can add more looks later in Settings.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {models.map((model) => {
        const selected = model.id === selectedId;
        return (
          <button
            key={model.id}
            type="button"
            onClick={() => onSelect(model.id)}
            className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all ${
              selected
                ? "border-indigo-400 bg-indigo-50 text-indigo-800 shadow-sm ring-1 ring-indigo-200/80"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {labelFor(model)}
            <span className="ml-1.5 text-xs font-normal text-slate-400">{typeLabel(model.type)}</span>
          </button>
        );
      })}
    </div>
  );
}
