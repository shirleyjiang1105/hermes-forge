import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppPaths } from "../main/app-paths";
import { ManagedWslInstallerService } from "./managed-wsl-installer-service";
import type { ManagedWslInstallerReport } from "./managed-wsl-installer-types";
import type { WslDoctorReport, WslRepairDryRunResult } from "./wsl-doctor-types";

let tempRoot = "";

function doctorReport(): WslDoctorReport {
  return {
    checkedAt: new Date().toISOString(),
    runtime: {
      mode: "wsl",
      distro: "Ubuntu",
      pythonCommand: "python3",
      managedRoot: "/home/test/.hermes-forge/hermes-agent",
      windowsAgentMode: "hermes_native",
    },
    overallStatus: "ready_to_attach_existing_wsl",
    checks: [],
    recommendedActions: [],
    blockingIssues: [],
    safeAutoRepairs: [],
    runtimeProbe: {
      distroName: "Ubuntu",
      overallStatus: "ready",
      issues: [],
    } as any,
  };
}

function dryRunResult(): WslRepairDryRunResult {
  return {
    ok: true,
    summary: "no repair needed",
    dependencyChecks: [
      { dependency: "python3", status: "ok", available: true, code: "ok", summary: "python ok" },
      { dependency: "git", status: "ok", available: true, code: "ok", summary: "git ok" },
      { dependency: "pip", status: "ok", available: true, code: "ok", summary: "pip ok" },
      { dependency: "venv", status: "ok", available: true, code: "ok", summary: "venv ok" },
    ],
    actions: [],
    before: doctorReport(),
    expectedStatus: "ready_to_attach_existing_wsl",
  };
}

describe("ManagedWslInstallerService", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "managed-wsl-installer-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("completes the managed WSL install chain and stores a report", async () => {
    const service = new ManagedWslInstallerService(
      new AppPaths(tempRoot),
      { diagnose: vi.fn(async () => doctorReport()) } as any,
      {
        dryRun: vi.fn(async () => dryRunResult()),
        repair: vi.fn(),
      } as any,
      {
        createOrAttach: vi.fn(),
      } as any,
      {
        install: vi.fn(async () => ({
          requestedAt: new Date().toISOString(),
          distroName: "Ubuntu",
          hermesRoot: "/home/test/.hermes-forge/hermes-agent",
          pythonResolved: "/home/test/.hermes-forge/hermes-agent/.venv/bin/python",
          repoReady: true,
          installExecuted: true,
          healthCheckPassed: true,
          lastSuccessfulStage: "health_check",
          reprobeStatus: "ready",
          reDoctorStatus: "ready_to_attach_existing_wsl",
          steps: [
            { phase: "cloning", step: "clone-repo", status: "passed", code: "ok", summary: "repo ok" },
            { phase: "installing_dependencies", step: "pip-install", status: "passed", code: "ok", summary: "pip ok" },
            { phase: "health_check", step: "verify-hermes", status: "passed", code: "ok", summary: "health ok" },
          ],
        })),
      } as any,
    );

    const report = await service.install();

    expect(report.finalInstallerState).toBe("completed");
    expect(report.managedRoot).toBe("/home/test/.hermes-forge/hermes-agent");
    expect(report.repoStatus.status).toBe("ready");
    expect(report.installStatus.status).toBe("ready");
    expect(report.healthStatus.status).toBe("ready");
    expect(report.lastSuccessfulStage).toBe("health_check");
    expect(report.nextRecommendedStep).toBe("none");
    expect(report.reportPath).toBeTruthy();
    await expect(fs.readFile(report.reportPath!, "utf8")).resolves.toContain("\"finalInstallerState\": \"completed\"");
  });

  it("stops at repair_planned when dependencies still need explicit repair", async () => {
    const repairPlan: WslRepairDryRunResult = {
      ...dryRunResult(),
      summary: "repair needed",
      ok: true,
      dependencyChecks: [
        { dependency: "python3", status: "repair_planned", available: false, code: "python_missing", summary: "python missing" },
        { dependency: "git", status: "ok", available: true, code: "ok", summary: "git ok" },
        { dependency: "pip", status: "repair_planned", available: false, code: "pip_missing", summary: "pip missing" },
        { dependency: "venv", status: "repair_planned", available: false, code: "venv_unavailable", summary: "venv missing" },
      ],
      actions: [
        { actionId: "install_python3", description: "install python3", target: "python3", safe: true, reversible: false, wouldChange: true, expectedOutcome: "python ok", dependency: "python3", command: "apt-get install -y python3" },
      ],
    };
    const service = new ManagedWslInstallerService(
      new AppPaths(tempRoot),
      { diagnose: vi.fn(async () => doctorReport()) } as any,
      {
        dryRun: vi.fn(async () => repairPlan),
        repair: vi.fn(),
      } as any,
      { createOrAttach: vi.fn() } as any,
      { install: vi.fn() } as any,
    );

    const report = await service.planInstall();

    expect(report.finalInstallerState).toBe("repair_planned");
    expect(report.code).toBe("python_missing");
    expect(report.pythonStatus.code).toBe("python_missing");
    expect(report.nextRecommendedStep).toBe("run_execute_repair");
  });
});
