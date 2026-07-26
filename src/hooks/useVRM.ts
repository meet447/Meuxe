import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { mixamoVRMRigMap } from "../utils/mixamoRigMap";
import type { AudioLevels } from "./useAudioAnalyser";
import type { AnimationInfo } from "../types";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const ORBIT_ROTATE_SPEED = 0.005;
const ORBIT_PITCH_MIN = -Math.PI / 6;
const ORBIT_PITCH_MAX = Math.PI / 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useVRM(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const pivotRef = useRef<THREE.Group | null>(null);
  const orbitRef = useRef({ yaw: 0, pitch: 0 });
  const dragRef = useRef({ active: false, pointerId: -1, lastX: 0, lastY: 0 });
  const clockRef = useRef<THREE.Clock | null>(null);
  const animFrameRef = useRef<number>(0);
  const animatingRef = useRef(false);
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
  const mouthValueRef = useRef(0);
  const speakingRef = useRef(false);
  const speakStartRef = useRef(0);

  // Debug cache
  const availableExpressionsRef = useRef<string[]>([]);
  const availableMotionGroupsRef = useRef<string[]>([]);
  const lastErrorRef = useRef("");

  // Blinking
  const lastBlinkTimeRef = useRef(Date.now());
  const nextBlinkDelayRef = useRef(2000 + Math.random() * 4000);
  const blinkValueRef = useRef(0);
  const blinkClosingRef = useRef(false);

  useEffect(() => {
    return () => {
      animatingRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

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
    const { yaw, pitch } = orbitRef.current;
    pivot.rotation.order = "YXZ";
    pivot.rotation.y = yaw;
    pivot.rotation.x = pitch;
  }, []);

  const resetOrbitRotation = useCallback(() => {
    orbitRef.current = { yaw: 0, pitch: 0 };
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
            // No rest pose found — use raw values (fallback)
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
    if (animatingRef.current) return;
    animatingRef.current = true;

    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;
    let lastFrameTime = 0;

    const tick = (timestamp: number) => {
      if (!animatingRef.current) return;

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

      // Post-animation arm correction — bring arms down from T-pose
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
      if (!blinkClosingRef.current) {
        if (now - lastBlinkTimeRef.current > nextBlinkDelayRef.current) {
          blinkClosingRef.current = true;
          blinkValueRef.current = 0;
        }
      }
      if (blinkClosingRef.current) {
        blinkValueRef.current += delta * 15;
        if (blinkValueRef.current >= 2) {
          blinkValueRef.current = 0;
          blinkClosingRef.current = false;
          lastBlinkTimeRef.current = now;
          nextBlinkDelayRef.current = Math.random() < 0.2
            ? 150 + Math.random() * 100
            : 2000 + Math.random() * 4000;
        }
      }
      const blinkWeight = blinkValueRef.current <= 1
        ? blinkValueRef.current
        : 2 - blinkValueRef.current;
      vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, blinkWeight);

      // ========== LIP SYNC ==========
      if (lipSyncActiveRef.current) {
        const getter = audioLevelsGetterRef.current;
        if (getter) {
          const levels = getter();
          mouthValueRef.current = lerp(mouthValueRef.current, levels.mouthOpen, 0.4);
          const mouth = mouthValueRef.current;
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
            const elapsed = (now - speakStartRef.current) / 1000;
            head.rotation.y += Math.sin(elapsed * 1.8) * 0.02;
            head.rotation.x += Math.sin(elapsed * 2.3) * 0.015;
          }
        }
      } else {
        mouthValueRef.current = lerp(mouthValueRef.current, 0, 0.3);
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

      // Stop animation
      animatingRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }

      lastErrorRef.current = "";
      // Clean up previous
      if (vrmRef.current) {
        vrmRef.current.scene.removeFromParent();
        vrmRef.current = null;
      }
      mixerRef.current = null;
      clipsRef.current.clear();
      currentActionRef.current = null;
      currentClipNameRef.current = "";

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
        rendererRef.current = renderer;
      }

      // Create scene once
      if (!sceneRef.current) {
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1, 1, 1).normalize();
        scene.add(dirLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-1, 0.5, -1).normalize();
        scene.add(fillLight);

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

        if (!vrm || !sceneRef.current || !rendererRef.current) {
          console.error("[VRM] Failed to load — scene or renderer destroyed");
          return;
        }

        vrm.scene.rotation.y = Math.PI;
        pivotRef.current?.add(vrm.scene);
        resetOrbitRotation();
        vrmRef.current = vrm;

        // Create animation mixer
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;

        // Load FBX animations
        if (animations && animations.length > 0) {
          const fbxLoader = new FBXLoader();
          // Load all animations in parallel
          await Promise.allSettled(
            animations.map(async (anim) => {
              try {
                const fbx = await fbxLoader.loadAsync(anim.path);
                const clip = retargetAnimation(fbx, vrm, anim.name);
                if (clip) {
                  clipsRef.current.set(anim.name, clip);
                  console.log(`[VRM] Loaded animation: "${anim.name}" (${clip.duration.toFixed(1)}s)`);
                }
              } catch (err) {
                console.warn(`[VRM] Failed to load animation "${anim.name}":`, err);
              }
            })
          );

          // Play idle animation if available
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
          // If no idle found, play the first animation
          if (!currentActionRef.current && clipsRef.current.size > 0) {
            playAnimation(clipsRef.current.keys().next().value!);
          }
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
    [canvasRef, startAnimationLoop, retargetAnimation, playAnimation, resetOrbitRotation]
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
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      orbitRef.current.yaw -= dx * ORBIT_ROTATE_SPEED;
      orbitRef.current.pitch = clamp(
        orbitRef.current.pitch - dy * ORBIT_ROTATE_SPEED,
        ORBIT_PITCH_MIN,
        ORBIT_PITCH_MAX
      );
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

    // Reset emotion expressions
    const emotionPresets = [
      VRMExpressionPresetName.Happy, VRMExpressionPresetName.Angry,
      VRMExpressionPresetName.Sad, VRMExpressionPresetName.Relaxed,
      VRMExpressionPresetName.Surprised,
    ];
    for (const preset of emotionPresets) {
      vrm.expressionManager.setValue(preset, 0);
    }

    const nameMap: Record<string, string> = {
      happy: VRMExpressionPresetName.Happy,
      angry: VRMExpressionPresetName.Angry,
      sad: VRMExpressionPresetName.Sad,
      relaxed: VRMExpressionPresetName.Relaxed,
      surprised: VRMExpressionPresetName.Surprised,
      neutral: "",
    };

    const preset = nameMap[expressionName.toLowerCase()] || expressionName;
    if (preset) {
      vrm.expressionManager.setValue(preset, 1);
    }

    // Try to play matching animation if available
    for (const k of clipsRef.current.keys()) {
      if (k.toLowerCase().includes(expressionName.toLowerCase())) {
        playAnimation(k);
        break;
      }
    }

    console.log(`[VRM] Expression: "${expressionName}"`);
  }, [playAnimation]);

  const startLipSync = useCallback((getAudioLevels?: () => AudioLevels) => {
    lipSyncActiveRef.current = true;
    speakingRef.current = true;
    speakStartRef.current = Date.now();
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
    mouthValueRef.current = 0;

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
    // Handled by the animation system — no manual bone manipulation needed
  }, []);

  const triggerMotion = useCallback((_group: string, _index?: number) => {}, []);

  const getDebug = useCallback(() => ({
    modelLoaded: !!vrmRef.current,
    currentEmotion: "",
    expressionId: "",
    motionPlaying: currentClipNameRef.current,
    lipSyncActive: lipSyncActiveRef.current,
    mouthValue: Math.round(mouthValueRef.current * 100) / 100,
    mappingEmotions: [],
    availableExpressions: availableExpressionsRef.current,
    availableMotionGroups: availableMotionGroupsRef.current,
    lastError: lastErrorRef.current,
  }), []);

  return {
    loadModel,
    setExpression,
    startLipSync,
    stopLipSync,
    triggerMotion,
    setViewport,
    setTypingReaction,
    getDebug,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endPointerDrag,
    handlePointerCancel: endPointerDrag,
  };
}
