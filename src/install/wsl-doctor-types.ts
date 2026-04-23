import type { InstallStep } from "./install-types";
import type { HermesInstallSourceConfig, HermesRuntimeConfig } from "../shared/types";
import type { RuntimeProbeResult } from "../runtime/runtime-types";
import type {
  ManagedWslInstallerFailureArtifacts,
  ManagedWslInstallerFailureCommand,
  ManagedWslInstallerRecovery,
  ManagedWslInstallerRecoveryAction,
  ManagedWslInstallerResumeStage,
} from "./managed-wsl-recovery-types";

export type WslDoctorCategory =
  | "wsl"
  | "distro"
  | "python"
  | "hermes"
  | "bridge"
  | "config"
  | "path"
  | "support";

export type WslDoctorStatus = "passed" | "warning" | "failed" | "skipped";

export type WslDoctorOverallStatus =
  | "ready_to_attach_existing_wsl"
  | "repair_needed"
  | "manual_setup_required"
  | "unsupported";

export type WslDoctorCheck = {
  checkId: string;
  category: WslDoctorCategory;
  status: WslDoctorStatus;
  code: string;
  summary: string;
  detail?: string;
  autoFixable: boolean;
  fixHint?: string;
  debugContext?: Record<string, unknown>;
};

export type WslDoctorReport = {
  checkedAt: string;
  runtime: HermesRuntimeConfig;
  overallStatus: WslDoctorOverallStatus;
  checks: WslDoctorCheck[];
  recommendedActions: string[];
  blockingIssues: WslDoctorCheck[];
  safeAutoRepairs: WslDoctorCheck[];
  runtimeProbe: RuntimeProbeResult;
};

export type WslRepairDependencyId = "python3" | "git" | "pip" | "venv";

export type WslRepairDependencyStatus =
  | "unknown"
  | "ok"
  | "missing"
  | "repair_planned"
  | "repair_executing"
  | "repaired"
  | "manual_action_required"
  | "failed";

export type WslRepairDependencyCheck = {
  dependency: WslRepairDependencyId;
  status: WslRepairDependencyStatus;
  available: boolean;
  code: string;
  summary: string;
  detail?: string;
  fixHint?: string;
  debugContext?: Record<string, unknown>;
};

export type WslRepairAction =
  | "set_runtime_wsl"
  | "set_default_python"
  | "select_existing_distro"
  | "refresh_bridge_config"
  | "install_python3"
  | "install_git"
  | "install_pip"
  | "install_venv"
  | "none";

export type WslRepairStep = {
  action: WslRepairAction;
  status: "applied" | "skipped" | "failed";
  code: string;
  summary: string;
  detail?: string;
  fixHint?: string;
  dependency?: WslRepairDependencyId;
  command?: string;
  debugContext?: Record<string, unknown>;
};

export type WslRepairDryRunAction = {
  actionId: WslRepairAction;
  description: string;
  target: string;
  safe: boolean;
  reversible: boolean;
  wouldChange: boolean;
  expectedOutcome: string;
  code?: string;
  dependency?: WslRepairDependencyId;
  command?: string;
  manualActionRequired?: boolean;
  debugContext?: Record<string, unknown>;
};

export type WslRepairDryRunResult = {
  ok: boolean;
  summary: string;
  dependencyChecks: WslRepairDependencyCheck[];
  actions: WslRepairDryRunAction[];
  before: WslDoctorReport;
  expectedStatus: WslDoctorOverallStatus;
};

export type WslRepairResult = {
  ok: boolean;
  repaired: boolean;
  summary: string;
  dependencyChecks: WslRepairDependencyCheck[];
  steps: WslRepairStep[];
  repairedDependencies: WslRepairDependencyId[];
  skippedDependencies: WslRepairDependencyId[];
  failedDependencies: WslRepairDependencyId[];
  manualActionsRequired: Array<{
    dependency?: WslRepairDependencyId;
    summary: string;
    fixHint?: string;
  }>;
  nextRecommendedStep: ManagedWslInstallerRecoveryAction;
  dryRun?: WslRepairDryRunResult;
  before: WslDoctorReport;
  after?: WslDoctorReport;
};

export type WslDistroCreateResult = {
  requestedAt: string;
  requestedBy: "install" | "debug";
  distroName: string;
  explicitCreate: boolean;
  existedBefore: boolean;
  createdNow: boolean;
  reachableAfterCreate: boolean;
  reprobeStatus?: RuntimeProbeResult["overallStatus"];
  reDoctorStatus?: WslDoctorOverallStatus;
  steps: InstallStep[];
  lastSuccessfulStage?: ManagedWslInstallerResumeStage;
  recovery?: ManagedWslInstallerRecovery;
  failureArtifacts?: ManagedWslInstallerFailureArtifacts;
  command?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  debugContext?: Record<string, unknown>;
};

export type WslHermesInstallResult = {
  requestedAt: string;
  distroName: string;
  hermesRoot: string;
  hermesSource?: HermesInstallSourceConfig;
  hermesCommit?: string;
  hermesVersion?: string;
  capabilityProbe?: {
    minimumSatisfied: boolean;
    cliVersion?: string;
    missing?: string[];
    supportsLaunchMetadataArg: boolean;
    supportsLaunchMetadataEnv: boolean;
    supportsResume: boolean;
  };
  pythonResolved?: string;
  venvPath?: string;
  repoReady: boolean;
  installExecuted: boolean;
  healthCheckPassed: boolean;
  resumedFromStage?: ManagedWslInstallerResumeStage;
  lastSuccessfulStage?: ManagedWslInstallerResumeStage;
  repoStatus?: {
    state: "missing" | "ready" | "invalid" | "updated" | "cloned" | "failed" | "reused";
    root?: string;
    detail?: string;
  };
  venvStatus?: {
    state: "missing" | "ready" | "created" | "skipped" | "failed" | "reused";
    path?: string;
    detail?: string;
  };
  bridgeStatus?: Record<string, unknown>;
  failedCommand?: ManagedWslInstallerFailureCommand;
  recovery?: ManagedWslInstallerRecovery;
  failureArtifacts?: ManagedWslInstallerFailureArtifacts;
  reprobeStatus?: "ready" | "degraded" | "missing_dependency" | "misconfigured" | "unavailable";
  reDoctorStatus?: WslDoctorOverallStatus;
  steps: InstallStep[];
  debugContext?: Record<string, unknown>;
};
