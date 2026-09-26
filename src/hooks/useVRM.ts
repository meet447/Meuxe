import { useRef, useCallback, useEffect, useState } from "react";
import * as THREE from "three";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { mixamoVRMRigMap } from "../utils/mixamoRigMap";
import { resolveAssetUrl } from "../api/tauri";
import { withCacheBust } from "../lib/assetUrls";
import { withHtmlImageTextures, patchGltfImageBitmapLoader } from "../lib/gltfTextures";
import { VrmAnimationPlayer } from "../lib/vrmAnimations";
import { ANIMATION_MAPPING_PREFIX } from "../lib/vrmAnimationOptions";
import { resolveVrmExpressionName } from "../utils/vrmExpressions";
import {
  applyVrmCamera,
  clientToNdc,
  focusYForHit,
  raycastVrmHitY,
  zoomVrmTowardHit,
  VRM_CAMERA_FOV_DEG,
  type VrmViewState,
} from "../lib/vrmCursorZoom";
import {
  createBlinkScheduler,
  createLipSyncDriver,
  speakingHeadSway,
} from "../utils/avatarAnimation";
import type { AudioLevels } from "./useAudioAnalyser";
import type { AnimationInfo } from "../types";

const VRM_BLINK_MIN_MS = 2000;
const VRM_BLINK_MAX_MS = 6000;
/** Matches legacy delta * 15 blink ramp (0 → 2 in ~133 ms). */
const VRM_BLINK_DURATION_MS = 2000 / 15;
const VRM_LIP_ATTACK = 0.4;
const VRM_LIP_RELEASE = 0.3;
const VRM_SPEAK_SWAY = {
  yFreq: 1.8,
  yAmp: 0.02,
  xFreq: 2.3,
  xAmp: 0.015,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function isOpaqueBackground(bg: string): boolean {
  const trimmed = bg.trim();
  if (!trimmed || trimmed === "transparent") return false;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) return true;
  const rgba = trimmed.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const parts = rgba[1].split(",").map((s) => s.trim());
    if (parts.length === 4) {
      const alpha = parseFloat(parts[3]);
      return !Number.isNaN(alpha) && alpha >= 1;
    }
    return true;
  }
  return false;
}

const EMOTION_PRESETS = [
  VRMExpressionPresetName.Happy,
  VRMExpressionPresetName.Angry,
  VRMExpressionPresetName.Sad,
  VRMExpressionPresetName.Relaxed,
  VRMExpressionPresetName.Surprised,
];

function applyEmotion(vrm: VRM, expressionName: string) {
  if (!vrm.expressionManager) return;
  for (const preset of EMOTION_PRESETS) {
    vrm.expressionManager.setValue(preset, 0);
  }
  // VRM 0 models often leave Neutral at 1; that blend washes out angry/sad.
  vrm.expressionManager.setValue(VRMExpressionPresetName.Neutral, expressionName ? 0 : 1);
  if (expressionName) {
    vrm.expressionManager.setValue(expressionName, 1);
  }
}

const ORBIT_ROTATE_SPEED = 0.005;
const _headWorld = new THREE.Vector3();

