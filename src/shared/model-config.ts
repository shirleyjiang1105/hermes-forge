import type { ModelProfile, ModelRole, ModelSourceType, ProviderId, RuntimeConfig } from "./types";

/**
 * Coding Plan / 特殊路由 sourceType → Hermes Agent 内部 provider 名映射。
 *
 * Hermes Agent 在 CLI 命令 (`--provider X`) 与 AIAgent 构造函数
 * (`provider="X"`) 上接受同一组 provider 名，例如 `kimi-coding`、`zhipu-coding`。
 * Forge 默认让所有 Coding Plan profile 的 `provider` 字段挂在 `custom` 上，
 * 但 Hermes AIAgent 不认识 `custom`，需要把 sourceType 翻译成它认识的 alias。
 */
export function mapSourceTypeToHermesProvider(sourceType?: ModelSourceType | string): string | undefined {
  switch (sourceType) {
    case "kimi_coding_api_key":
      return "kimi-coding";
    case "kimi_coding_cn_api_key":
      return "kimi-coding-cn";
    case "stepfun_coding_api_key":
      return "stepfun";
    case "minimax_coding_api_key":
      return "minimax";
    case "minimax_cn_token_plan_api_key":
      return "minimax-cn";
    case "zhipu_coding_api_key":
      return "zhipu-coding";
    case "dashscope_coding_api_key":
      return "dashscope-coding";
    case "baidu_qianfan_coding_api_key":
      return "baidu-qianfan-coding";
    case "tencent_token_plan_api_key":
      return "tencent-token-plan";
    case "tencent_hunyuan_token_plan_api_key":
      return "tencent-hy-token-plan";
    case "volcengine_coding_api_key":
      return "volcengine-coding";
    default:
      return undefined;
  }
}

/**
 * 给 Hermes Agent 用的 provider 名解析。
 *
 * 优先使用 sourceType 映射（覆盖所有 Coding Plan profile），其次按 ProviderId
 * 做兼容翻译。当 ProviderId === "custom" 且没有 sourceType 映射时，仍然返回
 * `custom`，由 Hermes Agent 走 OpenAI-compatible 自动识别。
 */
export function resolveHermesProvider(input: { provider: string; sourceType?: ModelSourceType | string }): string {
  const mapped = mapSourceTypeToHermesProvider(input.sourceType);
  if (mapped) return mapped;
  if (input.provider === "openai") return "openrouter";
  if (input.provider === "copilot_acp") return "copilot-acp";
  return input.provider;
}

export function normalizeOpenAiCompatibleBaseUrl(baseUrl?: string) {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return undefined;

  const parsed = new URL(trimmed);
  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/v1";
  }
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString().replace(/\/$/, "");
}

export function requiresStoredSecret(profile: ModelProfile) {
  if (profile.provider === "local") return false;
  if (profile.provider === "custom") return Boolean(profile.secretRef?.trim());
  return true;
}

export function missingSecretMessage(profile: ModelProfile) {
  if (profile.provider === "custom") {
    return "当前配置填写了密钥引用，但对应密钥尚未保存或已失效。";
  }
  return `${profile.provider} 模型缺少可用密钥。`;
}

type LegacyModelProfile = Partial<ModelProfile> & {
  providerId?: unknown;
  defaultModel?: unknown;
  default_model?: unknown;
};

type LegacyRuntimeConfig = Partial<RuntimeConfig> & {
  defaultModelId?: unknown;
  defaultModel?: unknown;
  default_model?: unknown;
  default_model_id?: unknown;
  models?: unknown;
};

const PROVIDERS: ProviderId[] = ["openai", "anthropic", "openrouter", "gemini", "deepseek", "huggingface", "copilot", "copilot_acp", "local", "custom"];

export function stableModelProfileId(input: Pick<ModelProfile, "provider" | "model"> & { baseUrl?: string }) {
  const key = modelIdentityKey(input.provider, input.model, input.baseUrl);
  return `model-${stableHash(key)}`;
}

