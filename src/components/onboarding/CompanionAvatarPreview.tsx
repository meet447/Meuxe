import { lazy, Suspense, useEffect, useState } from "react";
import { resolveAssetUrl } from "../../api/tauri";
import { BG_PRESETS } from "../../constants/bgPresets";

const Live2DCanvas = lazy(() =>
  import("../Live2DCanvas").then((m) => ({ default: m.Live2DCanvas })),
);
const VRMCanvas = lazy(() => import("../VRMCanvas").then((m) => ({ default: m.VRMCanvas })));

export interface PreviewModel {
  id: string;
  type: string;
  path: string;
  animations?: { name: string; path: string }[];
}

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
      className="relative w-full overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-slate-900 shadow-lg shadow-slate-900/10 aspect-[4/5] max-h-[min(440px,52vh)]"
    >
      {companionName?.trim() && (
        <div className="absolute left-3 top-3 z-10 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {companionName.trim()}
        </div>
      )}
      {vibeLabel && (
        <div className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {vibeLabel}
        </div>
      )}
      {!model && (
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center text-white/60">
          <span className="text-4xl">🎭</span>
          <p className="text-sm">Your companion will appear here</p>
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
