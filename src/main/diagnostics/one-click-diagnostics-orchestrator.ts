import fs from "node:fs/promises";
import path from "node:path";
import type { RuntimeConfigStore } from "../runtime-config";
import type { SetupService } from "../../setup/setup-service";
import type { RuntimeProbeService } from "../../runtime/runtime-probe-service";
import type { WslDoctorService } from "../../install/wsl-doctor-service";
import type { HermesConnectorService } from "../hermes-connector-service";
import type { HermesModelSyncService } from "../hermes-model-sync";
import type { HermesSystemAuditService } from "../hermes-system-audit-service";
import type { DiagnosticsService } from "../../diagnostics/diagnostics-service";
import type { WorkspaceLock } from "../../process/workspace-lock";
import type { TaskRunner } from "../../process/task-runner";
import { runCommand } from "../../process/command-runner";
import {
  resolveHermesCliForRuntime,
  resolveWslHome,
  validateWslHermesCli,
  type HermesCliValidationResult,
  type ResolvedHermesCli,
} from "../../runtime/hermes-cli-resolver";
import { migrateRuntimeConfigModels } from "../../shared/model-config";
import { redactSensitiveValue } from "../../shared/redaction";
import type {
  HermesRuntimeConfig,
  HermesSystemAuditStep,
  OneClickDiagnosticItem,
  OneClickDiagnosticSeverity,
  OneClickDiagnosticStatus,
  OneClickDiagnosticsExportResult,
  OneClickDiagnosticsReport,
  OneClickDiagnosticsRunOptions,
  OneClickDiagnosticsStatus,
  RuntimeConfig,
} from "../../shared/types";

type RuntimeContext = {
  config: RuntimeConfig;
  runtime: NonNullable<RuntimeConfig["hermesRuntime"]>;
};

const STALE_LOCK_MIN_AGE_MS = 5000;

export class OneClickDiagnosticsOrchestrator {
  private lastReport?: OneClickDiagnosticsReport;
  private status: OneClickDiagnosticsStatus = { running: false, message: "空闲" };
  private running = false;

  constructor(
    private readonly configStore: RuntimeConfigStore,
    private readonly setupService: SetupService,
    private readonly runtimeProbeService: RuntimeProbeService,
    private readonly wslDoctorService: WslDoctorService,
    private readonly hermesConnectorService: HermesConnectorService,
    private readonly hermesModelSyncService: HermesModelSyncService,
    private readonly hermesSystemAuditService: HermesSystemAuditService,
    private readonly diagnosticsService: DiagnosticsService,
    private readonly workspaceLock: WorkspaceLock,
    private readonly taskRunner: TaskRunner,
  ) {}

  getStatus(): OneClickDiagnosticsStatus {
    return {
      ...this.status,
      lastReport: this.lastReport,
    };
  }

  async run(options: OneClickDiagnosticsRunOptions = {}): Promise<OneClickDiagnosticsReport> {
    if (this.running) {
      throw new Error("DIAGNOSTIC_ALREADY_RUNNING: 一键诊断正在运行，请勿重复启动。");
    }
    this.running = true;
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const items: OneClickDiagnosticItem[] = [];
    this.status = { running: true, startedAt, stage: "starting", message: "正在启动一键诊断..." };

    let context: RuntimeContext | undefined;
    let resolvedCli: ResolvedHermesCli | undefined;

    try {
      await this.capture(items, "setup.summary", "基础环境摘要", "setup-service", async () => {
        await this.checkSetupSummary(items, options.workspacePath);
      });

      context = await this.readRuntimeContext(items);
      if (context) {
        await this.capture(items, "wsl.runtime", "WSL 基础检查", "runtime-probe-service", async () => {
          await this.checkWsl(items, context!, options);
        });
        resolvedCli = await this.captureValue(items, "hermes.path", "Hermes 路径检查", "hermes-cli-resolver", async () =>
          this.checkHermesPath(items, context!, options),
        );
        await this.capture(items, "hermes.cli", "Hermes CLI 能力检查", "hermes-cli-resolver", async () => {
          await this.checkHermesCli(items, context!, resolvedCli, options);
        });
        await this.capture(items, "gateway.status", "Gateway 检查", "hermes-connector-service", async () => {
          await this.checkGateway(items, options);
        });
        await this.capture(items, "model.schema", "模型配置检查", "runtime-config", async () => {
          await this.checkModels(items, options);
        });
      }

      await this.capture(items, "task.lock", "任务锁检查", "workspace-lock", async () => {
        await this.checkTaskLocks(items, options);
      });

      this.skipHermesSystemAudit(items);

      items.push(item({
        id: "diagnostics.export",
        title: "诊断报告导出准备",
        status: "pass",
        severity: "info",
        summary: "一键诊断结果已结构化，可通过“导出诊断报告”写入本地诊断目录。",
        autoFixable: false,
        source: "diagnostics-service",
      }));
    } finally {
      try {
        const finishedAt = new Date().toISOString();
        const report: OneClickDiagnosticsReport = {
          startedAt,
          finishedAt,
          durationMs: Date.now() - startedAtMs,
          summary: summarize(items),
          items: redactSensitiveValue(items.map(trimDiagnosticItem)),
        };
        this.lastReport = report;
        this.status = {
          running: false,
          startedAt,
          finishedAt,
          stage: "finished",
          message: report.summary.failed > 0 ? "一键诊断完成，仍有未解决问题。" : "一键诊断完成。",
          lastReport: report,
        };
      } finally {
        this.running = false;
      }
    }

    return this.lastReport!;
  }

