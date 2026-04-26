import { describe, expect, it } from "vitest";
import { modelRuntimeChanged } from "./model-runtime-snapshot";
import type { RuntimeConfig } from "../shared/types";

function configWith(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    defaultModelProfileId: "kimi-main",
    modelProfiles: [
      { id: "kimi-main", provider: "custom", sourceType: "kimi_coding_api_key", model: "kimi-for-coding", baseUrl: "https://api.kimi.com/coding/v1" },
      { id: "doubao-coding", provider: "custom", sourceType: "volcengine_coding_api_key", model: "doubao-coding", baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" },
    ],
    updateSources: {},
    ...overrides,
  } as RuntimeConfig;
}

describe("modelRuntimeChanged", () => {
  it("returns false when nothing relevant changed", () => {
    const previous = configWith();
    const next = configWith();
    expect(modelRuntimeChanged(previous, next)).toBe(false);
  });

  it("returns true when modelRoleAssignments.chat changes even if defaultModelProfileId stays the same", () => {
    const previous = configWith({ modelRoleAssignments: { chat: "kimi-main" } });
    const next = configWith({ modelRoleAssignments: { chat: "doubao-coding" } });
    expect(modelRuntimeChanged(previous, next)).toBe(true);
  });

  it("returns true when modelRoleAssignments adds a new role binding", () => {
    const previous = configWith({ modelRoleAssignments: { chat: "kimi-main" } });
    const next = configWith({ modelRoleAssignments: { chat: "kimi-main", coding_plan: "doubao-coding" } });
    expect(modelRuntimeChanged(previous, next)).toBe(true);
  });

  it("returns true when defaultModelProfileId changes", () => {
    const previous = configWith({ defaultModelProfileId: "kimi-main" });
    const next = configWith({ defaultModelProfileId: "doubao-coding" });
    expect(modelRuntimeChanged(previous, next)).toBe(true);
  });

  it("returns true when modelProfiles array contents change", () => {
    const previous = configWith();
    const next = configWith({
      modelProfiles: [
        { id: "kimi-main", provider: "custom", sourceType: "kimi_coding_api_key", model: "kimi-for-coding", baseUrl: "https://api.kimi.com/coding/v1" },
      ],
    });
    expect(modelRuntimeChanged(previous, next)).toBe(true);
  });
});
