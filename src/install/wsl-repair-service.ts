import { runCommand } from "../process/command-runner";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { RuntimeAdapterFactory } from "../runtime/runtime-adapter";
import type { RuntimeProbeService } from "../runtime/runtime-probe-service";
import type { RuntimeConfig } from "../shared/types";
import type {
  WslDoctorReport,
  WslRepairDependencyCheck,
  WslRepairDependencyId,
  WslRepairDryRunAction,
  WslRepairDryRunResult,
  WslRepairResult,
  WslRepairStep,
} from "./wsl-doctor-types";
import type { ManagedWslInstallerRecoveryAction } from "./managed-wsl-recovery-types";
import { WslDoctorService } from "./wsl-doctor-service";

type RepairSupport = {
  distroReachable: boolean;
  aptAvailable: boolean;
  privilegeMode: "sudo" | "root" | "none" | "unknown";
  code: string;
  summary: string;
  detail?: string;
  fixHint?: string;
  debugContext?: Record<string, unknown>;
};

type MutableRepairContext = {
  config: RuntimeConfig;
  next: RuntimeConfig;
  configDirty: boolean;
};

const DEPENDENCY_ORDER: WslRepairDependencyId[] = ["python3", "git", "pip", "venv"];
const PACKAGE_BY_DEPENDENCY: Record<WslRepairDependencyId, string> = {
  python3: "python3",
  git: "git",
  pip: "python3-pip",
  venv: "python3-venv",
};

export class WslRepairService {
  private lastDryRunResult?: WslRepairDryRunResult;
  private lastRepairResult?: WslRepairResult;

  constructor(
    private readonly configStore: RuntimeConfigStore,
    private readonly runtimeProbeService: RuntimeProbeService,
    private readonly runtimeAdapterFactory: RuntimeAdapterFactory,
    private readonly doctor: WslDoctorService,
  ) {}

  getLastDryRunResult() {
    return this.lastDryRunResult;
  }

  getLastRepairResult() {
    return this.lastRepairResult;
  }

  async dryRun(report?: WslDoctorReport): Promise<WslRepairDryRunResult> {
    const before = report ?? await this.doctor.diagnose();
    const config = await this.configStore.read();
    const support = await this.detectRepairSupport(before);
    const dependencyChecks = await this.probeDependencies(before, support);
    const actions = this.planActions(before, config, dependencyChecks, support);
    const result: WslRepairDryRunResult = {
      ok: !actions.some((action) => action.manualActionRequired),
      summary: this.dryRunSummary(actions, dependencyChecks),
      dependencyChecks,
      actions,
      before,
      expectedStatus: actions.some((action) => action.wouldChange) ? "repair_needed" : before.overallStatus,
    };
    this.lastDryRunResult = result;
    return result;
  }

