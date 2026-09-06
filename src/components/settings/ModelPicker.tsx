import { cn } from "../ui/cn";

export interface PreviewModel {
  id: string;
  type: string;
  path: string;
  animations?: { name: string; path: string }[];
}

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
      <p className="text-sm text-ink-3">
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
            className={cn(
              "rounded-control px-4 py-2.5 text-sm font-semibold transition-all",
              selected
                ? "bg-accent-100 text-accent-700 ring-2 ring-accent-300/70"
                : "bg-surface-2 text-ink-2 shadow-soft hover:bg-white hover:text-ink",
            )}
          >
            {labelFor(model)}
            <span className="ml-1.5 text-xs font-normal text-ink-4">{typeLabel(model.type)}</span>
          </button>
        );
      })}
    </div>
  );
}
