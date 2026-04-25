import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "volcengine_ark_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "火山引擎（豆包 / Ark）",
  provider: "custom",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  modelPlaceholder: "火山方舟 endpoint ID",
  presetModels: [],
};

export class VolcengineArkProvider extends OpenAiCompatibleProvider {
  constructor() {
    // TODO: Surface endpoint ID validation separately from model list discovery.
    super(definition, { urlPatterns: [/ark\.cn-beijing\.volces\.com/i, /volces\.com/i], modelPatterns: [/^doubao-/i] });
  }
}