  async exportLatest(workspacePath?: string): Promise<OneClickDiagnosticsExportResult> {
    const exported = await this.diagnosticsService.export(workspacePath);
    const oneClickReportPath = path.join(exported.path, "one-click-diagnostics.json");
    const report = this.lastReport ?? this.emptyExportReport();
    await fs.writeFile(oneClickReportPath, JSON.stringify(trimDiagnosticValue(redactSensitiveValue(report)), null, 2), "utf8");
    return {
      ...exported,
      diagnosticsPath: exported.path,
      oneClickReportPath,
      message: this.lastReport
        ? `${exported.message}；已包含 one-click-diagnostics.json。`
        : `${exported.message}；当前没有已完成的一键诊断，已写入空的一键诊断占位报告。`,
    };
  }

  private emptyExportReport(): OneClickDiagnosticsReport {
    const at = new Date().toISOString();
    return {
      startedAt: at,
      finishedAt: at,
      durationMs: 0,
      summary: {
        total: 1,
        passed: 0,
        warnings: 0,
        failed: 0,
        fixed: 0,
        skipped: 1,
        unresolved: 0,
      },
      items: [{
        id: "diagnostics.one-click.empty",
        title: "一键诊断结果",
        status: "skipped",
        severity: "info",
        summary: "当前进程中暂无已完成的一键诊断结果；本次仅导出普通诊断报告。",
        autoFixable: false,
        source: "one-click-diagnostics-orchestrator",
      }],
    };
  }

  private async checkSetupSummary(items: OneClickDiagnosticItem[], workspacePath?: string) {
    this.setStage("setup", "正在读取基础环境摘要...");
    const setup = await this.setupService.getSummary(workspacePath);
    const blocking = setup.blocking.length;
    items.push(item({
      id: "setup.summary",
      title: "基础环境摘要",
      status: setup.ready ? "pass" : blocking > 0 ? "fail" : "warn",
      severity: setup.ready ? "info" : blocking > 0 ? "error" : "warning",
      summary: setup.ready ? "基础环境检查通过。" : `基础环境仍有 ${blocking} 个阻塞项。`,
      details: setup.blocking.map((check) => `${check.label}: ${check.message}`).join("\n") || undefined,
      evidence: { ready: setup.ready, blocking: setup.blocking.map((check) => check.id), checkCount: setup.checks.length },
      autoFixable: setup.blocking.some((check) => check.canAutoFix),
      userActionRequired: setup.blocking.some((check) => !check.canAutoFix),
      suggestedActions: setup.blocking.map((check) => check.recommendedAction).filter((action): action is string => Boolean(action)),
      source: "setup-service",
    }));
  }

  private async readRuntimeContext(items: OneClickDiagnosticItem[]): Promise<RuntimeContext | undefined> {
    this.setStage("config", "正在读取运行时配置...");
    try {
      const config = await this.configStore.read();
      return {
        config,
        runtime: normalizeRuntime(config),
      };
    } catch (error) {
      items.push(failureItem("config.runtime", "运行时配置", error, {
        summary: "无法读取运行时配置，后续 WSL/Hermes/Gateway 检查已跳过。",
        severity: "critical",
        suggestedActions: ["重新打开设置中心，或导出诊断报告后修复 runtime config 文件。"],
        source: "runtime-config",
      }));
      return undefined;
    }
  }

