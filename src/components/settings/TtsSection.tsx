import type { TtsPresetUi } from "../../lib/ttsPresets";
import type { Voice } from "../../types";
import {
  Button,
  ChoiceCard,
  Field,
  Input,
  Notice,
  Pill,
  PlayIcon,
  SectionTitle,
  Select,
  SpeakerIcon,
} from "../ui";

export interface TtsSectionValue {
  provider: string;
  api_key: string;
  voice: string;
}

type Props = {
  value: TtsSectionValue;
  onChange: (next: TtsSectionValue) => void;
  voices: Voice[];
  presets: Record<string, TtsPresetUi>;
  configuredProviders?: Record<string, { configured: boolean; voice: string }>;
  onPreview?: () => void;
  previewLoading?: boolean;
  previewError?: string;
  showBuiltInNotice?: boolean;
  showLocalFirstNotice?: boolean;
  compactGrid?: boolean;
};

export function TtsSection({
  value,
  onChange,
  voices,
  presets,
  configuredProviders,
  onPreview,
  previewLoading = false,
  previewError,
  showBuiltInNotice = false,
  showLocalFirstNotice = false,
  compactGrid = false,
}: Props) {
  const currentPreset = presets[value.provider];
  const patch = (field: keyof TtsSectionValue, fieldValue: string) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="space-y-6">
      {showLocalFirstNotice && (
        <Notice tone={currentPreset?.needs_key ? "info" : "success"}>
          Memory and chat stay on this device. Voice and your assistant only use the network when you configure them.
        </Notice>
      )}

      {showBuiltInNotice && (
        <Notice tone="success" className="mb-4">
          Meuxe TTS is built in and free — ready to use with no API key. ElevenLabs and OpenAI are optional if you want studio voices.
        </Notice>
      )}

      <div>
        <SectionTitle>Voice service</SectionTitle>
        <div
          className={
            compactGrid
              ? "mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3"
              : "grid gap-2.5 sm:grid-cols-2"
          }
        >
          {Object.entries(presets).map(([id, preset]) => (
            <ChoiceCard
              key={id}
              compact
              selected={value.provider === id}
              onClick={() => patch("provider", id)}
              leading={<SpeakerIcon className="h-5 w-5" />}
              title={preset.name}
              description={preset.hint ?? (preset.needs_key ? "Needs an API key" : "Built in, no key needed")}
              trailing={
                configuredProviders?.[id]?.configured && value.provider !== id ? (
                  <Pill tone="sage" size="xs">
                    Configured
                  </Pill>
                ) : undefined
              }
            />
          ))}
        </div>
      </div>

      {currentPreset?.needs_key && (
        <Field label="API key">
          <Input
            type="password"
            value={value.api_key}
            onChange={(event) => patch("api_key", event.target.value)}
            placeholder={
              showBuiltInNotice
                ? "Paste key from your voice service"
                : "Paste your API key (blank to keep current)"
            }
          />
        </Field>
      )}

      {!currentPreset?.needs_key && !showBuiltInNotice && (
        <Notice tone="success">
          Meuxe TTS is the default — built in and free, with no account or API key needed.
        </Notice>
      )}

      <Field label="Voice" error={previewError || undefined} className={onPreview ? "mb-0" : undefined}>
        <div className={onPreview ? "flex flex-col gap-2 sm:flex-row sm:items-start" : undefined}>
          <Select
            wrapperClassName={onPreview ? "flex-1" : undefined}
            value={value.voice}
            onChange={(event) => patch("voice", event.target.value)}
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </Select>
          {onPreview ? (
            <Button
              variant="soft"
              leading={<PlayIcon className="h-4 w-4" />}
              loading={previewLoading}
              onClick={onPreview}
              className="shrink-0"
            >
              Listen
            </Button>
          ) : null}
        </div>
      </Field>
    </div>
  );
}
