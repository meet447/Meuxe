import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { AppConfig, MemoryFact, MemorySnapshot, ModelInfo, SessionMessage } from "../types";

// Asset paths: in the Tauri app, resolve to convertFileSrc URLs via the backend.
// In browser-only dev (npm run dev), fall back to Vite /static/ middleware.
export function toAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  return `/static/${clean}`;
}

export async function resolveAssetUrl(relativePath: string): Promise<string> {
  const clean = relativePath.replace(/^\/+/, "");
  try {
    const [absolutePath, dataDir] = await Promise.all([
      invoke<string>("resolve_asset_path", { path: clean }),
      invoke<string>("get_data_dir"),
    ]);
    const normalizedDataDir = dataDir.replace(/\\/g, "/").replace(/\/$/, "");
    const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
    if (normalizedAbsolute.startsWith(`${normalizedDataDir}/`)) {
      return convertFileSrc(absolutePath);
    }
    console.warn("[assets] Model is outside app data; using /static/ fallback:", clean);
    return toAssetUrl(clean);
  } catch (err) {
    console.warn("[assets] Falling back to /static/ URL for", clean, err);
    return toAssetUrl(clean);
  }
}

// Config
export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("config_get");
}

export async function saveConfig(config: Partial<AppConfig>) {
  return invoke("config_save", { config });
}

export async function setActiveCharacter(characterId: string) {
  return invoke("config_set_active_character", { characterId });
}

export async function resetAllAppData() {
  return invoke("config_reset_all");
}

export async function resetOnboarding() {
  return invoke("config_reset_onboarding");
}

export interface AgentSetupStatusResponse {
  prerequisites: {
    node_available: boolean;
    npx_available: boolean;
    node_version: string | null;
    npx_version: string | null;
  };
  agent: {
    preset: string;
    ready: boolean;
    managed_install: boolean;
    system_path: boolean;
    needs_node: boolean;
    detail: string;
    install_source: "system" | "managed" | "npx" | "none";
    system_command: string | null;
  };
}

export async function getAgentSetupStatus(preset: string) {
  return invoke<AgentSetupStatusResponse>("agent_setup_status", { preset });
}

export async function installAgentSetup(preset: string) {
  return invoke<AgentSetupStatusResponse>("agent_setup_install", { preset });
}

// Characters
export async function listCharacters() {
  return invoke<unknown[]>("characters_list");
}

export async function createCharacter(data: {
  name: string;
  personality: string;
  modelId: string;
  voice: string;
  vibe: string;
  relationshipStyle: string;
  speechStyle: string;
  userName: string;
  userAbout: string;
}) {
  return invoke<string>("characters_create", {
    name: data.name,
    personality: data.personality,
    modelId: data.modelId,
    voice: data.voice,
    vibe: data.vibe,
    relationshipStyle: data.relationshipStyle,
    speechStyle: data.speechStyle,
    userName: data.userName,
    userAbout: data.userAbout,
  });
}

// Models
export async function listModels() {
  return invoke<ModelInfo[]>("models_list");
}

export async function importLive2DModel() {
  return invoke<any | null>("models_import_live2d_dialog");
}

export async function importVRMModel() {
  return invoke<any | null>("models_import_vrm_dialog");
}

// Chat
export async function sendChat(characterId: string, message: string, requestId: string) {
  return invoke("chat_send", { characterId, message, requestId });
}

export async function cancelChat() {
  return invoke("chat_cancel");
}

export async function confirmToolCall(permissionId: string, approved: boolean) {
  return invoke("chat_tool_confirm", { permissionId, approved });
}

export async function getChatHistory(characterId: string) {
  return invoke<SessionMessage[]>("chat_history", { characterId });
}

export async function clearChat(characterId: string) {
  return invoke("chat_clear", { characterId });
}

export async function transcribeVoice(audioBase64: string, mimeType: string) {
  return invoke<string>("voice_transcribe", { audioBase64, mimeType });
}

export async function transcribeVoiceLocal(pcmBase64: string) {
  return invoke<string>("voice_transcribe_local", { pcmBase64 });
}

// Memory
export async function getMemorySnapshot(characterId: string): Promise<MemorySnapshot> {
  return invoke<MemorySnapshot>("memory_snapshot", { characterId });
}

export async function addMemoryFact(characterId: string, text: string): Promise<MemoryFact> {
  return invoke<MemoryFact>("memory_add_fact", { characterId, text });
}

export async function updateMemoryFact(
  characterId: string,
  factId: string,
  text: string,
): Promise<MemoryFact> {
  return invoke<MemoryFact>("memory_update_fact", { characterId, factId, text });
}

export async function forgetMemoryFact(characterId: string, factId: string): Promise<void> {
  return invoke("memory_forget_fact", { characterId, factId });
}

export async function forgetMemoryMoment(characterId: string, momentId: string): Promise<void> {
  return invoke("memory_forget_moment", { characterId, momentId });
}

export async function resetMemory(characterId: string): Promise<void> {
  return invoke("memory_reset", { characterId });
}

// Expressions
export async function getSupportedExpressions() {
  return invoke<string[]>("expressions_supported");
}

export async function getModelExpressions(modelId: string) {
  return invoke<string[]>("expressions_model_list", { modelId });
}

export async function getExpressions(modelId: string) {
  return invoke<Record<string, string>>("expressions_get", { modelId });
}

export async function saveExpressions(
  modelId: string,
  mapping: Record<string, string>,
) {
  return invoke("expressions_save", { modelId, mapping });
}

// TTS
export async function getVoices(provider: string) {
  return invoke<{ id: string; name: string }[]>("tts_voices", { provider });
}

export async function previewVoice(provider: string, voice: string, apiKey?: string, text?: string) {
  return invoke<number[]>("tts_preview", { provider, voice, apiKey: apiKey || null, text: text || null });
}

// Window
export async function toggleMiniMode(selectedCharacterId?: string) {
  return invoke("window_toggle_mini", {
    selectedCharacterId: selectedCharacterId || null,
  });
}

export async function expandWindow() {
  return invoke("window_expand");
}
