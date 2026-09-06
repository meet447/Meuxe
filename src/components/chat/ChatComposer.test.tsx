import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";

function renderComposer(
  overrides: Partial<React.ComponentProps<typeof ChatComposer>> = {},
) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const onChange = vi.fn();

  const props: React.ComponentProps<typeof ChatComposer> = {
    value: "",
    onChange,
    onSend,
    onStop,
    isStreaming: false,
    disabled: false,
    placeholder: "Type here",
    voice: { isRecording: false, onToggle: vi.fn() },
    ...overrides,
  };

  const view = render(<ChatComposer {...props} />);
  return { ...view, onSend, onStop, onChange, props };
}

describe("ChatComposer", () => {
  it("sends on Enter without Shift", () => {
    const { onSend, onChange } = renderComposer({ value: "Hello" });
    const textarea = screen.getByLabelText("Message");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).toHaveBeenCalledWith("Hello");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does not send on Shift+Enter", () => {
    const { onSend } = renderComposer({ value: "Hello" });
    const textarea = screen.getByLabelText("Message");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows Stop while streaming and calls onStop", () => {
    const { onStop } = renderComposer({ isStreaming: true, value: "partial" });

    const stopButton = screen.getByRole("button", { name: "Stop" });
    expect(stopButton).toBeInTheDocument();

    fireEvent.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("disables send when disabled and empty", () => {
    renderComposer({ disabled: true, value: "" });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
