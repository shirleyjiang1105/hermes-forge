import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelSourceDefinition } from "../types";

const definition: ModelSourceDefinition = {
  sourceType: "spark_api_key",
  family: "api_key",
  authMode: "api_key",
  label: "讯飞星火（Spark）",
  provider: "custom",
  baseUrl: "https://spark-api-open.xf-yun.com/v1",
  modelPlaceholder: "generalv3.5 / generalv3 / 4.0Ultra",
  presetModels: ["generalv3.5", "generalv3", "4.0Ultra"],
};

export class SparkProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(definition, { urlPatterns: [/spark-api-open\.xf-yun\.com/i], modelPatterns: [/^generalv/i, /^4\.0Ultra$/i] });
  }

  protected override buildAuthHeaders(auth?: string) {
    // TODO: If the UI stores raw APIKey:APISecret, normalize it to APIPassword before saving.
    const token = auth?.includes(":") ? Buffer.from(auth).toString("base64") : auth;
    return { authorization: `Bearer ${token || "lm-studio"}` };
  }
}
