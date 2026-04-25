import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "minimax_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "MiniMax",
  provider: "custom",
  baseUrl: "https://api.minimax.chat/v1",
  modelPlaceholder: "abab7 / abab6.5s-chat",
  presetModels: ["abab7", "abab6.5s-chat"],
};

export class MiniMaxProvider extends OpenAiCompatibleProvider {
  constructor() {
    // TODO: Confirm model naming aliases for new MiniMax coding models.
    super(definition, { urlPatterns: [/api\.minimax\.chat/i], modelPatterns: [/^abab/i, /^minimax/i] });
  }
}
