import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  clampZoom,
  wheelZoomFactor,
  zoomVrmCameraAtPoint,
  clientToNdc,
  applyVrmCamera,
  intersectModelPlane,
  MAX_CAMERA_PAN,
  VRM_ZOOM_MAX,
} from "./vrmCursorZoom";

describe("vrmCursorZoom", () => {
  it("clampZoom bounds and passthrough", () => {
    expect(clampZoom(0.1)).toBe(0.3);
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(1.1)).toBe(1.1);
  });

  it("wheelZoomFactor", () => {
    const zoomOut = wheelZoomFactor({ deltaY: 100, deltaMode: 0, ctrlKey: false }, 600);
    expect(zoomOut).toBeLessThan(1);
    expect(zoomOut).toBeGreaterThan(0.8);

    const zoomIn = wheelZoomFactor({ deltaY: -100, deltaMode: 0, ctrlKey: false }, 600);
    expect(zoomIn).toBeGreaterThan(1);

    expect(wheelZoomFactor({ deltaY: 10, deltaMode: 0, ctrlKey: true }, 600)).toBeCloseTo(
      Math.exp(-0.1),
    );

    const mode1 = wheelZoomFactor({ deltaY: 3, deltaMode: 1, ctrlKey: false }, 600);
    const mode0 = wheelZoomFactor({ deltaY: 48, deltaMode: 0, ctrlKey: false }, 600);
    expect(mode1).toBeCloseTo(mode0);

    const huge = wheelZoomFactor({ deltaY: 5000, deltaMode: 0, ctrlKey: false }, 600);
    const capped = wheelZoomFactor({ deltaY: 100, deltaMode: 0, ctrlKey: false }, 600);
    expect(huge).toBeCloseTo(capped);
  });

  function makeCamera() {
    return new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 20);
  }

  it("zoomVrmCameraAtPoint keeps world point under cursor (full, zoom in)", () => {
    const camera = makeCamera();
    const ndc = { x: 0.4, y: -0.3 };
    const state = { zoom: 1, framing: "full" as const, panX: 0, panY: 0 };
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    applyVrmCamera(camera, state);
    intersectModelPlane(camera, ndc, before);
    const next = zoomVrmCameraAtPoint(camera, state, ndc, 1.25);
    applyVrmCamera(camera, next);
    intersectModelPlane(camera, ndc, after);
    expect(before.distanceTo(after)).toBeLessThan(1e-6);
  });

  it("zoomVrmCameraAtPoint keeps world point under cursor (half, zoom out)", () => {
    const camera = makeCamera();
    const ndc = { x: 0.4, y: -0.3 };
    const state = { zoom: 1, framing: "half" as const, panX: 0, panY: 0 };
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    applyVrmCamera(camera, state);
    intersectModelPlane(camera, ndc, before);
    const next = zoomVrmCameraAtPoint(camera, state, ndc, 0.8);
    applyVrmCamera(camera, next);
    intersectModelPlane(camera, ndc, after);
    expect(before.distanceTo(after)).toBeLessThan(1e-6);
  });

  it("center ndc keeps pan at zero", () => {
    const camera = makeCamera();
    const state = { zoom: 1, framing: "full" as const, panX: 0, panY: 0 };
    const next = zoomVrmCameraAtPoint(camera, state, { x: 0, y: 0 }, 1.25);
    expect(next.panX).toBeCloseTo(0);
    expect(next.panY).toBeCloseTo(0);
  });

  it("at max zoom, factor 1.5 returns same state", () => {
    const camera = makeCamera();
    const state = { zoom: VRM_ZOOM_MAX, framing: "full" as const, panX: 0, panY: 0 };
    const next = zoomVrmCameraAtPoint(camera, state, { x: 0.5, y: 0.5 }, 1.5);
    expect(next).toBe(state);
  });

  it("pan stays within MAX_CAMERA_PAN on big off-centre zoom-out", () => {
    const camera = makeCamera();
    const state = { zoom: 1.5, framing: "full" as const, panX: 1.99, panY: 0 };
    const next = zoomVrmCameraAtPoint(camera, state, { x: -0.9, y: 0.8 }, 0.5);
    expect(next.panX).toBeLessThanOrEqual(MAX_CAMERA_PAN);
    expect(next.panX).toBeGreaterThanOrEqual(-MAX_CAMERA_PAN);
  });

  it("clientToNdc maps corners", () => {
    const rect = {
      left: 10,
      top: 20,
      width: 200,
      height: 100,
    } as DOMRectReadOnly;
    expect(clientToNdc(10, 20, rect)).toEqual({ x: -1, y: 1 });
    expect(clientToNdc(210, 120, rect)).toEqual({ x: 1, y: -1 });
  });
});
