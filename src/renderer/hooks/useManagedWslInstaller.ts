import { useEffect } from "react";
import type { ManagedWslInstallerIpcResult } from "../../shared/types";
import { useAppStore } from "../store";
import {
  dryRunManagedWslRepair,
  executeManagedWslRepair,
  getLastManagedWslInstallReport,
  installManagedWsl,
  planManagedWslInstall,
} from "../installer/managed-wsl-installer-client";

export function useManagedWslInstaller() {
  const result = useAppStore((state) => state.managedWslInstaller);
  const loadingAction = useAppStore((state) => state.managedWslInstallerLoadingAction);
  const setResult = useAppStore((state) => state.setManagedWslInstaller);
  const setLoadingAction = useAppStore((state) => state.setManagedWslInstallerLoadingAction);

  useEffect(() => {
    if (!result) {
      void refreshLastReport();
    }
  }, []);

  async function run(
    action: ManagedWslInstallerIpcResult["action"],
    task: () => Promise<ManagedWslInstallerIpcResult>,
  ) {
    setLoadingAction(action);
    try {
      const next = await task();
      setResult(next);
      return next;
    } finally {
      setLoadingAction(undefined);
    }
  }

  function refreshLastReport() {
    return run("get_last_report", getLastManagedWslInstallReport);
  }

  function planInstall() {
    return run("plan", planManagedWslInstall);
  }

  function dryRunRepair() {
    return run("dry_run_repair", dryRunManagedWslRepair);
  }

  function executeRepair() {
    return run("execute_repair", executeManagedWslRepair);
  }

  function install() {
    return run("install", installManagedWsl);
  }

  return {
    result,
    report: result?.report,
    loadingAction,
    refreshLastReport,
    planInstall,
    dryRunRepair,
    executeRepair,
    install,
  };
}
