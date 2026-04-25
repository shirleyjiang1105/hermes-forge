import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "siliconflow_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "硅基流动（SiliconFlow）",
  provider: "custom",
  baseUrl: "https://api.siliconflow.cn/v1",
  modelPlaceholder: "deepseek-ai/DeepSeek-V3 / Qwen/Qwen2.5-72B-Instruct",
  presetModels: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
};

export class SiliconFlowProvider extends OpenAiCompatibleProvider {
  constructor() {
    // TODO: Add provider-specific model catalog refresh when SiliconFlow exposes stable metadata.
    super(definition, { urlPatterns: [/siliconflow\.cn/i], modelPatterns: [/^deepseek-ai\//i, /^qwen\//i] });
  }
}
