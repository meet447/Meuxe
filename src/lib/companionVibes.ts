/** Curated vibe packs for onboarding: one pick sets vibe + relationship + speech. */

export interface CompanionVibePack {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  relationship_style: string;
  speech_style: string;
}

export const COMPANION_VIBE_PACKS: CompanionVibePack[] = [
  {
    id: "Wise",
    emoji: "📖",
    title: "Warm & thoughtful",
    subtitle: "Calm, caring, steady",
    relationship_style: "Gentle",
    speech_style: "Calm",
  },
  {
    id: "Cheerful",
    emoji: "☀️",
    title: "Bright & upbeat",
    subtitle: "Encouraging, playful",
    relationship_style: "Gentle",
    speech_style: "Playful",
  },
  {
    id: "Tsundere",
    emoji: "💢",
    title: "Teasing edge",
    subtitle: "Sharp, then soft",
    relationship_style: "Teasing",
    speech_style: "Sharp",
  },
  {
    id: "Chill",
    emoji: "🌊",
    title: "Easygoing",
    subtitle: "Relaxed, grounded",
    relationship_style: "Gentle",
    speech_style: "Calm",
  },
  {
    id: "Sassy",
    emoji: "💋",
    title: "Witty & bold",
    subtitle: "Flirty, quick",
    relationship_style: "Teasing",
    speech_style: "Sharp",
  },
  {
    id: "Mysterious",
    emoji: "🕯️",
    title: "Quiet & deep",
    subtitle: "Intimate, subtle",
    relationship_style: "Devoted",
    speech_style: "Intimate",
  },
];
