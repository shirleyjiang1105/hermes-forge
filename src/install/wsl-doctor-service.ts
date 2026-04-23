import type { RuntimeConfigStore } from "../main/runtime-config";
import type { RuntimeProbeService } from "../runtime/runtime-probe-service";
import type { RuntimeAdapterFactory } from "../runtime/runtime-adapter";
import type { HermesRuntimeConfig } from "../shared/types";
import type { RuntimeProbeResult } from "../runtime/runtime-types";
import type { WslDoctorCheck, WslDoctorReport, WslDoctorStatus } from "./wsl-doctor-types";

export class WslDoctorService {
  constructor(
    private readonly configStore: RuntimeConfigStore,
    private readonly runtimeProbeService: RuntimeProbeService,
    private readonly runtimeAdapterFactory: RuntimeAdapterFactory,
  ) {}

  async diagnose(input: { workspacePath?: string; runtime?: HermesRuntimeConfig } = {}): Promise<WslDoctorReport> {
    const config = await this.configStore.read();
    const configuredRuntime = {
      mode: config.hermesRuntime?.mode ?? "windows",
      distro: config.hermesRuntime?.distro?.trim() || undefined,
      pythonCommand: config.hermesRuntime?.pythonCommand?.trim() || "python3",
      windowsAgentMode: config.hermesRuntime?.windowsAgentMode ?? "hermes_native",
    } satisfies HermesRuntimeConfig;
    const runtime = {
      ...configuredRuntime,
      ...input.runtime,
      mode: "wsl" as const,
      pythonCommand: input.runtime?.pythonCommand?.trim() || configuredRuntime.pythonCommand || "python3",
    };
    const probe = await this.runtimeProbeService.probe({ workspacePath: input.workspacePath, runtime });
    const preflight = await this.runtimeAdapterFactory(runtime).preflight({ workspacePath: input.workspacePath, requireBridge: true });
    const checks = this.checks(probe, configuredRuntime, runtime, preflight.ok);
    const blockingIssues = checks.filter((check) => check.status === "failed");
    const safeAutoRepairs = checks.filter((check) => check.autoFixable && check.status !== "passed");
    return {
      checkedAt: new Date().toISOString(),
      runtime,
      overallStatus: this.overallStatus(checks),
      checks,
      recommendedActions: [...new Set(checks.map((check) => check.fixHint).filter((item): item is string => Boolean(item)))],
      blockingIssues,
      safeAutoRepairs,
      runtimeProbe: probe,
    };
  }

