import type {
  EngineMaintenanceResult,
  HermesInstallEvent,
  HermesInstallResult,
  HermesRuntimeConfig,
  SetupDependencyRepairId,
  SetupDependencyRepairResult,
} from "../shared/types";
import type { RuntimeIssue, RuntimePreflightResult, RuntimeProbeResult } from "../runtime/runtime-types";
import type { WslRepairDryRunResult } from "./wsl-doctor-types";

export type InstallTargetMode = HermesRuntimeConfig["mode"];

export type InstallPhase =
  | "plan"
  | "preflight"
  | "repairing_dependencies"
  | "recovering"
  | "cloning"
  | "installing_dependencies"
  | "health_check"
  | "completed"
  | "failed";

export type InstallStepStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export type InstallStep = {
  phase: InstallPhase;
  step: string;
  status: InstallStepStatus;
  code: string;
  summary: string;
  detail?: string;
  fixHint?: string;
  debugContext?: Record<string, unknown>;
};

export type InstallPlan = {
  mode: InstallTargetMode;
  ok: boolean;
  state?: "ready_to_attach_existing_wsl" | "repair_needed" | "manual_setup_required" | "unsupported";
  summary: string;
  steps: InstallStep[];
  issues: RuntimeIssue[];
  runtimeProbe?: RuntimeProbeResult;
  runtimePreflight?: RuntimePreflightResult;
  repairDryRun?: WslRepairDryRunResult;
};

export type InstallPublisher = (event: HermesInstallEvent) => void;

export type InstallOptions = {
  rootPath?: string;
  mode?: InstallTargetMode;
};

export type InstallStrategyResult = HermesInstallResult & {
  plan?: InstallPlan;
};

export type InstallStrategyUpdateResult = EngineMaintenanceResult & {
  plan?: InstallPlan;
};

export type InstallStrategyRepairResult = SetupDependencyRepairResult & {
  plan?: InstallPlan;
};

export type InstallStrategyKind = "native" | "managed-wsl";

export function installStep(input: InstallStep): InstallStep {
  return input;
}
