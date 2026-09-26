import * as THREE from "three";

export const VRM_ZOOM_MIN = 0.3;
export const VRM_ZOOM_MAX = 2.0;
export const DEFAULT_AVATAR_ZOOM = 1.1;
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
  return framing === "half"
    ? { baseDistance: 2.0, yPos: 1.5, lookY: 1.35 }
    : { baseDistance: 4.5, yPos: 1.3, lookY: 1.0 };
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
const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

export function intersectModelPlane(
  camera: THREE.PerspectiveCamera,
  ndc: { x: number; y: number },
  out: THREE.Vector3,
): THREE.Vector3 | null {
  _raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  return _raycaster.ray.intersectPlane(_plane, out);
}

export function zoomVrmCameraAtPoint(
  camera: THREE.PerspectiveCamera,
  state: VrmViewState,
  ndc: { x: number; y: number },
  factor: number,
): VrmViewState {
  const nextZoom = clampZoom(state.zoom * factor);
  if (nextZoom === state.zoom) return state;
  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  applyVrmCamera(camera, state);
  const beforeHit = intersectModelPlane(camera, ndc, before);
  const zoomed = { ...state, zoom: nextZoom };
  applyVrmCamera(camera, zoomed);
  const afterHit = intersectModelPlane(camera, ndc, after);
  if (!beforeHit || !afterHit) return zoomed;
  const next = {
    ...zoomed,
    panX: clampPan(state.panX + (before.x - after.x)),
    panY: clampPan(state.panY + (before.y - after.y)),
  };
  applyVrmCamera(camera, next);
  return next;
}
