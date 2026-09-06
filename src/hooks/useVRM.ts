import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { mixamoVRMRigMap } from "../utils/mixamoRigMap";
import { resolveAssetUrl } from "../api/tauri";
import { resolveVrmExpressionName } from "../utils/vrmExpressions";
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

export function useVRM(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
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
  });
  const applyViewportRef = useRef<() => void>(() => undefined);

  // Animation mixer
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clipsRef = useRef<Map<string, THREE.AnimationClip>>(new Map());
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const currentClipNameRef = useRef("");

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

  const disposeSceneResources = useCallback(() => {
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
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    sceneRef.current = null;
    cameraRef.current = null;
    pivotRef.current = null;
    clockRef.current = null;
    mixerRef.current = null;
    clipsRef.current.clear();
    currentActionRef.current = null;
    currentClipNameRef.current = "";
    headBaseRotationRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      disposeSceneResources();
    };
  }, [disposeSceneResources]);

  const applyViewport = useCallback(() => {
    if (!cameraRef.current) return;

    const { zoom, framing, offsetX, offsetY } = viewportRef.current;
    let zIdx = 4.5 / zoom;
    let yPos = 1.3;

    if (framing === "half") {
      zIdx = 2.0 / zoom;
      yPos = 1.5;
    }

    cameraRef.current.position.set(0, yPos, zIdx);

    if (vrmRef.current) {
      vrmRef.current.scene.position.x = offsetX * 0.0025;
      vrmRef.current.scene.position.y = -offsetY * 0.0025;
    }
  }, []);

  const layoutRendererSize = useCallback(() => {
    if (!cameraRef.current || !rendererRef.current || !canvasRef.current) return;
    const w = canvasRef.current.parentElement?.clientWidth || canvasRef.current.clientWidth;
    const h = canvasRef.current.parentElement?.clientHeight || canvasRef.current.clientHeight;
    if (w <= 0 || h <= 0) return;
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
  }, [canvasRef]);

  const syncStageLayout = useCallback(() => {
    layoutRendererSize();
    applyViewport();
  }, [layoutRendererSize, applyViewport]);

  applyViewportRef.current = syncStageLayout;

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
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        applyViewportRef.current();
      });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canvasRef]);

  // Retarget Mixamo FBX animation to VRM skeleton
  const loadVrmaClip = useCallback(async (url: string, vrm: VRM): Promise<THREE.AnimationClip | null> => {
    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await gltfLoader.loadAsync(url);
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
      renderer.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const playAnimation = useCallback((name: string, loop = true, crossFadeDuration = 0.5) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const clip = clipsRef.current.get(name);
    if (!clip) {
      console.warn(`[VRM] Animation "${name}" not found`);
      return;
    }

    const newAction = mixer.clipAction(clip);
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    if (!loop) newAction.clampWhenFinished = true;

    if (currentActionRef.current && currentClipNameRef.current !== name) {
      // Cross-fade from current to new
      currentActionRef.current.fadeOut(crossFadeDuration);
      newAction.reset().fadeIn(crossFadeDuration).play();
    } else if (!currentActionRef.current) {
      newAction.reset().play();
    }

    currentActionRef.current = newAction;
    currentClipNameRef.current = name;
    console.log(`[VRM] Playing animation: "${name}"`);
  }, []);

  const loadModel = useCallback(
    async (modelPath: string, animations?: AnimationInfo[]) => {
      if (!canvasRef.current) return;

      const generation = ++loadGenerationRef.current;

      // Stop animation (invalidate any in-flight RAF loop)
      loopGenerationRef.current += 1;
      animatingRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }

      lastErrorRef.current = "";
      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
        vrmRef.current.scene.removeFromParent();
        vrmRef.current = null;
      }
      mixerRef.current = null;
      clipsRef.current.clear();
      currentActionRef.current = null;
      currentClipNameRef.current = "";
      headBaseRotationRef.current = null;
      currentEmotionRef.current = "";
      blinkSchedulerRef.current.reset(Date.now());
      lipSyncDriverRef.current.reset();

      // Create renderer once
      if (!rendererRef.current) {
        const renderer = new THREE.WebGLRenderer({
          canvas: canvasRef.current,
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
        renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        rendererRef.current = renderer;
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
        const canvas = canvasRef.current;
        const camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.1, 20);
        camera.position.set(0, 1.3, 4.5);
        camera.lookAt(0, 1.0, 0);
        cameraRef.current = camera;
      }

      // Load VRM
      const gltfLoader = new GLTFLoader();
      gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

      try {
        const cacheBust = `${modelPath}${modelPath.includes("?") ? "&" : "?"}t=${Date.now()}`;
        const gltf = await gltfLoader.loadAsync(cacheBust);
        const vrm = gltf.userData.vrm as VRM;

        if (generation !== loadGenerationRef.current) {
          if (vrm) {
            VRMUtils.deepDispose(vrm.scene);
          }
          return;
        }

        if (!vrm || !sceneRef.current || !rendererRef.current) {
          console.error("[VRM] Failed to load: scene or renderer destroyed");
          return;
        }

        const version = vrm.meta?.metaVersion === "1" ? "1" : "0";
        vrm.scene.rotation.y = version === "1" ? 0 : Math.PI;
        pivotRef.current?.add(vrm.scene);
        resetOrbitRotation();
        vrmRef.current = vrm;

        // Create animation mixer
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;

        // Load animations (VRMA or Mixamo FBX)
        if (animations && animations.length > 0) {
          const fbxLoader = new FBXLoader();
          await Promise.allSettled(
            animations.map(async (anim) => {
              try {
                const assetUrl = await resolveAssetUrl(anim.path);
                const cacheBustUrl = `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
                const lower = anim.path.toLowerCase();
                let clip: THREE.AnimationClip | null = null;

                if (lower.endsWith(".vrma")) {
                  clip = await loadVrmaClip(cacheBustUrl, vrm);
                } else if (lower.endsWith(".fbx")) {
                  const fbx = await fbxLoader.loadAsync(cacheBustUrl);
                  clip = retargetAnimation(fbx, vrm, anim.name);
                }

                if (clip) {
                  clipsRef.current.set(anim.name, clip);
                  console.log(`[VRM] Loaded animation: "${anim.name}" (${clip.duration.toFixed(1)}s)`);
                }
              } catch (err) {
                console.warn(`[VRM] Failed to load animation "${anim.name}":`, err);
              }
            })
          );

          const idleNames = ["idle", "breathingidle", "breathing_idle", "standing", "default"];
          let matchFound = false;
          for (const name of idleNames) {
            for (const k of clipsRef.current.keys()) {
              if (k.toLowerCase().includes(name)) {
                playAnimation(k);
                matchFound = true;
                break;
              }
            }
            if (matchFound) break;
          }
          if (!currentActionRef.current && clipsRef.current.size > 0) {
            playAnimation(clipsRef.current.keys().next().value!);
          }
        }

        if (generation !== loadGenerationRef.current) {
          VRMUtils.deepDispose(vrm.scene);
          vrm.scene.removeFromParent();
          vrmRef.current = null;
          return;
        }

        clockRef.current = new THREE.Clock();

        availableExpressionsRef.current = Object.keys(vrm.expressionManager?.expressionMap || {});
        availableMotionGroupsRef.current = [...clipsRef.current.keys()];

        console.log("[VRM] Model loaded:", modelPath);
        console.log("[VRM] Expressions:", availableExpressionsRef.current);
        console.log("[VRM] Animations:", availableMotionGroupsRef.current);

        applyViewportRef.current();
        startAnimationLoop();
      } catch (err) {
        lastErrorRef.current = err instanceof Error ? err.message : String(err);
        console.error("[VRM] Failed to load model:", err);
      }
    },
    [canvasRef, startAnimationLoop, retargetAnimation, playAnimation, resetOrbitRotation, loadVrmaClip]
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
    if (!vrm?.expressionManager) return;

    const preset = resolveVrmExpressionName(expressionName, availableExpressionsRef.current);
    currentEmotionRef.current = preset;
    applyEmotion(vrm, preset);

    // Try to play matching animation if available
    for (const k of clipsRef.current.keys()) {
      if (k.toLowerCase().includes(expressionName.toLowerCase())) {
        playAnimation(k);
        break;
      }
    }

    console.log(`[VRM] Expression: "${expressionName}"${preset && preset !== expressionName ? ` → "${preset}"` : ""}`);
  }, [playAnimation]);

  const startLipSync = useCallback((getAudioLevels?: () => AudioLevels) => {
    lipSyncActiveRef.current = true;
    speakingRef.current = true;
    speakStartRef.current = Date.now();
    headBaseRotationRef.current = null;
    if (getAudioLevels) audioLevelsGetterRef.current = getAudioLevels;

    // Play talking animation if available
    for (const k of clipsRef.current.keys()) {
      if (k.toLowerCase().includes("talk")) {
        playAnimation(k);
        break;
      }
    }
  }, [playAnimation]);

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

    // Return to idle animation
    const idleNames = ["idle", "breathingidle", "breathing_idle", "standing", "default"];
    let matchFound = false;
    for (const name of idleNames) {
      for (const k of clipsRef.current.keys()) {
        if (k.toLowerCase().includes(name)) {
          playAnimation(k);
          matchFound = true;
          break;
        }
      }
      if (matchFound) break;
    }
  }, [playAnimation]);

  const setViewport = useCallback((zoom: number, framing: "full" | "half", offsetX: number = 0, offsetY: number = 0) => {
    viewportRef.current = { zoom, framing, offsetX, offsetY };
    syncStageLayout();
  }, [syncStageLayout]);

  const setTypingReaction = useCallback((_isTyping: boolean) => {
    // Handled by the animation system: no manual bone manipulation needed
  }, []);

  return {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    setViewport,
    setTypingReaction,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endPointerDrag,
    handlePointerCancel: endPointerDrag,
  };
}
