export type ManagedWslInstallerResumeStage =
  | "doctor"
  | "repair"
  | "create_distro"
  | "ensure_python"
  | "ensure_repo"
  | "ensure_venv"
  | "pip_install"
  | "health_check";

export type ManagedWslInstallerRecoveryDisposition =
  | "retryable"
  | "non_retryable"
  | "manual_action_required";

export type ManagedWslInstallerRecoveryAction =
  | "retry_install"
  | "retry_create_distro"
  | "run_dry_run_repair"
  | "run_execute_repair"
  | "restart_bridge_and_retry"
  | "manual_create_distro"
  | "manual_repo_cleanup"
  | "manual_fix_then_retry"
  | "export_diagnostics"
  | "none";

export type ManagedWslInstallerRecovery = {
  failureStage: ManagedWslInstallerResumeStage;
  disposition: ManagedWslInstallerRecoveryDisposition;
  code: string;
  summary: string;
  detail?: string;
  fixHint?: string;
  nextAction: ManagedWslInstallerRecoveryAction;
  debugContext?: Record<string, unknown>;
};

export type ManagedWslInstallerFailureCommand = {
  commandSummary: string;
  commandId?: string;
  exitCode?: number | null;
  stdoutPreview?: string;
  stderrPreview?: string;
};

export type ManagedWslInstallerFailureArtifacts = {
  failedCommand?: ManagedWslInstallerFailureCommand;
  distroName?: string;
  managedRoot?: string;
  repoStatus?: Record<string, unknown>;
  venvStatus?: Record<string, unknown>;
  bridgeStatus?: Record<string, unknown>;
  lastSuccessfulStage?: ManagedWslInstallerResumeStage;
  recommendedRecoveryAction?: ManagedWslInstallerRecoveryAction;
};

const STAGE_ORDER: ManagedWslInstallerResumeStage[] = [
  "doctor",
  "repair",
  "create_distro",
  "ensure_python",
  "ensure_repo",
  "ensure_venv",
  "pip_install",
  "health_check",
];

export function compareInstallerStage(
  left?: ManagedWslInstallerResumeStage,
  right?: ManagedWslInstallerResumeStage,
) {
  const leftIndex = left ? STAGE_ORDER.indexOf(left) : -1;
  const rightIndex = right ? STAGE_ORDER.indexOf(right) : -1;
  return leftIndex - rightIndex;
}

export function nextInstallerStage(
  stage?: ManagedWslInstallerResumeStage,
): ManagedWslInstallerResumeStage | undefined {
  if (!stage) return undefined;
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0 || index >= STAGE_ORDER.length - 1) {
    return stage;
  }
  return STAGE_ORDER[index + 1];
}
