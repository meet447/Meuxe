import { useRef, useEffect, useState, memo } from "react";
import { useVRM } from "../hooks/useVRM";
import type { AnimationInfo } from "../types";
import { LoadingOverlay } from "./LoadingOverlay";
import { wheelZoomFactor, type WebKitGestureEventLike } from "../lib/vrmCursorZoom";

interface Props {
  modelPath: string | null;
  animations?: AnimationInfo[];
  expression: string;
  speaking: boolean;
  userTyping: boolean;
  uiMode?: "full" | "mini";
  background: string;
  zoom: number;
  framing: "full" | "half";
  wheelZoom?: boolean;
  /** Increment to re-center pan and apply the current zoom (Settings → Reset zoom). */
  viewResetTick?: number;
  onZoomChange?: (zoom: number) => void;
  onFramingChange?: (framing: "full" | "half") => void;
  onBackgroundChange?: (bg: string) => void;
  getAudioLevels?: () => { volume: number; mouthOpen: number; mouthForm: number };
}

export const VRMCanvas = memo(function VRMCanvas({
  modelPath,
  animations,
  expression,
  speaking,
  userTyping,
  uiMode = "full",
  background,
  zoom,
  framing,
  wheelZoom = true,
  viewResetTick = 0,
  onZoomChange,
  getAudioLevels,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    setViewport,
    zoomAtClientPoint,
    resetPan,
    setTypingReaction,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    lastError,
  } = useVRM(canvasRef, containerRef);
  const prevExpression = useRef<string>("");
  const expressionRef = useRef(expression);
  expressionRef.current = expression;
  const loadModelRef = useRef(loadModel);
  loadModelRef.current = loadModel;
  const setViewportRef = useRef(setViewport);
  setViewportRef.current = setViewport;
  const zoomAtClientPointRef = useRef(zoomAtClientPoint);
  zoomAtClientPointRef.current = zoomAtClientPoint;
  const setExpressionRef = useRef(setExpression);
  setExpressionRef.current = setExpression;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const echoRef = useRef(new Set<number>());
  const framingRef = useRef(framing);
  const zoomEmitRafRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const [modelLoading, setModelLoading] = useState(false);

  const emitZoom = (nextZoom: number) => {
    pendingZoomRef.current = nextZoom;
    if (zoomEmitRafRef.current !== null) return;
    zoomEmitRafRef.current = requestAnimationFrame(() => {
      zoomEmitRafRef.current = null;
      const value = pendingZoomRef.current;
      if (value === null) return;
      pendingZoomRef.current = null;
      const echo = echoRef.current;
      echo.add(value);
      if (echo.size > 32) echo.clear();
      onZoomChangeRef.current?.(value);
    });
  };

  useEffect(() => {
    if (!modelPath) return;

    let cancelled = false;
    setModelLoading(true);
    loadModelRef.current(modelPath, animations, backgroundRef.current)
      .then(() => {
        if (cancelled) return;
        setViewportRef.current(zoom, framing);
        const expr = expressionRef.current;
        if (expr) {
          prevExpression.current = expr;
          setExpressionRef.current(expr);
        }
      })
      .finally(() => {
        if (!cancelled) setModelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modelPath, animations]);

  useEffect(() => {
    if (expression && expression !== prevExpression.current) {
      prevExpression.current = expression;
      setExpression(expression);
    }
  }, [expression, setExpression]);

  useEffect(() => {
    if (speaking) {
      startLipSync(getAudioLevels);
    } else {
      stopLipSync();
    }
  }, [speaking, startLipSync, stopLipSync, getAudioLevels]);

  useEffect(() => {
    const prevFraming = framingRef.current;
    const isEcho = echoRef.current.delete(zoom);
    framingRef.current = framing;
    if (isEcho && prevFraming === framing) return;
    setViewport(zoom, framing);
  }, [zoom, framing, setViewport]);

  const resetPanRef = useRef(resetPan);
  resetPanRef.current = resetPan;
  const viewRef = useRef({ zoom, framing });
  viewRef.current = { zoom, framing };

  useEffect(() => {
    if (!viewResetTick) return;
    resetPanRef.current();
    const { zoom: nextZoom, framing: nextFraming } = viewRef.current;
    setViewportRef.current(nextZoom, nextFraming);
  }, [viewResetTick]);

  useEffect(() => {
    setTypingReaction(userTyping);
  }, [userTyping, setTypingReaction]);

  useEffect(() => {
    if (!wheelZoom || !modelPath) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastScale = 1;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = wheelZoomFactor(e, canvas.clientHeight);
      const next = zoomAtClientPointRef.current(factor, e.clientX, e.clientY);
      if (next !== null) emitZoom(next);
    };

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = (e as WebKitGestureEventLike).scale || 1;
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as WebKitGestureEventLike;
      const factor = lastScale === 0 ? 1 : g.scale / lastScale;
      lastScale = g.scale;
      const next = zoomAtClientPointRef.current(factor, g.clientX, g.clientY);
      if (next !== null) emitZoom(next);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("gesturestart", onGestureStart, { passive: false });
    canvas.addEventListener("gesturechange", onGestureChange, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("gesturestart", onGestureStart);
      canvas.removeEventListener("gesturechange", onGestureChange);
      if (zoomEmitRafRef.current !== null) {
        cancelAnimationFrame(zoomEmitRafRef.current);
        zoomEmitRafRef.current = null;
      }
    };
  }, [wheelZoom, modelPath]);

  const showMiniUi = uiMode === "mini";

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden" style={{ background }}>
      <LoadingOverlay
        visible={modelLoading}
        message="Loading VRM model..."
        subMessage="Please wait"
        variant="model"
      />
      {lastError && !modelLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <p className="text-sm text-ink-2">
            Failed to load VRM: {lastError}
          </p>
        </div>
      )}
      {!modelPath && !showMiniUi && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <div>
            <p className="text-lg font-medium text-ink-2">No VRM model loaded</p>
            <p className="mt-2 text-sm text-ink-3">
              Add a <code className="rounded-[6px] bg-well px-1 font-mono text-[12px] text-ink-2">.vrm</code> file to <code className="rounded-[6px] bg-well px-1 font-mono text-[12px] text-ink-2">models/vrm/</code>
            </p>
          </div>
        </div>
      )}
      {!modelPath && showMiniUi && (
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <p className="text-lg text-ink-3">No VRM model loaded</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full cursor-grab active:cursor-grabbing"
        style={{
          display: modelPath ? "block" : "none",
          touchAction: "none",
          transform: "translateZ(0)",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </div>
  );
});
