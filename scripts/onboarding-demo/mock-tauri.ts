/** Mock Tauri invoke for browser-based onboarding demo recording. */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "config_get":
      return { onboarding_complete: false } as T;
    case "config_save":
      return undefined as T;
    case "models_list":
      return [
        {
          id: "haru",
          type: "live2d",
          model_file: "Haru.model3.json",
          path: "models/live2d/haru/Haru.model3.json",
        },
        {
          id: "utsuwa",
          type: "vrm",
          model_file: "utsuwa.vrm",
          path: "models/vrm/utsuwa/utsuwa.vrm",
          animations: [{ name: "idle", path: "models/vrm/utsuwa/animations/idle.vrma" }],
        },
      ] as T;
    case "tts_voices":
      return [
        { id: "jp_001", name: "Japanese Female 1" },
        { id: "jp_002", name: "Japanese Female 2" },
      ] as T;
    case "tts_preview":
      return [] as T;
    case "characters_create":
      return "demo-character-id" as T;
    case "agent_setup_status":
      return {
        prerequisites: {
          node_available: true,
          npx_available: true,
          node_version: "v20.0.0",
          npx_version: "10.0.0",
        },
        agent: {
          preset: (args?.preset as string) ?? "opencode",
          ready: true,
          managed_install: false,
          system_path: true,
          needs_node: false,
          detail: "Demo: using system agent.",
          install_source: "system",
          system_command: "/usr/local/bin/opencode",
        },
      } as T;
    case "agent_setup_install":
      return invoke("agent_setup_status", args);
    default:
      console.warn(`[onboarding-demo] unhandled invoke: ${cmd}`, args);
      return null as T;
  }
}