  private checks(
    probe: RuntimeProbeResult,
    configuredRuntime: HermesRuntimeConfig,
    runtime: HermesRuntimeConfig,
    preflightOk: boolean,
  ): WslDoctorCheck[] {
    return [
      check("wsl-exe", "wsl", probe.wslAvailable ? "passed" : "failed", probe.wslAvailable ? "wsl_available" : "wsl_missing", probe.wslAvailable ? "wsl.exe 可运行。" : "wsl.exe 不可用。", {
        detail: probe.commands.wsl.message,
        fixHint: probe.wslAvailable ? undefined : "请启用 Windows Subsystem for Linux 并重启系统。",
      }),
      check("runtime-mode", "config", configuredRuntime.mode === "wsl" ? "passed" : "warning", configuredRuntime.mode === "wsl" ? "runtime_wsl" : "runtime_not_wsl", configuredRuntime.mode === "wsl" ? "当前配置已启用 WSL runtime。" : "当前配置不是 WSL runtime。", {
        autoFixable: configuredRuntime.mode !== "wsl",
        fixHint: configuredRuntime.mode !== "wsl" ? "可以安全地把 hermesRuntime.mode 校正为 wsl。" : undefined,
        debugContext: { configuredMode: configuredRuntime.mode },
      }),
      check("distro-exists", "distro", probe.distroExists !== false ? "passed" : "failed", probe.distroExists !== false ? "distro_exists" : "wsl_distro_missing", probe.distroExists !== false ? "目标/默认 WSL 发行版存在。" : "目标 WSL 发行版不存在。", {
        detail: probe.commands.wsl.message,
        fixHint: probe.distroExists === false ? "请手动安装目标发行版，或选择已存在的发行版。" : undefined,
        debugContext: { distro: runtime.distro },
      }),
      check("distro-reachable", "distro", probe.distroReachable !== false ? "passed" : "failed", probe.distroReachable !== false ? "distro_reachable" : "wsl_distro_unreachable", probe.distroReachable !== false ? "WSL 发行版可进入。" : "WSL 发行版无法进入。", {
        detail: probe.commands.wsl.message,
        fixHint: probe.distroReachable === false ? "请运行 wsl.exe 检查发行版状态，必要时重启 WSL。" : undefined,
      }),
      check("wsl-python", "python", probe.wslPythonAvailable ? "passed" : "failed", probe.wslPythonAvailable ? "wsl_python_available" : "wsl_python_missing", probe.wslPythonAvailable ? "WSL 内 Python 可用。" : "WSL 内 Python 不可用。", {
        autoFixable: !runtime.pythonCommand,
        detail: probe.commands.wsl.message,
        fixHint: probe.wslPythonAvailable ? undefined : "请在 WSL 内安装 Python，或把 pythonCommand 改成可执行命令。",
        debugContext: { pythonCommand: runtime.pythonCommand },
      }),
      check("hermes-root", "hermes", probe.hermesRootExists ? "passed" : "failed", probe.hermesRootExists ? "hermes_root_exists" : "hermes_root_missing", probe.hermesRootExists ? "Hermes root 在 WSL runtime 下可访问。" : "Hermes root 在 WSL runtime 下不可访问。", {
        detail: probe.paths.profileHermesPath.path,
        fixHint: probe.hermesRootExists ? undefined : "请确认 Hermes root 已安装且 WSL 可访问该路径；本轮不会自动 clone Hermes。",
      }),
      check("hermes-cli", "hermes", probe.hermesCliExists ? "passed" : "failed", probe.hermesCliExists ? "hermes_cli_exists" : "hermes_cli_missing", probe.hermesCliExists ? "Hermes CLI 在 WSL runtime 下可访问。" : "Hermes CLI 在 WSL runtime 下不可访问。", {
        fixHint: probe.hermesCliExists ? undefined : "请确认 Hermes root 中存在 hermes 入口；下一阶段可做 WSL 内安装。",
      }),
      check("bridge-reachable", "bridge", probe.bridgeReachable ? "passed" : "failed", probe.bridgeReachable ? "bridge_reachable" : "bridge_unreachable", probe.bridgeReachable ? "Windows Bridge 可从 WSL 访问。" : "Windows Bridge 无法从 WSL 访问。", {
        autoFixable: Boolean(probe.bridge.running),
        detail: probe.bridge.message,
        fixHint: probe.bridgeReachable ? undefined : "请确认 Bridge 已启动、host/port 已刷新，并允许防火墙访问。",
        debugContext: { bridgeHost: probe.bridgeHost, bridgePort: probe.bridgePort },
      }),
      check("paths-resolved", "path", probe.homeResolved && probe.memoryResolved ? "passed" : "warning", probe.homeResolved && probe.memoryResolved ? "paths_resolved" : "paths_partial", probe.homeResolved && probe.memoryResolved ? "关键路径已解析。" : "部分关键路径未解析。", {
        autoFixable: !(probe.homeResolved && probe.memoryResolved),
        debugContext: { paths: probe.paths.all },
        fixHint: "可通过刷新 runtime path resolution 修复假性失败。",
      }),
      check("preflight", "support", preflightOk ? "passed" : "failed", preflightOk ? "preflight_ready" : "preflight_failed", preflightOk ? "RuntimeAdapter preflight 通过。" : "RuntimeAdapter preflight 未通过。", {
        detail: probe.issues[0]?.summary,
        fixHint: probe.issues[0]?.fixHint,
      }),
    ];
  }

  private overallStatus(checks: WslDoctorCheck[]): WslDoctorReport["overallStatus"] {
    const failed = checks.filter((check) => check.status === "failed");
    if (failed.length === 0) return "ready_to_attach_existing_wsl";
    if (failed.every((check) => check.autoFixable)) return "repair_needed";
    if (failed.some((check) => check.code === "wsl_missing")) return "unsupported";
    return "manual_setup_required";
  }
}

function check(
  checkId: string,
  category: WslDoctorCheck["category"],
  status: WslDoctorStatus,
  code: string,
  summary: string,
  extra: Partial<Omit<WslDoctorCheck, "checkId" | "category" | "status" | "code" | "summary">> = {},
): WslDoctorCheck {
  return {
    checkId,
    category,
    status,
    code,
    summary,
    autoFixable: false,
    ...extra,
  };
}
