/** User-facing TTS provider labels (internal config id stays `tiktok`). */

export interface TtsPresetUi {
  name: string;
  needs_key: boolean;
  hint?: string;
}

export const TTS_PRESETS_UI: Record<string, TtsPresetUi> = {
  tiktok: {
    name: "Meuxe TTS",
    needs_key: false,
    hint: "Built into Meuxe, no key needed",
  },
  elevenlabs: {
    name: "ElevenLabs",
    needs_key: true,
    hint: "Studio voices (API key)",
  },
  openai_tts: {
    name: "OpenAI",
    needs_key: true,
    hint: "OpenAI speech (API key)",
  },
};

export const DEFAULT_TTS_PROVIDER = "tiktok";
