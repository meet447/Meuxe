/** Mock Tauri invoke for browser-based onboarding demo recording. */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "config_get":
      return { onboarding_complete: false } as T;
    case "config_save":
      return undefined as T;
    case "config_test_llm":
      return "ok" as T;
    case "models_list":
      return [
        { id: "haru", type: "live2d", model_file: "haru.model3.json", path: "live2d/haru" },
        { id: "demo-vrm", type: "vrm", model_file: "model.vrm", path: "vrm/demo" },
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
    case "composio_status":
      return [
        {
          slug: "github",
          name: "GitHub",
          connected: false,
          status: "not_connected",
        },
        {
          slug: "gmail",
          name: "Gmail",
          connected: true,
          status: "active",
        },
        {
          slug: "slack",
          name: "Slack",
          connected: false,
          status: "not_connected",
        },
      ] as T;
    case "composio_save_config":
      return undefined as T;
    case "composio_authorize_toolkit":
      return {
        toolkit: (args?.toolkit as string) ?? "github",
        auth_config_id: "ac_demo",
        connected_account_id: "ca_demo",
        redirect_url: "https://example.com/oauth-demo",
        status: "initiated",
      } as T;
    case "composio_refresh_toolkit":
      return {
        toolkit: (args?.toolkit as string) ?? "github",
        status: "active",
      } as T;
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
          detail: "Demo: agent ready.",
        },
      } as T;
    case "agent_setup_install":
      return invoke("agent_setup_status", args);
    default:
      console.warn(`[onboarding-demo] unhandled invoke: ${cmd}`, args);
      return null as T;
  }
}
