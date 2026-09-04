import { BG_PRESETS } from "../../constants/bgPresets";
import { ChoiceCard, IconButton, MinusIcon, PlusIcon, SectionTitle, Surface } from "../ui";

const STAGE_BACKGROUNDS = [
  { name: "Transparent (match app)", value: "transparent" },
  { name: "Light", value: "#f8fafc" },
  ...BG_PRESETS,
];

export function AvatarViewportSettings({
  zoom,
  background,
  onZoomChange,
  onBackgroundChange,
}: {
  zoom: number;
  background: string;
  onZoomChange: (zoom: number) => void;
  onBackgroundChange: (bg: string) => void;
}) {
  const pct = Math.round(zoom * 100);

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-2">
        Use the framing button in the left sidebar to switch between full and half body.
      </p>

      <Surface tone="raised" className="p-5">
        <SectionTitle>Zoom</SectionTitle>
        <div className="flex items-center gap-3">
          <IconButton
            label="Zoom out"
            variant="secondary"
            onClick={() => onZoomChange(Math.round(Math.max(30, pct - 5)) / 100)}
          >
            <MinusIcon className="h-4 w-4" />
          </IconButton>
          <span className="min-w-16 text-center text-lg font-bold text-ink">{pct}%</span>
          <IconButton
            label="Zoom in"
            variant="secondary"
            onClick={() => onZoomChange(Math.round(Math.min(200, pct + 5)) / 100)}
          >
            <PlusIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </Surface>

      <Surface tone="raised" className="p-5">
        <SectionTitle>Background behind avatar</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {STAGE_BACKGROUNDS.map((preset) => (
            <ChoiceCard
              key={preset.name}
              compact
              selected={background === preset.value}
              onClick={() => onBackgroundChange(preset.value)}
              leading={
                preset.value === "transparent" ? (
                  <span className="h-5 w-5 rounded-full bg-surface ring-1 ring-line-2" />
                ) : (
                  <span className="h-5 w-5 rounded-full" style={{ background: preset.value }} />
                )
              }
              title={preset.name}
            />
          ))}
        </div>
      </Surface>
    </div>
  );
}
