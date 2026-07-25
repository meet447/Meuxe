import { BG_PRESETS } from "../../constants/bgPresets";

const STAGE_BACKGROUNDS = [
  { name: "Transparent (match app)", value: "transparent" },
  { name: "Light", value: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 55%, #eef2ff 100%)" },
  ...BG_PRESETS,
];

export function AvatarViewportSettings({
  zoom,
  framing,
  background,
  onZoomChange,
  onFramingChange,
  onBackgroundChange,
}: {
  zoom: number;
  framing: "full" | "half";
  background: string;
  onZoomChange: (zoom: number) => void;
  onFramingChange: (framing: "full" | "half") => void;
  onBackgroundChange: (bg: string) => void;
}) {
  const pct = Math.round(zoom * 100);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 leading-relaxed">
        Adjust how your companion appears on the main screen. Changes apply immediately.
      </p>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Zoom</h3>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onZoomChange(Math.round(Math.max(30, pct - 5)) / 100)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-[4rem] text-center text-lg font-bold text-slate-800">{pct}%</span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.round(Math.min(200, pct + 5)) / 100)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Framing</h3>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onFramingChange("full")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              framing === "full"
                ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            Full body
          </button>
          <button
            type="button"
            onClick={() => onFramingChange("half")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              framing === "half"
                ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            Half body
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Background behind avatar</h3>
        <div className="mt-3 grid gap-2">
          {STAGE_BACKGROUNDS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => onBackgroundChange(preset.value)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                background === preset.value
                  ? "bg-blue-50 text-blue-800 ring-1 ring-blue-200"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div
                className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-slate-200/80"
                style={{
                  background: preset.value === "transparent" ? "#f1f5f9" : preset.value,
                }}
              />
              {preset.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
