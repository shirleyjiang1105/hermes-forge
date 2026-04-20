import { describe, expect, it } from "vitest";
import { normalizeOpenAiCompatibleBaseUrl, requiresStoredSecret } from "./model-config";
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
});
