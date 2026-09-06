import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TTS_PRESETS_UI } from "../../lib/ttsPresets";
import { TtsSection, type TtsSectionValue } from "./TtsSection";

const baseValue: TtsSectionValue = {
  provider: "tiktok",
  api_key: "",
  voice: "en_us_001",
};

describe("TtsSection", () => {
  it("renders provider and voice options", () => {
    render(
      <TtsSection
        value={baseValue}
        onChange={vi.fn()}
        voices={[{ id: "en_us_001", name: "Default" }]}
        presets={TTS_PRESETS_UI}
      />,
    );
    expect(screen.getByText("Meuxe TTS")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("calls onChange when provider changes", () => {
    const onChange = vi.fn();
    render(
      <TtsSection
        value={baseValue}
        onChange={onChange}
        voices={[{ id: "en_us_001", name: "Default" }]}
        presets={TTS_PRESETS_UI}
      />,
    );

    fireEvent.click(screen.getByText("ElevenLabs"));

    expect(onChange).toHaveBeenCalledWith({
      ...baseValue,
      provider: "elevenlabs",
    });
  });
});