export function useVRM(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef?: React.RefObject<HTMLElement | null>,
) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const pivotRef = useRef<THREE.Group | null>(null);
  const orbitYawRef = useRef(0);
  const dragRef = useRef({ active: false, pointerId: -1, lastX: 0, lastY: 0 });
  const clockRef = useRef<THREE.Clock | null>(null);
  const animFrameRef = useRef<number>(0);
  const animatingRef = useRef(false);
  const loopGenerationRef = useRef(0);
  const loadGenerationRef = useRef(0);
  const viewportRef = useRef({
    zoom: 1,
    framing: "full" as "full" | "half",
    offsetX: 0,
    offsetY: 0,
    panX: 0,
    panY: 0,
  });
  const applyViewportRef = useRef<() => void>(() => undefined);

  // Animation mixer
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationPlayerRef = useRef<VrmAnimationPlayer | null>(null);

  // Lip sync / expression state
  const lipSyncActiveRef = useRef(false);
  const audioLevelsGetterRef = useRef<(() => AudioLevels) | null>(null);
  const speakingRef = useRef(false);
  const speakStartRef = useRef(0);
  const headBaseRotationRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const currentEmotionRef = useRef("");
  const blinkSchedulerRef = useRef(
    createBlinkScheduler({
      minIntervalMs: VRM_BLINK_MIN_MS,
      maxIntervalMs: VRM_BLINK_MAX_MS,
      durationMs: VRM_BLINK_DURATION_MS,
      doubleBlinkChance: 0.2,
      doubleBlinkGapMinMs: 150,
      doubleBlinkGapMaxMs: 250,
      curve: "triangle",
    })
  );
  const lipSyncDriverRef = useRef(
    createLipSyncDriver({ attack: VRM_LIP_ATTACK, release: VRM_LIP_RELEASE })
  );

  // Debug cache
  const availableExpressionsRef = useRef<string[]>([]);
  const availableMotionGroupsRef = useRef<string[]>([]);
  const lastErrorRef = useRef("");
  const [lastError, setLastError] = useState("");

  const disposeSceneResources = useCallback(() => {
    // Abort any in-flight loadModel so it never touches the disposed scene/renderer.
    loadGenerationRef.current += 1;
    loopGenerationRef.current += 1;
    animatingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    if (vrmRef.current) {
      VRMUtils.deepDispose(vrmRef.current.scene);
      vrmRef.current.scene.removeFromParent();
      vrmRef.current = null;
    }

    if (rendererRef.current) {
      // Soft dispose only — forceContextLoss can poison the next WebGL context on
      // software/GL drivers with a low context limit (blank VRM preview after main unmount).
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    sceneRef.current = null;
    cameraRef.current = null;
    pivotRef.current = null;
    clockRef.current = null;
    mixerRef.current = null;
    animationPlayerRef.current?.dispose();
    animationPlayerRef.current = null;
    headBaseRotationRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      disposeSceneResources();
    };
  }, [disposeSceneResources]);

  const applyViewport = useCallback(() => {
    if (!cameraRef.current) return;

    const { offsetX, offsetY } = viewportRef.current;
    applyVrmCamera(cameraRef.current, viewportRef.current);

    if (vrmRef.current) {
      vrmRef.current.scene.position.x = offsetX * 0.0025;
      vrmRef.current.scene.position.y = -offsetY * 0.0025;
    }
  }, []);

  const readCanvasSize = useCallback(() => {
    const container = containerRef?.current ?? canvasRef.current?.parentElement ?? null;
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        return { w: Math.floor(rect.width), h: Math.floor(rect.height) };
      }
    }

    const canvas = canvasRef.current;
    if (!canvas) return { w: 0, h: 0 };
    return {
      w: canvas.clientWidth || 0,
      h: canvas.clientHeight || 0,
    };
  }, [canvasRef, containerRef]);

  const waitForCanvasLayout = useCallback((): Promise<{ w: number; h: number }> => {
    const measure = () => readCanvasSize();

    return new Promise((resolve) => {
      const initial = measure();
      if (initial.w > 0 && initial.h > 0) {
        resolve(initial);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        resolve({ w: 0, h: 0 });
        return;
      }

      console.log("[VRM] Waiting for canvas layout before load…");

      let settled = false;
      const finish = (size: { w: number; h: number }) => {
        if (settled) return;
        settled = true;
        observer?.disconnect();
        resolve(size);
      };

      let observer: ResizeObserver | undefined;
      const parent = canvas.parentElement;
      if (parent) {
        observer = new ResizeObserver(() => {
          const size = measure();
          if (size.w > 0 && size.h > 0) finish(size);
        });
        observer.observe(parent);
        observer.observe(canvas);
      }

      const startedAt = performance.now();
      const LAYOUT_TIMEOUT_MS = 2000;

      const poll = () => {
        const size = measure();
        if (size.w > 0 && size.h > 0) {
          finish(size);
          return;
        }
        if (performance.now() - startedAt >= LAYOUT_TIMEOUT_MS) {
          console.warn("[VRM] Canvas layout wait timed out after 2s; using last measured size");
          finish(size);
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }, [canvasRef, readCanvasSize]);

  const layoutRendererSize = useCallback(() => {
    if (!cameraRef.current || !rendererRef.current || !canvasRef.current) return;
    const { w, h } = readCanvasSize();
    if (w <= 0 || h <= 0) return;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (camera.aspect !== w / h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const size = new THREE.Vector2();
    renderer.getSize(size);
    if (size.x !== w || size.y !== h) {
      // false = don't overwrite CSS; absolute inset-0 + h/w-full owns layout.
      renderer.setSize(w, h, false);
    }
  }, [canvasRef, readCanvasSize]);

  const syncStageLayout = useCallback(() => {
    layoutRendererSize();
    applyViewport();
  }, [layoutRendererSize, applyViewport]);

  applyViewportRef.current = syncStageLayout;

  const resetPan = useCallback(() => {
    viewportRef.current.panX = 0;
    viewportRef.current.panY = 0;
    syncStageLayout();
  }, [syncStageLayout]);

  const applyOrbitRotation = useCallback(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;
    pivot.rotation.y = orbitYawRef.current;
  }, []);

  const resetOrbitRotation = useCallback(() => {
    orbitYawRef.current = 0;
    applyOrbitRotation();
  }, [applyOrbitRotation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        applyViewportRef.current();
      });
    });
    observer.observe(parent);
    observer.observe(canvas);
    // Catch late layout after modal/grid height settles.
    requestAnimationFrame(() => applyViewportRef.current());
    const timeout = window.setTimeout(() => applyViewportRef.current(), 50);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [canvasRef]);

  // Retarget Mixamo FBX animation to VRM skeleton
  const loadVrmaClip = useCallback(async (url: string, vrm: VRM): Promise<THREE.AnimationClip | null> => {
    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await withHtmlImageTextures(() => gltfLoader.loadAsync(url));
    const vrmAnimations = gltf.userData.vrmAnimations as unknown[] | undefined;
    if (!vrmAnimations?.length) {
      return null;
    }
    return createVRMAnimationClip(vrmAnimations[0] as Parameters<typeof createVRMAnimationClip>[0], vrm);
  }, []);

  const retargetAnimation = useCallback(
    (fbxScene: THREE.Group, vrm: VRM, clipName: string): THREE.AnimationClip | null => {
      const clip = fbxScene.animations[0];
      if (!clip) return null;

      const tracks: THREE.KeyframeTrack[] = [];

      // Capture rest pose quaternions from the FBX skeleton
      const restRotations = new Map<string, THREE.Quaternion>();
      fbxScene.traverse((obj) => {
        if ((obj as THREE.Bone).isBone) {
          restRotations.set(obj.name, obj.quaternion.clone());
        }
      });

      clip.tracks.forEach((track) => {
        const splitTrack = track.name.split(".");
        const mixamoName = splitTrack[0];
        const property = splitTrack[1];

        const vrmBoneName = mixamoVRMRigMap[mixamoName];
        if (!vrmBoneName) return;

        const vrmBoneNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as any);
        if (!vrmBoneNode) return;

        // Skip position tracks except for hips
        if (property === "position" && vrmBoneName !== "hips") return;

        if (property === "quaternion") {
          // Get the Mixamo rest pose for this bone
          const restQuat = restRotations.get(mixamoName);

          if (restQuat) {
            // Convert absolute Mixamo rotations to deltas from rest pose,
            // then apply to VRM's identity rest pose
            const restQuatInv = restQuat.clone().invert();
            const values = new Float32Array(track.values.length);

            for (let i = 0; i < track.values.length; i += 4) {
              // Get the animated quaternion
              const animQuat = new THREE.Quaternion(
                track.values[i],
                track.values[i + 1],
                track.values[i + 2],
                track.values[i + 3]
              );

              // Compute delta: delta = restInverse * animated
              const delta = restQuatInv.clone().multiply(animQuat);

              values[i] = delta.x;
              values[i + 1] = delta.y;
              values[i + 2] = delta.z;
              values[i + 3] = delta.w;
            }

            tracks.push(
              new THREE.QuaternionKeyframeTrack(
                `${vrmBoneNode.name}.quaternion`,
                track.times as any,
                values as any
              )
            );
          } else {
            // No rest pose found: use raw values (fallback)
            tracks.push(
              new THREE.QuaternionKeyframeTrack(
                `${vrmBoneNode.name}.quaternion`,
                track.times as any,
                track.values as any
              )
            );
          }
        } else if (property === "position" && vrmBoneName === "hips") {
          // Scale from Mixamo cm to VRM meters
          const scaledValues = new Float32Array(track.values.length);
          for (let i = 0; i < track.values.length; i++) {
            scaledValues[i] = track.values[i] * 0.01;
          }
          tracks.push(
            new THREE.VectorKeyframeTrack(
              `${vrmBoneNode.name}.position`,
              track.times as any,
              scaledValues as any
            )
          );
        }
      });

      if (tracks.length === 0) return null;

      return new THREE.AnimationClip(clipName, clip.duration, tracks);
    },
    []
  );

  const startAnimationLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    const generation = ++loopGenerationRef.current;
    animatingRef.current = true;

    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;
    let lastFrameTime = 0;

    const tick = (timestamp: number) => {
      if (!animatingRef.current || loopGenerationRef.current !== generation) return;

      const elapsed = timestamp - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const vrm = vrmRef.current;
      const clock = clockRef.current;

      if (!renderer || !scene || !camera || !vrm || !clock) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const delta = clock.getDelta();
      const now = Date.now();

      // Update animation mixer
      mixerRef.current?.update(delta);

      // VRMA clips often include expression tracks that zero the face every frame.
      // Re-apply the current emotion after the mixer so the face actually sticks.
      applyEmotion(vrm, currentEmotionRef.current);

      // Post-animation arm correction: bring arms down from T-pose
      // The animation delta may be near-zero for arms in breathing idle,
      // so we blend in a natural resting arm rotation
      if (vrm.humanoid) {
        const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        // Blend arms toward rest position (absolute, not additive)
        if (leftUpperArm) {
          leftUpperArm.rotation.z = lerp(leftUpperArm.rotation.z, 0.6, 0.1);
        }
        if (rightUpperArm) {
          rightUpperArm.rotation.z = lerp(rightUpperArm.rotation.z, -0.6, 0.1);
        }
      }

      // ========== BLINKING ==========
      const blinkWeight = blinkSchedulerRef.current.update(now);
      vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, blinkWeight);

      // ========== LIP SYNC ==========
      const lipDriver = lipSyncDriverRef.current;
      const dtMs = delta * 1000;
      if (lipSyncActiveRef.current) {
        const getter = audioLevelsGetterRef.current;
        if (getter) {
          const levels = getter();
          const mouth = lipDriver.update(levels.mouthOpen, dtMs);
          const form = levels.mouthForm;

          vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, Math.min(1, mouth * Math.max(0, 1 - Math.abs(form)) * 0.8));
          vrm.expressionManager?.setValue(VRMExpressionPresetName.Oh, Math.min(1, mouth * Math.max(0, -form) * 0.6));
          vrm.expressionManager?.setValue(VRMExpressionPresetName.Ee, Math.min(1, mouth * Math.max(0, form) * 0.5));
          vrm.expressionManager?.setValue(VRMExpressionPresetName.Ih, Math.min(1, mouth * 0.3));
        }

        // Speaking head overlay
        if (speakingRef.current) {
          const head = vrm.humanoid?.getNormalizedBoneNode("head");
          if (head) {
            if (!headBaseRotationRef.current) {
              headBaseRotationRef.current = {
                x: head.rotation.x,
                y: head.rotation.y,
                z: head.rotation.z,
              };
            }
            const elapsed = (now - speakStartRef.current) / 1000;
            const base = headBaseRotationRef.current;
            const sway = speakingHeadSway(elapsed, VRM_SPEAK_SWAY);
            head.rotation.y = base.y + sway.y;
            head.rotation.x = base.x + sway.x;
          }
        }
      } else {
        lipDriver.update(0, dtMs);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, 0);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Oh, 0);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Ee, 0);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Ih, 0);
      }

      vrm.update(delta);
      // Keep picking up late modal/grid layout after h-full settles.
      applyViewportRef.current();
      renderer.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const loadModel = useCallback(
    async (modelPath: string, animations?: AnimationInfo[], background = "transparent") => {
      if (!canvasRef.current) return;

      const generation = ++loadGenerationRef.current;

      const layout = await waitForCanvasLayout();
      if (generation !== loadGenerationRef.current) return;
      console.log(`[VRM] Load starting (${layout.w}x${layout.h}):`, modelPath);
      if (layout.w <= 0 || layout.h <= 0) {
        const message = "Canvas has zero size";
        lastErrorRef.current = message;
        setLastError(message);
        console.warn("[VRM] Load aborted:", message);
        return;
      }

      // Stop animation (invalidate any in-flight RAF loop)
      loopGenerationRef.current += 1;
      animatingRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }

      lastErrorRef.current = "";
      setLastError("");
      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
        vrmRef.current.scene.removeFromParent();
        vrmRef.current = null;
      }
      mixerRef.current = null;
      animationPlayerRef.current?.dispose();
      animationPlayerRef.current = null;
      headBaseRotationRef.current = null;
      currentEmotionRef.current = "";
      blinkSchedulerRef.current.reset(Date.now());
      lipSyncDriverRef.current.reset();

      const opaqueBg = isOpaqueBackground(background);

      // Create renderer once
      if (!rendererRef.current) {
        try {
          const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            alpha: !opaqueBg,
            antialias: false,
            powerPreference: "low-power",
          });
          if (!renderer.getContext()) {
            const message = "WebGL context unavailable";
            lastErrorRef.current = message;
            setLastError(message);
            return;
          }
          const { w, h } = readCanvasSize();
          renderer.setSize(Math.max(w, 1), Math.max(h, 1), false);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.outputColorSpace = SRGBColorSpace;
          renderer.toneMapping = ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.15;
          if (opaqueBg) {
            renderer.setClearColor(new THREE.Color(background));
          }
          rendererRef.current = renderer;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          lastErrorRef.current = message;
          setLastError(message);
          return;
        }
      } else if (opaqueBg) {
        rendererRef.current.setClearColor(new THREE.Color(background));
      }

      // Create scene once
      if (!sceneRef.current) {
        const scene = new THREE.Scene();

        // Hemisphere + key/fill (brighter than flat ambient for MToon / VRM on light UI backgrounds)
        const hemi = new THREE.HemisphereLight(0xffffff, 0xfff0e8, 1.5);
        hemi.position.set(0, 1, 0);
        scene.add(hemi);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.75);
        keyLight.position.set(-0.6, 1.4, 1.4);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xeaf2ff, 0.65);
        fillLight.position.set(1.2, 0.5, 1.0);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
        rimLight.position.set(0.2, 0.8, -1.2);
        scene.add(rimLight);

        const pivot = new THREE.Group();
        scene.add(pivot);
        pivotRef.current = pivot;

        sceneRef.current = scene;
      }

      // Create camera once
      if (!cameraRef.current) {
        const { w, h } = readCanvasSize();
        const camera = new THREE.PerspectiveCamera(
          VRM_CAMERA_FOV_DEG,
          w > 0 && h > 0 ? w / h : 1,
          0.1,
          20,
        );
        camera.position.set(0, 1.3, 4.5);
        camera.lookAt(0, 1.0, 0);
        cameraRef.current = camera;
      }

      // Load VRM
      patchGltfImageBitmapLoader();
      const gltfLoader = new GLTFLoader();
      gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

      try {
        const gltf = await withHtmlImageTextures(() =>
          gltfLoader.loadAsync(withCacheBust(modelPath)),
        );
        const vrm = gltf.userData.vrm as VRM;

        if (generation !== loadGenerationRef.current) {
          if (vrm) {
            VRMUtils.deepDispose(vrm.scene);
          }
          return;
        }

        if (!vrm || !sceneRef.current || !rendererRef.current) {
          const message = "Failed to load: scene or renderer destroyed";
          console.error(`[VRM] ${message}`);
          lastErrorRef.current = message;
          setLastError(message);
          return;
        }

        const version = vrm.meta?.metaVersion === "1" ? "1" : "0";
        vrm.scene.rotation.y = version === "1" ? 0 : Math.PI;
        pivotRef.current?.add(vrm.scene);
        resetOrbitRotation();
        resetPan();
        vrmRef.current = vrm;

        // Create animation mixer
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;
        const animationPlayer = new VrmAnimationPlayer(mixer);
        animationPlayer.setSpeaking(speakingRef.current);
        animationPlayerRef.current = animationPlayer;

        clockRef.current = new THREE.Clock();
        availableExpressionsRef.current = Object.keys(vrm.expressionManager?.expressionMap || {});
        availableMotionGroupsRef.current = [];

        // Paint the mesh immediately; load clips in the background so preview/main
        // aren't blocked on large VRMA batches (utsuwa ships many files).
        applyViewportRef.current();
        startAnimationLoop();

        if (animations && animations.length > 0) {
          const fbxLoader = new FBXLoader();
          void Promise.allSettled(
            animations.map(async (anim) => {
              try {
                const assetUrl = await resolveAssetUrl(anim.path);
                const animUrl = withCacheBust(assetUrl);
                const lower = anim.path.toLowerCase();
                let clip: THREE.AnimationClip | null = null;

                if (lower.endsWith(".vrma")) {
                  clip = await loadVrmaClip(animUrl, vrm);
                } else if (lower.endsWith(".fbx")) {
                  const fbx = await fbxLoader.loadAsync(animUrl);
                  clip = retargetAnimation(fbx, vrm, anim.name);
                }

                if (generation !== loadGenerationRef.current || vrmRef.current !== vrm) {
                  return;
                }

                if (clip) {
                  animationPlayer.clips.set(anim.name, clip);
                  availableMotionGroupsRef.current = [...animationPlayer.clips.keys()];
                  console.log(`[VRM] Loaded animation: "${anim.name}" (${clip.duration.toFixed(1)}s)`);
                }
              } catch (err) {
                console.warn(`[VRM] Failed to load animation "${anim.name}":`, err);
              }
            }),
          ).then(() => {
            if (generation !== loadGenerationRef.current || vrmRef.current !== vrm) {
              return;
            }

            animationPlayer.start();
            availableMotionGroupsRef.current = [...animationPlayer.clips.keys()];
            console.log("[VRM] Animations:", availableMotionGroupsRef.current);
          });
        }

        if (generation !== loadGenerationRef.current) {
          VRMUtils.deepDispose(vrm.scene);
          vrm.scene.removeFromParent();
          vrmRef.current = null;
          return;
        }

        console.log("[VRM] Model loaded:", modelPath);
        console.log("[VRM] Expressions:", availableExpressionsRef.current);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lastErrorRef.current = message;
        setLastError(message);
        console.error("[VRM] Failed to load model:", err);
      }
    },
    [
      canvasRef,
      startAnimationLoop,
      retargetAnimation,
      resetOrbitRotation,
      resetPan,
      loadVrmaClip,
      readCanvasSize,
      waitForCanvasLayout,
    ],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!vrmRef.current) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;

      const dx = event.clientX - drag.lastX;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      orbitYawRef.current += dx * ORBIT_ROTATE_SPEED;
      applyOrbitRotation();
    },
    [applyOrbitRotation]
  );

  const endPointerDrag = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    dragRef.current.active = false;
    dragRef.current.pointerId = -1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const setExpression = useCallback((expressionName: string) => {
    const vrm = vrmRef.current;
    if (!vrm) return;

    const preset = expressionName.startsWith(ANIMATION_MAPPING_PREFIX)
      ? "" : resolveVrmExpressionName(expressionName, availableExpressionsRef.current);
    currentEmotionRef.current = preset;
    applyEmotion(vrm, preset);
    animationPlayerRef.current?.setExpression(expressionName);

    console.log(`[VRM] Expression: "${expressionName}"${preset && preset !== expressionName ? ` → "${preset}"` : ""}`);
  }, []);

  const startLipSync = useCallback((getAudioLevels?: () => AudioLevels) => {
    lipSyncActiveRef.current = true;
    speakingRef.current = true;
    speakStartRef.current = Date.now();
    headBaseRotationRef.current = null;
    if (getAudioLevels) audioLevelsGetterRef.current = getAudioLevels;

    animationPlayerRef.current?.setSpeaking(true);
  }, []);

  const stopLipSync = useCallback(() => {
    lipSyncActiveRef.current = false;
    speakingRef.current = false;
    audioLevelsGetterRef.current = null;
    lipSyncDriverRef.current.reset();

    const head = vrmRef.current?.humanoid?.getNormalizedBoneNode("head");
    if (head && headBaseRotationRef.current) {
      head.rotation.x = headBaseRotationRef.current.x;
      head.rotation.y = headBaseRotationRef.current.y;
      head.rotation.z = headBaseRotationRef.current.z;
    }
    headBaseRotationRef.current = null;

    animationPlayerRef.current?.setSpeaking(false);
  }, []);

  const setViewport = useCallback((zoom: number, framing: "full" | "half", offsetX: number = 0, offsetY: number = 0) => {
    const prev = viewportRef.current;
    const framingChanged = prev.framing !== framing;
    viewportRef.current = {
      zoom,
      framing,
      offsetX,
      offsetY,
      panX: framingChanged ? 0 : prev.panX,
      panY: framingChanged ? 0 : prev.panY,
    };
    syncStageLayout();
  }, [syncStageLayout]);

  const zoomAtClientPoint = useCallback(
    (factor: number, clientX: number, clientY: number): number | null => {
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      const vrm = vrmRef.current;
      if (!camera || !canvas || !vrm) return null;

      const ndc = clientToNdc(clientX, clientY, canvas.getBoundingClientRect());
      const { zoom, framing, offsetX, offsetY, panX, panY } = viewportRef.current;
      const viewState: VrmViewState = { zoom, framing, panX, panY };
      applyVrmCamera(camera, viewState);
      const hitY = raycastVrmHitY(camera, ndc, vrm.scene);
      if (hitY === null) return null;
      const head = vrm.humanoid?.getNormalizedBoneNode("head");
      const headY = head ? head.getWorldPosition(_headWorld).y : null;
      const next = zoomVrmTowardHit(viewState, focusYForHit(hitY, headY), factor);
      if (next === viewState) return null;
      viewportRef.current = {
        zoom: next.zoom,
        framing,
        offsetX,
        offsetY,
        panX: 0,
        panY: next.panY,
      };
      syncStageLayout();
      return next.zoom;
    },
    [canvasRef, syncStageLayout],
  );

  const setTypingReaction = useCallback((_isTyping: boolean) => {
    // Handled by the animation system: no manual bone manipulation needed
  }, []);

  return {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    setViewport,
    zoomAtClientPoint,
    resetPan,
    resetOrbit: resetOrbitRotation,
    setTypingReaction,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endPointerDrag,
    handlePointerCancel: endPointerDrag,
    lastError,
  };
}
