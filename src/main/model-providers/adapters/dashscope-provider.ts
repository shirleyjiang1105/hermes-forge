import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "dashscope_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "阿里通义千问（DashScope）",
  provider: "custom",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  modelPlaceholder: "qwen-max / qwen-plus / qwen-turbo / qwen-long",
  presetModels: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long"],
};

export class DashScopeProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(definition, {
      urlPatterns: [/dashscope\.aliyuncs\.com/i],
      modelPatterns: [/^qwen[-_]/i, /^qwen\d/i],
    });
  }
}
