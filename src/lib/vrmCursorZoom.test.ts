import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  clampZoom,
  wheelZoomFactor,
  zoomVrmTowardHit,
  clientToNdc,
  applyVrmCamera,
  raycastVrmHitY,
  focusYForHit,
  visibleHalfHeightAtModel,
  VRM_ZOOM_MAX,
  FOCUS_FRAME_MARGIN,
  FACE_BELOW_HEAD,
} from "./vrmCursorZoom";

describe("vrmCursorZoom", () => {
  it("clampZoom bounds and passthrough", () => {
    expect(clampZoom(0.1)).toBe(0.3);
    expect(clampZoom(5)).toBe(4.5);
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

  it("miss returns same state", () => {
    const s = { zoom: 1.1, framing: "full" as const, panX: 0, panY: 0 };
    expect(zoomVrmTowardHit(s, null, 1.25)).toBe(s);
  });

  it("at max returns same state", () => {
    const s = { zoom: VRM_ZOOM_MAX, framing: "full" as const, panX: 0, panY: 0 };
    expect(zoomVrmTowardHit(s, 1.45, 1.5)).toBe(s);
  });

  it("panX never moves on zoom in", () => {
    const s = { zoom: 1.1, framing: "full" as const, panX: 0, panY: 0 };
    const next = zoomVrmTowardHit(s, 1.45, 1.2);
    expect(next.zoom).toBeCloseTo(1.32);
    expect(next.panX).toBe(0);
    expect(next.panY).toBeCloseTo(0.45 * 0.22 / 3.4);
    expect(next.panY).toBeLessThan(0.45);
  });

  it("max zoom centres the hit", () => {
    const s = { zoom: 1.1, framing: "full" as const, panX: 0, panY: 0 };
    const next = zoomVrmTowardHit(s, 1.45, 100);
    expect(next.zoom).toBe(4.5);
    expect(next.panY).toBeCloseTo(0.45);
  });

  it("half framing centres the hit", () => {
    const s = { zoom: 1.0, framing: "half" as const, panX: 0, panY: 0 };
    const next = zoomVrmTowardHit(s, 1.5, 100);
    expect(next.panY).toBeCloseTo(0.15);
  });

  it("zoom out eases panY", () => {
    let s = { zoom: 4.5, framing: "full" as const, panX: 0, panY: 0.45 };
    const mid = zoomVrmTowardHit(s, 1.45, 0.5);
    expect(mid.zoom).toBeCloseTo(2.25);
    expect(mid.panY).toBeCloseTo(0.45 * 1.25 / 3.5);
    s = { ...mid };
    const out = zoomVrmTowardHit(s, 1.45, 0.4);
    expect(out.zoom).toBeCloseTo(0.9);
    expect(out.panY).toBe(0);
  });

  it("in-frame guard on a low hit", () => {
    const s = { zoom: 1.1, framing: "full" as const, panX: 0, panY: 0 };
    const next = zoomVrmTowardHit(s, 0.05, 2.0);
    expect(next.zoom).toBeCloseTo(2.2);
    const half = visibleHalfHeightAtModel("full", 2.2) * FOCUS_FRAME_MARGIN;
    expect(Math.abs(0.05 - (1.0 + next.panY))).toBeLessThanOrEqual(half + 1e-6);
  });

  it("raycastVrmHitY hit and miss", () => {
    const camera = makeCamera();
    applyVrmCamera(camera, { zoom: 1, framing: "full", panX: 0, panY: 0 });

    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(0, 1.45, 0);
    root.add(mesh);
    root.updateMatrixWorld(true);

    const centre = new THREE.Vector3(0, 1.45, 0).project(camera);
    const hitY = raycastVrmHitY(camera, { x: centre.x, y: centre.y }, root);
    expect(hitY).not.toBeNull();
    expect(hitY!).toBeCloseTo(1.45, 1);

    expect(raycastVrmHitY(camera, { x: 0.9, y: 0.9 }, root)).toBeNull();
  });

  it("focusYForHit uses the face when the hit is on hair or head", () => {
    expect(focusYForHit(1.62, 1.5)).toBeCloseTo(1.5 - FACE_BELOW_HEAD);
    expect(focusYForHit(1.4, 1.5)).toBeCloseTo(1.5 - FACE_BELOW_HEAD);
    expect(focusYForHit(0.2, 1.5)).toBeCloseTo(0.2);
    expect(focusYForHit(1.62, null)).toBeCloseTo(1.62);
  });

  it("visibleHalfHeightAtModel(full, 4.5)", () => {
    expect(visibleHalfHeightAtModel("full", 4.5)).toBeCloseTo(0.268, 2);
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