export function migrateRuntimeConfigModels<T extends Partial<RuntimeConfig>>(input: T | LegacyRuntimeConfig): T & Pick<RuntimeConfig, "modelProfiles"> & { defaultModelProfileId?: string; modelRoleAssignments?: RuntimeConfig["modelRoleAssignments"] } {
  const raw = (input ?? {}) as LegacyRuntimeConfig;
  const rawProfiles = Array.isArray(raw.modelProfiles)
    ? raw.modelProfiles
    : Array.isArray(raw.models)
      ? raw.models
      : [];
  const modelProfiles = dedupeProfiles(rawProfiles
    .map((item) => normalizeLegacyModelProfile(item))
    .filter((item): item is ModelProfile => Boolean(item)));
  const rawDefault = firstString(
    raw.defaultModelId,
    raw.defaultModelProfileId,
    raw.modelRoleAssignments?.chat,
    raw.default_model_id,
    raw.default_model,
    raw.defaultModel,
  );
  const defaultModelProfileId = resolveDefaultModelProfileId(rawDefault, modelProfiles);
  const modelRoleAssignments = normalizeRoleAssignments(raw.modelRoleAssignments, defaultModelProfileId, modelProfiles);
  return {
    ...input,
    modelProfiles,
    defaultModelProfileId,
    modelRoleAssignments,
  } as T & Pick<RuntimeConfig, "modelProfiles"> & { defaultModelProfileId?: string };
}

export function resolveDefaultModelProfileId(rawDefault: string | undefined, profiles: ModelProfile[]) {
  if (!profiles.length) return undefined;
  const wanted = rawDefault?.trim();
  if (!wanted) return profiles[0].id;
  return (
    profiles.find((item) => item.id === wanted)?.id ??
    profiles.find((item) => modelIdentityKey(item.provider, item.model, item.baseUrl) === wanted)?.id ??
    profiles.find((item) => stableModelProfileId(item) === wanted)?.id ??
    profiles.find((item) => `${item.provider}:${item.model}` === wanted)?.id ??
    profiles.find((item) => item.model === wanted)?.id ??
    profiles.find((item) => item.name === wanted)?.id ??
    profiles[0].id
  );
}

function normalizeLegacyModelProfile(input: unknown): ModelProfile | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as LegacyModelProfile;
  const model = firstString(raw.model, raw.defaultModel, raw.default_model, raw.name);
  if (!model) return undefined;
  const provider = normalizeProvider(firstString(raw.provider, raw.providerId), raw.baseUrl);
  const baseUrl = typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : undefined;
  const profile: ModelProfile = {
    ...raw,
    id: typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : stableModelProfileId({ provider, model, baseUrl }),
    provider,
    model,
    ...(baseUrl ? { baseUrl } : {}),
  };
  return profile;
}

function normalizeRoleAssignments(raw: unknown, defaultModelProfileId: string | undefined, profiles: ModelProfile[]) {
  const ids = new Set(profiles.map((profile) => profile.id));
  const next: Partial<Record<ModelRole, string>> = {};
  if (raw && typeof raw === "object") {
    for (const role of ["chat", "coding_plan", "apply", "autocomplete"] as const) {
      const value = (raw as Partial<Record<ModelRole, unknown>>)[role];
      if (typeof value === "string" && ids.has(value)) next[role] = value;
    }
  }
  if (!next.chat && defaultModelProfileId && ids.has(defaultModelProfileId)) next.chat = defaultModelProfileId;
  if (!next.chat && profiles[0]) next.chat = profiles[0].id;
  return Object.keys(next).length ? next : undefined;
}

function dedupeProfiles(profiles: ModelProfile[]) {
  const byId = new Map<string, ModelProfile>();
  for (const profile of profiles) {
    byId.set(profile.id, profile);
  }
  return [...byId.values()];
}

function normalizeProvider(provider: string | undefined, baseUrl: unknown): ProviderId {
  const normalized = provider?.trim().toLowerCase().replace(/-/g, "_");
  if (normalized && PROVIDERS.includes(normalized as ProviderId)) return normalized as ProviderId;
  const url = typeof baseUrl === "string" ? baseUrl.toLowerCase() : "";
  if (url.includes("openrouter.ai")) return "openrouter";
  if (url.includes("api.openai.com")) return "openai";
  if (url.includes("anthropic.com")) return "anthropic";
  if (url.includes("generativelanguage.googleapis.com")) return "gemini";
  if (url.includes("deepseek.com")) return "deepseek";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "custom";
  return "custom";
}

function modelIdentityKey(provider: string, model: string, baseUrl?: string) {
  return `${provider.trim().toLowerCase()}:${model.trim()}:${baseUrl?.trim().replace(/\/$/, "") ?? ""}`;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