  private async checkWsl(items: OneClickDiagnosticItem[], context: RuntimeContext, options: OneClickDiagnosticsRunOptions) {
    this.setStage("wsl", "正在检查 WSL runtime...");
    const runtime = context.runtime;
    const probe = await this.runtimeProbeService.probe({
      workspacePath: options.workspacePath,
      runtime,
      persistResolvedHermesPath: Boolean(options.autoFix),
    });
    const doctor = await this.wslDoctorService.diagnose({
      workspacePath: options.workspacePath,
      runtime,
      persistResolvedHermesPath: Boolean(options.autoFix),
    }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

    if (runtime.mode !== "wsl") {
      items.push(item({
        id: "wsl.runtime",
        title: "WSL 运行环境",
        status: "warn",
        severity: "warning",
        summary: "当前 Hermes 运行环境不是 WSL，本轮不会把 Windows Hermes 路径作为 WSL 主流程成功条件。",
        evidence: { runtimeMode: runtime.mode, probe: wslProbeEvidence(probe), doctor },
        autoFixable: false,
        userActionRequired: true,
        suggestedActions: ["在 Hermes 设置中把运行环境改为“自动选择（推荐）”或 WSL。"],
        source: "runtime-probe-service",
      }));
      items.push(skippedItem("wsl.distro", "WSL 发行版", "当前未启用 WSL runtime，跳过发行版主流程检查。", "runtime-probe-service"));
      items.push(skippedItem("wsl.command", "WSL 命令执行", "当前未启用 WSL runtime，跳过 bash 命令执行检查。", "runtime-probe-service"));
      return;
    }

    items.push(item({
      id: "wsl.runtime",
      title: "WSL 运行环境",
      status: probe.wslAvailable ? "pass" : "fail",
      severity: probe.wslAvailable ? "info" : "critical",
      summary: probe.wslAvailable ? "wsl.exe 可用，wsl --status 正常返回。" : "wsl.exe 不可用或 wsl --status 失败。",
      details: probe.commands.wsl.message,
      evidence: wslProbeEvidence(probe),
      autoFixable: false,
      userActionRequired: !probe.wslAvailable,
      suggestedActions: probe.wslAvailable ? [] : ["启用 Windows Subsystem for Linux，安装一个 Linux 发行版后重试。"],
      source: "runtime-probe-service",
    }));
    items.push(item({
      id: "wsl.distro",
      title: "WSL 发行版",
      status: probe.distroExists !== false ? "pass" : "fail",
      severity: probe.distroExists !== false ? "info" : "error",
      summary: probe.distroExists !== false ? "当前配置的 WSL distro 存在。" : `当前配置的 WSL distro 不存在：${runtime.distro ?? "<default>"}`,
      details: probe.commands.wsl.message,
      evidence: { distro: runtime.distro, doctor },
      autoFixable: false,
      userActionRequired: probe.distroExists === false,
      suggestedActions: probe.distroExists === false ? ["在设置中选择已存在的 WSL 发行版，或使用 Managed WSL 安装器创建。"] : [],
      source: "wsl-doctor-service",
    }));
    items.push(item({
      id: "wsl.command",
      title: "WSL bash 命令",
      status: probe.distroReachable ? "pass" : "fail",
      severity: probe.distroReachable ? "info" : "error",
      summary: probe.distroReachable ? "WSL 能执行 bash/uname 命令。" : "WSL 发行版无法执行基础 bash 命令。",
      details: probe.commands.wsl.message,
      evidence: { distroReachable: probe.distroReachable, pythonAvailable: probe.wslPythonAvailable },
      autoFixable: false,
      userActionRequired: !probe.distroReachable,
      suggestedActions: probe.distroReachable ? [] : ["运行 wsl.exe 检查发行版状态，必要时执行 wsl --shutdown 后重试。"],
      source: "runtime-probe-service",
    }));
  }

  private async checkHermesPath(
    items: OneClickDiagnosticItem[],
    context: RuntimeContext,
    options: OneClickDiagnosticsRunOptions,
  ): Promise<ResolvedHermesCli | undefined> {
    this.setStage("hermes.path", "正在解析 WSL Hermes 路径...");
    if (context.runtime.mode !== "wsl") {
      items.push(skippedItem("hermes.path", "Hermes 路径", "当前不是 WSL runtime，跳过 WSL Hermes 路径主流程检查。", "hermes-cli-resolver"));
      return undefined;
    }

    const beforeManagedRoot = context.config.hermesRuntime?.managedRoot?.trim();
    const beforeEnginePath = context.config.enginePaths?.hermes?.trim();
    const savedPaths = [beforeManagedRoot, beforeEnginePath].filter((value): value is string => Boolean(value));
    const hardcoded = savedPaths.filter((value) => /\/home\/(jia|xia)\b/i.test(value));
    let wslHome: string | undefined;
    try {
      wslHome = await resolveWslHome(context.runtime);
    } catch (error) {
      items.push(item({
        id: "hermes.path",
        title: "Hermes 路径",
        status: "fail",
        severity: "error",
        summary: "无法解析 WSL $HOME，因此无法自动发现 Hermes Agent。",
        details: error instanceof Error ? error.message : String(error),
        evidence: { runtime: context.runtime, savedPaths },
        autoFixable: false,
        userActionRequired: true,
        suggestedActions: ["确认目标 WSL 发行版可启动，再执行修复安装。"],
        source: "hermes-cli-resolver",
      }));
      return undefined;
    }

    const dryResolved = await resolveHermesCliForRuntime(this.configStore, context.runtime, { persist: false });
    const wouldRewritePath = dryResolved.source !== "saved"
      || hardcoded.length > 0
      || beforeManagedRoot !== dryResolved.rootPath
      || beforeEnginePath !== dryResolved.rootPath;
    let resolved = dryResolved;
    let fixed = false;
    if (options.autoFix && wouldRewritePath) {
      resolved = await resolveHermesCliForRuntime(this.configStore, context.runtime, { persist: true });
      const verified = await resolveHermesCliForRuntime(this.configStore, context.runtime, { persist: false });
      fixed = verified.cliPath === resolved.cliPath;
    }

    items.push(item({
      id: "hermes.path",
      title: "Hermes 路径",
      status: fixed ? "fixed" : hardcoded.length > 0 ? "warn" : "pass",
      severity: hardcoded.length > 0 ? "warning" : "info",
      summary: fixed
        ? `已重新发现并保存 WSL Hermes 路径：${resolved.rootPath}`
        : hardcoded.length > 0
          ? `发现旧的硬编码 WSL 用户路径，但已解析到可用 Hermes CLI：${resolved.cliPath}`
          : `已解析 WSL Hermes CLI：${resolved.cliPath}`,
      details: `WSL HOME=${wslHome}; source=${resolved.source}`,
      evidence: { source: resolved.source, rootPath: resolved.rootPath, cliPath: resolved.cliPath, savedPaths, hardcoded },
      autoFixable: wouldRewritePath,
      fixed,
      userActionRequired: false,
      suggestedActions: fixed || !wouldRewritePath ? [] : ["点击“一键修复”写回自动发现的 WSL Hermes 路径。"],
      source: "hermes-cli-resolver",
    }));
    return resolved;
  }

  private async checkHermesCli(
    items: OneClickDiagnosticItem[],
    context: RuntimeContext,
    resolvedCli: ResolvedHermesCli | undefined,
    options: OneClickDiagnosticsRunOptions,
  ) {
    this.setStage("hermes.cli", "正在检查 Hermes CLI capabilities...");
    if (context.runtime.mode !== "wsl") {
      items.push(skippedItem("hermes.cli", "Hermes CLI 文件", "当前不是 WSL runtime，跳过 WSL Hermes CLI 检查。", "hermes-cli-resolver"));
      items.push(skippedItem("hermes.capabilities", "Hermes capabilities", "当前不是 WSL runtime，跳过 capabilities --json。", "hermes-cli-resolver"));
      return;
    }

    let resolved = resolvedCli;
    if (!resolved) {
      try {
        resolved = await resolveHermesCliForRuntime(this.configStore, context.runtime, { persist: Boolean(options.autoFix) });
      } catch (error) {
        items.push(failureItem("hermes.cli", "Hermes CLI 文件", error, {
          summary: "无法找到 WSL 内 Hermes CLI。",
          severity: "error",
          autoFixable: false,
          userActionRequired: true,
          suggestedActions: ["Hermes Agent 未安装或路径不存在，请重新安装 / 修复安装。"],
          source: "hermes-cli-resolver",
        }));
        items.push(skippedItem("hermes.capabilities", "Hermes capabilities", "Hermes CLI 不存在，跳过 capabilities --json。", "hermes-cli-resolver"));
        return;
      }
    }

    let validation = await validateWslHermesCli(context.runtime, resolved.cliPath);
    let chmodFixed = false;
    if (!validation.ok && validation.kind === "permission_denied" && options.autoFix) {
      const chmod = await chmodWslExecutable(context.runtime, resolved.cliPath);
      if (chmod.exitCode === 0) {
        validation = await validateWslHermesCli(context.runtime, resolved.cliPath);
        chmodFixed = validation.ok;
      }
    }

    const cliProblem = !validation.ok && (validation.kind === "file_missing" || validation.kind === "permission_denied");
    items.push(item({
      id: "hermes.cli",
      title: "Hermes CLI 文件",
      status: validation.ok || !cliProblem ? chmodFixed ? "fixed" : "pass" : "fail",
      severity: cliProblem ? "error" : "info",
      summary: validation.ok
        ? chmodFixed ? "已修复 Hermes CLI 权限，并确认 CLI 可用于 capabilities 检查。" : "Hermes CLI 存在且可用于 capabilities 检查。"
        : cliProblem
          ? validation.message
          : "Hermes CLI 文件存在，但 capabilities 检查未通过。",
      details: validation.ok ? undefined : validation.message,
      evidence: validationEvidence(validation),
      autoFixable: !validation.ok && validation.kind === "permission_denied",
      fixed: chmodFixed,
      userActionRequired: !validation.ok && validation.kind !== "permission_denied",
      suggestedActions: validation.ok
        ? []
        : validation.kind === "file_missing"
          ? ["Hermes Agent 未安装或路径不存在，请重新安装 / 修复安装。"]
          : validation.kind === "permission_denied"
            ? ["点击“一键修复”尝试 chmod +x；如果仍失败，请在 WSL 中检查文件权限。"]
            : [],
      source: "hermes-cli-resolver",
    }));

    items.push(item({
      id: "hermes.capabilities",
      title: "Hermes capabilities",
      status: validation.ok ? "pass" : "fail",
      severity: validation.ok ? "info" : validation.kind === "capability_unsupported" ? "error" : "warning",
      summary: validation.ok ? "capabilities --json 返回正常，满足 Forge WSL 最低门槛。" : capabilityFailureSummary(validation),
      details: validation.ok ? undefined : validation.message,
      evidence: validationEvidence(validation),
      autoFixable: false,
      userActionRequired: !validation.ok,
      suggestedActions: validation.ok ? [] : capabilitySuggestedActions(validation),
      source: "hermes-cli-resolver",
    }));
  }

  private async checkGateway(items: OneClickDiagnosticItem[], options: OneClickDiagnosticsRunOptions) {
    this.setStage("gateway", "正在检查 Gateway 状态和启动前检查...");
    let status = await this.hermesConnectorService.status();
    let fixed = false;
    const canRestart = status.managedRunning || status.healthStatus === "error";
    if (options.autoFix && canRestart) {
      const restart = await this.hermesConnectorService.restart();
      status = restart.status;
      fixed = restart.ok && restart.status.running;
    }
    items.push(item({
      id: "gateway.status",
      title: "Gateway 状态",
      status: fixed ? "fixed" : status.healthStatus === "running" ? "pass" : status.healthStatus === "error" ? "fail" : "warn",
      severity: status.healthStatus === "error" ? "error" : status.healthStatus === "running" ? "info" : "warning",
      summary: fixed ? "已安全重启 Hermes Forge 托管的 Gateway。" : status.message,
      details: status.lastError || status.lastOutput,
      evidence: status,
      autoFixable: canRestart,
      fixed,
      userActionRequired: status.healthStatus !== "running" && !canRestart,
      suggestedActions: status.healthStatus === "running"
        ? []
        : canRestart
          ? ["点击“一键修复”重启 Hermes Forge 托管的 Gateway。"]
          : ["如需连接第三方平台，请在连接器页面启动 Gateway；本轮不会强杀非本项目进程。"],
      source: "hermes-connector-service",
    }));

    const preflight = await this.hermesConnectorService.checkPreflight();
    items.push(item({
      id: "gateway.preflight",
      title: "Gateway 启动前检查",
      status: preflight.ok ? "pass" : "fail",
      severity: preflight.ok ? "info" : "error",
      summary: preflight.message,
      evidence: preflight,
      autoFixable: false,
      userActionRequired: !preflight.ok,
      suggestedActions: preflight.ok ? [] : ["先修复 Hermes 路径 / CLI capabilities，再启动 Gateway。"],
      source: "hermes-connector-service",
    }));
  }

  private async checkModels(items: OneClickDiagnosticItem[], options: OneClickDiagnosticsRunOptions) {
    this.setStage("model", "正在检查模型配置 schema 和默认模型...");
    const configPath = this.configStore.getConfigPath();
    const config = await this.configStore.read();
    const rawText = await fs.readFile(configPath, "utf8").catch(() => "");
    const raw = parseJsonObject(rawText);
    const rawProfiles = Array.isArray(raw?.modelProfiles)
      ? raw.modelProfiles
      : Array.isArray(raw?.models)
        ? raw.models
        : [];
    const schemaIssues = modelSchemaIssues(raw, rawProfiles);
    const migrated = migrateRuntimeConfigModels({
      ...config,
      ...(raw ?? {}),
      modelProfiles: rawProfiles.length ? rawProfiles : config.modelProfiles,
      providerProfiles: Array.isArray(raw?.providerProfiles) ? raw.providerProfiles : config.providerProfiles,
      updateSources: config.updateSources,
      enginePaths: config.enginePaths,
      enginePermissions: config.enginePermissions,
      hermesRuntime: config.hermesRuntime,
    });
    const normalizedProfiles = migrated.modelProfiles;

    if (!normalizedProfiles.length) {
      items.push(item({
        id: "model.schema",
        title: "模型配置 schema",
        status: "fail",
        severity: "error",
        summary: "当前没有可用模型配置。",
        autoFixable: false,
        userActionRequired: true,
        suggestedActions: ["打开模型设置，添加一个模型并测试连接。"],
        source: "runtime-config",
      }));
      items.push(item({
        id: "model.default",
        title: "默认模型",
        status: "fail",
        severity: "error",
        summary: "没有模型可设为默认。",
        autoFixable: false,
        userActionRequired: true,
        suggestedActions: ["先添加模型，再设为默认。"],
        source: "runtime-config",
      }));
      return;
    }

    const currentDefault = migrated.defaultModelProfileId;
    const defaultExists = Boolean(currentDefault && normalizedProfiles.some((profile) => profile.id === currentDefault));
    const shouldWrite = schemaIssues.length > 0 || !defaultExists;
    let saved: RuntimeConfig | undefined;
    let syncError: string | undefined;
    if (options.autoFix && shouldWrite) {
      const nextDefault = defaultExists ? currentDefault : normalizedProfiles[0]!.id;
      saved = await this.configStore.write({
        ...config,
        modelProfiles: normalizedProfiles,
        providerProfiles: migrated.providerProfiles ?? config.providerProfiles,
        defaultModelProfileId: nextDefault,
      });
      try {
        await this.hermesModelSyncService.syncRuntimeConfig(saved);
      } catch (error) {
        syncError = error instanceof Error ? error.message : String(error);
      }
    }
    const verified = saved ? await this.configStore.read() : undefined;
    const verifiedDefaultExists = Boolean(verified?.defaultModelProfileId && verified.modelProfiles.some((profile) => profile.id === verified.defaultModelProfileId));
    const schemaFixed = Boolean(saved && schemaIssues.length > 0 && verified?.modelProfiles.every((profile) => profile.id));
    const defaultFixed = Boolean(saved && !defaultExists && verifiedDefaultExists);

    items.push(item({
      id: "model.schema",
      title: "模型配置 schema",
      status: schemaFixed ? "fixed" : schemaIssues.length ? "warn" : "pass",
      severity: schemaIssues.length ? "warning" : "info",
      summary: schemaFixed
        ? "已迁移旧模型 schema，并为模型补齐稳定 ID。"
        : schemaIssues.length
          ? `发现旧模型 schema：${schemaIssues.join("；")}`
          : "模型配置 schema 正常。",
      details: syncError ? `Hermes 同步失败：${syncError}` : undefined,
      evidence: { configPath, modelCount: normalizedProfiles.length, issues: schemaIssues },
      autoFixable: schemaIssues.length > 0,
      fixed: schemaFixed,
      userActionRequired: false,
      suggestedActions: schemaIssues.length && !schemaFixed ? ["点击“一键修复”执行 schema migration 并保存配置。"] : [],
      source: "runtime-config",
    }));
    items.push(item({
      id: "model.default",
      title: "默认模型",
      status: defaultFixed ? "fixed" : defaultExists ? "pass" : "fail",
      severity: defaultExists || defaultFixed ? "info" : "error",
      summary: defaultFixed
        ? `已把默认模型修复为 ${verified?.defaultModelProfileId}。`
        : defaultExists
          ? `默认模型有效：${currentDefault}`
          : `默认模型指向不存在的模型：${currentDefault ?? "<empty>"}`,
      details: syncError ? `Hermes 同步失败：${syncError}` : undefined,
      evidence: { previousDefaultModelId: currentDefault, verifiedDefaultModelId: verified?.defaultModelProfileId, modelIds: normalizedProfiles.map((profile) => profile.id) },
      autoFixable: !defaultExists,
      fixed: defaultFixed,
      userActionRequired: !defaultExists && !defaultFixed,
      suggestedActions: defaultExists || defaultFixed ? [] : ["点击“一键修复”自动选择第一个可用模型作为默认模型。"],
      source: "runtime-config",
    }));
  }

  private async checkTaskLocks(items: OneClickDiagnosticItem[], options: OneClickDiagnosticsRunOptions) {
    this.setStage("task.lock", "正在检查任务锁状态...");
    const locks = this.workspaceLock.listActive();
    const runningSessionIds = new Set(this.taskRunner.listRunningSessionIds());
    const now = Date.now();
    const staleLocks = locks.filter((lock) => !runningSessionIds.has(lock.sessionId) && now - Date.parse(lock.createdAt) >= STALE_LOCK_MIN_AGE_MS);
    const youngOrRunningLocks = locks.filter((lock) => !staleLocks.includes(lock));

    let fixed = false;
    if (options.autoFix && staleLocks.length > 0) {
      for (const lock of staleLocks) {
        this.workspaceLock.release(lock.workspaceId, lock.sessionId);
      }
      const remaining = this.workspaceLock.listActive().filter((lock) => staleLocks.some((stale) => stale.workspaceId === lock.workspaceId && stale.sessionId === lock.sessionId));
      fixed = remaining.length === 0;
    }

    items.push(item({
      id: "task.lock",
      title: "任务锁",
      status: fixed ? "fixed" : staleLocks.length ? "warn" : locks.length ? "pass" : "pass",
      severity: staleLocks.length ? "warning" : "info",
      summary: fixed
        ? `已清理 ${staleLocks.length} 个确认无运行任务的 stale lock。`
        : staleLocks.length
          ? `发现 ${staleLocks.length} 个疑似 stale task lock。`
          : locks.length
            ? "存在任务锁，但对应任务仍在运行或锁刚创建，未判定为 stale。"
            : "当前没有活动任务锁。",
      evidence: { locks, runningSessionIds: [...runningSessionIds], staleLocks, youngOrRunningLocks },
      autoFixable: staleLocks.length > 0,
      fixed,
      userActionRequired: staleLocks.length > 0 && !fixed,
      suggestedActions: staleLocks.length > 0 && !fixed ? ["点击“一键修复”清理确认安全的 stale lock；若仍锁定，请切换会话或重启客户端。"] : [],
      source: "workspace-lock",
    }));
  }

  private skipHermesSystemAudit(items: OneClickDiagnosticItem[]) {
    this.setStage("hermes.audit", "已跳过高风险 Hermes 深度审计...");
    items.push(skippedItem(
      "hermes.audit.model",
      "Hermes 深度运行能力测试",
      "安全热修复已默认跳过真实 Hermes Agent 审计，避免大文件读取、host command 或长任务导致卡顿。",
      "HermesSystemAuditService",
    ));
    items.push(skippedItem(
      "hermes.audit.filesystem",
      "Hermes 文件能力审计",
      "安全热修复已跳过极限路径、大文件和跨目录写入审计。",
      "HermesSystemAuditService",
    ));
    items.push(skippedItem(
      "hermes.audit.command",
      "Hermes 命令执行审计",
      "安全热修复已跳过 host command 审计。",
      "HermesSystemAuditService",
    ));
  }

  private async capture(
    items: OneClickDiagnosticItem[],
    fallbackId: string,
    fallbackTitle: string,
    source: string,
    task: () => Promise<void>,
  ) {
    try {
      await task();
    } catch (error) {
      items.push(failureItem(fallbackId, fallbackTitle, error, { source }));
    }
  }

  private async captureValue<T>(
    items: OneClickDiagnosticItem[],
    fallbackId: string,
    fallbackTitle: string,
    source: string,
    task: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await task();
    } catch (error) {
      items.push(failureItem(fallbackId, fallbackTitle, error, { source }));
      return undefined;
    }
  }

