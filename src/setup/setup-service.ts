import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppPaths } from "../main/app-paths";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { EngineAdapter } from "../adapters/engine-adapter";
import type { SecretVault } from "../auth/secret-vault";
import { runCommand } from "../process/command-runner";
import type { EngineMaintenanceResult, HermesInstallResult, RuntimeConfig, SetupCheck, SetupSummary } from "../shared/types";
import { missingSecretMessage, normalizeOpenAiCompatibleBaseUrl, requiresStoredSecret } from "../shared/model-config";

const DEFAULT_HERMES_REPO_URL = "https://github.com/NousResearch/hermes-agent.git";

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

  async installHermes(): Promise<HermesInstallResult> {
    const log: string[] = [];
    const startedAt = new Date().toISOString();
    const logDir = path.join(this.appPaths.baseDir(), "diagnostics", "install-logs");
    await fs.mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, `hermes-install-${startedAt.replace(/[:.]/g, "-")}.log`);

    const finish = async (result: Omit<HermesInstallResult, "engineId" | "log" | "logPath">) => {
      await fs.writeFile(logPath, [result.message, "", ...log].join("\n"), "utf8");
      return { ...result, engineId: "hermes" as const, log, logPath };
    };

    const currentHealth = await this.hermes.healthCheck().catch((error) => {
      log.push(`Current Hermes check failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    });
    if (currentHealth?.available) {
      const rootPath = currentHealth.path ?? await this.configStore.getEnginePath("hermes");
      await this.saveHermesRoot(rootPath);
      log.push(`Hermes is already available at ${rootPath}.`);
      return finish({ ok: true, rootPath, message: `已检测到可用 Hermes：${rootPath}` });
    }

    const repoUrl = process.env.HERMES_INSTALL_REPO_URL?.trim() || DEFAULT_HERMES_REPO_URL;
    const rootPath = process.env.HERMES_INSTALL_DIR?.trim() || path.join(os.homedir(), "Hermes Agent");
    log.push(`Install target: ${rootPath}`);
    log.push(`Repository: ${repoUrl}`);

    const git = await this.runLogged("git", ["--version"], process.cwd(), log, 15000);
    if (git.exitCode !== 0) {
      return finish({ ok: false, rootPath, message: "无法一键部署 Hermes：未检测到可用 Git。请先安装 Git，或手动配置 Hermes 根路径。" });
    }

    const python = await this.runLogged("python", ["--version"], process.cwd(), log, 15000);
    if (python.exitCode !== 0) {
      return finish({ ok: false, rootPath, message: "无法一键部署 Hermes：未检测到可用 Python。请先安装 Python，或手动配置 Hermes 根路径。" });
    }

    const existingEntries = await fs.readdir(rootPath).catch(() => undefined);
    if (!existingEntries) {
      await fs.mkdir(path.dirname(rootPath), { recursive: true });
      const clone = await this.runLogged("git", ["clone", "--depth", "1", repoUrl, rootPath], path.dirname(rootPath), log, 10 * 60 * 1000);
      if (clone.exitCode !== 0) {
        return finish({ ok: false, rootPath, message: `Hermes 克隆失败，详情见安装日志：${logPath}` });
      }
    } else if (existingEntries.length === 0) {
      const clone = await this.runLogged("git", ["clone", "--depth", "1", repoUrl, "."], rootPath, log, 10 * 60 * 1000);
      if (clone.exitCode !== 0) {
        return finish({ ok: false, rootPath, message: `Hermes 克隆失败，详情见安装日志：${logPath}` });
      }
    } else {
      const hermesCliExists = await this.exists(path.join(rootPath, "hermes"));
      if (!hermesCliExists) {
        return finish({
          ok: false,
          rootPath,
          message: `目标目录已存在但未找到 Hermes CLI：${rootPath}。为避免覆盖用户文件，请清空该目录、设置 HERMES_INSTALL_DIR，或手动配置正确路径。`,
        });
      }
      log.push("Target directory already contains Hermes CLI; skipping clone.");
    }

    await this.installPythonDependencies(rootPath, log);
    await this.saveHermesRoot(rootPath);

    const health = await this.hermes.healthCheck().catch((error) => {
      log.push(`Post-install health check threw: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    });
    if (!health?.available) {
      return finish({
        ok: false,
        rootPath,
        message: `Hermes 已下载到 ${rootPath}，但健康检查仍未通过：${health?.message ?? "未知错误"}。详情见安装日志：${logPath}`,
      });
    }

    return finish({ ok: true, rootPath, message: `Hermes 部署完成并通过健康检查：${rootPath}` });
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

  private async installPythonDependencies(rootPath: string, log: string[]) {
    if (await this.exists(path.join(rootPath, "pyproject.toml"))) {
      const result = await this.runLogged("python", ["-m", "pip", "install", "-e", "."], rootPath, log, 10 * 60 * 1000);
      if (result.exitCode !== 0) {
        log.push("Editable pip install failed; continuing to health check so the user gets a precise runtime error.");
      }
      return;
    }
    if (await this.exists(path.join(rootPath, "requirements.txt"))) {
      const result = await this.runLogged("python", ["-m", "pip", "install", "-r", "requirements.txt"], rootPath, log, 10 * 60 * 1000);
      if (result.exitCode !== 0) {
        log.push("requirements.txt pip install failed; continuing to health check so the user gets a precise runtime error.");
      }
    }
  }

  private async saveHermesRoot(rootPath: string) {
    const config = await this.configStore.read();
    await this.configStore.write({
      ...config,
      enginePaths: {
        ...(config.enginePaths ?? {}),
        hermes: rootPath,
      },
    });
  }

  private async runLogged(command: string, args: string[], cwd: string, log: string[], timeoutMs: number) {
    log.push(`$ ${command} ${args.join(" ")}`);
    const result = await runCommand(command, args, { cwd, timeoutMs });
    if (result.stdout.trim()) log.push(result.stdout.trim());
    if (result.stderr.trim()) log.push(result.stderr.trim());
    log.push(`exit ${result.exitCode ?? "unknown"}`);
    return result;
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

  private async exists(targetPath: string) {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
