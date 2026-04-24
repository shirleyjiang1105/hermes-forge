import { describe, expect, it } from "vitest";
import { migrateRuntimeConfigModels, normalizeOpenAiCompatibleBaseUrl, requiresStoredSecret, stableModelProfileId } from "./model-config";
import type { ModelProfile } from "./types";

describe("model config helpers", () => {
  it("normalizes root OpenAI-compatible endpoints to /v1", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("http://127.0.0.1:1234")).toBe("http://127.0.0.1:1234/v1");
    expect(normalizeOpenAiCompatibleBaseUrl("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/v1");
  });

  it("allows custom local endpoints without a stored secret", () => {
    const profile: ModelProfile = {
      id: "custom-local-endpoint",
      provider: "custom",
      baseUrl: "http://127.0.0.1:1234",
      model: "qwen",
    };

    expect(requiresStoredSecret(profile)).toBe(false);
    expect(requiresStoredSecret({ ...profile, secretRef: "provider.local.apiKey" })).toBe(true);
  });

  it("migrates legacy models to stable ids and a canonical default profile id", () => {
    const migrated = migrateRuntimeConfigModels({
      defaultModel: "openrouter/elephant-alpha",
      modelProfiles: [
        { provider: "local", model: "mock-model" },
        { provider: "openrouter", model: "openrouter/elephant-alpha", baseUrl: "https://openrouter.ai/api/v1" },
      ],
    });

    const expectedId = stableModelProfileId({
      provider: "openrouter",
      model: "openrouter/elephant-alpha",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(migrated.modelProfiles.map((item) => item.id)).toContain(expectedId);
    expect(migrated.defaultModelProfileId).toBe(expectedId);
  });
});