  private setStage(stage: string, message: string) {
    this.status = {
      ...this.status,
      running: true,
      stage,
      message,
    };
  }
}

function item(input: OneClickDiagnosticItem): OneClickDiagnosticItem {
  return trimDiagnosticItem(redactSensitiveValue(input));
}

function skippedItem(id: string, title: string, summary: string, source?: string): OneClickDiagnosticItem {
  return item({
    id,
    title,
    status: "skipped",
    severity: "info",
    summary,
    autoFixable: false,
    source,
  });
}

function failureItem(
  id: string,
  title: string,
  error: unknown,
  extra: Partial<OneClickDiagnosticItem> = {},
): OneClickDiagnosticItem {
  const message = error instanceof Error ? error.message : String(error);
  return item({
    id,
    title,
    status: "fail",
    severity: "error",
    summary: extra.summary ?? message,
    details: extra.details ?? message,
    autoFixable: extra.autoFixable ?? false,
    userActionRequired: extra.userActionRequired ?? true,
    suggestedActions: extra.suggestedActions ?? ["导出诊断报告并根据错误信息修复。"],
    source: extra.source,
    evidence: extra.evidence,
    fixed: extra.fixed,
  });
}

function auditItem(id: string, title: string, step: HermesSystemAuditStep | undefined, source: string): OneClickDiagnosticItem {
  if (!step) {
    return skippedItem(id, title, "本项审计没有返回结果。", source);
  }
  return item({
    id,
    title,
    status: step.status === "passed" ? "pass" : step.status === "skipped" ? "skipped" : "fail",
    severity: step.status === "failed" ? "error" : "info",
    summary: step.message,
    details: step.detail,
    evidence: step,
    autoFixable: false,
    userActionRequired: step.status === "failed",
    suggestedActions: step.status === "failed" ? ["检查模型配置、Hermes runtime 和运行权限。"] : [],
    source,
  });
}

