import fs from "node:fs/promises";
import path from "node:path";
import { runCommand } from "../process/command-runner";
import type { HermesRuntimeConfig, RuntimeConfig, WindowsBridgeStatus } from "../shared/types";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { RuntimeResolver, ParsedCommand } from "./runtime-resolver";
import { parseCommandLine, parseWslHost, toWslPath } from "./runtime-resolver";
import type {
  RuntimeBridgeProbe,
  RuntimeCommandProbe,
  RuntimeIssue,
  RuntimeIssueCode,
  RuntimeOverallStatus,
  RuntimeProbeResult,
  RuntimeWslProbe,
} from "./runtime-types";

type BridgeAccess = {
  url: string;
  token: string;
  capabilities: string;
};

type BridgeProvider = {
  status(): WindowsBridgeStatus;
  accessForHost(host: string): BridgeAccess | undefined;
  start?(): Promise<WindowsBridgeStatus>;
};

const COMMAND_TIMEOUT_MS = 8000;
const WSL_TIMEOUT_MS = 10000;

export class RuntimeProbeService {
  constructor(
    private readonly configStore: RuntimeConfigStore,
    private readonly runtimeResolver: RuntimeResolver,
    private readonly bridge?: BridgeProvider,
    private readonly appFetch: typeof fetch = fetch,
  ) {}

  async probe(input: { workspacePath?: string; runtime?: HermesRuntimeConfig } = {}): Promise<RuntimeProbeResult> {
    const config = await this.configStore.read().catch(() => undefined);
    const runtime = input.runtime ?? this.runtimeResolver.runtimeFromConfig(config);
    const paths = await this.runtimeResolver.resolvePaths({ runtime, workspacePath: input.workspacePath });
    const rootPath = runtime.mode === "wsl" && config?.hermesRuntime?.managedRoot?.trim()
      ? config.hermesRuntime.managedRoot.trim()
      : await this.configStore.getEnginePath("hermes");
    const runtimeRootPath = runtime.mode === "wsl" ? toWslPath(rootPath) : rootPath;
    const runtimeCliPath = runtime.mode === "wsl" ? `${runtimeRootPath.replace(/\/+$/, "")}/hermes` : path.join(rootPath, "hermes");

    const [powershell, python, git, winget, wsl] = await Promise.all([
      this.probeCommand("powershell.exe", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], "PowerShell", "windows"),
      this.probeNativePython(runtime, rootPath),
      this.probeCommand("git", ["--version"], "Git", "windows"),
      process.platform === "win32"
        ? this.probeCommand("winget", ["--version"], "winget", "windows")
        : Promise.resolve({ available: false, message: "非 Windows 平台跳过 winget 检测。" } satisfies RuntimeCommandProbe),
      this.probeWsl(runtime, runtimeRootPath),
    ]);

    const hermesRootExists = runtime.mode === "wsl"
      ? Boolean(wsl.available && await this.wslPathExists(runtime, runtimeRootPath))
      : await exists(rootPath);
    const hermesCliExists = runtime.mode === "wsl"
      ? Boolean(wsl.available && await this.wslPathExists(runtime, runtimeCliPath))
      : await exists(runtimeCliPath);
    const bridge = await this.probeBridge(runtime, wsl.hostIp);
    const issues = this.collectIssues({
      runtime,
      powershell,
      python,
      git,
      winget,
      wsl,
      hermesRootExists,
      hermesCliExists,
      bridge,
    });
    const overallStatus = this.overallStatus(runtime, issues);

