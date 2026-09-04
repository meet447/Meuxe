import type { ComponentType } from "react";
import type { IconProps } from "./icons";
import { BookIcon, HeartIcon, MoonIcon, SparkIcon, SunIcon, WavesIcon, ZapIcon } from "./icons";

const GLYPHS: Record<string, ComponentType<IconProps>> = {
  Wise: BookIcon,
  Cheerful: SunIcon,
  Tsundere: ZapIcon,
  Chill: WavesIcon,
  Sassy: HeartIcon,
  Mysterious: MoonIcon,
};

/** Stroke icon for a companion vibe pack id (replaces emoji). */
export function VibeGlyph({ id, className = "h-5 w-5" }: { id: string; className?: string }) {
  const Icon = GLYPHS[id] ?? SparkIcon;
  return <Icon className={className} />;
}
