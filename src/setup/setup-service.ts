import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppPaths } from "../main/app-paths";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { EngineAdapter } from "../adapters/engine-adapter";
import type { SecretVault } from "../auth/secret-vault";
import { runCommand } from "../process/command-runner";
import type { EngineMaintenanceResult, RuntimeConfig, SetupCheck, SetupSummary } from "../shared/types";
import { missingSecretMessage, normalizeOpenAiCompatibleBaseUrl, requiresStoredSecret } from "../shared/model-config";

export class SetupService {
  constructor(
    private readonly appPaths: AppPaths,
    private readonly hermes: EngineAdapter,
    private readonly configStore: RuntimeConfigStore,
    private readonly secretVault: SecretVault,
  ) {}

  async getSummary(workspacePath?: string): Promise<SetupSummary> {
    const config = await this.configStore.read();
    const checks: SetupCheck[] = [
      await this.checkCommand("git", ["--version"], "git", "Git"),
      await this.checkCommand("node", ["--version"], "node", "Node.js"),
      await this.checkCommand("python", ["--version"], "python", "Python"),
      await this.checkHermes(),
      await this.checkModelConfig(config),
      await this.checkWritable("user-data", "用户数据目录", this.appPaths.baseDir()),
    ];

    if (workspacePath?.trim()) {
      checks.push(await this.checkWritable("workspace", "当前工作区", workspacePath));
    }

    const suggestions = this.buildSuggestions(checks);
    const suggestionChecks = suggestions.map((message, index) => ({
      id: `suggestion-${index + 1}`,
      label: "建议",
      status: "warning" as const,
      message,
      blocking: false,
    }));
    const mergedChecks = [...checks, ...suggestionChecks];
    const blocking = mergedChecks.filter((check) => check.status === "missing" || check.status === "failed");
    return { ready: blocking.length === 0, blocking, checks: mergedChecks };
  }

  private buildSuggestions(checks: SetupCheck[]) {
    const suggestions: string[] = [];
    const python = checks.find((check) => check.id === "python");
    const hermes = checks.find((check) => check.id === "hermes");
    const model = checks.find((check) => check.id === "model" || check.id === "model-placeholder" || check.id === "model-secret");
    if (python?.status !== "ok") {
      suggestions.push("建议优先修复 Python 环境，否则 Hermes CLI 与更新动作可能无法正常运行。");
    }
    if (hermes?.status !== "ok") {
      suggestions.push("建议先完成 Hermes 路径和 CLI 自检，再进行真实任务执行。");
    }
    if (model?.status !== "ok") {
      suggestions.push("建议先确认默认模型与密钥配置，避免任务启动后才失败。");
    }
    return suggestions;
  }

  async updateHermes(): Promise<EngineMaintenanceResult> {
    const log: string[] = [];
    const startedAt = new Date().toISOString();
    const hermesRoot = await this.configStore.getEnginePath("hermes");
    const hermesCli = path.join(hermesRoot, "hermes");
    log.push(`$ python ${hermesCli} update`);
    const result = await runCommand("python", [hermesCli, "update"], {
      cwd: hermesRoot,
      timeoutMs: 10 * 60 * 1000,
      env: {
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: `${hermesRoot}${path.delimiter}${process.env.PYTHONPATH ?? ""}`,
        NO_COLOR: "1",
      },
    });
    if (result.stdout.trim()) log.push(result.stdout.trim());
    if (result.stderr.trim()) log.push(result.stderr.trim());
    const ok = result.exitCode === 0;
    const message = ok ? "Hermes 更新完成。" : `Hermes 更新失败：exit ${result.exitCode}`;
    const logDir = path.join(this.appPaths.baseDir(), "diagnostics", "install-logs");
    await fs.mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, `hermes-update-${startedAt.replace(/[:.]/g, "-")}.log`);
    await fs.writeFile(logPath, [message, "", ...log].join("\n"), "utf8");
    return { ok, engineId: "hermes", message, log, logPath };
  }

  private async checkHermes(): Promise<SetupCheck> {
    const health = await this.hermes.healthCheck();
    if (!health.available) {
      return {
        id: "hermes",
        label: "Hermes",
        status: "warning",
        message: `Hermes 未完全就绪：${health.message}`,
        fixAction: "configure_hermes",
        blocking: false,
      };
    }

    const memoryDir = path.join(os.homedir(), ".hermes", "memories");
    await fs.mkdir(memoryDir, { recursive: true }).catch(() => undefined);
    return {
      id: "hermes",
      label: "Hermes",
      status: "ok",
      message: `${health.message} 记忆目录：${memoryDir}`,
      blocking: false,
    };
  }

  private async checkModelConfig(config: RuntimeConfig): Promise<SetupCheck> {
    const profile = config.modelProfiles.find((item) => item.id === config.defaultModelProfileId) ?? config.modelProfiles[0];
    if (!profile) {
      return {
        id: "model",
        label: "模型配置",
        status: "missing",
        message: "尚未配置默认模型。",
        fixAction: "configure_model",
        blocking: true,
      };
    }
    if (profile.provider === "local" && profile.model === "mock-model") {
      return {
        id: "model-placeholder",
        label: "模型配置",
        status: "warning",
        message: "当前默认模型仍是示例占位配置 mock-model，请在设置中改成真实可用模型。",
        fixAction: "configure_model",
        blocking: false,
      };
    }
    if (profile.provider === "custom") {
      try {
        normalizeOpenAiCompatibleBaseUrl(profile.baseUrl);
      } catch {
        return {
          id: "model",
          label: "模型配置",
          status: "missing",
          message: "本地/自定义模型缺少有效 Base URL，请填写例如 http://127.0.0.1:1234/v1。",
          fixAction: "configure_model",
          blocking: true,
        };
      }
    }
    if (requiresStoredSecret(profile) && (!profile.secretRef || !(await this.secretVault.hasSecret(profile.secretRef)))) {
      return {
        id: "model-secret",
        label: "模型密钥",
        status: "missing",
        message: missingSecretMessage(profile),
        fixAction: "configure_model",
        blocking: true,
      };
    }
    return {
      id: "model",
      label: "模型配置",
      status: "ok",
      message: `默认模型：${profile.provider}/${profile.model}`,
      blocking: false,
    };
  }

  private async checkWritable(id: string, label: string, targetPath: string): Promise<SetupCheck> {
    try {
      await fs.mkdir(targetPath, { recursive: true });
      const probe = path.join(targetPath, `.zhenghebao-write-test-${Date.now()}`);
      await fs.writeFile(probe, "ok", "utf8");
      await fs.unlink(probe);
      return { id, label, status: "ok", message: `${targetPath} 可写。`, blocking: false };
    } catch (error) {
      return {
        id,
        label,
        status: "failed",
        message: `${targetPath} 不可写：${error instanceof Error ? error.message : "未知错误"}`,
        fixAction: "open_settings",
        blocking: true,
      };
    }
  }

  private async checkCommand(id: string, args: string[], checkId: string, label: string): Promise<SetupCheck> {
    const result = await runCommand(id, args, { cwd: process.cwd(), timeoutMs: 8000 });
    return {
      id: checkId,
      label,
      status: result.exitCode === 0 ? "ok" : "warning",
      message:
        result.exitCode === 0
          ? (result.stdout || result.stderr).trim() || `${label} 可用。`
          : `${label} 检测失败：${result.stderr || result.stdout}。建议先修复该基础环境后再运行 Hermes 任务。`,
      blocking: false,
    };
  }
}
