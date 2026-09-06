export interface Character {
  id: string;
  name: string;
  live2d_model: string;
  voice: string;
  default_emotion: string;
  source_type?: "markdown" | "directory";
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  expression?: string;
}

export interface ToolCallStatus {
  requestId: string;
  toolCallId: string;
  permissionId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  description?: string;
  status: "running" | "completed" | "failed" | "awaiting_confirmation";
  result?: string;
}

export type ChatTimelineItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; expression?: string }
  | { id: string; kind: "tool"; call: ToolCallStatus };

export type MemoryFactKind =
  | "identity"
  | "people"
  | "preference"
  | "life"
  | "work"
  | "boundary"
  | "other";

export type MemoryFactSource = "agent" | "user" | "legacy";

export interface MemoryFact {
  id: string;
  text: string;
  kind: MemoryFactKind;
  created_at: string;
  confirmed_at: string;
  mentions: number;
  source: MemoryFactSource;
}

export interface MemoryMoment {
  id: string;
  at: string;
  summary: string;
  feeling?: string | null;
  weight: number;
}

export interface CompanionMood {
  name: string;
  intensity: number;
  cause?: string | null;
  wants?: string | null;
  since: string;
}

export interface CompanionThread {
  id: string;
  text: string;
  opened_at: string;
}

export type BondStage =
  | "just met"
  | "getting to know each other"
  | "friends"
  | "close"
  | "inseparable";

export interface CompanionBond {
  closeness: number;
  stage: BondStage;
  mood: CompanionMood;
  threads: CompanionThread[];
  last_talked_at?: string | null;
  seconds_since_last_talk?: number | null;
  turns: number;
  updated_at: string;
}

export interface MemorySnapshot {
  bond: CompanionBond;
  facts: MemoryFact[];
  moments: MemoryMoment[];
  memory_dir: string;
}

export interface ModelMapping {
  params: {
    mouthOpen: string;
    mouthForm: string;
    eyeLeftOpen: string;
    eyeRightOpen: string;
    breath: string;
    bodyAngleX: string;
  };
}

export interface AnimationInfo {
  name: string;
  path: string;
}

export interface ModelInfo {
  id: string;
  type: "live2d" | "vrm";
  model_file: string;
  path: string;
  mapping: ModelMapping | null;
  animations?: AnimationInfo[];
}

export interface Voice {
  id: string;
  name: string;
}

export interface UserConfig {
  id?: string;
  name: string;
  about: string;
}

export interface AgentConfig {
  preset: string;
  program: string;
  args: string[];
}

export interface LlmConfig {
  provider: string;
  base_url?: string;
  api_key?: string | null;
  model?: string;
}

export interface TtsConfig {
  provider: string;
  api_key?: string | null;
  voice: string;
}

export interface LlmProviderConfig {
  base_url?: string;
  api_key?: string | null;
  model?: string;
}

export interface TtsProviderConfig {
  api_key?: string | null;
  voice?: string;
}

export interface AppConfig {
  user?: UserConfig;
  llm?: LlmConfig;
  tts?: TtsConfig;
  llm_providers?: Record<string, LlmProviderConfig>;
  tts_providers?: Record<string, TtsProviderConfig>;
  active_character?: string;
  onboarding_complete?: boolean;
  agent?: AgentConfig;
}
