import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "moonshot_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "月之暗面 Kimi（Moonshot）",
  provider: "custom",
  baseUrl: "https://api.moonshot.cn/v1",
  modelPlaceholder: "moonshot-v1-128k / moonshot-v1-32k / moonshot-v1-8k",
  presetModels: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
};

export class MoonshotProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(definition, {
      urlPatterns: [/api\.moonshot\.cn/i],
      modelPatterns: [/^moonshot-/i, /^kimi-/i],
    });
  }
}
