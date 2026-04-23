import type { RuntimeOverallStatus } from "../runtime/runtime-types";
import type {
  ManagedWslInstallerFailureArtifacts,
  ManagedWslInstallerRecovery,
  ManagedWslInstallerRecoveryAction,
  ManagedWslInstallerResumeStage,
} from "./managed-wsl-recovery-types";
import type {
  WslDoctorOverallStatus,
  WslDoctorReport,
  WslDistroCreateResult,
  WslHermesInstallResult,
  WslRepairDependencyId,
  WslRepairDependencyStatus,
  WslRepairDryRunResult,
  WslRepairResult,
} from "./wsl-doctor-types";

export type ManagedWslInstallerState =
  | "doctor_started"
  | "doctor_blocked"
  | "repair_planned"
  | "repair_executing"
  | "distro_ready"
  | "hermes_install_started"
  | "hermes_install_blocked"
  | "hermes_install_failed"
  | "hermes_install_ready"
  | "completed";

export type ManagedWslInstallerCode =
  | "python_missing"
  | "git_missing"
  | "pip_missing"
  | "venv_unavailable"
  | "repo_invalid"
  | "repo_clone_failed"
  | "pip_install_failed"
  | "hermes_healthcheck_failed"
  | "bridge_unreachable"
  | "distro_unavailable"
  | "unsupported"
  | "manual_action_required"
  | "ok";

export type ManagedWslInstallerPhase =
  | "doctor"
  | "repair"
  | "distro"
  | "install"
  | "health_check"
  | "completed";

export type ManagedWslInstallerStatus =
  | "pending"
  | "running"
  | "blocked"
  | "failed"
  | "ready"
  | "completed"
  | "skipped";

export type ManagedWslInstallerStepResult = {
  phase: ManagedWslInstallerPhase;
  step: string;
  status: ManagedWslInstallerStatus;
  code: ManagedWslInstallerCode;
  summary: string;
  detail?: string;
  fixHint?: string;
  debugContext?: Record<string, unknown>;
};

export type ManagedWslInstallerDependencyResult = {
  dependency: WslRepairDependencyId;
  status: WslRepairDependencyStatus;
  code: ManagedWslInstallerCode;
  summary: string;
  detail?: string;
  fixHint?: string;
  debugContext?: Record<string, unknown>;
};

export type ManagedWslInstallerReport = {
  startedAt: string;
  finishedAt: string;
  finalInstallerState: ManagedWslInstallerState;
  phase: ManagedWslInstallerPhase;
  step: string;
  status: ManagedWslInstallerStatus;
  code: ManagedWslInstallerCode;
  summary: string;
  detail?: string;
  fixHint?: string;
  debugContext?: Record<string, unknown>;
  current: ManagedWslInstallerStepResult;
  timeline: ManagedWslInstallerStepResult[];
  distroName?: string;
  managedRoot?: string;
  hermesSource?: import("../shared/types").HermesInstallSourceConfig;
  hermesCommit?: string;
  hermesVersion?: string;
  hermesCapabilityProbe?: {
    minimumSatisfied: boolean;
    cliVersion?: string;
    missing?: string[];
    supportsLaunchMetadataArg: boolean;
    supportsLaunchMetadataEnv: boolean;
    supportsResume: boolean;
  };
  pythonStatus: ManagedWslInstallerDependencyResult;
  gitStatus: ManagedWslInstallerDependencyResult;
  pipStatus: ManagedWslInstallerDependencyResult;
  venvStatus: ManagedWslInstallerDependencyResult;
  repoStatus: ManagedWslInstallerStepResult;
  installStatus: ManagedWslInstallerStepResult;
  healthStatus: ManagedWslInstallerStepResult;
  reprobeStatus?: RuntimeOverallStatus;
  reDoctorStatus?: WslDoctorOverallStatus;
  resumedFromStage?: ManagedWslInstallerResumeStage;
  lastSuccessfulStage?: ManagedWslInstallerResumeStage;
  recovery?: ManagedWslInstallerRecovery;
  nextRecommendedStep?: ManagedWslInstallerRecoveryAction;
  failureArtifacts?: ManagedWslInstallerFailureArtifacts;
  lastDoctor?: WslDoctorReport;
  lastDryRunRepair?: WslRepairDryRunResult;
  lastRepairExecution?: WslRepairResult;
  lastCreateDistro?: WslDistroCreateResult;
  lastHermesInstall?: WslHermesInstallResult;
  reportPath?: string;
};

export function installerStep(input: ManagedWslInstallerStepResult): ManagedWslInstallerStepResult {
  return input;
}

export function emptyDependencyResult(dependency: WslRepairDependencyId): ManagedWslInstallerDependencyResult {
  return {
    dependency,
    status: "unknown",
    code: "manual_action_required",
    summary: `${dependency} 状态尚未探测。`,
  };
}
