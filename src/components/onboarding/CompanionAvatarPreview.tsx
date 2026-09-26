import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { resolveAssetUrl, resolveLive2DModelUrl } from "../../api/tauri";
import { vrmPreviewAnimations } from "../../lib/vrmPreviewAnimations";
import { Mascot } from "../ui";
import { cn } from "../ui/cn";

const Live2DCanvas = lazy(() =>
  import("../Live2DCanvas").then((m) => ({ default: m.Live2DCanvas })),
);
const VRMCanvas = lazy(() => import("../VRMCanvas").then((m) => ({ default: m.VRMCanvas })));

import type { PreviewModel } from "./ModelPicker";

export type { PreviewModel };

const noop = () => undefined;
const previewBg = "#eef1f6";
const CANVAS_MOUNT_DELAY_MS = 300;

export function CompanionAvatarPreview({
  model,
  companionName,
  vibeLabel,
  className,
  thumbnailUrl,
}: {
  model: PreviewModel | null;
  companionName?: string;
  vibeLabel?: string;
  className?: string;
  thumbnailUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const vrmAnimations = useMemo(
    () => (model?.type === "vrm" ? vrmPreviewAnimations(model.animations) : undefined),
    [model],
  );

  useEffect(() => {
    if (!model?.path) {
      setUrl(null);
      setResolveError(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    setCanvasReady(false);
    setResolveError(null);
    setThumbnailFailed(false);
    const resolver = model.type === "live2d" ? resolveLive2DModelUrl : resolveAssetUrl;
    resolver(model.path)
      .then((resolved) => {
        if (cancelled) return;
        setUrl(resolved);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setResolveError(message);
        setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [model?.path, model?.type, model?.id]);

  useEffect(() => {
    setThumbnailFailed(false);
  }, [thumbnailUrl]);

  useEffect(() => {
    if (!model || !url) {
      setCanvasReady(false);
      return;
    }
    setCanvasReady(false);
    const timer = window.setTimeout(() => {
      setCanvasReady(true);
    }, CANVAS_MOUNT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [model?.type, model?.id, url]);

  const showCanvas = Boolean(model && url && canvasReady);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-card bg-well",
        className ?? "h-[180px]",
      )}
    >
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <Mascot mood="sleepy" tone="light" className="h-12 w-12" />
          <p className="text-xs text-ink-3">Pick a look to preview it here</p>
        </div>
      )}
      {model && resolveError && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-ink-2">
          Could not resolve model file: {resolveError}
        </div>
      )}
      {model && !resolveError && (!url || !canvasReady) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">
          Loading avatar…
        </div>
      )}
      {model?.type === "vrm" && thumbnailUrl && showCanvas && !thumbnailFailed && (
        <img
          src={thumbnailUrl}
          alt=""
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-40"
          onError={() => setThumbnailFailed(true)}
        />
      )}
      {showCanvas && (
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">
              Loading avatar…
            </div>
          }
        >
          <div className="absolute inset-0 z-[1]">
            {model!.type === "vrm" ? (
              <VRMCanvas
                key={`vrm-${model!.id}`}
                modelPath={url}
                animations={vrmAnimations}
                expression="neutral"
                speaking={false}
                userTyping={false}
                background={previewBg}
                zoom={0.85}
                framing="full"
                wheelZoom={false}
                onZoomChange={noop}
                onFramingChange={noop}
                onBackgroundChange={noop}
                uiMode="mini"
              />
            ) : (
              <Live2DCanvas
                key={`l2d-${model!.id}`}
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
