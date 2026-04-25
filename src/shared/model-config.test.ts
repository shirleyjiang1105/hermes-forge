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

  it("mirrors the legacy default model into the chat role assignment", () => {
    const migrated = migrateRuntimeConfigModels({
      defaultModelProfileId: "kimi-main",
      modelProfiles: [
        { id: "kimi-main", provider: "custom", model: "moonshot-v1-128k", baseUrl: "https://api.moonshot.cn/v1" },
        { id: "doubao-coding", provider: "custom", model: "doubao-coding", baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" },
      ],
      modelRoleAssignments: { coding_plan: "doubao-coding" },
    });

    expect(migrated.modelRoleAssignments).toMatchObject({
      chat: "kimi-main",
      coding_plan: "doubao-coding",
    });
  });
});
