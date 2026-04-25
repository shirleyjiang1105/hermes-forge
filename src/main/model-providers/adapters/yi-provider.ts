import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "yi_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "零一万物（Yi）",
  provider: "custom",
  baseUrl: "https://api.lingyiwanwu.com/v1",
  modelPlaceholder: "yi-large / yi-medium / yi-spark / yi-lightning",
  presetModels: ["yi-large", "yi-medium", "yi-spark", "yi-lightning"],
};

export class YiProvider extends OpenAiCompatibleProvider {
  constructor() {
    // TODO: Verify current Yi model capabilities before marking presets as primary-agent ready.
    super(definition, { urlPatterns: [/lingyiwanwu\.com/i], modelPatterns: [/^yi-/i] });
  }
}