  async repair(report?: WslDoctorReport, options: { dryRun?: boolean } = {}): Promise<WslRepairResult> {
    const dryRun = await this.dryRun(report);
    const before = dryRun.before;
    if (options.dryRun) {
      const result: WslRepairResult = {
        ok: dryRun.ok,
        repaired: false,
        summary: dryRun.summary,
        dependencyChecks: dryRun.dependencyChecks,
        steps: dryRun.actions.map((action) => ({
          action: action.actionId,
          status: "skipped",
          code: action.wouldChange ? "repair_planned" : "repair_not_needed",
          summary: action.description,
          detail: action.expectedOutcome,
          fixHint: action.manualActionRequired ? "该项需要人工处理后再重新执行 repair。" : undefined,
          dependency: action.dependency,
          command: action.command,
          debugContext: action.debugContext,
        })),
        repairedDependencies: [],
        skippedDependencies: dryRun.dependencyChecks.map((check) => check.dependency),
        failedDependencies: [],
        manualActionsRequired: dryRun.actions
          .filter((action) => action.manualActionRequired)
          .map((action) => ({
            dependency: action.dependency,
            summary: action.description,
            fixHint: "该项需要人工处理后再重新执行 repair。",
          })),
        nextRecommendedStep: dryRun.actions.some((action) => action.manualActionRequired) ? "manual_fix_then_retry" : "run_execute_repair",
        dryRun,
        before,
      };
      this.lastRepairResult = result;
      return result;
    }

    const steps: WslRepairStep[] = [];
    const context: MutableRepairContext = {
      config: await this.configStore.read(),
      next: cloneConfig(await this.configStore.read()),
      configDirty: false,
    };

    for (const action of dryRun.actions.filter((item) => item.wouldChange)) {
      if (action.manualActionRequired) {
        steps.push({
          action: action.actionId,
          status: "failed",
          code: "manual_action_required",
          summary: action.description,
          detail: action.expectedOutcome,
          fixHint: "请先完成人工修复，再重新执行 Managed WSL repair。",
          dependency: action.dependency,
          command: action.command,
          debugContext: action.debugContext,
        });
        continue;
      }

      const step = await this.executeAction(action, before, context);
      steps.push(step);
    }

    if (context.configDirty) {
      await this.configStore.write(context.next);
    }

    if (steps.length === 0) {
      steps.push({
        action: "none",
        status: "skipped",
        code: "repair_not_needed",
        summary: "没有需要执行的 WSL repair 动作。",
        debugContext: {
          blockingIssues: before.blockingIssues,
        },
      });
    }

    const after = await this.doctor.diagnose({ runtime: context.next.hermesRuntime });
    const afterSupport = await this.detectRepairSupport(after);
    const dependencyChecks = await this.probeDependencies(after, afterSupport);
    const blockingDependency = dependencyChecks.find((check) => check.status !== "ok" && check.status !== "repaired");
    const failedStep = steps.find((step) => step.status === "failed");
    const repairedDependencies = steps
      .filter((step) => step.status === "applied" && step.dependency)
      .map((step) => step.dependency!) as WslRepairDependencyId[];
    const failedDependencies = steps
      .filter((step) => step.status === "failed" && step.dependency)
      .map((step) => step.dependency!) as WslRepairDependencyId[];
    const skippedDependencies = dependencyChecks
      .map((check) => check.dependency)
      .filter((dependency) => !repairedDependencies.includes(dependency) && !failedDependencies.includes(dependency));
    const manualActionsRequired = [
      ...dryRun.actions
        .filter((action) => action.manualActionRequired)
        .map((action) => ({
          dependency: action.dependency,
          summary: action.description,
          fixHint: "该项需要人工处理后再重新执行 repair。",
        })),
      ...steps
        .filter((step) => step.status === "failed" && step.code === "manual_action_required")
        .map((step) => ({
          dependency: step.dependency,
          summary: step.summary,
          fixHint: step.fixHint,
        })),
    ];
    const result: WslRepairResult = {
      ok: !failedStep && !blockingDependency,
      repaired: steps.some((step) => step.status === "applied"),
      summary: failedStep
        ? "WSL repair 已执行，但仍有动作失败。"
        : blockingDependency
          ? "WSL repair 已执行，但仍有依赖需要继续修复。"
          : "WSL repair 已完成，Python/git/pip/venv 已达到当前链路要求。",
      dependencyChecks,
      steps,
      repairedDependencies,
      skippedDependencies,
      failedDependencies,
      manualActionsRequired,
      nextRecommendedStep: this.nextRecommendedStep(failedStep, blockingDependency, manualActionsRequired),
      dryRun,
      before,
      after,
    };
    this.lastRepairResult = result;
    return result;
  }

  private dryRunSummary(actions: WslRepairDryRunAction[], dependencyChecks: WslRepairDependencyCheck[]) {
    if (actions.some((action) => action.manualActionRequired)) {
      return "WSL dry-run 已生成 repair 计划，但其中包含需要人工处理的依赖项。";
    }
    if (actions.some((action) => action.wouldChange)) {
      return "WSL dry-run 已生成可执行 repair 计划。";
    }
    if (dependencyChecks.every((check) => check.status === "ok")) {
      return "WSL dry-run 确认 python3/git/pip/venv 已满足当前链路要求。";
    }
    return "WSL dry-run 未发现可自动修复的变更。";
  }

