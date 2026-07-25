import { useRef, useEffect, useState, memo } from "react";
import { useVRM } from "../hooks/useVRM";
import type { DebugInfo } from "../hooks/useLive2D";
import type { AnimationInfo } from "../types";
import { BG_PRESETS } from "../constants/bgPresets";
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
  onZoomChange: (zoom: number) => void;
  onFramingChange: (framing: "full" | "half") => void;
  onBackgroundChange: (bg: string) => void;
  getAudioLevels?: () => { volume: number; mouthOpen: number; mouthForm: number };
  hideAvatarControls?: boolean;
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
  onZoomChange,
  onFramingChange,
  onBackgroundChange,
  getAudioLevels,
  hideAvatarControls = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loadModel, setExpression, startLipSync, stopLipSync, setViewport, setTypingReaction, getDebug } =
    useVRM(canvasRef);
  const prevModelPath = useRef<string | null>(null);
  const prevExpression = useRef<string>("");
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [showControls, setShowControls] = useState(!hideAvatarControls);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (modelPath && modelPath !== prevModelPath.current) {
      prevModelPath.current = modelPath;
      setModelLoading(true);
      loadModel(modelPath, animations).then(() => {
        setViewport(zoom, framing, dragOffset.x, dragOffset.y);
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
    setViewport(zoom, framing, dragOffset.x, dragOffset.y);
  }, [zoom, framing, dragOffset, setViewport]);

  useEffect(() => {
    setTypingReaction(userTyping);
  }, [userTyping, setTypingReaction]);

  useEffect(() => {
    if (!showDebug) return;
    const interval = setInterval(() => {
      setDebugInfo(getDebug());
    }, 200);
    return () => clearInterval(interval);
  }, [showDebug, getDebug]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!moveMode) return;
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !moveMode) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    setDragOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

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
      {!modelPath && (
        <div className="text-amber-200/50 text-center">
          <p className="text-lg">No VRM model loaded</p>
          <p className="text-sm mt-2">
            Add a <code className="text-amber-300/60">.vrm</code> file to <code className="text-amber-300/60">models/vrm/</code>
          </p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-full ${moveMode ? "cursor-move" : "cursor-pointer"}`}
        style={{ display: modelPath ? "block" : "none", touchAction: "none" }}
      />

      {/* Debug overlay */}
      {!showMiniUi && showDebug && debugInfo && (
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-xs font-mono text-slate-600 rounded-2xl p-4 max-w-sm z-50 space-y-2 shadow-xl ring-1 ring-slate-200/50 pointer-events-none">
          <div className="text-slate-800 font-bold mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
            <span>VRM Debug</span>
            <button onClick={() => setShowDebug(false)} className="text-slate-400 hover:text-slate-600 ml-4 hover:bg-slate-100 rounded-full w-5 h-5 flex items-center justify-center transition-colors">x</button>
          </div>
          <Row label="Model" value={debugInfo.modelLoaded ? "loaded (VRM)" : "none"} ok={debugInfo.modelLoaded} />
          {!debugInfo.modelLoaded && debugInfo.lastError ? (
            <Row label="Load Error" value={debugInfo.lastError} />
          ) : null}
          <Row label="Lip Sync" value={debugInfo.lipSyncActive ? "ON" : "off"} ok={debugInfo.lipSyncActive} />
          <Row label="Mouth Value" value={String(debugInfo.mouthValue)} />
          <div className="pt-1">
            <div className="text-slate-400 font-semibold mb-1">Expressions:</div>
            <div className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md max-h-20 overflow-y-auto">
              {debugInfo.availableExpressions.length > 0
                ? debugInfo.availableExpressions.join(", ")
                : "(none)"}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      {!showMiniUi && !hideAvatarControls && showControls && (
        <div className="absolute bottom-4 left-4 flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowBgPicker(!showBgPicker)}
              className="bg-white/60 hover:bg-white/90 backdrop-blur-md text-slate-600 hover:text-slate-800 rounded-full px-3.5 py-2 text-xs font-semibold transition-all shadow-sm ring-1 ring-slate-200/50"
            >
              BG
            </button>
            {showBgPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowBgPicker(false)} />
                <div className="absolute bottom-full left-0 mb-3 bg-white/95 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-2xl z-50 p-2 w-48 font-medium">
                  <div className="text-xs text-slate-400 px-3 py-1.5 mb-1 uppercase tracking-wider font-bold">Background</div>
                  {BG_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => { onBackgroundChange(preset.value); setShowBgPicker(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                        background === preset.value ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full shadow-inner ring-1 ring-slate-200/50 shrink-0" style={{ background: preset.value }} />
                      {preset.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 bg-white/60 backdrop-blur-md rounded-full px-2 py-1.5 shadow-sm ring-1 ring-slate-200/50">
            <button
              onClick={() => onZoomChange(Math.round(Math.max(30, (zoom * 100) - 1)) / 100)}
              className="text-slate-500 hover:text-slate-800 hover:bg-white rounded-full text-sm w-6 h-6 flex items-center justify-center transition-colors font-medium shadow-sm ring-1 ring-transparent hover:ring-slate-200/50"
            >-</button>
            <span className="text-slate-700 font-semibold text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => onZoomChange(Math.round(Math.min(200, (zoom * 100) + 1)) / 100)}
              className="text-slate-500 hover:text-slate-800 hover:bg-white rounded-full text-sm w-6 h-6 flex items-center justify-center transition-colors font-medium shadow-sm ring-1 ring-transparent hover:ring-slate-200/50"
            >+</button>
          </div>

          {/* Move toggle */}
          <button
            onClick={() => {
              setMoveMode(!moveMode);
              if (moveMode) {
                setDragOffset({ x: 0, y: 0 }); // reset on toggle off
              }
            }}
            className={`backdrop-blur-md rounded-full px-3.5 py-2 text-xs font-bold tracking-wide transition-all shadow-sm ring-1 ${
              moveMode
                ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 ring-indigo-200"
                : "bg-white/60 hover:bg-white/90 text-slate-600 hover:text-slate-800 ring-slate-200/50"
            }`}
          >
            MOVE
          </button>

          <button
            onClick={() => onFramingChange(framing === "full" ? "half" : "full")}
            className={`backdrop-blur-md rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-all shadow-sm ring-1 ${
              framing === "half"
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200 ring-blue-200"
                : "bg-white/60 hover:bg-white/90 text-slate-600 hover:text-slate-800 ring-slate-200/50"
            }`}
          >
            {framing.toUpperCase()}
          </button>

          <button
            onClick={() => setShowDebug(!showDebug)}
            className={`backdrop-blur-md rounded-full px-3.5 py-2 text-xs font-bold tracking-wide transition-all shadow-sm ring-1 ${
              showDebug ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 ring-emerald-200" : "bg-white/60 hover:bg-white/90 text-slate-600 hover:text-slate-800 ring-slate-200/50"
            }`}
          >DBG</button>
        </div>
      )}

      {/* Visibility toggle */}
      {!showMiniUi && !hideAvatarControls && modelPath && !showDebug && (
        <button
          onClick={() => setShowControls(!showControls)}
          className="absolute bottom-4 right-4 bg-white/60 hover:bg-white/90 backdrop-blur-md text-slate-500 hover:text-slate-700 p-2.5 rounded-full ring-1 ring-slate-200/50 shadow-sm transition-all"
          title={showControls ? "Hide Controls" : "Show Controls"}
        >
          {showControls ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          )}
        </button>
      )}
    </div>
  );
});

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between gap-3 items-center text-sm">
      <span className="text-slate-500 font-medium">{label}:</span>
      <span className={`font-semibold bg-slate-50 px-2 py-0.5 rounded-md ${ok !== undefined ? (ok ? "text-emerald-600" : "text-rose-500") : "text-slate-700"}`}>{value}</span>
    </div>
  );
}
