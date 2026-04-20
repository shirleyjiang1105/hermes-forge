import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand, type CommandResult } from "../process/command-runner";
import type { AutoHotkeyStatus } from "../shared/types";

const AHK_TIMEOUT_MS = 30_000;

export class AutoHotkeyService {
  private cachedStatus?: AutoHotkeyStatus;

  constructor(
    private readonly commandRunner = runCommand,
    private readonly candidatePaths = defaultAutoHotkeyCandidates,
  ) {}

  async status(): Promise<AutoHotkeyStatus> {
    if (this.cachedStatus) {
      return this.cachedStatus;
    }
    const executablePath = await this.findExecutable();
    if (!executablePath) {
      this.cachedStatus = {
        available: false,
        message: "未检测到 AutoHotkey v2。请安装 AutoHotkey v2 后重启应用，以启用窗口聚焦、键鼠输入等 GUI 自动化能力。",
      };
      return this.cachedStatus;
    }
    const versionResult = await this.commandRunner(executablePath, ["/ErrorStdOut", "*"], {
      cwd: process.cwd(),
      timeoutMs: 3000,
    }).catch(() => undefined);
    this.cachedStatus = {
      available: true,
      executablePath,
      version: parseVersion(versionResult),
      message: `AutoHotkey 可用：${executablePath}`,
    };
    return this.cachedStatus;
  }

  async runScript(script: string, timeoutMs = AHK_TIMEOUT_MS): Promise<CommandResult> {
    const status = await this.status();
    if (!status.available || !status.executablePath) {
      return { exitCode: 1, stdout: "", stderr: status.message };
    }
    const scriptPath = path.join(os.tmpdir(), `hermes-ahk-${Date.now()}-${Math.random().toString(16).slice(2)}.ahk`);
    await fs.writeFile(scriptPath, script, "utf8");
    try {
      return await this.commandRunner(status.executablePath, ["/ErrorStdOut", scriptPath], {
        cwd: process.cwd(),
        timeoutMs,
      });
    } finally {
      await fs.rm(scriptPath, { force: true }).catch(() => undefined);
    }
  }

  private async findExecutable() {
    for (const candidate of this.candidatePaths()) {
      if (!candidate) continue;
      const exists = await fs.access(candidate).then(() => true).catch(() => false);
      if (exists) {
        return candidate;
      }
      if (!candidate.includes("\\") && !candidate.includes("/")) {
        const result = await this.commandRunner("where.exe", [candidate], {
          cwd: process.cwd(),
          timeoutMs: 3000,
        }).catch(() => undefined);
        const found = result?.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }
}

function defaultAutoHotkeyCandidates() {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA ?? "";
  return [
    "AutoHotkey64.exe",
    "AutoHotkey.exe",
    path.join(programFiles, "AutoHotkey", "v2", "AutoHotkey64.exe"),
    path.join(programFiles, "AutoHotkey", "AutoHotkey64.exe"),
    path.join(programFilesX86, "AutoHotkey", "AutoHotkey.exe"),
    localAppData ? path.join(localAppData, "Programs", "AutoHotkey", "v2", "AutoHotkey64.exe") : "",
  ];
}

function parseVersion(result: CommandResult | undefined) {
  const text = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`;
  return text.match(/\b2\.\d+(?:\.\d+)?\b/)?.[0];
}
