import { useRef, useCallback, useEffect } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import type { ModelMapping } from "../types";
import type { AudioLevels } from "./useAudioAnalyser";
import {
  createBlinkScheduler,
  createLipSyncDriver,
  speakingHeadSway,
} from "../utils/avatarAnimation";

const LIVE2D_BLINK_MIN_MS = 2000;
const LIVE2D_BLINK_MAX_MS = 6000;
const LIVE2D_BLINK_DURATION_MS = 150;
const LIVE2D_LIP_ATTACK = 0.4;
const LIVE2D_LIP_RELEASE = 0.35;
const LIVE2D_SPEAK_SWAY = {
  xFreq: 1.8,
  xAmp: 2,
  xSecondaryFreq: 3.1,
  xSecondaryAmp: 1,
  yFreq: 2.3,
  yAmp: 1.5,
  ySecondaryFreq: 1.5,
  ySecondaryAmp: 0.8,
  zFreq: 1.2,
  zAmp: 1.5,
};

// Expose PIXI globally for pixi-live2d-display
(window as any).PIXI = PIXI;

const DEFAULT_PARAMS = {
  mouthOpen: "ParamMouthOpenY",
  mouthForm: "ParamMouthForm",
  eyeLeftOpen: "ParamEyeLOpen",
  eyeRightOpen: "ParamEyeROpen",
  breath: "ParamBreath",
  bodyAngleX: "ParamBodyAngleX",
};

export interface DebugInfo {
  modelLoaded: boolean;
  currentEmotion: string;
  expressionId: string;
  motionPlaying: string;
  lipSyncActive: boolean;
  mouthValue: number;
  mappingEmotions: string[];
  availableExpressions: string[];
  availableMotionGroups: string[];
  lastError: string;
}