function summarize(items: OneClickDiagnosticItem[]): OneClickDiagnosticsReport["summary"] {
  const count = (status: OneClickDiagnosticStatus) => items.filter((item) => item.status === status).length;
  const warnings = count("warn");
  const failed = count("fail");
  const fixed = count("fixed");
  const skipped = count("skipped");
  return {
    total: items.length,
    passed: count("pass"),
    warnings,
    failed,
    fixed,
    skipped,
    unresolved: items.filter((item) => (item.status === "fail" || item.status === "warn") && !item.fixed).length,
  };
}

function normalizeRuntime(config: RuntimeConfig): NonNullable<RuntimeConfig["hermesRuntime"]> {
  return {
    mode: config.hermesRuntime?.mode ?? "windows",
    distro: config.hermesRuntime?.distro?.trim() || undefined,
    pythonCommand: config.hermesRuntime?.pythonCommand?.trim() || "python3",
    managedRoot: config.hermesRuntime?.managedRoot?.trim() || undefined,
    windowsAgentMode: config.hermesRuntime?.windowsAgentMode ?? "hermes_native",
    cliPermissionMode: config.hermesRuntime?.cliPermissionMode ?? "yolo",
    permissionPolicy: config.hermesRuntime?.permissionPolicy ?? "bridge_guarded",
    installSource: config.hermesRuntime?.installSource,
  };
}

