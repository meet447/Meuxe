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
  toolName: string;
  arguments: Record<string, unknown>;
  status: "running" | "completed" | "failed" | "awaiting_confirmation";
  result?: string;
}

export type ChatTimelineItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; expression?: string }
  | { id: string; kind: "tool"; call: ToolCallStatus };

export interface MemoryRecord {
  id: string;
  ts: string;
  character_id?: string;
  type: "episodic" | "semantic" | "reflections" | string;
  summary: string;
  importance: number;
  tags: string[];
  source_kind?: string;
  source_id?: string | null;
  provenance?: string | null;
  pinned?: boolean;
  topic?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MemorySourceRecord {
  id: string;
  ts: string;
  character_id: string;
  source_kind: string;
  title: string;
  content_hash: string;
  metadata?: Record<string, unknown>;
}

export interface TopicSummary {
  topic: string;
  count: number;
  summary: string;
  latest_at?: string | null;
}

export interface ComposioToolkitStatus {
  slug: string;
  name: string;
  connected: boolean;
  status: string;
  auth_config_id?: string | null;
  connected_account_id?: string | null;
  redirect_url?: string | null;
  last_sync_at?: string | null;
}

export interface ComposioAuthorizeResult {
  toolkit: string;
  auth_config_id: string;
  connected_account_id: string;
  redirect_url: string;
  status: string;
}

export interface RelationshipSnapshot {
  character_id: string;
  user_id: string;
  mood: string;
  trust: number;
  affection: number;
  energy: number;
  relationship_summary: string;
  updated_at: string;
}

export interface MemoryVaultOverview {
  total_memories: number;
  total_sources: number;
  total_dreams: number;
  semantic_count: number;
  episodic_count: number;
  reflection_count: number;
  latest_memory_at?: string | null;
  latest_dream_at?: string | null;
  vault_path: string;
  database_path: string;
  relationship?: RelationshipSnapshot | null;
  pinned_count?: number;
  topic_count?: number;
  latest_source_at?: string | null;
}

export interface DreamRun {
  id: string;
  character_id: string;
  user_id: string;
  status: string;
  summary: string;
  started_at: string;
  finished_at?: string | null;
  error?: string | null;
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
