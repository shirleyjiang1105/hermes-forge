import { describe, expect, it, vi, beforeEach } from "vitest";
import { WslRepairService } from "./wsl-repair-service";
import type { RuntimeConfig } from "../shared/types";
import type { WslDoctorReport } from "./wsl-doctor-types";

const runCommandMock = vi.fn();

vi.mock("../process/command-runner", () => ({
  runCommand: (...args: Parameters<typeof runCommandMock>) => runCommandMock(...args),
}));

function createDoctorReport(): WslDoctorReport {
  return {
    checkedAt: new Date().toISOString(),
    runtime: {
      mode: "wsl",
      distro: "Ubuntu",
      pythonCommand: "python3",
      windowsAgentMode: "hermes_native",
    },
    overallStatus: "repair_needed",
    checks: [],
    recommendedActions: [],
    blockingIssues: [],
    safeAutoRepairs: [],
    runtimeProbe: {
      checkedAt: new Date().toISOString(),
      runtimeMode: "wsl",
      windowsAvailable: true,
      powershellAvailable: true,
      pythonAvailable: true,
      gitAvailable: true,
      wingetAvailable: true,
      wslAvailable: true,
      distroExists: true,
      distroName: "Ubuntu",
      distroReachable: true,
      wslPythonAvailable: false,
      hermesRootExists: false,
      hermesCliExists: false,
      bridgeReachable: true,
      configResolved: true,
      homeResolved: true,
      memoryResolved: true,
      paths: {
        profileHermesPath: { path: "/tmp/hermes" },
        memoryPath: { path: "/tmp/memory" },
        all: [],
      },
      commands: {
        wsl: { message: "ok" },
      },
      bridge: { running: true, reachable: true, configured: true, message: "ok" },
      overallStatus: "missing_dependency",
      issues: [],
      recommendations: [],
    } as any,
  };
}

describe("WslRepairService", () => {
  let config: RuntimeConfig;
  let configStore: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    runCommandMock.mockReset();
    config = {
      modelProfiles: [],
      updateSources: {},
      enginePaths: {},
      hermesRuntime: {
        mode: "wsl",
        distro: "Ubuntu",
        pythonCommand: "python3",
        windowsAgentMode: "hermes_native",
      },
    };
    configStore = {
      read: vi.fn(async () => config),
      write: vi.fn(async (next: RuntimeConfig) => {
        config = next;
      }),
    };
  });

  it("plans explicit repair commands for missing python3/git/pip/venv", async () => {
    runCommandMock.mockImplementation(async (_command: string, _args: string[], options: { commandId: string }) => {
      if (options.commandId === "repair.wsl.support.apt") return { exitCode: 0, stdout: "yes\n", stderr: "" };
      if (options.commandId === "repair.wsl.support.privilege") return { exitCode: 0, stdout: "sudo\n", stderr: "" };
      if (options.commandId === "repair.wsl.probe.python3") return { exitCode: 1, stdout: "", stderr: "python3 missing" };
      if (options.commandId === "repair.wsl.probe.git") return { exitCode: 1, stdout: "", stderr: "git missing" };
      return { exitCode: 1, stdout: "", stderr: "not available" };
    });
    const service = new WslRepairService(
      configStore as any,
      { probe: vi.fn() } as any,
      (() => ({ getBridgeAccessHost: vi.fn() })) as any,
      { diagnose: vi.fn(async () => createDoctorReport()) } as any,
    );

    const result = await service.dryRun(createDoctorReport());

    expect(result.dependencyChecks.map((check) => check.code)).toEqual(["python_missing", "git_missing", "pip_missing", "venv_unavailable"]);
    expect(result.actions.filter((action) => action.dependency).map((action) => action.actionId)).toEqual([
      "install_python3",
      "install_git",
      "install_pip",
      "install_venv",
    ]);
    expect(result.actions.filter((action) => action.dependency).every((action) => action.command?.includes("apt-get install -y"))).toBe(true);
  });

  it("marks dependency repair as manual_action_required when apt/sudo is unavailable", async () => {
    runCommandMock.mockImplementation(async (_command: string, _args: string[], options: { commandId: string }) => {
      if (options.commandId === "repair.wsl.support.apt") return { exitCode: 0, stdout: "no\n", stderr: "" };
      if (options.commandId === "repair.wsl.support.privilege") return { exitCode: 0, stdout: "none\n", stderr: "" };
      if (options.commandId === "repair.wsl.probe.python3") return { exitCode: 1, stdout: "", stderr: "python3 missing" };
      if (options.commandId === "repair.wsl.probe.git") return { exitCode: 1, stdout: "", stderr: "git missing" };
      return { exitCode: 1, stdout: "", stderr: "not available" };
    });
    const service = new WslRepairService(
      configStore as any,
      { probe: vi.fn() } as any,
      (() => ({ getBridgeAccessHost: vi.fn() })) as any,
      { diagnose: vi.fn(async () => createDoctorReport()) } as any,
    );

    const result = await service.dryRun(createDoctorReport());

    expect(result.ok).toBe(false);
    expect(result.actions.filter((action) => action.dependency).every((action) => action.manualActionRequired)).toBe(true);
  });

  it("reports repaired/failed/manual dependency buckets after execute", async () => {
    const afterDoctor = createDoctorReport();
    runCommandMock.mockImplementation(async (_command: string, _args: string[], options: { commandId: string }) => {
      if (options.commandId === "repair.wsl.support.apt") return { exitCode: 0, stdout: "yes\n", stderr: "" };
      if (options.commandId === "repair.wsl.support.privilege") return { exitCode: 0, stdout: "sudo\n", stderr: "" };
      if (options.commandId === "repair.wsl.probe.python3") return { exitCode: 1, stdout: "", stderr: "python3 missing" };
      if (options.commandId === "repair.wsl.probe.git") return { exitCode: 1, stdout: "", stderr: "git missing" };
      if (options.commandId === "repair.wsl.install_python3") return { exitCode: 0, stdout: "python3 installed", stderr: "", diagnostics: { commandId: "repair.wsl.install_python3" } };
      if (options.commandId === "repair.wsl.install_git") return { exitCode: 1, stdout: "", stderr: "git install failed", diagnostics: { commandId: "repair.wsl.install_git" } };
      return { exitCode: 1, stdout: "", stderr: "not available" };
    });
    const doctorMock = {
      diagnose: vi.fn()
        .mockResolvedValueOnce(createDoctorReport())
        .mockResolvedValueOnce(afterDoctor),
    };
    const service = new WslRepairService(
      configStore as any,
      { probe: vi.fn() } as any,
      (() => ({ getBridgeAccessHost: vi.fn() })) as any,
      doctorMock as any,
    );

    const result = await service.repair(createDoctorReport());

    expect(result.repairedDependencies).toContain("python3");
    expect(result.failedDependencies).toContain("git");
    expect(result.manualActionsRequired.length).toBe(0);
    expect(result.nextRecommendedStep).toBe("run_execute_repair");
  });
});