function wslProbeEvidence(probe: Awaited<ReturnType<RuntimeProbeService["probe"]>>) {
  return {
    runtimeMode: probe.runtimeMode,
    wslAvailable: probe.wslAvailable,
    wslStatus: probe.wslStatus,
    distroName: probe.distroName,
    distroExists: probe.distroExists,
    distroReachable: probe.distroReachable,
    wslPythonAvailable: probe.wslPythonAvailable,
    issues: probe.issues,
  };
}

function validationEvidence(validation: HermesCliValidationResult) {
  return validation.ok
    ? {
        ok: true,
        command: validation.command,
        exitCode: validation.result.exitCode,
        capabilities: trimCapabilities(validation.capabilities),
      }
    : {
        ok: false,
        kind: validation.kind,
        command: validation.command,
        exitCode: validation.result?.exitCode,
        stderr: previewDiagnosticText(validation.result?.stderr),
        stdout: previewDiagnosticText(validation.result?.stdout),
        capabilities: validation.capabilities ? trimCapabilities(validation.capabilities) : undefined,
      };
}

function trimDiagnosticItem(value: OneClickDiagnosticItem): OneClickDiagnosticItem {
  return trimDiagnosticValue(value) as OneClickDiagnosticItem;
}

function trimDiagnosticValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return previewDiagnosticText(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (depth >= 4) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => trimDiagnosticValue(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, itemValue] of Object.entries(value)) {
    result[key] = trimDiagnosticValue(itemValue, depth + 1);
  }
  return result;
}

