import { invoke, convertFileSrc } from "@tauri-apps/api/core";

// Asset paths — in the Tauri app, resolve to convertFileSrc URLs via the backend.
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
export async function getConfig() {
  return invoke("config_get");
}

export async function saveConfig(config: unknown) {
  return invoke("config_save", { config });
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
  };
}

export async function getAgentSetupStatus(preset: string) {
  return invoke<AgentSetupStatusResponse>("agent_setup_status", { preset });
}

export async function installAgentSetup(preset: string) {
  return invoke<AgentSetupStatusResponse>("agent_setup_install", { preset });
}

export async function testLlm(provider: {
  base_url: string;
  api_key: string;
  model: string;
  provider?: string;
}) {
  return invoke<string>("config_test_llm", { provider });
}

export async function listLlmModels(provider: {
  base_url: string;
  api_key?: string;
  provider?: string;
}) {
  return invoke<string[]>("config_list_llm_models", { provider });
}

// Characters
export async function listCharacters() {
  return invoke<unknown[]>("characters_list");
}

export async function getCharacter(id: string) {
  return invoke<unknown>("characters_get", { id });
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
  return invoke<any[]>("models_list");
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

export async function getChatHistory(characterId: string) {
  return invoke<unknown[]>("chat_history", { characterId });
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
export async function getMemory(characterId: string) {
  return invoke<unknown[]>("memory_get", { characterId });
}

export async function searchMemory(characterId: string, query: string) {
  return invoke<unknown[]>("memory_search", { characterId, query });
}

export async function clearMemory(characterId: string) {
  return invoke("memory_clear", { characterId });
}

export async function getMemoryOverview(characterId: string) {
  return invoke("memory_overview", { characterId });
}

export async function rebuildMemoryVault(characterId: string) {
  return invoke<string>("memory_rebuild_vault", { characterId });
}

export async function runMemoryDream(characterId: string) {
  return invoke("memory_run_dream", { characterId });
}

export async function getMemoryDreamStatus(characterId: string) {
  return invoke("memory_dream_status", { characterId });
}

export async function migrateLegacyMemory(characterId: string) {
  return invoke<number>("memory_migrate_legacy", { characterId });
}

export async function deleteMemory(characterId: string, memoryId: string) {
  return invoke("memory_delete", { characterId, memoryId });
}

export async function setMemoryPinned(characterId: string, memoryId: string, pinned: boolean) {
  return invoke("memory_set_pinned", { characterId, memoryId, pinned });
}

export async function getMemorySources(characterId: string) {
  return invoke("memory_sources", { characterId });
}

export async function getMemoryTopics(characterId: string) {
  return invoke("memory_topics", { characterId });
}

export async function ingestMemoryNote(characterId: string, title: string, body: string) {
  return invoke<number>("memory_ingest_note", { characterId, title, body });
}

export async function ingestMemoryTranscript(characterId: string, title: string, transcript: string) {
  return invoke<number>("memory_ingest_transcript", { characterId, title, transcript });
}

export async function ingestMemoryFileDialog(characterId: string) {
  return invoke<number | null>("memory_ingest_file_dialog", { characterId });
}

export async function ingestMemoryFolderDialog(characterId: string) {
  return invoke<number | null>("memory_ingest_folder_dialog", { characterId });
}

export async function exportMemoryZipDialog(characterId: string) {
  return invoke<string | null>("memory_export_zip_dialog", { characterId });
}

export async function importMemoryZipDialog(characterId: string) {
  return invoke<number | null>("memory_import_zip_dialog", { characterId });
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
