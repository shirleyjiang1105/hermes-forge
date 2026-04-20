import type { ModelProfile } from "./types";

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
