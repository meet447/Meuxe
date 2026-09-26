import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddCharacterModal } from "./AddCharacterModal";
import {
  createCharacter,
  getConfig,
  importLive2DModel,
  importVRMModel,
  listModels,
} from "../api/tauri";
import type { ModelInfo } from "../types";

vi.mock("../api/tauri", () => ({
  getConfig: vi.fn(),
  listModels: vi.fn(),
  createCharacter: vi.fn(),
  importLive2DModel: vi.fn(),
  importVRMModel: vi.fn(),
}));

vi.mock("./onboarding/CompanionAvatarPreview", () => ({
  CompanionAvatarPreview: () => <div data-testid="preview" />,
}));

vi.mock("../lib/openExternal", () => ({
  openExternalUrl: vi.fn(),
}));

const haruModel: ModelInfo = {
  id: "haru",
  type: "live2d",
  model_file: "Haru.model3.json",
  path: "models/live2d/haru/Haru.model3.json",
  mapping: null,
};

function renderModal(props?: Partial<{ onClose: () => void; onCreated: (id: string) => void }>) {
  const onClose = props?.onClose ?? vi.fn();
  const onCreated = props?.onCreated ?? vi.fn();
  return render(<AddCharacterModal open onClose={onClose} onCreated={onCreated} />);
}

describe("AddCharacterModal", () => {
  beforeEach(() => {
    vi.mocked(getConfig).mockResolvedValue({
      user: { name: "Alex", about: "" },
      tts: { voice: "en_us_001" },
    } as Awaited<ReturnType<typeof getConfig>>);
    vi.mocked(listModels).mockResolvedValue([haruModel]);
    vi.mocked(createCharacter).mockResolvedValue("char-1");
    vi.mocked(importLive2DModel).mockResolvedValue(null);
    vi.mocked(importVRMModel).mockResolvedValue(null);
  });

  it("opens on step 1 Name with Continue disabled until name is entered", async () => {
    renderModal();

    expect(screen.getByText(/Step 1 of 3 · Name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Mira/i), {
      target: { value: "Mira" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    });
  });

  it("walks through look and personality steps", async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Mira/i), {
      target: { value: "Mira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 3 · Look/)).toBeInTheDocument();
    });
    expect(screen.getByText("Selected: Haru · Live2D")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Selected$/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 3 · Personality/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Mira should feel like a real person/i)).toBeInTheDocument();
  });

  it("updates draft and relationship when selecting a vibe", async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Mira/i), {
      target: { value: "Mira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/Step 2 of 3 · Look/));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/Step 3 of 3 · Personality/));

    fireEvent.click(screen.getByText("Teasing edge"));

    expect(screen.getByText(/hide attachment behind defensiveness/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Relationship")).toHaveValue("Teasing");
  });

  it("respects manual draft edits and regenerate", async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Mira/i), {
      target: { value: "Mira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/Step 2 of 3 · Look/));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/Step 3 of 3 · Personality/));

    fireEvent.click(screen.getByText("Teasing edge"));
    fireEvent.click(screen.getByRole("button", { name: /edit draft/i }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Custom personality notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: /done editing/i }));

    expect(screen.getByText("Edited")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Teasing edge"));
    expect(screen.getByText("Custom personality notes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /regenerate from picks/i }));
    expect(screen.getByText(/hide attachment behind defensiveness/i)).toBeInTheDocument();
    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
  });

  it("creates a companion with the chosen settings", async () => {
    const onCreated = vi.fn();
    renderModal({ onCreated });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Mira/i), {
      target: { value: "Mira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/Step 2 of 3 · Look/));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/Step 3 of 3 · Personality/));

    fireEvent.click(screen.getByText("Teasing edge"));
    fireEvent.click(screen.getByRole("button", { name: /create companion/i }));

    await waitFor(() => {
      expect(createCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Mira",
          modelId: "haru",
          vibe: "Tsundere",
          relationshipStyle: "Teasing",
          speechStyle: "Sharp",
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith("char-1");
  });

  it("preserves name on back and resets on close and reopen", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<AddCharacterModal open onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Mira/i), {
      target: { value: "Mira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/Step 2 of 3 · Look/));

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByDisplayValue("Mira")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();

    rerender(<AddCharacterModal open={false} onClose={onClose} onCreated={vi.fn()} />);
    rerender(<AddCharacterModal open onClose={onClose} onCreated={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 3 · Name/)).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/e\.g\. Mira/i)).toHaveValue("");
  });
});
