import { describe, expect, it, vi, beforeEach } from "vitest";
import { WslHermesInstallService } from "./wsl-hermes-install-service";

const runCommandMock = vi.fn();

vi.mock("../process/command-runner", () => ({
  runCommand: (...args: Parameters<typeof runCommandMock>) => runCommandMock(...args),
}));

function createDoctorReport() {
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
      bridge: { running: true, reachable: true, configured: true, message: "ok" },
    },
  } as any;
}

describe("WslHermesInstallService", () => {
  beforeEach(() => {
    runCommandMock.mockReset();
  });

  it("stops before pip install when virtualenv creation fails", async () => {
    runCommandMock.mockImplementation(async (_command: string, _args: string[], options: { commandId: string }) => {
      switch (options.commandId) {
        case "install.wsl.resolve-home":
          return { exitCode: 0, stdout: "/home/test", stderr: "" };
        case "install.wsl.mkdir-root":
          return { exitCode: 0, stdout: "", stderr: "" };
        case "install.wsl.ensure-python":
          return { exitCode: 0, stdout: "Python 3.12.3", stderr: "" };
        case "install.wsl.git-version":
          return { exitCode: 0, stdout: "git version 2.43.0", stderr: "" };
        case "install.wsl.check-repo":
          return { exitCode: 0, stdout: "no\n", stderr: "" };
        case "install.wsl.git-clone":
          return { exitCode: 0, stdout: "clone ok", stderr: "" };
        case "install.wsl.check-venv":
          return { exitCode: 0, stdout: "no\n", stderr: "" };
        case "install.wsl.create-venv":
          return { exitCode: 1, stdout: "", stderr: "ensurepip is not available" };
        default:
          return { exitCode: 1, stdout: "", stderr: `unexpected command: ${options.commandId}` };
      }
    });

    const service = new WslHermesInstallService(
      { baseDir: () => "C:\\temp" } as any,
      { read: vi.fn(async () => ({})), write: vi.fn(async () => undefined) } as any,
      { probe: vi.fn() } as any,
      (() => ({ preflight: vi.fn() })) as any,
      { diagnose: vi.fn(async () => createDoctorReport()) } as any,
    );

    const result = await service.install({ report: createDoctorReport() });

    expect(result.installExecuted).toBe(false);
    expect(result.healthCheckPassed).toBe(false);
    expect(result.lastSuccessfulStage).toBe("ensure_repo");
    expect(result.venvStatus).toMatchObject({ state: "failed" });
    expect(result.steps.some((step) => step.step === "pip-install")).toBe(false);
    expect(result.steps.find((step) => step.step === "ensure-venv")).toMatchObject({
      status: "failed",
      code: "venv_unavailable",
    });
  });

  it("treats Hermes verification as successful even when bridge-only follow-up checks are degraded", async () => {
    runCommandMock.mockImplementation(async (_command: string, _args: string[], options: { commandId: string }) => {
      switch (options.commandId) {
        case "install.wsl.resolve-home":
          return { exitCode: 0, stdout: "/home/test", stderr: "" };
        case "install.wsl.mkdir-root":
        case "install.wsl.git-clone":
        case "install.wsl.pip-install":
          return { exitCode: 0, stdout: "ok", stderr: "" };
        case "install.wsl.ensure-python":
          return { exitCode: 0, stdout: "Python 3.12.3", stderr: "" };
        case "install.wsl.git-version":
          return { exitCode: 0, stdout: "git version 2.43.0", stderr: "" };
        case "install.wsl.check-repo":
        case "install.wsl.check-venv":
          return { exitCode: 0, stdout: "no\n", stderr: "" };
        case "install.wsl.create-venv":
          return { exitCode: 0, stdout: "", stderr: "" };
        case "install.wsl.pip-version":
          return { exitCode: 0, stdout: "pip 24.0", stderr: "" };
        case "install.wsl.hermes-version":
          return { exitCode: 0, stdout: "Hermes Agent v0.10.0", stderr: "" };
        case "install.wsl.hermes-capabilities":
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              cliVersion: "0.10.0",
              capabilities: {
                supportsLaunchMetadataArg: true,
                supportsLaunchMetadataEnv: true,
                supportsResume: true,
              },
            }),
            stderr: "",
          };
        default:
          return { exitCode: 1, stdout: "", stderr: `unexpected command: ${options.commandId}` };
      }
    });
    const bridgeIssue = {
      code: "bridge_unreachable",
      severity: "error",
      summary: "Windows Bridge 不可达。",
    };
    const service = new WslHermesInstallService(
      { baseDir: () => "C:\\temp" } as any,
      {
        read: vi.fn(async () => ({
          hermesRuntime: {
            mode: "wsl",
            distro: "Ubuntu",
            pythonCommand: "python3",
            managedRoot: "/home/test/.hermes-forge/hermes-agent",
          },
        })),
        write: vi.fn(async () => undefined),
      } as any,
      {
        probe: vi.fn(async () => ({
          overallStatus: "unavailable",
          issues: [bridgeIssue],
          bridge: { running: false, reachable: false, configured: false, message: "bridge stopped" },
        })),
      } as any,
      (() => ({ preflight: vi.fn() })) as any,
      {
        diagnose: vi.fn(async () => ({
          ...createDoctorReport(),
          overallStatus: "manual_setup_required",
          blockingIssues: [bridgeIssue],
        })),
      } as any,
    );

    const result = await service.install({ report: createDoctorReport() });

    expect(result.healthCheckPassed).toBe(true);
    expect(result.lastSuccessfulStage).toBe("health_check");
    expect(result.steps.find((step) => step.step === "verify-hermes")).toMatchObject({ status: "passed" });
    expect(result.steps.find((step) => step.step === "reprobe-after-install")).toMatchObject({ status: "passed" });
    expect(result.steps.find((step) => step.step === "redoctor-after-install")).toMatchObject({ status: "passed" });
  });
});
