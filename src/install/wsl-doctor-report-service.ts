import fs from "node:fs/promises";
import path from "node:path";
import type { AppPaths } from "../main/app-paths";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { WslDoctorService } from "./wsl-doctor-service";
import type { WslRepairService } from "./wsl-repair-service";
import type { ManagedWslInstallerService } from "./managed-wsl-installer-service";
import type { ManagedWslInstallerReport } from "./managed-wsl-installer-types";
import type { WslDoctorReport, WslRepairDryRunResult, WslRepairResult } from "./wsl-doctor-types";

export type WslDoctorExport = {
  createdAt: string;
  runtimeConfigSummary: Record<string, unknown>;
  doctor: WslDoctorReport;
  dryRunRepair: WslRepairDryRunResult;
  lastRepairExecution?: WslRepairResult;
  lastCreateDistro?: unknown;
  lastHermesInstall?: unknown;
  finalInstallerState?: ManagedWslInstallerReport["finalInstallerState"];
  installerReport?: ManagedWslInstallerReport;
  summaryText: string;
};

export class WslDoctorReportService {
  constructor(
    private readonly appPaths: AppPaths,
    private readonly configStore: RuntimeConfigStore,
    private readonly doctorService: WslDoctorService,
    private readonly repairService: WslRepairService,
    private readonly installerService?: ManagedWslInstallerService,
  ) {}

  async build(workspacePath?: string): Promise<WslDoctorExport> {
    const [config, installerReportCandidate] = await Promise.all([
      this.configStore.read(),
      this.installerService?.getLastInstallReport() ? Promise.resolve(this.installerService.getLastInstallReport()) : this.installerService?.planInstall(),
    ]);
    const installerReport = installerReportCandidate;
    const doctor = installerReport?.lastDoctor ?? await this.doctorService.diagnose({ workspacePath });
    const dryRunRepair = installerReport?.lastDryRunRepair ?? await this.repairService.dryRun(doctor);
    const safeConfig = {
      hermesRuntime: config.hermesRuntime,
      enginePaths: config.enginePaths,
      defaultModelProfileId: config.defaultModelProfileId,
      modelProfiles: config.modelProfiles.map((profile) => ({
        id: profile.id,
        provider: profile.provider,
        model: profile.model,
        baseUrl: profile.baseUrl,
        secretRef: profile.secretRef ? "[CONFIGURED]" : undefined,
      })),
    };
    const createdAt = new Date().toISOString();
    return {
      createdAt,
      runtimeConfigSummary: safeConfig,
      doctor: redactDoctor(doctor),
      dryRunRepair: redactDryRun(dryRunRepair),
      lastRepairExecution: installerReport?.lastRepairExecution,
      lastCreateDistro: installerReport?.lastCreateDistro,
      lastHermesInstall: installerReport?.lastHermesInstall,
      finalInstallerState: installerReport?.finalInstallerState,
      installerReport: installerReport ? redactInstaller(installerReport) : undefined,
      summaryText: this.summaryText(doctor, dryRunRepair, installerReport),
    };
  }

  async export(workspacePath?: string) {
    const report = await this.build(workspacePath);
    const dir = path.join(this.appPaths.baseDir(), "diagnostics", "wsl-doctor", report.createdAt.replace(/[:.]/g, "-"));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "wsl-doctor.json"), JSON.stringify(report, null, 2), "utf8");
    await fs.writeFile(path.join(dir, "SUMMARY.txt"), report.summaryText, "utf8");
    return { dir, report };
  }

  private summaryText(doctor: WslDoctorReport, dryRun: WslRepairDryRunResult, installerReport?: ManagedWslInstallerReport) {
    return [
      `WSL Doctor: ${doctor.overallStatus}`,
      `Checked at: ${doctor.checkedAt}`,
      installerReport ? `Installer state: ${installerReport.finalInstallerState}` : "Installer state: none",
      installerReport?.lastSuccessfulStage ? `Last successful stage: ${installerReport.lastSuccessfulStage}` : "Last successful stage: none",
      installerReport?.recovery ? `Recovery: ${installerReport.recovery.disposition} -> ${installerReport.recovery.nextAction}` : "Recovery: none",
      "",
      "Blocking issues:",
      ...(doctor.blockingIssues.length
        ? doctor.blockingIssues.map((issue) => `- [${issue.code}] ${issue.summary}${issue.fixHint ? ` | ${issue.fixHint}` : ""}`)
        : ["- none"]),
      "",
      "Dependency checks:",
      ...(dryRun.dependencyChecks.length
        ? dryRun.dependencyChecks.map((check) => `- ${check.dependency}: ${check.status} [${check.code}] ${check.summary}`)
        : ["- none"]),
      "",
      "Dry-run repair actions:",
      ...(dryRun.actions.length
        ? dryRun.actions.map((action) => `- ${action.actionId}: wouldChange=${action.wouldChange}, manual=${Boolean(action.manualActionRequired)} | ${action.expectedOutcome}`)
        : ["- none"]),
      "",
      "Last repair execution:",
      installerReport?.lastRepairExecution ? JSON.stringify(installerReport.lastRepairExecution, null, 2) : "none",
      "",
      "Last create distro result:",
      installerReport?.lastCreateDistro ? JSON.stringify(installerReport.lastCreateDistro, null, 2) : "none",
      "",
      "Last WSL Hermes install result:",
      installerReport?.lastHermesInstall ? JSON.stringify(installerReport.lastHermesInstall, null, 2) : "none",
      "",
      "Final installer state snapshot:",
      installerReport ? JSON.stringify(installerReport, null, 2) : "none",
      "",
    ].join("\n");
  }
}

function redactDoctor(report: WslDoctorReport): WslDoctorReport {
  return JSON.parse(redact(JSON.stringify(report))) as WslDoctorReport;
}

function redactDryRun(report: WslRepairDryRunResult): WslRepairDryRunResult {
  return JSON.parse(redact(JSON.stringify(report))) as WslRepairDryRunResult;
}

function redactInstaller(report: ManagedWslInstallerReport): ManagedWslInstallerReport {
  return JSON.parse(redact(JSON.stringify(report))) as ManagedWslInstallerReport;
}

function redact(raw: string) {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|KEY)["']?\s*:\s*["'][^"']+["']/gi, "$1\":\"[REDACTED]\"");
}
