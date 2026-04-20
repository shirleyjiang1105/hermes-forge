import { describe, expect, it } from "vitest";
import { RuntimeEnvResolver } from "./runtime-env-resolver";
import type { RuntimeConfig } from "../shared/types";

describe("RuntimeEnvResolver", () => {
  it("injects OpenRouter API key aliases for OpenRouter profiles", async () => {
    const publicFixtureSecret = "public-fixture-secret";
    const config: RuntimeConfig = {
      defaultModelProfileId: "openrouter-elephant-alpha",
      modelProfiles: [{
        id: "openrouter-elephant-alpha",
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openrouter/elephant-alpha",
        secretRef: "provider.openrouter.apiKey",
      }],
      updateSources: {},
    };
    const resolver = new RuntimeEnvResolver(
      { read: async () => config } as never,
      { readSecret: async () => publicFixtureSecret } as never,
    );

    const runtime = await resolver.resolve();

    expect(runtime.env).toMatchObject({
      AI_PROVIDER: "openrouter",
      AI_MODEL: "openrouter/elephant-alpha",
      AI_BASE_URL: "https://openrouter.ai/api/v1",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
      OPENROUTER_API_KEY: publicFixtureSecret,
      OPENAI_API_KEY: publicFixtureSecret,
      AI_API_KEY: publicFixtureSecret,
    });
  });
});
