import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VRMCanvas } from "./VRMCanvas";

const zoomAtClientPoint = vi.fn<(factor: number, x: number, y: number) => number | null>(() => 1.2);
const setViewport = vi.fn();
const resetPan = vi.fn();

vi.mock("../hooks/useVRM", () => ({
  useVRM: () => ({
    loadModel: vi.fn(() => Promise.resolve()),
    setExpression: vi.fn(),
    startLipSync: vi.fn(),
    stopLipSync: vi.fn(),
    setViewport,
    zoomAtClientPoint,
    resetPan,
    setTypingReaction: vi.fn(),
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    handlePointerCancel: vi.fn(),
    lastError: null,
  }),
}));

const baseProps = {
  modelPath: "models/vrm/test.vrm",
  expression: "neutral",
  speaking: false,
  userTyping: false,
  background: "transparent",
  zoom: 1.1,
  framing: "full" as const,
};

describe("VRMCanvas wheel zoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    zoomAtClientPoint.mockReturnValue(1.2);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("wheel calls zoomAtClientPoint, prevents default, and emits onZoomChange after rAF", async () => {
    const onZoomChange = vi.fn();
    const { container } = render(
      <VRMCanvas {...baseProps} onZoomChange={onZoomChange} />,
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();

    const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    canvas!.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(zoomAtClientPoint).toHaveBeenCalled();
    const factor = zoomAtClientPoint.mock.calls[0][0] as number;
    expect(factor).toBeLessThan(1);

    await waitFor(() => {
      expect(onZoomChange).toHaveBeenCalledWith(1.2);
    });
  });

  it("wheel miss does not emit", async () => {
    zoomAtClientPoint.mockReturnValue(null);
    const onZoomChange = vi.fn();
    const { container } = render(
      <VRMCanvas {...baseProps} onZoomChange={onZoomChange} />,
    );
    const canvas = container.querySelector("canvas");
    const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    canvas!.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(zoomAtClientPoint).toHaveBeenCalled();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    expect(onZoomChange).not.toHaveBeenCalled();
  });

  it("wheelZoom false does not zoom or prevent default", () => {
    const onZoomChange = vi.fn();
    const { container } = render(
      <VRMCanvas {...baseProps} wheelZoom={false} onZoomChange={onZoomChange} />,
    );
    const canvas = container.querySelector("canvas");
    const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    canvas!.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
    expect(zoomAtClientPoint).not.toHaveBeenCalled();
    expect(onZoomChange).not.toHaveBeenCalled();
  });

  it("echo suppression skips setViewport for emitted zoom; unrelated zoom still updates", async () => {
    const onZoomChange = vi.fn();
    const { container, rerender } = render(
      <VRMCanvas {...baseProps} zoom={1.1} onZoomChange={onZoomChange} />,
    );
    await waitFor(() => {
      expect(setViewport).toHaveBeenCalled();
    });
    setViewport.mockClear();

    const canvas = container.querySelector("canvas");
    canvas!.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }),
    );

    await waitFor(() => {
      expect(onZoomChange).toHaveBeenCalledWith(1.2);
    });

    rerender(<VRMCanvas {...baseProps} zoom={1.2} onZoomChange={onZoomChange} />);
    expect(setViewport).not.toHaveBeenCalled();

    rerender(<VRMCanvas {...baseProps} zoom={1.5} onZoomChange={onZoomChange} />);
    expect(setViewport).toHaveBeenCalledWith(1.5, "full");

    setViewport.mockClear();
    rerender(<VRMCanvas {...baseProps} zoom={1.5} framing="half" onZoomChange={onZoomChange} />);
    expect(setViewport).toHaveBeenCalledWith(1.5, "half");
  });

  it("viewResetTick re-centers the camera", () => {
    const { rerender } = render(<VRMCanvas {...baseProps} viewResetTick={0} />);
    resetPan.mockClear();
    setViewport.mockClear();
    rerender(<VRMCanvas {...baseProps} viewResetTick={1} />);
    expect(resetPan).toHaveBeenCalled();
    expect(setViewport).toHaveBeenCalledWith(1.1, "full");
  });
});
