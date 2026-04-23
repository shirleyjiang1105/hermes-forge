import type { ManagedWslInstallerIpcResult } from "../../shared/types";

export async function planManagedWslInstall() {
  return window.workbenchClient.installerPlan();
}

export async function dryRunManagedWslRepair() {
  return window.workbenchClient.installerDryRunRepair();
}

export async function executeManagedWslRepair() {
  return window.workbenchClient.installerExecuteRepair();
}

export async function installManagedWsl() {
  return window.workbenchClient.installerInstall();
}

export async function getLastManagedWslInstallReport(): Promise<ManagedWslInstallerIpcResult> {
  return window.workbenchClient.installerGetLastReport();
}
