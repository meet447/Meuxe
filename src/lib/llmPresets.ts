/** OpenAI-compatible LLM provider presets (shared by Onboarding + Settings). */
export interface LLMPreset {
  name: string;
  base_url: string;
  needs_key: boolean;
  default_model: string;
}

export const LLM_PRESETS: Record<string, LLMPreset> = {
  openai: {
    name: "OpenAI",
    base_url: "https://api.openai.com/v1",
    needs_key: true,
    default_model: "gpt-4o",
  },
  groq: {
    name: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    needs_key: true,
    default_model: "llama-3.3-70b-versatile",
  },
  openrouter: {
    name: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    needs_key: true,
    default_model: "openai/gpt-4o",
  },
  together: {
    name: "Together AI",
    base_url: "https://api.together.ai/v1",
    needs_key: true,
    default_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  fireworks: {
    name: "Fireworks AI",
    base_url: "https://api.fireworks.ai/inference/v1",
    needs_key: true,
    default_model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  },
  baseten: {
    name: "Baseten",
    base_url: "https://inference.baseten.co/v1",
    needs_key: true,
    default_model: "deepseek-ai/DeepSeek-V3",
  },
  mistral: {
    name: "Mistral AI",
    base_url: "https://api.mistral.ai/v1",
    needs_key: true,
    default_model: "mistral-small-latest",
  },
  deepseek: {
    name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    needs_key: true,
    default_model: "deepseek-chat",
  },
  xai: {
    name: "xAI",
    base_url: "https://api.x.ai/v1",
    needs_key: true,
    default_model: "grok-3-mini",
  },
  cerebras: {
    name: "Cerebras",
    base_url: "https://api.cerebras.ai/v1",
    needs_key: true,
    default_model: "llama3.1-8b",
  },
  deepinfra: {
    name: "DeepInfra",
    base_url: "https://api.deepinfra.com/v1/openai",
    needs_key: true,
    default_model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
  },
  perplexity: {
    name: "Perplexity",
    base_url: "https://api.perplexity.ai",
    needs_key: true,
    default_model: "sonar",
  },
  hyperbolic: {
    name: "Hyperbolic",
    base_url: "https://api.hyperbolic.xyz/v1",
    needs_key: true,
    default_model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
  },
  novita: {
    name: "Novita AI",
    base_url: "https://api.novita.ai/openai",
    needs_key: true,
    default_model: "meta/llama-3.1-70b-instruct",
  },
  siliconflow: {
    name: "SiliconFlow",
    base_url: "https://api.siliconflow.com/v1",
    needs_key: true,
    default_model: "deepseek-ai/DeepSeek-V3",
  },
  nectara: {
    name: "Nectara",
    base_url: "https://api-nectara.chipling.xyz/v1",
    needs_key: true,
    default_model: "auto",
  },
  ollama: {
    name: "Ollama",
    base_url: "http://localhost:11434/v1",
    needs_key: false,
    default_model: "llama3.2",
  },
  lmstudio: {
    name: "LM Studio",
    base_url: "http://localhost:1234/v1",
    needs_key: false,
    default_model: "local-model",
  },
  custom: {
    name: "Custom",
    base_url: "",
    needs_key: true,
    default_model: "",
  },
};

/** Stable display order for provider picker grids. */
export const LLM_PRESET_ORDER: string[] = [
  "openai",
  "groq",
  "openrouter",
  "together",
  "fireworks",
  "baseten",
  "mistral",
  "deepseek",
  "xai",
  "cerebras",
  "deepinfra",
  "perplexity",
  "hyperbolic",
  "novita",
  "siliconflow",
  "nectara",
  "ollama",
  "lmstudio",
  "custom",
];

export function llmPresetEntries(): [string, LLMPreset][] {
  return LLM_PRESET_ORDER.filter((id) => id in LLM_PRESETS).map((id) => [id, LLM_PRESETS[id]]);
}
