import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "hunyuan_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "腾讯混元",
  provider: "custom",
  baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
  modelPlaceholder: "hunyuan-pro / hunyuan-standard / hunyuan-lite",
  presetModels: ["hunyuan-pro", "hunyuan-standard", "hunyuan-lite"],
};

export class HunyuanProvider extends OpenAiCompatibleProvider {
  constructor() {
    // TODO: Reconcile older hunyuan.cloud.tencent.com aliases during migration.
    super(definition, { urlPatterns: [/hunyuan\.cloud\.tencent\.com/i], modelPatterns: [/^hunyuan-/i] });
  }
}
