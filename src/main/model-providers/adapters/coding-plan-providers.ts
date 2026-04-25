import { OpenAiCompatibleProvider } from "../openai-compatible-provider";
import type { ModelListResult, ModelSourceDefinition, ProviderTestContext } from "../types";

function codingPlanDefinition(input: {
  sourceType: ModelSourceDefinition["sourceType"];
  label: string;
  baseUrl: string;
  modelPlaceholder: string;
  presetModels?: string[];
  keywords: string[];
  description: string;
  roleCapabilities?: ModelSourceDefinition["roleCapabilities"];
  runtimeCompatibility?: ModelSourceDefinition["runtimeCompatibility"];
}): ModelSourceDefinition {
  return {
    sourceType: input.sourceType,
    family: "api_key",
    authMode: "api_key",
    label: input.label,
    provider: "custom",
    baseUrl: input.baseUrl,
    modelPlaceholder: input.modelPlaceholder,
    presetModels: input.presetModels,
    group: "china",
    description: input.description,
    keywords: [...input.keywords, "coding", "plan", "token plan"],
    badge: "Coding Plan",
    roleCapabilities: input.roleCapabilities ?? ["coding_plan"],
    runtimeCompatibility: input.runtimeCompatibility ?? "runtime",
  };
}

export class DashScopeCodingProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(codingPlanDefinition({
      sourceType: "dashscope_coding_api_key",
      label: "通义千问 Coding Plan（国内）",
      baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
      modelPlaceholder: "qwen3-coder-plus / qwen3-max-2026-01-23",
      presetModels: ["qwen3-coder-plus", "qwen3-max-2026-01-23"],
      keywords: ["阿里", "通义", "百炼", "qwen", "dashscope", "aliyun"],
      description: "阿里云百炼 Coding Plan 专用 OpenAI-compatible 入口。",
    }), {
      urlPatterns: [/coding-intl\.dashscope\.aliyuncs\.com/i],
      modelPatterns: [/^qwen3.*coder/i, /^qwen3-max/i],
    });
  }
}

export class ZhipuCodingProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(codingPlanDefinition({
      sourceType: "zhipu_coding_api_key",
      label: "智谱 Coding Plan（国内）",
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
      modelPlaceholder: "GLM-5.1 / GLM-5 / glm-4.7",
      presetModels: ["GLM-5.1", "GLM-5", "glm-4.7"],
      keywords: ["智谱", "glm", "zhipu", "bigmodel", "z.ai"],
      description: "智谱 GLM Coding Plan 专用 OpenAI-compatible 入口。",
    }), {
      urlPatterns: [/open\.bigmodel\.cn\/api\/coding\/paas\/v4/i],
      modelPatterns: [/^glm-/i, /^GLM-/],
    });
  }
}

export class BaiduQianfanCodingProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(codingPlanDefinition({
      sourceType: "baidu_qianfan_coding_api_key",
      label: "百度千帆 Coding Plan",
      baseUrl: "https://qianfan.baidubce.com/v2/coding",
      modelPlaceholder: "填写千帆 Coding Plan 模型 ID",
      presetModels: ["deepseek-v3", "deepseek-r1", "ernie-4.5-turbo"],
      keywords: ["百度", "千帆", "qianfan", "baidu"],
      description: "百度千帆 Coding Plan 专用 OpenAI-compatible 入口。",
    }), {
      urlPatterns: [/qianfan\.baidubce\.com\/v2\/coding/i],
      modelPatterns: [/^ernie-/i, /^deepseek-/i],
    });
  }
}

export class TencentTokenPlanProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(codingPlanDefinition({
      sourceType: "tencent_token_plan_api_key",
      label: "腾讯云通用 Token Plan",
      baseUrl: "https://api.lkeap.cloud.tencent.com/plan/v3",
      modelPlaceholder: "glm-5 / kimi-k2.5 / minimax-m2.5 / deepseek-v3.2",
      presetModels: ["glm-5", "kimi-k2.5", "minimax-m2.5", "deepseek-v3.2"],
      keywords: ["腾讯云", "tokenhub", "token plan", "lkeap"],
      description: "腾讯云 Token Plan 专用 OpenAI-compatible 入口。",
    }), {
      urlPatterns: [/api\.lkeap\.cloud\.tencent\.com\/plan\/v3/i],
      modelPatterns: [/^glm-/i, /^kimi-/i, /^minimax-/i, /^deepseek-/i],
    });
  }
}

export class TencentHunyuanTokenPlanProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(codingPlanDefinition({
      sourceType: "tencent_hunyuan_token_plan_api_key",
      label: "腾讯云 Hy Token Plan",
      baseUrl: "https://tokenhub.tencentmaas.com/plan/v3",
      modelPlaceholder: "n-2.0-thinking-202511 / n-2.0-instruct-202511",
      presetModels: ["n-2.0-thinking-202511", "n-2.0-instruct-202511"],
      keywords: ["腾讯云", "混元", "hunyuan", "hy", "tokenhub"],
      description: "腾讯云 TokenHub 企业版 / Hy Token Plan OpenAI-compatible 入口。",
    }), {
      urlPatterns: [/tokenhub\.tencentmaas\.com\/plan\/v3/i],
      modelPatterns: [/^n-2\.0-/i, /^hunyuan-/i],
    });
  }
}

export class MiniMaxTokenPlanProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(codingPlanDefinition({
      sourceType: "minimax_token_plan_api_key",
      label: "MiniMax Token Plan（国内）",
      baseUrl: "https://api.minimaxi.com/v1",
      modelPlaceholder: "MiniMax-M2.7 / MiniMax-M2.7-highspeed",
      presetModels: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5"],
      keywords: ["minimax", "m2.7", "m2.5"],
      description: "MiniMax Token Plan OpenAI-compatible 入口。",
    }), {
      urlPatterns: [/api\.minimaxi\.com\/v1/i],
      modelPatterns: [/^MiniMax-/i],
    });
  }
}

export class KimiCodingProvider extends OpenAiCompatibleProvider {
  constructor() {
    super(codingPlanDefinition({
      sourceType: "kimi_coding_api_key",
      label: "Kimi Coding Plan",
      baseUrl: "https://api.kimi.com/coding/v1",
      modelPlaceholder: "kimi-for-coding（Coding Plan 套餐名）",
      presetModels: ["kimi-for-coding"],
      keywords: ["kimi", "moonshot", "月之暗面"],
      description: "Kimi Coding 专用入口。当前 Kimi Code 会员接口只允许特定 Coding Agent 直接调用，Hermes runtime 暂仅支持连接检测和保存。",
      roleCapabilities: [],
      runtimeCompatibility: "connection_only",
    }), {
      urlPatterns: [/api\.kimi\.com\/coding\/v1/i],
      modelPatterns: [/^kimi-/i],
    });
  }

  protected override buildAuthHeaders(auth?: string): Record<string, string> {
    return {
      ...super.buildAuthHeaders(auth),
      "user-agent": "kimi-cli/1.0",
      "x-stainless-arch": "x64",
      "x-stainless-lang": "typescript",
      "x-stainless-os": "win32",
      "x-stainless-package-version": "1.0.0",
      "x-stainless-runtime": "node",
    };
  }

  protected override async fetchModels(_input: ProviderTestContext, _baseUrl: string, _auth?: string): Promise<ModelListResult> {
    return {
      ok: true,
      message: "Kimi Coding API 的模型发现不可靠，已跳过，直接以 chat 实测为准。",
      availableModels: [],
      authResolved: true,
    };
  }
}
