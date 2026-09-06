import { useRef, useEffect, useState, memo } from "react";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loadModel, setExpression, startLipSync, stopLipSync, setViewport, setTypingReaction } =
    useLive2D(canvasRef);
  const prevModelPath = useRef<string | null>(null);
  const prevExpression = useRef<string>("");
  const expressionRef = useRef(expression);
  expressionRef.current = expression;
  const [modelLoading, setModelLoading] = useState(false);
  const dragOffset = { x: 0, y: 0 };

  useEffect(() => {
    if (modelPath && modelPath !== prevModelPath.current) {
      prevModelPath.current = modelPath;
      setModelLoading(true);
      loadModel(modelPath, modelMapping || undefined).then(() => {
        setViewport(zoom, framing, dragOffset.x, dragOffset.y);
        const expr = expressionRef.current;
        if (expr) {
          prevExpression.current = expr;
          setExpression(expr);
        }
      }).finally(() => setModelLoading(false));
    }
    // Intentionally disabling lint rule - loading state is necessary for model loading UX
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/set-state-syntax-use-give-error-message
  }, [modelPath, modelMapping, loadModel]);

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
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-default"
        style={{ display: modelPath ? "block" : "none", touchAction: "none" }}
      />
    </div>
  );
});
