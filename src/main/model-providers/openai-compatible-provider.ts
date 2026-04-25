import { z } from "zod";
import { fetchWithRetry, httpFailureCategory, httpFailureFix, httpFailureMessage, isOptionalModelDiscoveryStatus } from "./http";
import { BaseProvider } from "./base-provider";
import type { ModelListResult, ModelPayloadItem, ModelSourceDefinition, ProviderTestContext } from "./types";

const openAiModelPayloadSchema = z.object({
  data: z.array(z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    context_length: z.number().optional(),
    context_window: z.number().optional(),
  })).optional(),
  models: z.array(z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    context_length: z.number().optional(),
    context_window: z.number().optional(),
  })).optional(),
}).passthrough();

/**
 * Adapter for OpenAI-compatible providers.
 *
 * It implements `/models`, `/chat/completions`, and OpenAI tool-calling probes.
 * Provider-specific subclasses usually only supply metadata, domain matching,
 * and preset models.
 */
export class OpenAiCompatibleProvider extends BaseProvider {
  constructor(
    readonly definition: ModelSourceDefinition,
    options: {
      urlPatterns?: RegExp[];
      modelPatterns?: RegExp[];
      sourceType?: ModelSourceDefinition["sourceType"];
    } = {},
  ) {
    super();
    this.sourceType = options.sourceType ?? definition.sourceType;
    this.urlPatterns = options.urlPatterns ?? [];
    this.modelPatterns = options.modelPatterns ?? [];
  }

  readonly sourceType: ModelSourceDefinition["sourceType"];
  override readonly urlPatterns: RegExp[];
  override readonly modelPatterns: RegExp[];

  async discoverModels(baseUrl: string, auth?: string) {
    return this.fetchModels({} as ProviderTestContext, baseUrl, auth);
  }

  protected async fetchModels(_input: ProviderTestContext, baseUrl: string, auth?: string): Promise<ModelListResult> {
    const modelsUrl = `${baseUrl.replace(/\/$/, "")}/models`;
    try {
      const response = await fetchWithRetry(modelsUrl, {
        method: "GET",
        headers: this.buildAuthHeaders(auth),
      });
      if (!response.ok) {
        if (isOptionalModelDiscoveryStatus(response.status)) {
          return {
            ok: true,
            message: `模型列表端点不可用（HTTP ${response.status}），已跳过发现并使用手动模型名继续测试。`,
            availableModels: [],
            authResolved: true,
          };
        }
        return {
          ok: false,
          message: httpFailureMessage(response.status, response.statusText, baseUrl),
          failureCategory: httpFailureCategory(response.status),
          recommendedFix: httpFailureFix(response.status, baseUrl),
          availableModels: [],
          authResolved: !(response.status === 401 || response.status === 403),
        };
      }
      const payload = await response.json().catch(() => undefined);
      const parsed = openAiModelPayloadSchema.safeParse(payload);
      const rawModels = normalizeOpenAiModelPayload(parsed.success ? parsed.data : undefined);
      const availableModels = rawModels.map((item) => item.id).filter((item): item is string => Boolean(item));
      return {
        ok: true,
        message: availableModels.length ? `模型发现成功，共 ${availableModels.length} 个模型。` : "模型发现成功，但服务端未返回模型列表。",
        availableModels,
        rawModelPayload: rawModels,
        authResolved: true,
      };
    } catch (error) {
      return {
        ok: false,
        message: `连不上模型服务 ${modelsUrl}。`,
        failureCategory: error instanceof Error && error.message.includes("Invalid URL") ? "invalid_url" : "network_unreachable",
        recommendedFix: error instanceof Error && error.message.includes("Invalid URL")
          ? "请检查 Base URL 格式，建议填写到 /v1。"
          : "请确认服务已经启动，而且 Base URL 指向实际监听端口和 /v1 接口。",
        availableModels: [],
        authResolved: false,
      };
    }
  }
}

function normalizeOpenAiModelPayload(payload: z.infer<typeof openAiModelPayloadSchema> | undefined): ModelPayloadItem[] {
  const items = payload?.data ?? payload?.models ?? [];
  return items
    .map((item) => ({
      id: item.id ?? item.name,
      context_length: item.context_length,
      context_window: item.context_window,
    }))
    .filter((item) => Boolean(item.id));
}
