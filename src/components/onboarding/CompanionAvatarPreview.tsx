import { lazy, Suspense, useEffect, useState } from "react";
import { resolveAssetUrl } from "../../api/tauri";
import { BG_PRESETS } from "../../constants/bgPresets";
import { Mascot, Pill } from "../ui";

const Live2DCanvas = lazy(() =>
  import("../Live2DCanvas").then((m) => ({ default: m.Live2DCanvas })),
);
const VRMCanvas = lazy(() => import("../VRMCanvas").then((m) => ({ default: m.VRMCanvas })));

import type { PreviewModel } from "./ModelPicker";

export type { PreviewModel };

const noop = () => undefined;
const previewBg = BG_PRESETS[2].value;

export function CompanionAvatarPreview({
  model,
  companionName,
  vibeLabel,
}: {
  model: PreviewModel | null;
  companionName?: string;
  vibeLabel?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!model?.path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    resolveAssetUrl(model.path)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [model?.path]);

  return (
    <div
      className="squircle relative w-full overflow-hidden rounded-panel shadow-float aspect-[4/5] max-h-[min(440px,52vh)]"
      style={{ background: previewBg }}
    >
      {companionName?.trim() && (
        <div className="absolute left-3 top-3 z-10 rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {companionName.trim()}
        </div>
      )}
      {vibeLabel && (
        <div className="absolute right-3 top-3 z-10">
          <Pill tone="neutral" className="bg-surface-2/90">
            {vibeLabel}
          </Pill>
        </div>
      )}
      {!model && (
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
          <Mascot mood="sleepy" tone="light" className="h-16 w-16" />
          <p className="text-sm text-white/60">Your companion will appear here</p>
        </div>
      )}
      {model && (
        <Suspense
          fallback={
            <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-white/50">
              Loading avatar…
            </div>
          }
        >
          <div className="h-full w-full min-h-[220px]">
            {model.type === "vrm" ? (
              <VRMCanvas
                modelPath={url}
                animations={model.animations}
                expression="neutral"
                speaking={false}
                userTyping={false}
                background={previewBg}
                zoom={1}
                framing="half"
                onZoomChange={noop}
                onFramingChange={noop}
                onBackgroundChange={noop}
                uiMode="mini"
              />
            ) : (
              <Live2DCanvas
                modelPath={url}
                modelMapping={null}
                expression="neutral"
                speaking={false}
                userTyping={false}
                background={previewBg}
                zoom={1}
                framing="half"
                onZoomChange={noop}
                onFramingChange={noop}
                onBackgroundChange={noop}
                uiMode="mini"
              />
            )}
          </div>
        </Suspense>
      )}
    </div>
  );
}