function trimCapabilities(capabilities: NonNullable<ResolvedHermesCli["capabilities"]>) {
  return {
    ...capabilities,
    raw: previewDiagnosticText(capabilities.raw),
  };
}

function previewDiagnosticText(value: string | undefined) {
  if (!value) return value;
  return value.length > 6000 ? `${value.slice(0, 6000)}\n...[truncated]` : value;
}

function capabilityFailureSummary(validation: HermesCliValidationResult) {
  if (validation.ok) return "capabilities --json 正常。";
  if (validation.kind === "file_missing") return "Hermes CLI 文件不存在，无法执行 capabilities --json。";
  if (validation.kind === "permission_denied") return "Hermes CLI 权限不足，无法执行 capabilities --json。";
  if (validation.kind === "capability_unsupported") return "Hermes CLI 存在，但版本或 capability 不满足最低门槛。";
  if (validation.message.includes("不是有效 JSON")) return "capabilities --json 返回内容不是有效 JSON。";
  return "capabilities --json 执行失败。";
}

function capabilitySuggestedActions(validation: HermesCliValidationResult) {
  if (validation.ok) return [];
  if (validation.kind === "file_missing") return ["Hermes Agent 未安装或路径不存在，请重新安装 / 修复安装。"];
  if (validation.kind === "permission_denied") return ["修复 WSL 文件权限后重试。"];
  if (validation.kind === "capability_unsupported") return ["更新或修复 Hermes Agent，使 capabilities 包含 launch metadata 与 resume 支持。"];
  if (validation.message.includes("不是有效 JSON")) return ["检查 Hermes CLI 是否输出了错误栈，必要时重新安装 Agent。"];
  return ["查看 stderr 并修复 Hermes CLI 运行错误。"];
}

