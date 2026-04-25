import type { RuntimeAdapterFactory } from "../../runtime/runtime-adapter";
import type {
  ModelConnectionTestResult,
  ModelHealthCheckStep,
  ModelProfile,
  ModelSourceDefinition,
  ModelSourceType,
  RuntimeConfig,
} from "../../shared/types";
import type { SecretVault } from "../../auth/secret-vault";

export type { ModelSourceDefinition } from "../../shared/types";

export type ModelConnectionDraft = {
  sourceType: ModelSourceType;
  profileId?: string;
  provider?: ModelProfile["provider"];
  baseUrl?: string;
  model?: string;
  secretRef?: string;
  maxTokens?: number;
};

export type ProviderTestInput = {
  profile: ModelProfile;
  config: RuntimeConfig;
  secretVault: SecretVault;
  runtimeAdapterFactory: RuntimeAdapterFactory;
  resolveHermesRoot: () => Promise<string>;
};

export type ProviderTestContext = ProviderTestInput & {
  sourceType: ModelSourceType;
};

export type ProviderAuthResult =
  | { ok: true; auth?: string }
  | { ok: false; result: ModelConnectionTestResult };

export type ModelPayloadItem = {
  id?: string;
  context_length?: number;
  context_window?: number;
};

export type ModelListResult = {
  ok: boolean;
  message: string;
  failureCategory?: NonNullable<ModelConnectionTestResult["failureCategory"]>;
  recommendedFix?: string;
  availableModels: string[];
  rawModelPayload?: ModelPayloadItem[];
  authResolved: boolean;
};

export type ChatResult = {
  ok: boolean;
  message: string;
  failureCategory?: NonNullable<ModelConnectionTestResult["failureCategory"]>;
  recommendedFix?: string;
};

export type ToolCheckResult = {
  ok: boolean;
  message: string;
  detail?: string;
  recommendedFix?: string;
};

export type ProviderHealthResultInput = {
  profile: ModelProfile;
  sourceType: ModelSourceType;
  family: ModelConnectionTestResult["providerFamily"];
  authMode: ModelConnectionTestResult["authMode"];
  message: string;
  steps: ModelHealthCheckStep[];
  normalizedBaseUrl?: string;
  availableModels?: string[];
  authResolved?: boolean;
  contextWindow?: number;
  supportsTools?: boolean;
  agentRole?: ModelConnectionTestResult["agentRole"];
  runtimeCompatibility?: ModelConnectionTestResult["runtimeCompatibility"];
  roleCompatibility?: ModelConnectionTestResult["roleCompatibility"];
  wslReachable?: boolean;
  wslProbeUrl?: string;
};
