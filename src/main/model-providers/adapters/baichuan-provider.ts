import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "baichuan_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "百川智能",
  provider: "custom",
  baseUrl: "https://api.baichuan-ai.com/v1",
  modelPlaceholder: "Baichuan4 / Baichuan3-Turbo / Baichuan3-Turbo-128k",
  presetModels: ["Baichuan4", "Baichuan3-Turbo", "Baichuan3-Turbo-128k"],
};

export class BaichuanProvider extends OpenAiCompatibleProvider {
  constructor() {
    // TODO: Verify Baichuan's current /models and tool-calling behavior against production accounts.
    super(definition, { urlPatterns: [/baichuan-ai\.com/i], modelPatterns: [/^baichuan/i] });
  }
}
