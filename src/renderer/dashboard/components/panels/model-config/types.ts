import type { LucideIcon } from "lucide-react";
import type { LocalModelDiscoveryResult, ModelCapabilityRole, ModelConnectionTestResult, ModelRole, ModelSourceDefinition, ModelSourceType, RuntimeCompatibility } from "../../../../../shared/types";

export type ModelSummary = {
  sourceType?: string;
  currentModel?: string;
  baseUrl?: string;
  secretStatus?: string;
  message?: string;
  recommendedFix?: string;
};

export type OverviewModels = {
  defaultProfileId?: string;
  roleAssignments?: Partial<Record<ModelRole, string>>;
  providers?: ModelSourceDefinition[];
  providerProfiles: Array<{ id: string; provider: string; label: string; apiKeySecretRef?: string }>;
  modelProfiles: Array<{
    id: string;
    name?: string;
    provider: string;
    model: string;
    baseUrl?: string;
    secretRef?: string;
    sourceType?: ModelSourceType;
    authMode?: string;
    agentRole?: ModelCapabilityRole;
    supportsTools?: boolean;
    supportsVision?: boolean;
    maxTokens?: number;
    lastHealthSummary?: string;
    lastHealthStatus?: string;
    lastHealthCheckAt?: string;
  }>;
  summary?: ModelSummary;
};

export type SecretMeta = { ref: string; exists: boolean };

export type OperationNotice = {
  tone: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
};

export type ProviderGroupId = "recommended" | "international" | "china" | "local";

export type ProviderPreset = {
  id: ModelSourceType;
  label: string;
  group: ProviderGroupId;
  authHint: string;
  baseUrl?: string;
  defaultModel?: string;
  modelPlaceholder: string;
  keyMode: "required" | "optional";
  icon: LucideIcon;
  modelOptions?: string[];
  description: string;
  keywords: string[];
  badge?: string;
  authModeToStore: "api_key" | "oauth" | "local_credentials" | "external_process" | "optional_api_key";
  roleCapabilities: ModelRole[];
  runtimeCompatibility: RuntimeCompatibility;
  /**
   * CC Switch 模式：直接配置对象模板。
   * 如果存在，保存时会直接填充到 ModelProfile.settingsConfig，
   * 运行时通过 runtime-env-resolver 直接透传，不再走 legacy 分支转换。
   */
  settingsConfig?: {
    env: Record<string, string>;
  };
  /** 模板变量定义：key 对应 settingsConfig.env 中的 ${var} 占位符 */
  templateValues?: Record<string, { label: string; placeholder: string; defaultValue?: string }>;
};

export type DraftState = {
  sourceType: ModelSourceType;
  baseUrl: string;
  model: string;
  secretRef: string;
};

export type BusyAction = "discover" | "test" | "save";

export type ConnectionDraft = {
  sourceType: ModelSourceType;
  provider: ProviderPreset;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiSecret: string;
  secretRef: string;
  hasStoredSecret: boolean;
  modelOptions: string[];
  discovery?: LocalModelDiscoveryResult;
  testResult?: ModelConnectionTestResult;
};
