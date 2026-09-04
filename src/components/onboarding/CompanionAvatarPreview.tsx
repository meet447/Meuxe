import { lazy, Suspense, useEffect, useState } from "react";
import { resolveAssetUrl } from "../../api/tauri";
import { Mascot } from "../ui";

const Live2DCanvas = lazy(() =>
  import("../Live2DCanvas").then((m) => ({ default: m.Live2DCanvas })),
);
const VRMCanvas = lazy(() => import("../VRMCanvas").then((m) => ({ default: m.VRMCanvas })));

import type { PreviewModel } from "./ModelPicker";

export type { PreviewModel };

const noop = () => undefined;
const previewBg = "#f0f0f2";

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
    <div className="relative h-[180px] w-full overflow-hidden rounded-card bg-well">
      {companionName?.trim() && (
        <div className="absolute left-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink shadow-soft">
          {companionName.trim()}
        </div>
      )}
      {vibeLabel && (
        <div className="absolute right-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink shadow-soft">
          {vibeLabel}
        </div>
      )}
      {!model && (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Mascot mood="sleepy" tone="light" className="h-12 w-12" />
          <p className="text-xs text-ink-3">Your companion will appear here</p>
        </div>
      )}
      {model && (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-ink-3">
              Loading avatar…
            </div>
          }
        >
          <div className="h-full w-full">
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