async function chmodWslExecutable(runtime: HermesRuntimeConfig, cliPath: string) {
  const args = [
    ...(runtime.distro?.trim() ? ["-d", runtime.distro.trim()] : []),
    "--",
    "bash",
    "-lc",
    "chmod +x \"$1\"",
    "bash",
    cliPath,
  ];
  return runCommand("wsl.exe", args, {
    cwd: process.cwd(),
    timeoutMs: 10_000,
    commandId: "one-click.hermes-cli.chmod",
    runtimeKind: "wsl",
  });
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  if (!raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function modelSchemaIssues(raw: Record<string, unknown> | undefined, rawProfiles: unknown[]) {
  const issues: string[] = [];
  if (!raw) {
    issues.push("配置文件为空或不是有效 JSON，当前使用运行时默认配置");
    return issues;
  }
  if ("models" in raw) issues.push("存在旧字段 models");
  for (const field of ["defaultModelId", "defaultModel", "default_model", "default_model_id"]) {
    if (field in raw) issues.push(`存在旧默认模型字段 ${field}`);
  }
  const missingIdCount = rawProfiles.filter((profile) => profile && typeof profile === "object" && !("id" in profile)).length;
  if (missingIdCount > 0) issues.push(`${missingIdCount} 个模型缺少稳定 id`);
  const isDefaultCount = rawProfiles.filter((profile) => profile && typeof profile === "object" && (profile as { isDefault?: unknown }).isDefault === true).length;
  if (isDefaultCount > 1) issues.push(`存在 ${isDefaultCount} 个 isDefault=true`);
  return issues;
}
