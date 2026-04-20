import { describe, expect, it, vi } from "vitest";
import { AutoHotkeyService } from "./autohotkey-service";
import type { CommandResult } from "../process/command-runner";

describe("AutoHotkeyService", () => {
  it("reports unavailable when no executable can be found", async () => {
    const runner = vi.fn(async (): Promise<CommandResult> => ({ exitCode: 1, stdout: "", stderr: "" }));
    const service = new AutoHotkeyService(runner, () => ["AutoHotkey64.exe"]);

    const status = await service.status();

    expect(status.available).toBe(false);
    expect(status.message).toContain("未检测到 AutoHotkey v2");
  });

  it("finds AutoHotkey through where.exe", async () => {
    const runner = vi.fn(async (command: string): Promise<CommandResult> => (
      command === "where.exe"
        ? { exitCode: 0, stdout: "C:\\Tools\\AutoHotkey64.exe\r\n", stderr: "" }
        : { exitCode: 1, stdout: "", stderr: "AutoHotkey v2.0.18" }
    ));
    const service = new AutoHotkeyService(runner, () => ["AutoHotkey64.exe"]);

    const status = await service.status();

    expect(status.available).toBe(true);
    expect(status.executablePath).toBe("C:\\Tools\\AutoHotkey64.exe");
  });
});