// Easing functions
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function useLive2D(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const baseScaleRef = useRef(1);
  const modelSizeRef = useRef({ width: 0, height: 0 });
  const mappingRef = useRef<ModelMapping | null>(null);
  const debugRef = useRef<DebugInfo>({
    modelLoaded: false,
    currentEmotion: "",
    expressionId: "",
    motionPlaying: "",
    lipSyncActive: false,
    mouthValue: 0,
    mappingEmotions: [],
    availableExpressions: [],
    availableMotionGroups: [],
    lastError: "",
  });

  // Animation state refs
  const lipSyncActiveRef = useRef(false);
  const lipSyncHandlerRef = useRef<(() => void) | null>(null);
  const idleHandlerRef = useRef<(() => void) | null>(null);
  const speakingHandlerRef = useRef<(() => void) | null>(null);
  const mouthValueRef = useRef(0);
  const mouthTargetRef = useRef(0);
  const lipSyncDriverRef = useRef(
    createLipSyncDriver({ attack: LIVE2D_LIP_ATTACK, release: LIVE2D_LIP_RELEASE })
  );
  const lastToggleRef = useRef(0);
  const breathPhaseRef = useRef(0);
  const breathSpeedRef = useRef(0.03); // Adjustable per emotion
  const audioLevelsGetterRef = useRef<(() => AudioLevels) | null>(null);
  const typingReactionRef = useRef<(() => void) | null>(null);
  const mouseCleanupRef = useRef<(() => void) | null>(null);
  const loadGenerationRef = useRef(0);
  const viewportRef = useRef({
    zoom: 1,
    framing: "full" as "full" | "half",
    offsetX: 0,
    offsetY: 0,
  });
  const applyModelLayoutRef = useRef<() => void>(() => undefined);

  const getParams = useCallback(() => {
    return mappingRef.current?.params || DEFAULT_PARAMS;
  }, []);

  const disposeLive2DResources = useCallback(() => {
    lipSyncActiveRef.current = false;
    mouseCleanupRef.current?.();
    mouseCleanupRef.current = null;

    const model = modelRef.current;
    if (model) {
      if (idleHandlerRef.current) {
        model.internalModel.off("beforeModelUpdate", idleHandlerRef.current);
        idleHandlerRef.current = null;
      }
      if (lipSyncHandlerRef.current) {
        model.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
        lipSyncHandlerRef.current = null;
      }
      if (speakingHandlerRef.current) {
        model.internalModel.off("beforeModelUpdate", speakingHandlerRef.current);
        speakingHandlerRef.current = null;
      }
      if (typingReactionRef.current) {
        model.internalModel.off("beforeModelUpdate", typingReactionRef.current);
        typingReactionRef.current = null;
      }
      model.destroy();
      modelRef.current = null;
      modelSizeRef.current = { width: 0, height: 0 };
    }

    if (appRef.current) {
      appRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
      appRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      disposeLive2DResources();
    };
  }, [disposeLive2DResources]);

  const applyModelLayout = useCallback(() => {
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;

    const parent = canvasRef.current?.parentElement;
    if (parent) {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w > 0 && h > 0) {
        app.renderer.resize(w, h);
      }
    }

    const intrinsicW = modelSizeRef.current.width;
    const intrinsicH = modelSizeRef.current.height;
    if (intrinsicW <= 0 || intrinsicH <= 0) return;

    const scaleX = app.screen.width / intrinsicW;
    const scaleY = app.screen.height / intrinsicH;
    baseScaleRef.current = Math.min(scaleX, scaleY);

    const { zoom, framing, offsetX, offsetY } = viewportRef.current;
    const baseScale = baseScaleRef.current * zoom;
    const screenW = app.screen.width;
    const screenH = app.screen.height;

    let targetScale = baseScale;
    let targetY = screenH / 2 + offsetY;

    if (framing === "half") {
      const halfZoom = 1.65;
      const widthCap = (screenW * 0.96) / intrinsicW;
      targetScale = Math.min(baseScale * halfZoom, widthCap);
      const scaledH = intrinsicH * targetScale;
      const topMargin = screenH * 0.08;
      // Center anchor: align sprite top near top margin so head stays in frame
      targetY = topMargin + scaledH / 2 + offsetY;
    }

    model.scale.set(targetScale);
    model.x = screenW / 2 + offsetX;
    model.y = targetY;
  }, [canvasRef]);

  applyModelLayoutRef.current = applyModelLayout;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        applyModelLayoutRef.current();
      });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canvasRef]);

  // ========================================
  // IDLE ANIMATION SYSTEM
  // ========================================
  const startIdleAnimations = useCallback((model: any) => {
    if (idleHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", idleHandlerRef.current);
    }

    const blinkScheduler = createBlinkScheduler({
      minIntervalMs: LIVE2D_BLINK_MIN_MS,
      maxIntervalMs: LIVE2D_BLINK_MAX_MS,
      durationMs: LIVE2D_BLINK_DURATION_MS,
      doubleBlinkChance: 0.2,
      doubleBlinkGapMinMs: 150,
      doubleBlinkGapMaxMs: 250,
      curve: "ease-hold",
    });
    blinkScheduler.reset(Date.now());

    // Eye saccade state: subtle micro eye movements
    let saccadeX = 0;
    let saccadeY = 0;
    let saccadeTargetX = 0;
    let saccadeTargetY = 0;
    let lastSaccadeTime = Date.now();
    let nextSaccadeDelay = 500 + Math.random() * 2000;

    // Random idle motion state
    let lastIdleMotionTime = Date.now();
    let nextIdleMotionDelay = 8000 + Math.random() * 15000; // 8-23 seconds

    // Body micro-movement
    let bodyTargetX = 0;
    let bodyCurrentX = 0;
    let bodyTargetY = 0;
    let bodyCurrentY = 0;
    let lastBodyShiftTime = Date.now();
    let nextBodyShiftDelay = 3000 + Math.random() * 5000;

    const handler = () => {
      const now = Date.now();
      const coreModel = model.internalModel.coreModel;
      const params = getParams();

      // --- Breathing (speed varies by emotion) ---
      breathPhaseRef.current += breathSpeedRef.current;
      try {
        const breathVal = Math.sin(breathPhaseRef.current) * 0.5 + 0.5;
        coreModel.setParameterValueById(params.breath, breathVal);
      } catch {}

      // --- Body sway (breathing-linked + random shifts) ---
      if (now - lastBodyShiftTime > nextBodyShiftDelay) {
        lastBodyShiftTime = now;
        nextBodyShiftDelay = 3000 + Math.random() * 5000;
        bodyTargetX = (Math.random() - 0.5) * 4; // -2 to 2 degrees
        bodyTargetY = (Math.random() - 0.5) * 3;
      }
      bodyCurrentX = lerp(bodyCurrentX, bodyTargetX, 0.02);
      bodyCurrentY = lerp(bodyCurrentY, bodyTargetY, 0.02);

      try {
        const breathSway = Math.sin(breathPhaseRef.current * 0.7) * 1.5;
        coreModel.setParameterValueById(params.bodyAngleX, bodyCurrentX + breathSway);
        coreModel.setParameterValueById("ParamBodyAngleY", bodyCurrentY);
        coreModel.setParameterValueById("ParamBodyAngleZ", Math.sin(breathPhaseRef.current * 0.3) * 0.5);
      } catch {}

      // --- Eye saccades (micro eye movements when not tracking cursor) ---
      if (now - lastSaccadeTime > nextSaccadeDelay) {
        lastSaccadeTime = now;
        nextSaccadeDelay = 300 + Math.random() * 2000;

        // Small random eye movements
        const intensity = Math.random() < 0.3 ? 0.4 : 0.15; // Occasional bigger glance
        saccadeTargetX = (Math.random() - 0.5) * intensity;
        saccadeTargetY = (Math.random() - 0.5) * intensity * 0.5;
      }
      saccadeX = lerp(saccadeX, saccadeTargetX, 0.15);
      saccadeY = lerp(saccadeY, saccadeTargetY, 0.15);

      try {
        coreModel.addParameterValueById("ParamEyeBallX", saccadeX);
        coreModel.addParameterValueById("ParamEyeBallY", saccadeY);
      } catch {}

      // --- Random blinking with occasional double blinks ---
      const blinkClose = blinkScheduler.update(now);
      if (blinkClose > 0) {
        const eyeOpen = 1 - blinkClose;
        try {
          coreModel.setParameterValueById(params.eyeLeftOpen, eyeOpen);
          coreModel.setParameterValueById(params.eyeRightOpen, eyeOpen);
        } catch {}
      }

      // --- Random idle motions (occasional pose shifts) ---
      if (now - lastIdleMotionTime > nextIdleMotionDelay) {
        lastIdleMotionTime = now;
        nextIdleMotionDelay = 10000 + Math.random() * 20000; // 10-30 seconds

        try {
          // Try to play a random idle or tap motion
          const hasIdle = model.internalModel.motionManager.definitions?.Idle;
          const hasTap = model.internalModel.motionManager.definitions?.TapBody;

          if (hasTap && Math.random() < 0.3) {
            const idx = Math.floor(Math.random() * hasTap.length);
            model.motion("TapBody", idx, 1); // IDLE priority so it doesn't override expressions
          } else if (hasIdle && hasIdle.length > 1) {
            const idx = Math.floor(Math.random() * hasIdle.length);
            model.motion("Idle", idx, 1);
          }
        } catch {}
      }
    };

    idleHandlerRef.current = handler;
    model.internalModel.on("beforeModelUpdate", handler);
  }, [getParams]);

  // ========================================
  // SPEAKING BODY ANIMATION
  // ========================================
  const startSpeakingAnimation = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;

    if (speakingHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", speakingHandlerRef.current);
    }

    const startTime = Date.now();

    const handler = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const coreModel = model.internalModel.coreModel;
      const sway = speakingHeadSway(elapsed, LIVE2D_SPEAK_SWAY);

      try {
        coreModel.addParameterValueById("ParamAngleX", sway.x);
        coreModel.addParameterValueById("ParamAngleY", sway.y);
        coreModel.addParameterValueById("ParamAngleZ", sway.z);
      } catch {}
    };

    speakingHandlerRef.current = handler;
    model.internalModel.on("beforeModelUpdate", handler);
  }, []);

  const stopSpeakingAnimation = useCallback(() => {
    const model = modelRef.current;
    if (!model || !speakingHandlerRef.current) return;

    model.internalModel.off("beforeModelUpdate", speakingHandlerRef.current);
    speakingHandlerRef.current = null;
  }, []);

  // ========================================
  // MODEL LOADING
  // ========================================
  const loadModel = useCallback(
    async (modelPath: string, mapping?: ModelMapping) => {
      if (!canvasRef.current) return;

      const generation = ++loadGenerationRef.current;

      if (mapping) {
        mappingRef.current = mapping;
        debugRef.current.mappingEmotions = [];
      }

      // Clean up previous model
      if (modelRef.current) {
        const oldModel = modelRef.current;
        if ((oldModel as any)._onMouseMove && (oldModel as any)._canvas) {
          (oldModel as any)._canvas.removeEventListener("mousemove", (oldModel as any)._onMouseMove);
        }
        if (idleHandlerRef.current) {
          oldModel.internalModel.off("beforeModelUpdate", idleHandlerRef.current);
          idleHandlerRef.current = null;
        }
        if (lipSyncHandlerRef.current) {
          oldModel.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
          lipSyncHandlerRef.current = null;
          lipSyncActiveRef.current = false;
        }
        if (speakingHandlerRef.current) {
          oldModel.internalModel.off("beforeModelUpdate", speakingHandlerRef.current);
          speakingHandlerRef.current = null;
        }
        if (typingReactionRef.current) {
          oldModel.internalModel.off("beforeModelUpdate", typingReactionRef.current);
          typingReactionRef.current = null;
        }
        if (appRef.current) {
          appRef.current.stage.removeChildren();
        }
        oldModel.destroy();
        modelRef.current = null;
        modelSizeRef.current = { width: 0, height: 0 };
      }

      let app = appRef.current;
      if (!app) {
        app = new PIXI.Application({
          view: canvasRef.current,
          width: canvasRef.current.clientWidth,
          height: canvasRef.current.clientHeight,
          backgroundAlpha: 0,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          resizeTo: canvasRef.current.parentElement || window,
        });
        // Cap PIXI ticker to 30 FPS
        app.ticker.maxFPS = 30;
        appRef.current = app;
      }

      try {
        const cacheBust = `${modelPath}${modelPath.includes("?") ? "&" : "?"}t=${Date.now()}`;
        console.log("[Live2D] Loading from URL:", cacheBust);
        const model = await Live2DModel.from(cacheBust, {
          motionPreload: "IDLE" as any,
        });

        if (generation !== loadGenerationRef.current) {
          model.destroy();
          return;
        }

        modelRef.current = model;

        model.scale.set(1);
        modelSizeRef.current = { width: model.width, height: model.height };

        model.anchor.set(0.5, 0.5);
        model.interactive = true;
        model.buttonMode = true;

        app.stage.addChild(model);
        applyModelLayoutRef.current();

        // Debug info
        debugRef.current.modelLoaded = true;
        const im = model.internalModel;

        const exprPaths = [
          im.motionManager?.expressionManager?.definitions,
          (im.motionManager?.expressionManager as any)?._definitions,
          (im as any).settings?.expressions,
        ];
        let exprDefs: any[] = [];
        for (const p of exprPaths) {
          if (Array.isArray(p) && p.length > 0) { exprDefs = p; break; }
        }
        debugRef.current.availableExpressions = exprDefs.map(
          (d: any) => d.Name || d.name || d.File || d.file || "unnamed"
        );

        const motionPaths = [
          im.motionManager?.definitions,
          (im.motionManager as any)?._definitions,
          (im as any).settings?.motions,
        ];
        let motionDefs: Record<string, any> | null = null;
        for (const p of motionPaths) {
          if (p && typeof p === "object" && Object.keys(p).length > 0) { motionDefs = p; break; }
        }
        debugRef.current.availableMotionGroups = motionDefs ? Object.keys(motionDefs) : [];

        console.log("[Live2D] Model loaded:", modelPath);
        console.log("[Live2D] Expressions:", debugRef.current.availableExpressions);
        console.log("[Live2D] Motion groups:", debugRef.current.availableMotionGroups);

        // Cursor tracking
        const canvas = canvasRef.current;
        const onMouseMove = (e: MouseEvent) => {
          if (!modelRef.current || !canvas) return;
          try {
            const rect = canvas.getBoundingClientRect();
            modelRef.current.focus(e.clientX - rect.left, e.clientY - rect.top);
          } catch {}
        };
        canvas.addEventListener("mousemove", onMouseMove);
        mouseCleanupRef.current = () => canvas.removeEventListener("mousemove", onMouseMove);
        (model as any)._onMouseMove = onMouseMove;
        (model as any)._canvas = canvas;

        // Click interaction
        model.on("hit", (hitAreas: string[]) => {
          if (hitAreas.length > 0) {
            try {
              const defs = model.internalModel.motionManager.definitions;
              if (defs?.TapBody) {
                const idx = Math.floor(Math.random() * defs.TapBody.length);
                model.motion("TapBody", idx, 3);
              }
            } catch {}
          }
        });

        // Start idle system
        startIdleAnimations(model);
      } catch (err) {
        console.error("Failed to load Live2D model:", err);
      }
    },
    [canvasRef, startIdleAnimations]
  );

  // ========================================
  // EXPRESSION + EMOTION-DRIVEN ANIMATION
  // ========================================
  const setExpression = useCallback((expressionName: string) => {
    const model = modelRef.current;
    if (!model) return;

    debugRef.current.currentEmotion = expressionName;
    debugRef.current.expressionId = expressionName;

    // Adjust breathing speed based on emotion intensity
    const fastEmotions = ["excited", "angry", "surprised", "生气"];
    const slowEmotions = ["sad", "thinking", "伤心"];
    const name = expressionName.toLowerCase();

    if (fastEmotions.some(e => name.includes(e))) {
      breathSpeedRef.current = 0.06; // Fast breathing
    } else if (slowEmotions.some(e => name.includes(e))) {
      breathSpeedRef.current = 0.02; // Slow, deep breathing
    } else {
      breathSpeedRef.current = 0.03; // Normal
    }

    // Set the expression (match the model's registered name, not just the requested string)
    const available = debugRef.current.availableExpressions;
    const resolved =
      available.find((item) => item.toLowerCase() === expressionName.toLowerCase()) ??
      expressionName;
    try {
      model.expression(resolved);
      console.log(`[Live2D] Expression: "${resolved}"`);
    } catch (e) {
      debugRef.current.lastError = `Expression "${resolved}" failed: ${e}`;
      try { model.expression(0); } catch {}
    }

    // Emotion-driven body reaction (brief)
    try {
      const coreModel = model.internalModel.coreModel;
      if (fastEmotions.some(e => name.includes(e))) {
        // Quick body jolt for surprise/excitement
        coreModel.addParameterValueById("ParamAngleX", (Math.random() - 0.5) * 8);
        coreModel.addParameterValueById("ParamAngleY", 5);
      } else if (slowEmotions.some(e => name.includes(e))) {
        // Slight head drop for sad/thinking
        coreModel.addParameterValueById("ParamAngleY", -3);
      }
    } catch {}

    // Eyebrow reaction
    try {
      const coreModel = model.internalModel.coreModel;
      if (fastEmotions.some(e => name.includes(e))) {
        coreModel.setParameterValueById("ParamBrowLY", 0.5);
        coreModel.setParameterValueById("ParamBrowRY", 0.5);
      } else if (slowEmotions.some(e => name.includes(e))) {
        coreModel.setParameterValueById("ParamBrowLY", -0.5);
        coreModel.setParameterValueById("ParamBrowRY", -0.5);
      }
    } catch {}
  }, []);

  // ========================================
  // LIP SYNC (audio-driven or fallback)
  // ========================================
  const startLipSync = useCallback((getAudioLevels?: () => AudioLevels) => {
    const model = modelRef.current;
    if (!model) return;

    if (lipSyncHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
    }

    lipSyncActiveRef.current = true;
    debugRef.current.lipSyncActive = true;
    lipSyncDriverRef.current.reset();
    mouthValueRef.current = 0;
    mouthTargetRef.current = 0;

    if (getAudioLevels) {
      audioLevelsGetterRef.current = getAudioLevels;
    }

    // Also start speaking body animation
    startSpeakingAnimation();

    const handler = () => {
      if (!lipSyncActiveRef.current) return;

      const params = getParams();
      const getter = audioLevelsGetterRef.current;

      if (getter) {
        const levels = getter();
        mouthValueRef.current = lipSyncDriverRef.current.update(levels.mouthOpen, 33);
        debugRef.current.mouthValue = Math.round(mouthValueRef.current * 100) / 100;

        try {
          const coreModel = model.internalModel.coreModel;
          coreModel.setParameterValueById(params.mouthOpen, mouthValueRef.current);
          coreModel.setParameterValueById(params.mouthForm, levels.mouthForm * 0.5);
        } catch {}
      } else {
        // Fallback random lip sync
        const now = Date.now();
        if (now - lastToggleRef.current > 80 + Math.random() * 80) {
          lastToggleRef.current = now;
          const r = Math.random();
          if (r < 0.25) mouthTargetRef.current = 0;
          else if (r < 0.5) mouthTargetRef.current = 0.3 + Math.random() * 0.3;
          else mouthTargetRef.current = 0.6 + Math.random() * 0.4;
        }
        mouthValueRef.current += (mouthTargetRef.current - mouthValueRef.current) * 0.35;
        debugRef.current.mouthValue = Math.round(mouthValueRef.current * 100) / 100;

        try {
          const coreModel = model.internalModel.coreModel;
          coreModel.setParameterValueById(params.mouthOpen, mouthValueRef.current);
        } catch {}
      }
    };

    lipSyncHandlerRef.current = handler;
    model.internalModel.on("beforeModelUpdate", handler);
  }, [getParams, startSpeakingAnimation]);

  const stopLipSync = useCallback(() => {
    lipSyncActiveRef.current = false;
    debugRef.current.lipSyncActive = false;
    debugRef.current.mouthValue = 0;
    lipSyncDriverRef.current.reset();
    mouthValueRef.current = 0;
    mouthTargetRef.current = 0;
    audioLevelsGetterRef.current = null;

    stopSpeakingAnimation();

    const model = modelRef.current;
    if (!model) return;

    if (lipSyncHandlerRef.current) {
      model.internalModel.off("beforeModelUpdate", lipSyncHandlerRef.current);
      lipSyncHandlerRef.current = null;
    }

    try {
      const params = getParams();
      const coreModel = model.internalModel.coreModel;
      coreModel.setParameterValueById(params.mouthOpen, 0);
      coreModel.setParameterValueById(params.mouthForm, 0);
    } catch {}
  }, [getParams, stopSpeakingAnimation]);

  // ========================================
  // OTHER CONTROLS
  // ========================================
  const setViewport = useCallback((zoom: number, framing: "full" | "half", offsetX: number = 0, offsetY: number = 0) => {
    viewportRef.current = { zoom, framing, offsetX, offsetY };
    applyModelLayout();
  }, [applyModelLayout]);

  // Typing awareness
  const setTypingReaction = useCallback((isTyping: boolean) => {
    const model = modelRef.current;
    if (!model) return;

    if (typingReactionRef.current) {
      model.internalModel.off("beforeModelUpdate", typingReactionRef.current);
      typingReactionRef.current = null;
    }

    if (isTyping) {
      const startTime = Date.now();
      const handler = () => {
        try {
          const elapsed = (Date.now() - startTime) / 1000;
          const coreModel = model.internalModel.coreModel;
          // Curious head tilt + slight lean
          coreModel.setParameterValueById("ParamAngleZ", Math.sin(elapsed * 2) * 5 + 5);
          coreModel.setParameterValueById("ParamAngleY", 3);
          // Eyebrows up slightly (curious)
          coreModel.setParameterValueById("ParamBrowLY", 0.3);
          coreModel.setParameterValueById("ParamBrowRY", 0.3);
        } catch {}
      };
      typingReactionRef.current = handler;
      model.internalModel.on("beforeModelUpdate", handler);
    } else {
      try {
        const coreModel = model.internalModel.coreModel;
        coreModel.setParameterValueById("ParamAngleZ", 0);
        coreModel.setParameterValueById("ParamAngleY", 0);
        coreModel.setParameterValueById("ParamBrowLY", 0);
        coreModel.setParameterValueById("ParamBrowRY", 0);
      } catch {}
    }
  }, []);

  return {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    setViewport,
    setTypingReaction,
  };
}
