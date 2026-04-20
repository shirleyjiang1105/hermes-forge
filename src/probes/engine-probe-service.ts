import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppPaths } from "../main/app-paths";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { EngineAdapter } from "../adapters/engine-adapter";
import { runCommand } from "../process/command-runner";
import type { HermesProbe, HermesProbeSummary, MemoryStatus } from "../shared/types";

const now = () => new Date().toISOString();

export class EngineProbeService {
  constructor(
    private readonly appPaths: AppPaths,
    private readonly hermes: EngineAdapter,
    private readonly configStore: RuntimeConfigStore,
  ) {}

  async probeHermes(workspacePath?: string): Promise<HermesProbeSummary> {
    const workspaceId = workspacePath
      ? await this.appPaths.ensureWorkspaceLayout(workspacePath)
      : this.appPaths.workspaceId(process.cwd());
    return {
      checkedAt: now(),
      probe: await this.probe(workspaceId),
    };
  }

  private async probe(workspaceId: string): Promise<HermesProbe> {
    const rootPath = await this.configStore.getEnginePath("hermes");
    const health = await this.hermes.healthCheck();
    const cliExists = await this.exists(path.join(rootPath, "hermes"));
    const python = await runCommand("python", ["--version"], { cwd: process.cwd(), timeoutMs: 12000 });
    const memoryDir = path.join(os.homedir(), ".hermes", "memories");
    const userPath = path.join(memoryDir, "USER.md");
    const memoryPath = path.join(memoryDir, "MEMORY.md");
    const skillCount = await this.countEntries(path.join(rootPath, "skills"));
    const optionalSkillCount = await this.countEntries(path.join(rootPath, "optional-skills"));
    const toolCount = await this.countEntries(path.join(rootPath, "tools"));
    const acpAdapter = await this.exists(path.join(rootPath, "acp_adapter"));
    const acpRegistry = await this.exists(path.join(rootPath, "acp_registry"));
    const logsCount = await this.countEntries(path.join(rootPath, "logs"));
    const [userText, memoryText, memoryStatus] = await Promise.all([
      fs.readFile(userPath, "utf8").catch(() => ""),
      fs.readFile(memoryPath, "utf8").catch(() => ""),
      this.hermes.getMemoryStatus(workspaceId).catch(() => undefined as MemoryStatus | undefined),
    ]);

    return {
      engineId: "hermes",
      checkedAt: now(),
      status: health.available ? "healthy" : cliExists ? "warning" : "offline",
      primaryMetric: health.available ? "本地隔离" : "未连接",
      secondaryMetric: health.path ?? rootPath,
      metrics: [
        { label: "CLI 文件", value: cliExists ? "存在" : "缺失", tone: cliExists ? "green" : "red" },
        { label: "Python", value: (python.stdout || python.stderr || "未知").trim(), tone: python.exitCode === 0 ? "green" : "red" },
        { label: "USER.md", value: `${userText.length} 字符`, tone: userText ? "blue" : "slate" },
        { label: "MEMORY.md", value: `${memoryText.length} 字符`, tone: this.memoryTone(memoryText.length, memoryStatus?.maxCharacters) },
        { label: "记忆目录", value: memoryDir, tone: memoryStatus ? "green" : "amber" },
        { label: "Skills", value: skillCount === undefined ? "未找到" : `${skillCount}`, tone: skillCount ? "blue" : "slate" },
        { label: "Optional Skills", value: optionalSkillCount === undefined ? "未找到" : `${optionalSkillCount}`, tone: optionalSkillCount ? "blue" : "slate" },
        { label: "Tools", value: toolCount === undefined ? "未找到" : `${toolCount}`, tone: toolCount ? "blue" : "slate" },
        { label: "ACP Adapter", value: acpAdapter ? "存在" : "缺失", tone: acpAdapter ? "green" : "amber" },
        { label: "ACP Registry", value: acpRegistry ? "存在" : "缺失", tone: acpRegistry ? "green" : "amber" },
        { label: "运行日志", value: logsCount === undefined ? "未找到" : `${logsCount}`, tone: logsCount ? "blue" : "slate" },
      ],
      message: health.message,
    };
  }

  private memoryTone(used: number, max?: number) {
    if (!max) return "blue";
    const ratio = used / max;
    if (ratio >= 0.95) return "red";
    if (ratio >= 0.85) return "amber";
    return "green";
  }

  private async countEntries(targetPath: string) {
    const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => undefined);
    if (!entries) return undefined;
    return entries.filter((entry) => entry.isFile() || entry.isDirectory()).length;
  }

  private async exists(targetPath: string) {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
