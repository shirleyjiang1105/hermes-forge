import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "zhipu_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "智谱 AI（GLM）",
  provider: "custom",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  modelPlaceholder: "glm-4-plus / glm-4 / glm-4-flash",
  presetModels: ["glm-4-plus", "glm-4", "glm-4-flash"],
};

export class ZhipuProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(definition, {
      urlPatterns: [/open\.bigmodel\.cn/i],
      modelPatterns: [/^glm-/i],
    });
  }
}
