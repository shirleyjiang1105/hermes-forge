const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const ASSIGNMENT_SECRET_PATTERN = /\b(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE[_-]?KEY|AUTHORIZATION|COOKIE)\b\s*[:=]\s*["']?[^"'\s,;]+/gi;
const JSON_SECRET_PATTERN = /("(?:apiKey|api_key|token|secret|password|authorization|cookie|privateKey|private_key)"\s*:\s*)"[^"]*"/gi;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{12,}\b/g;

export function redactSensitiveText(value: string) {
  return value
    .replace(PRIVATE_KEY_PATTERN, "[REDACTED_PRIVATE_KEY]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(ASSIGNMENT_SECRET_PATTERN, (_match, key) => `${key}=[REDACTED]`)
    .replace(JSON_SECRET_PATTERN, "$1\"[REDACTED]\"")
    .replace(SK_KEY_PATTERN, "sk-[REDACTED]");
}

export function redactSensitiveValue<T>(value: T): T {
  if (typeof value === "string") {
    return redactSensitiveText(value) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(redactSensitiveText(JSON.stringify(value))) as T;
  } catch {
    return value;
  }
}