  private async executeAction(
    action: WslRepairDryRunAction,
    before: WslDoctorReport,
    context: MutableRepairContext,
  ): Promise<WslRepairStep> {
    if (action.actionId === "set_runtime_wsl") {
      context.next.hermesRuntime = { ...(context.next.hermesRuntime ?? { pythonCommand: "python3" }), mode: "wsl" };
      context.configDirty = true;
      return applied(action.actionId, "repair_applied", "已将 hermesRuntime.mode 校正为 wsl。");
    }

    if (action.actionId === "set_default_python") {
      context.next.hermesRuntime = { ...(context.next.hermesRuntime ?? { mode: "wsl" }), pythonCommand: "python3" };
      context.configDirty = true;
      return applied(action.actionId, "repair_applied", "已补充默认 WSL pythonCommand=python3。");
    }

    if (action.actionId === "select_existing_distro") {
      const probeDistro = before.runtimeProbe.distroName?.trim();
      if (probeDistro) {
        context.next.hermesRuntime = {
          ...(context.next.hermesRuntime ?? { mode: "wsl", pythonCommand: "python3" }),
          distro: probeDistro,
        };
        context.configDirty = true;
        return applied(action.actionId, "repair_applied", `已选择已存在 WSL 发行版：${probeDistro}`);
      }
      return {
        action: action.actionId,
        status: "failed",
        code: "manual_action_required",
        summary: "无法自动选择已有 distro。",
        fixHint: "请先在设置中明确选择 distro，或先创建 Managed distro。",
        debugContext: action.debugContext,
      };
    }

    if (action.actionId === "refresh_bridge_config") {
      const runtime = {
        mode: "wsl" as const,
        distro: context.next.hermesRuntime?.distro?.trim() || undefined,
        pythonCommand: context.next.hermesRuntime?.pythonCommand?.trim() || "python3",
        windowsAgentMode: context.next.hermesRuntime?.windowsAgentMode ?? "hermes_native",
      };
      await this.runtimeAdapterFactory(runtime).getBridgeAccessHost().catch(() => undefined);
      await this.runtimeProbeService.probe({ runtime }).catch(() => undefined);
      return applied(action.actionId, "repair_applied", "已刷新 WSL bridge host/path 探测缓存。");
    }

    if (action.command) {
      const runtime = {
        mode: "wsl" as const,
        distro: context.next.hermesRuntime?.distro?.trim() || before.runtime.distro,
        pythonCommand: context.next.hermesRuntime?.pythonCommand?.trim() || before.runtime.pythonCommand || "python3",
        windowsAgentMode: context.next.hermesRuntime?.windowsAgentMode ?? before.runtime.windowsAgentMode ?? "hermes_native",
      };
      const result = await this.runInDistro(runtime, action.command, `repair.wsl.${action.actionId}`);
      if (result.exitCode === 0) {
        return {
          action: action.actionId,
          status: "applied",
          code: "repair_applied",
          summary: action.description,
          detail: result.stdout.trim() || result.stderr.trim() || action.expectedOutcome,
          dependency: action.dependency,
          command: action.command,
          debugContext: {
            ...action.debugContext,
            diagnostics: result.diagnostics,
          },
        };
      }
      return {
        action: action.actionId,
        status: "failed",
        code: action.code ?? "manual_action_required",
        summary: action.description,
        detail: result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`,
        fixHint: "请进入该 distro 手动执行 apt 安装，或确认 sudo/apt-get 权限后重试。",
        dependency: action.dependency,
        command: action.command,
        debugContext: {
          ...action.debugContext,
          diagnostics: result.diagnostics,
        },
      };
    }

    return {
      action: action.actionId,
      status: "skipped",
      code: "repair_not_needed",
      summary: action.description,
      detail: action.expectedOutcome,
      dependency: action.dependency,
      command: action.command,
      debugContext: action.debugContext,
    };
  }

  private planActions(
    report: WslDoctorReport,
    config: RuntimeConfig,
    dependencyChecks: WslRepairDependencyCheck[],
    support: RepairSupport,
  ): WslRepairDryRunAction[] {
    const actions: WslRepairDryRunAction[] = [];
    actions.push({
      actionId: "set_runtime_wsl",
      description: "将 hermesRuntime.mode 设置为 wsl。",
      target: "config.hermesRuntime.mode",
      safe: true,
      reversible: true,
      wouldChange: (config.hermesRuntime?.mode ?? "windows") !== "wsl",
      expectedOutcome: "后续 runtime probe 将按 WSL 模式解析路径和启动命令。",
      code: "ok",
      debugContext: { current: config.hermesRuntime?.mode },
    });
    actions.push({
      actionId: "set_default_python",
      description: "补充 WSL 默认 pythonCommand=python3。",
      target: "config.hermesRuntime.pythonCommand",
      safe: true,
      reversible: true,
      wouldChange: !config.hermesRuntime?.pythonCommand?.trim(),
      expectedOutcome: "WSL Python 探测会使用 python3 作为默认命令。",
      code: "ok",
      debugContext: { current: config.hermesRuntime?.pythonCommand },
    });
    actions.push({
      actionId: "select_existing_distro",
      description: "如果 probe 已识别现有发行版，则写入 hermesRuntime.distro。",
      target: "config.hermesRuntime.distro",
      safe: true,
      reversible: true,
      wouldChange: !config.hermesRuntime?.distro?.trim() && Boolean(report.runtimeProbe.distroName?.trim()),
      expectedOutcome: "后续 WSL 命令将显式使用已存在发行版。",
      code: "ok",
      debugContext: { current: config.hermesRuntime?.distro, detected: report.runtimeProbe.distroName },
    });
    actions.push({
      actionId: "refresh_bridge_config",
      description: "刷新 bridge host/path runtime probe，修复假性缓存失败。",
      target: "runtime probe cache",
      safe: true,
      reversible: true,
      wouldChange: report.safeAutoRepairs.some((item) => item.category === "bridge" || item.category === "path"),
      expectedOutcome: "重新解析 WSL 到 Windows bridge 的 host/port 和关键路径。",
      code: "ok",
      debugContext: { bridge: report.runtimeProbe.bridge, paths: report.runtimeProbe.paths.all },
    });

    for (const dependency of DEPENDENCY_ORDER) {
      const check = dependencyChecks.find((item) => item.dependency === dependency);
      if (!check || check.status === "ok") continue;
      const packageName = PACKAGE_BY_DEPENDENCY[dependency];
      const actionId = dependencyToActionId(dependency);
      const command = this.buildInstallCommand(packageName, support);
      const manualActionRequired = !command;
      actions.push({
        actionId,
        description: `修复 WSL 内 ${dependency} 依赖。`,
        target: packageName,
        safe: !manualActionRequired,
        reversible: false,
        wouldChange: true,
        expectedOutcome: manualActionRequired
          ? `当前无法自动修复 ${dependency}；需要人工在 distro 内安装 ${packageName}。`
          : `将显式安装 ${packageName}，以恢复 ${dependency}。`,
        code: check.code,
        dependency,
        command: command ?? undefined,
        manualActionRequired,
        debugContext: {
          ...check.debugContext,
          packageName,
          support,
        },
      });
    }
    return actions;
  }

  private async probeDependencies(report: WslDoctorReport, support: RepairSupport): Promise<WslRepairDependencyCheck[]> {
    if (!support.distroReachable) {
      return DEPENDENCY_ORDER.map((dependency) => ({
        dependency,
        status: "manual_action_required",
        available: false,
        code: "distro_unavailable",
        summary: `无法在不可用的 distro 中检测 ${dependency}。`,
        detail: support.detail,
        fixHint: "请先让目标 distro 可进入，再执行 Managed WSL repair。",
        debugContext: support.debugContext,
      }));
    }

    const runtime = report.runtime;
    const python = await this.runInDistro(runtime, "python3 --version", "repair.wsl.probe.python3");
    const pythonAvailable = python.exitCode === 0;
    const git = await this.runInDistro(runtime, "git --version", "repair.wsl.probe.git");
    const gitAvailable = git.exitCode === 0;
    const pip = pythonAvailable
      ? await this.runInDistro(runtime, "python3 -m pip --version", "repair.wsl.probe.pip")
      : undefined;
    const pipAvailable = pip?.exitCode === 0;
    const venv = pythonAvailable
      ? await this.runInDistro(runtime, "python3 -m venv --help >/dev/null", "repair.wsl.probe.venv")
      : undefined;
    const venvAvailable = venv?.exitCode === 0;

    return [
      {
        dependency: "python3",
        status: pythonAvailable ? "ok" : support.aptAvailable && support.privilegeMode !== "none" ? "repair_planned" : "manual_action_required",
        available: pythonAvailable,
        code: pythonAvailable ? "ok" : "python_missing",
        summary: pythonAvailable ? "WSL 内 python3 可用。" : "WSL 内缺少 python3。",
        detail: (python.stdout || python.stderr).trim() || report.runtimeProbe.commands.wsl.message,
        fixHint: pythonAvailable ? undefined : "可通过 Managed WSL repair 显式安装 python3；若无 sudo/apt，则需要人工处理。",
        debugContext: { diagnostics: python.diagnostics },
      },
      {
        dependency: "git",
        status: gitAvailable ? "ok" : support.aptAvailable && support.privilegeMode !== "none" ? "repair_planned" : "manual_action_required",
        available: gitAvailable,
        code: gitAvailable ? "ok" : "git_missing",
        summary: gitAvailable ? "WSL 内 git 可用。" : "WSL 内缺少 git。",
        detail: (git.stdout || git.stderr).trim(),
        fixHint: gitAvailable ? undefined : "可通过 Managed WSL repair 显式安装 git；若无 sudo/apt，则需要人工处理。",
        debugContext: { diagnostics: git.diagnostics },
      },
      {
        dependency: "pip",
        status: pipAvailable ? "ok" : !pythonAvailable ? "manual_action_required" : support.aptAvailable && support.privilegeMode !== "none" ? "repair_planned" : "manual_action_required",
        available: Boolean(pipAvailable),
        code: pipAvailable ? "ok" : "pip_missing",
        summary: pipAvailable ? "WSL 内 pip 可用。" : "WSL 内缺少 pip。",
        detail: (pip?.stdout || pip?.stderr || (pythonAvailable ? "" : "python3 不可用，无法继续检测 pip。")).trim(),
        fixHint: pipAvailable ? undefined : "可通过 Managed WSL repair 显式安装 python3-pip；若 python3 本身缺失，请先修复 python3。",
        debugContext: { diagnostics: pip?.diagnostics, pythonAvailable },
      },
      {
        dependency: "venv",
        status: venvAvailable ? "ok" : !pythonAvailable ? "manual_action_required" : support.aptAvailable && support.privilegeMode !== "none" ? "repair_planned" : "manual_action_required",
        available: Boolean(venvAvailable),
        code: venvAvailable ? "ok" : "venv_unavailable",
        summary: venvAvailable ? "WSL 内 venv 模块可用。" : "WSL 内 venv 模块不可用。",
        detail: (venv?.stdout || venv?.stderr || (pythonAvailable ? "" : "python3 不可用，无法继续检测 venv。")).trim(),
        fixHint: venvAvailable ? undefined : "可通过 Managed WSL repair 显式安装 python3-venv；若 python3 本身缺失，请先修复 python3。",
        debugContext: { diagnostics: venv?.diagnostics, pythonAvailable },
      },
    ];
  }

  private async detectRepairSupport(report: WslDoctorReport): Promise<RepairSupport> {
    const runtime = report.runtime;
    if (report.overallStatus === "unsupported") {
      return {
        distroReachable: false,
        aptAvailable: false,
        privilegeMode: "unknown",
        code: "unsupported",
        summary: "当前环境不支持 Managed WSL repair。",
        detail: report.blockingIssues.map((issue) => issue.summary).join("；"),
        fixHint: report.recommendedActions[0],
        debugContext: { blockingIssues: report.blockingIssues },
      };
    }

    const distroBlocked = report.blockingIssues.find((issue) => ["wsl_missing", "wsl_distro_missing", "wsl_distro_unreachable"].includes(issue.code));
    if (distroBlocked) {
      return {
        distroReachable: false,
        aptAvailable: false,
        privilegeMode: "unknown",
        code: "distro_unavailable",
        summary: "目标 distro 当前不可用于执行 repair。",
        detail: distroBlocked.detail ?? distroBlocked.summary,
        fixHint: distroBlocked.fixHint,
        debugContext: distroBlocked.debugContext,
      };
    }

    const apt = await this.runInDistro(runtime, "command -v apt-get >/dev/null && echo yes || echo no", "repair.wsl.support.apt");
    const privilege = await this.runInDistro(
      runtime,
      "if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then echo sudo; elif [ \"$(id -u)\" -eq 0 ]; then echo root; else echo none; fi",
      "repair.wsl.support.privilege",
    );
    const privilegeMode = (privilege.stdout || "").trim();
    return {
      distroReachable: true,
      aptAvailable: (apt.stdout || "").trim() === "yes",
      privilegeMode: privilegeMode === "sudo" || privilegeMode === "root" || privilegeMode === "none" ? privilegeMode : "unknown",
      code: privilegeMode === "none" ? "manual_action_required" : "ok",
      summary: (apt.stdout || "").trim() === "yes"
        ? privilegeMode === "none"
          ? "检测到 apt-get，但当前账户无法无交互提权。"
          : "当前 distro 支持 apt-get repair。"
        : "当前 distro 不支持 apt-get repair。",
      detail: [apt.stderr.trim(), privilege.stderr.trim()].filter(Boolean).join("\n"),
      fixHint: (apt.stdout || "").trim() === "yes"
        ? privilegeMode === "none"
          ? "请在该 distro 内准备 sudo/root 权限，或改为人工安装依赖。"
          : undefined
        : "当前自动 repair 仅支持 apt-get 包安装；其他发行版请人工安装依赖。",
      debugContext: {
        aptDiagnostics: apt.diagnostics,
        privilegeDiagnostics: privilege.diagnostics,
      },
    };
  }

  private buildInstallCommand(packageName: string, support: RepairSupport) {
    if (!support.distroReachable || !support.aptAvailable) return undefined;
    if (support.privilegeMode === "root") {
      return `DEBIAN_FRONTEND=noninteractive apt-get install -y ${shellQuote(packageName)}`;
    }
    if (support.privilegeMode === "sudo") {
      return `sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y ${shellQuote(packageName)}`;
    }
    return undefined;
  }

  private nextRecommendedStep(
    failedStep: WslRepairStep | undefined,
    blockingDependency: WslRepairDependencyCheck | undefined,
    manualActionsRequired: Array<{ dependency?: WslRepairDependencyId; summary: string; fixHint?: string }>,
  ): ManagedWslInstallerRecoveryAction {
    if (manualActionsRequired.length > 0) return "manual_fix_then_retry";
    if (failedStep || blockingDependency) return "run_execute_repair";
    return "retry_install";
  }

  private async runInDistro(
    runtime: { distro?: string; pythonCommand?: string; windowsAgentMode?: "hermes_native" | "host_tool_loop" | "disabled" },
    script: string,
    commandId: string,
  ) {
    return runCommand("wsl.exe", [...(runtime.distro ? ["-d", runtime.distro] : []), "sh", "-lc", script], {
      cwd: process.cwd(),
      timeoutMs: 10 * 60 * 1000,
      commandId,
      runtimeKind: "wsl",
    });
  }
}

function dependencyToActionId(dependency: WslRepairDependencyId) {
  if (dependency === "python3") return "install_python3" as const;
  if (dependency === "git") return "install_git" as const;
  if (dependency === "pip") return "install_pip" as const;
  return "install_venv" as const;
}

function applied(action: WslRepairStep["action"], code: string, summary: string): WslRepairStep {
  return { action, status: "applied", code, summary };
}

function cloneConfig(config: RuntimeConfig): RuntimeConfig {
  return JSON.parse(JSON.stringify(config)) as RuntimeConfig;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