    return {
      checkedAt: new Date().toISOString(),
      runtimeMode: runtime.mode,
      windowsAvailable: process.platform === "win32",
      powershellAvailable: powershell.available,
      pythonAvailable: python.available,
      pythonCommandResolved: python.label,
      gitAvailable: git.available,
      wingetAvailable: winget.available,
      wslAvailable: wsl.available,
      wslStatus: wsl.status,
      distroExists: wsl.distroExists,
      distroName: wsl.distroName,
      distroReachable: wsl.distroReachable,
      wslPythonAvailable: wsl.pythonAvailable,
      hermesRootExists,
      hermesCliExists,
      bridgeReachable: bridge.reachable,
      bridgeHost: bridge.host,
      bridgePort: bridge.port,
      configResolved: Boolean(config),
      homeResolved: Boolean(paths.profileHermesPath.path),
      memoryResolved: Boolean(paths.memoryPath.path),
      paths,
      commands: { powershell, python, git, winget, wsl },
      bridge,
      overallStatus,
      issues,
      recommendations: issues.map((issue) => issue.fixHint).filter((item): item is string => Boolean(item)),
    };
  }

  private async probeNativePython(runtime: HermesRuntimeConfig, rootPath: string): Promise<RuntimeCommandProbe> {
    const candidates = this.pythonCandidates(runtime, rootPath);
    const failures: string[] = [];
    for (const candidate of candidates) {
      if (looksLikeFilePath(candidate.command) && !(await exists(candidate.command))) {
        failures.push(`${candidate.label}: 文件不存在`);
        continue;
      }
      const result = await runCommand(candidate.command, [...candidate.args, "--version"], {
        cwd: rootPath,
        timeoutMs: COMMAND_TIMEOUT_MS,
        commandId: "runtime.probe.python",
        runtimeKind: "windows",
      });
      if (result.exitCode === 0) {
        return {
          available: true,
          command: candidate.command,
          args: candidate.args,
          label: candidate.label,
          version: (result.stdout || result.stderr).trim(),
          message: `${candidate.label} 可用。`,
        };
      }
      failures.push(`${candidate.label}: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`);
    }
    return {
      available: false,
      message: failures.length ? failures.slice(0, 5).join("；") : "未找到可用 Python。",
    };
  }

  private pythonCandidates(runtime: HermesRuntimeConfig, rootPath: string): ParsedCommand[] {
    const candidates: ParsedCommand[] = [];
    const add = (raw: string | undefined) => {
      const parsed = raw?.trim() ? parseCommandLine(raw) : undefined;
      if (!parsed) return;
      if (!candidates.some((item) => item.command === parsed.command && item.args.join("\0") === parsed.args.join("\0"))) {
        candidates.push(parsed);
      }
    };
    add(runtime.pythonCommand);
    if (process.platform === "win32") {
      add(path.join(rootPath, ".venv", "Scripts", "python.exe"));
      add(path.join(rootPath, "venv", "Scripts", "python.exe"));
      add("py -3");
      add("python");
      add("python3");
    } else {
      add(path.join(rootPath, ".venv", "bin", "python"));
      add(path.join(rootPath, "venv", "bin", "python"));
      add("python3");
      add("python");
    }
    return candidates;
  }

  private async probeCommand(command: string, args: string[], label: string, runtimeKind: "windows" | "wsl"): Promise<RuntimeCommandProbe> {
    const result = await runCommand(command, args, {
      cwd: process.cwd(),
      timeoutMs: COMMAND_TIMEOUT_MS,
      commandId: `runtime.probe.${label.toLowerCase()}`,
      runtimeKind,
    });
    const output = (result.stdout || result.stderr).trim();
    return {
      available: result.exitCode === 0,
      command,
      args,
      label,
      version: result.exitCode === 0 ? output : undefined,
      message: result.exitCode === 0 ? output || `${label} 可用。` : `${label} 不可用：${output || result.diagnostics?.spawnError || `exit ${result.exitCode}`}`,
    };
  }

  private async probeWsl(runtime: HermesRuntimeConfig, runtimeRootPath: string): Promise<RuntimeWslProbe> {
    if (process.platform !== "win32") {
      return { available: false, message: "当前不是 Windows 平台，WSL 不可用。" };
    }
    const status = await runCommand("wsl.exe", ["--status"], {
      cwd: process.cwd(),
      timeoutMs: WSL_TIMEOUT_MS,
      commandId: "runtime.probe.wsl.status",
      runtimeKind: "windows",
    });
    if (status.exitCode !== 0) {
      return {
        available: false,
        status: status.stderr || status.stdout,
        message: status.stderr || status.stdout || status.diagnostics?.spawnError || "wsl.exe 不可用。",
      };
    }
    const distroName = runtime.distro?.trim();
    const list = await runCommand("wsl.exe", ["-l", "-q"], {
      cwd: process.cwd(),
      timeoutMs: WSL_TIMEOUT_MS,
      commandId: "runtime.probe.wsl.list",
      runtimeKind: "windows",
    });
    const distros = list.stdout.replace(/\0/g, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const distroExists = distroName ? distros.some((item) => item.toLowerCase() === distroName.toLowerCase()) : distros.length > 0;
    if (runtime.mode !== "wsl") {
      return {
        available: true,
        status: status.stdout || status.stderr,
        distroExists,
        distroName,
        message: "WSL 可用；当前 runtime 未启用 WSL。",
      };
    }
    if (!distroExists) {
      return {
        available: true,
        status: status.stdout || status.stderr,
        distroExists: false,
        distroName,
        message: distroName ? `未找到 WSL 发行版：${distroName}` : "没有可用 WSL 发行版。",
      };
    }
    const wslArgs = [...wslDistroArgs(runtime)];
    const reachable = await runCommand("wsl.exe", [...wslArgs, "sh", "-lc", "uname -a"], {
      cwd: process.cwd(),
      timeoutMs: WSL_TIMEOUT_MS,
      commandId: "runtime.probe.wsl.uname",
      runtimeKind: "wsl",
    });
    const pythonCommand = runtime.pythonCommand?.trim() || "python3";
    const python = reachable.exitCode === 0
      ? await runCommand("wsl.exe", [...wslArgs, pythonCommand, "--version"], {
        cwd: process.cwd(),
        timeoutMs: WSL_TIMEOUT_MS,
        commandId: "runtime.probe.wsl.python",
        runtimeKind: "wsl",
      })
      : undefined;
    const route = reachable.exitCode === 0
      ? await runCommand("wsl.exe", [...wslArgs, "ip", "route", "show", "default"], {
        cwd: process.cwd(),
        timeoutMs: WSL_TIMEOUT_MS,
        commandId: "runtime.probe.wsl.route",
        runtimeKind: "wsl",
      })
      : undefined;
    return {
      available: true,
      status: status.stdout || status.stderr,
      distroExists,
      distroName,
      distroReachable: reachable.exitCode === 0,
      pythonAvailable: python?.exitCode === 0,
      pythonCommand,
      hostIp: parseWslHost(route?.stdout ?? "") || "127.0.0.1",
      message: reachable.exitCode === 0
        ? `WSL 发行版可进入，${pythonCommand} ${python?.exitCode === 0 ? "可用" : "不可用"}。`
        : reachable.stderr || reachable.stdout || "WSL 发行版无法进入。",
    };
  }

  private async wslPathExists(runtime: HermesRuntimeConfig, targetPath: string) {
    const result = await runCommand("wsl.exe", [...wslDistroArgs(runtime), "sh", "-lc", `[ -e "$1" ]`, "sh", targetPath], {
      cwd: process.cwd(),
      timeoutMs: WSL_TIMEOUT_MS,
      commandId: "runtime.probe.wsl.path-exists",
      runtimeKind: "wsl",
    });
    return result.exitCode === 0;
  }

  private async probeBridge(runtime: HermesRuntimeConfig, wslHost?: string): Promise<RuntimeBridgeProbe> {
    const status = this.bridge?.status();
    if (!this.bridge || !status?.running) {
      return {
        configured: false,
        running: false,
        reachable: false,
        status,
        message: "Windows Control Bridge 未启动。",
      };
    }
    const host = runtime.mode === "wsl" ? wslHost || "127.0.0.1" : "127.0.0.1";
    const access = this.bridge.accessForHost(host);
    if (!access) {
      return {
        configured: true,
        running: true,
        reachable: false,
        host,
        port: status.port,
        status,
        message: "Bridge access 信息不可用。",
      };
    }
    if (runtime.mode !== "wsl") {
      const reachable = await this.httpHealth(access);
      return {
        configured: true,
        running: true,
        reachable,
        host,
        port: status.port,
        url: access.url,
        status,
        message: reachable ? "Bridge 本机 health 可访问。" : "Bridge 本机 health 不可访问。",
      };
    }
    const reachable = await this.wslBridgeHealth(runtime, access);
    return {
      configured: true,
      running: true,
      reachable,
      host,
      port: status.port,
      url: access.url,
      status,
      message: reachable ? "Bridge 可从 WSL 访问。" : "Bridge 无法从 WSL 访问。",
    };
  }

  private async httpHealth(access: BridgeAccess) {
    try {
      const response = await this.appFetch(`${access.url}/v1/health`, {
        headers: { authorization: `Bearer ${access.token}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async wslBridgeHealth(runtime: HermesRuntimeConfig, access: BridgeAccess) {
    const python = runtime.pythonCommand?.trim() || "python3";
    const script = [
      "import sys, urllib.request",
      "req=urllib.request.Request(sys.argv[1], headers={'Authorization':'Bearer '+sys.argv[2]})",
      "resp=urllib.request.urlopen(req, timeout=5)",
      "print(resp.status)",
    ].join("; ");
    const result = await runCommand("wsl.exe", [...wslDistroArgs(runtime), python, "-c", script, `${access.url}/v1/health`, access.token], {
      cwd: process.cwd(),
      timeoutMs: WSL_TIMEOUT_MS,
      commandId: "runtime.probe.bridge.wsl-health",
      runtimeKind: "wsl",
    });
    return result.exitCode === 0 && result.stdout.includes("200");
  }

  private collectIssues(input: {
    runtime: HermesRuntimeConfig;
    powershell: RuntimeCommandProbe;
    python: RuntimeCommandProbe;
    git: RuntimeCommandProbe;
    winget: RuntimeCommandProbe;
    wsl: RuntimeWslProbe;
    hermesRootExists: boolean;
    hermesCliExists: boolean;
    bridge: RuntimeBridgeProbe;
  }) {
    const issues: RuntimeIssue[] = [];
    const add = (code: RuntimeIssueCode, severity: RuntimeIssue["severity"], summary: string, detail?: string, fixHint?: string, debugContext?: Record<string, unknown>) => {
      issues.push({ code, severity, summary, detail, fixHint, debugContext });
    };
    if (process.platform === "win32" && !input.powershell.available) {
      add("powershell_missing", "warning", "PowerShell 不可用。", input.powershell.message, "请确认 powershell.exe 在系统路径中可执行。");
    }
    if (!input.python.available) {
      add("python_missing", input.runtime.mode === "windows" ? "error" : "warning", "Windows Python 不可用。", input.python.message, "请安装 Python 或在设置中填写 Hermes Python 命令。");
    }
    if (!input.git.available) {
      add("git_missing", "warning", "Git 不可用。", input.git.message, "首次自动安装 Hermes 需要 Git。");
    }
    if (process.platform === "win32" && !input.winget.available) {
      add("winget_missing", "warning", "winget 不可用。", input.winget.message, "一键修复 Git/Python 依赖需要 winget，缺失时可手动安装。");
    }
    if (input.runtime.mode === "wsl") {
      if (!input.wsl.available) {
        add("wsl_missing", "error", "WSL 不可用。", input.wsl.message, "请启用 WSL 并安装目标 Linux 发行版。");
      } else if (input.wsl.distroExists === false) {
        add("wsl_distro_missing", "error", "目标 WSL 发行版不存在。", input.wsl.message, "请在设置中选择已安装发行版，或安装 Managed WSL 发行版。", { distro: input.runtime.distro });
      } else if (input.wsl.distroReachable === false) {
        add("wsl_distro_unreachable", "error", "目标 WSL 发行版无法进入。", input.wsl.message, "请运行 wsl.exe 检查发行版状态。", { distro: input.runtime.distro });
      } else if (!input.wsl.pythonAvailable) {
        add("wsl_python_missing", "error", "WSL 内 Python 不可用。", input.wsl.message, "请在 WSL 中安装 Python，或修改 runtime pythonCommand。", { pythonCommand: input.runtime.pythonCommand });
      }
    }
    if (!input.hermesRootExists) {
      add("hermes_root_missing", "error", "Hermes root 不存在。", undefined, "请先安装 Hermes，或在设置中选择正确的 Hermes 安装目录。");
    } else if (!input.hermesCliExists) {
      add("hermes_cli_missing", "error", "Hermes CLI 文件不存在。", undefined, "请确认 Hermes 安装目录中存在 hermes 入口文件。");
    }
    if (!input.bridge.reachable) {
      add(input.bridge.running ? "bridge_unreachable" : "bridge_disabled", input.runtime.mode === "wsl" ? "error" : "warning", "Windows Control Bridge 不可达。", input.bridge.message, "请重启客户端；WSL 模式下还需确认 Windows 防火墙允许本应用监听端口。");
    }
    return issues;
  }

  private overallStatus(runtime: HermesRuntimeConfig, issues: RuntimeIssue[]): RuntimeOverallStatus {
    const errors = issues.filter((issue) => issue.severity === "error");
    if (errors.length === 0) {
      return issues.length ? "degraded" : "ready";
    }
    if (errors.some((issue) => issue.code.includes("missing") || issue.code === "wsl_distro_missing")) {
      return "missing_dependency";
    }
    if (errors.some((issue) => issue.code === "hermes_root_missing" || issue.code === "hermes_cli_missing" || issue.code === "runtime_mismatch")) {
      return "misconfigured";
    }
    return runtime.mode === "wsl" ? "unavailable" : "degraded";
  }
}

export function wslDistroArgs(runtime: Pick<HermesRuntimeConfig, "distro">) {
  return runtime.distro?.trim() ? ["-d", runtime.distro.trim()] : [];
}

function looksLikeFilePath(value: string) {
  return path.isAbsolute(value) || value.includes("\\") || value.includes("/");
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
