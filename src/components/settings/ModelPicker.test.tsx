import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker } from "./ModelPicker";

describe("ModelPicker", () => {
  it("renders models and calls onSelect", () => {
    const onSelect = vi.fn();
    render(
      <ModelPicker
        models={[
          { id: "haru", type: "live2d", path: "models/live2d/haru/Haru.model3.json" },
          { id: "utsuwa", type: "vrm", path: "models/vrm/utsuwa/utsuwa.vrm" },
        ]}
        selectedId="haru"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Haru")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Utsuwa"));
    expect(onSelect).toHaveBeenCalledWith("utsuwa");
  });
});
