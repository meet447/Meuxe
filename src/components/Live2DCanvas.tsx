import { useRef, useEffect, useState, memo, useMemo } from "react";
import { useLive2D } from "../hooks/useLive2D";
import type { ModelMapping } from "../types";
import { LoadingOverlay } from "./LoadingOverlay";

interface Props {
  modelPath: string | null;
  modelMapping: ModelMapping | null;
  expression: string;
  speaking: boolean;
  userTyping: boolean;
  uiMode?: "full" | "mini";
  background: string;
  zoom: number;
  framing: "full" | "half";
  onZoomChange?: (zoom: number) => void;
  onFramingChange?: (framing: "full" | "half") => void;
  onBackgroundChange?: (bg: string) => void;
  getAudioLevels?: () => { volume: number; mouthOpen: number; mouthForm: number };
}

export const Live2DCanvas = memo(function Live2DCanvas({
  modelPath,
  modelMapping,
  expression,
  speaking,
  userTyping,
  uiMode = "full",
  background,
  zoom,
  framing,
  getAudioLevels,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { loadModel, setExpression, startLipSync, stopLipSync, setViewport, setTypingReaction } =
    useLive2D(hostRef);
  const prevModelPath = useRef<string | null>(null);
  const prevMappingKey = useRef<string>("");

  // The hook disposes its renderer on unmount; forget what was loaded so a remount
  // (including React StrictMode's simulated one in dev) loads the model again.
  useEffect(() => {
    return () => {
      prevModelPath.current = null;
      prevMappingKey.current = "";
    };
  }, []);
  const prevExpression = useRef<string>("");
  const expressionRef = useRef(expression);
  expressionRef.current = expression;
  const [modelLoading, setModelLoading] = useState(false);
  const dragOffset = { x: 0, y: 0 };
  const mappingKey = useMemo(() => JSON.stringify(modelMapping), [modelMapping]);

  useEffect(() => {
    if (!modelPath) return;

    const pathChanged = modelPath !== prevModelPath.current;
    const mappingChanged = mappingKey !== prevMappingKey.current;
    if (!pathChanged && !mappingChanged) return;

    prevModelPath.current = modelPath;
    prevMappingKey.current = mappingKey;

    let cancelled = false;
    setModelLoading(true);
    loadModel(modelPath, modelMapping || undefined)
      .then(() => {
        if (cancelled) return;
        setViewport(zoom, framing, dragOffset.x, dragOffset.y);
        const expr = expressionRef.current;
        if (expr) {
          prevExpression.current = expr;
          setExpression(expr);
        }
      })
      .finally(() => {
        if (!cancelled) setModelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modelPath, mappingKey, modelMapping, loadModel, setViewport, setExpression, zoom, framing]);

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
    setViewport(zoom, framing, dragOffset.x, dragOffset.y);
  }, [zoom, framing, setViewport]);

  useEffect(() => {
    setTypingReaction(userTyping);
  }, [userTyping, setTypingReaction]);

  const showMiniUi = uiMode === "mini";

  return (
    <div
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ background }}
    >
      <LoadingOverlay
        visible={modelLoading}
        message="Loading model..."
        subMessage="Please wait"
        variant="model"
      />
      {!modelPath && !showMiniUi && (
        <div className="px-6 text-center">
          <p className="text-lg font-medium text-ink-2">No Live2D model loaded</p>
          <p className="mt-2 text-sm text-ink-3">
            Add a model to <code className="rounded-[6px] bg-well px-1 font-mono text-[12px] text-ink-2">models/live2d/</code> and select a character
          </p>
        </div>
      )}
      {!modelPath && showMiniUi && (
        <div className="text-center">
          <p className="text-lg text-ink-3">No Live2D model loaded</p>
        </div>
      )}
      <div
        ref={hostRef}
        className="h-full w-full"
        style={{ display: modelPath ? "block" : "none" }}
      />
    </div>
  );
});
