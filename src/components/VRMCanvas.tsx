import { useRef, useEffect, useState, memo } from "react";
import { useVRM } from "../hooks/useVRM";
import type { AnimationInfo } from "../types";
import { LoadingOverlay } from "./LoadingOverlay";

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
  onZoomChange?: (zoom: number) => void;
  onFramingChange?: (framing: "full" | "half") => void;
  onBackgroundChange?: (bg: string) => void;
  getAudioLevels?: () => { volume: number; mouthOpen: number; mouthForm: number };
  /** Restrict drag rotation to horizontal (yaw) only. */
  orbitYawOnly?: boolean;
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
  getAudioLevels,
  orbitYawOnly = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    setViewport,
    setTypingReaction,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useVRM(canvasRef, { orbitYawOnly });
  const prevModelPath = useRef<string | null>(null);
  const prevExpression = useRef<string>("");
  const [modelLoading, setModelLoading] = useState(false);

  useEffect(() => {
    if (modelPath && modelPath !== prevModelPath.current) {
      prevModelPath.current = modelPath;
      setModelLoading(true);
      loadModel(modelPath, animations).then(() => {
        setViewport(zoom, framing);
      }).finally(() => setModelLoading(false));
    }
    // Intentionally disabling lint rule - loading state is necessary for model loading UX
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [modelPath, animations, loadModel]);

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
    setViewport(zoom, framing);
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
        message="Loading VRM model..."
        subMessage="Please wait"
        variant="model"
      />
      {!modelPath && !showMiniUi && (
        <div className="text-slate-500 text-center px-6">
          <p className="text-lg font-medium">No VRM model loaded</p>
          <p className="text-sm mt-2 text-slate-400">
            Add a <code className="text-slate-600">.vrm</code> file to <code className="text-slate-600">models/vrm/</code>
          </p>
        </div>
      )}
      {!modelPath && showMiniUi && (
        <div className="text-amber-200/50 text-center">
          <p className="text-lg">No VRM model loaded</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ display: modelPath ? "block" : "none", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </div>
  );
});
