import { describe, expect, it, vi } from "vitest";
import { WslDoctorService } from "./wsl-doctor-service";

describe("WslDoctorService", () => {
  it("treats Windows Bridge unavailability as non-blocking for WSL Hermes checks", async () => {
    const service = new WslDoctorService(
      {
        read: vi.fn(async () => ({
          hermesRuntime: {
            mode: "wsl",
            distro: "Ubuntu",
            pythonCommand: "python3",
            windowsAgentMode: "hermes_native",
          },
        })),
      } as any,
      {
        probe: vi.fn(async () => ({
          wslAvailable: true,
          distroExists: true,
          distroReachable: true,
          wslPythonAvailable: true,
          hermesRootExists: true,
          hermesCliExists: true,
          bridgeReachable: false,
          issues: [],
          bridgeHost: "127.0.0.1",
          bridgePort: undefined,
          homeResolved: true,
          memoryResolved: true,
          commands: {
            wsl: { available: true, message: "WSL ok" },
          },
          bridge: { configured: false, running: false, reachable: false, message: "Windows Control Bridge 未启动。" },
          paths: {
            profileHermesPath: { path: "/root/.hermes-forge/hermes-agent" },
            memoryPath: { path: "/root/.hermes/memories" },
            all: [],
          },
        })),
      } as any,
      (() => ({
        preflight: vi.fn(async () => ({ ok: true })),
      })) as any,
    );

    const report = await service.diagnose();

    expect(report.overallStatus).toBe("ready_to_attach_existing_wsl");
    expect(report.blockingIssues.some((issue) => issue.code === "bridge_unreachable")).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: "bridge-reachable", status: "warning", code: "bridge_unreachable" }),
    ]));
  });
});
