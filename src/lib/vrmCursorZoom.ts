import * as THREE from "three";

export const VRM_ZOOM_MIN = 0.3;
export const VRM_ZOOM_MAX = 4.5;
export const DEFAULT_AVATAR_ZOOM = 1.1;
export const VRM_CAMERA_FOV_DEG = 30;
export const ZOOM_FOCUS_START = 1.0;
export const FOCUS_FRAME_MARGIN = 0.8;
/** Hits within this world-Y of the head bone focus on the face, not hair tips. */
export const HEAD_FOCUS_RADIUS = 0.45;
/** Head bone sits above the eyes; drop look-at slightly for a face fill. */
export const FACE_BELOW_HEAD = 0.08;
export const MAX_CAMERA_PAN = 2.0;
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;
export const PINCH_ZOOM_SENSITIVITY = 0.01;
export const MAX_WHEEL_STEP_PX = 100;
const LINE_HEIGHT_PX = 16;

export type VrmFraming = "full" | "half";
export interface VrmViewState {
  zoom: number;
  framing: VrmFraming;
  panX: number;
  panY: number;
}
export interface FramingRig {
  baseDistance: number;
  yPos: number;
  lookY: number;
}
export interface WebKitGestureEventLike extends Event {
  scale: number;
  clientX: number;
  clientY: number;
}

export function framingRig(framing: VrmFraming): FramingRig {
  // Half ignores wheel zoom: a fixed bust crop, a little closer on the face than full body.
  return framing === "half"
    ? { baseDistance: 1.95, yPos: 1.5, lookY: 1.38 }
    : { baseDistance: 4.5, yPos: 1.3, lookY: 1.0 };
}

/** Crop toggle always starts from the load zoom. Half body gets closer in `framingRig`, not from the wheel zoom. */
export function zoomForFraming(framing: VrmFraming): number {
  return framing === "half" ? DEFAULT_AVATAR_ZOOM : DEFAULT_AVATAR_ZOOM;
}
export function clampZoom(zoom: number): number {
  return Math.min(VRM_ZOOM_MAX, Math.max(VRM_ZOOM_MIN, zoom));
}
export function clampPan(v: number): number {
  return Math.min(MAX_CAMERA_PAN, Math.max(-MAX_CAMERA_PAN, v));
}
export function normalizeWheelDeltaPx(deltaY: number, deltaMode: number, viewportHeight: number): number {
  let px = deltaY;
  if (deltaMode === 1) px = deltaY * LINE_HEIGHT_PX;
  else if (deltaMode === 2) px = deltaY * viewportHeight;
  return Math.max(-MAX_WHEEL_STEP_PX, Math.min(MAX_WHEEL_STEP_PX, px));
}
export function wheelZoomFactor(
  e: { deltaY: number; deltaMode: number; ctrlKey: boolean },
  viewportHeight: number,
): number {
  const px = normalizeWheelDeltaPx(e.deltaY, e.deltaMode, viewportHeight);
  const sensitivity = e.ctrlKey ? PINCH_ZOOM_SENSITIVITY : WHEEL_ZOOM_SENSITIVITY;
  return Math.exp(-px * sensitivity);
}
export function clientToNdc(clientX: number, clientY: number, rect: DOMRectReadOnly): { x: number; y: number } {
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: ((clientX - rect.left) / width) * 2 - 1,
    y: -(((clientY - rect.top) / height) * 2 - 1),
  };
}
export function applyVrmCamera(camera: THREE.PerspectiveCamera, s: VrmViewState): void {
  const rig = framingRig(s.framing);
  camera.position.set(s.panX, rig.yPos + s.panY, rig.baseDistance / s.zoom);
  camera.lookAt(s.panX, rig.lookY + s.panY, 0);
  camera.updateMatrixWorld(true);
}

const _raycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();

export function visibleHalfHeightAtModel(framing: VrmFraming, zoom: number): number {
  const rig = framingRig(framing);
  const halfFovRad = (VRM_CAMERA_FOV_DEG / 2) * (Math.PI / 180);
  return (rig.baseDistance / zoom) * Math.tan(halfFovRad);
}

export function focusYForHit(hitY: number, headY: number | null): number {
  if (headY == null) return hitY;
  if (Math.abs(hitY - headY) <= HEAD_FOCUS_RADIUS) {
    return headY - FACE_BELOW_HEAD;
  }
  return hitY;
}

export function raycastVrmHitY(
  camera: THREE.PerspectiveCamera,
  ndc: { x: number; y: number },
  root: THREE.Object3D,
): number | null {
  _ndcVec.set(ndc.x, ndc.y);
  _raycaster.setFromCamera(_ndcVec, camera);
  const hits = _raycaster.intersectObject(root, true);
  return hits[0]?.point.y ?? null;
}

export function zoomVrmTowardHit(
  state: VrmViewState,
  hitY: number | null,
  factor: number,
): VrmViewState {
  if (hitY === null) return state;

  const nextZoom = clampZoom(state.zoom * factor);
  if (nextZoom === state.zoom) return state;

  const lookY = framingRig(state.framing).lookY;
  const target = hitY - lookY;

  let panY = state.panY;
  if (nextZoom > state.zoom) {
    const denom = VRM_ZOOM_MAX - state.zoom;
    const s = denom > 0 ? Math.min(1, Math.max(0, (nextZoom - state.zoom) / denom)) : 1;
    panY = state.panY + (target - state.panY) * s;
    const half = visibleHalfHeightAtModel(state.framing, nextZoom) * FOCUS_FRAME_MARGIN;
    panY = Math.min(target + half, Math.max(target - half, panY));
  } else {
    if (nextZoom <= ZOOM_FOCUS_START || state.zoom <= ZOOM_FOCUS_START) {
      panY = 0;
    } else {
      panY =
        state.panY *
        (nextZoom - ZOOM_FOCUS_START) /
        (state.zoom - ZOOM_FOCUS_START);
    }
  }

  panY = clampPan(panY);
  return { zoom: nextZoom, framing: state.framing, panX: 0, panY };
}
