import { runCommand } from "../../process/command-runner";
import type { RuntimeAdapterFactory } from "../../runtime/runtime-adapter";
import type { RuntimeConfig } from "../../shared/types";

const LOCALHOST_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export async function probeWslReachability(input: {
  baseUrl: string;
  runtime: NonNullable<RuntimeConfig["hermesRuntime"]>;
  runtimeAdapterFactory: RuntimeAdapterFactory;
  resolveHermesRoot: () => Promise<string>;
}) {
  const adapter = input.runtimeAdapterFactory(input.runtime);
  const rootPath = input.runtime.mode === "wsl"
    ? adapter.toRuntimePath(await input.resolveHermesRoot())
    : await input.resolveHermesRoot();
  const parsed = new URL(input.baseUrl);
  const candidates = [parsed.toString().replace(/\/$/, "")];

  if (LOCALHOST_HOSTS.has(parsed.hostname)) {
    const host = await adapter.getBridgeAccessHost();
    parsed.hostname = host;
    candidates.push(parsed.toString().replace(/\/$/, ""));
  }

  for (const candidate of candidates) {
    const script = [
      "import sys, urllib.error, urllib.request",
      "url = sys.argv[1].rstrip('/') + '/models'",
      "req = urllib.request.Request(url, headers={'Authorization': 'Bearer lm-studio'})",
      "try:",
      "    with urllib.request.urlopen(req, timeout=8) as resp:",
      "        sys.exit(0 if resp.status < 500 else 3)",
      "except urllib.error.HTTPError as exc:",
      "    sys.exit(0 if exc.code < 500 else 3)",
      "except Exception:",
      "    sys.exit(2)",
    ].join("\n");
    const launch = await adapter.buildPythonLaunch({
      runtime: input.runtime,
      rootPath,
      pythonArgs: ["-c", script, candidate],
      cwd: rootPath,
      env: {
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
      },
    });
    const result = await runCommand(launch.command, launch.args, {
      cwd: launch.cwd,
      timeoutMs: 12_000,
      env: launch.env,
      detached: launch.detached,
    });
    if (result.exitCode === 0) {
      return {
        ok: true,
        message: `WSL 可以访问模型服务：${candidate}`,
        testedUrl: candidate,
      };
    }
  }

  const isLocalhost = LOCALHOST_HOSTS.has(new URL(input.baseUrl).hostname);
  const fixSteps = isLocalhost
    ? [
        "把模型服务启动参数加上 `--host 0.0.0.0`（如 Ollama: `OLLAMA_HOST=0.0.0.0 ollama serve`；LM Studio: 在设置里把 Server Port 绑定到 0.0.0.0）。",
        "在 Base URL 里把 `127.0.0.1` 或 `localhost` 换成 `host.docker.internal` 或你的 Windows 实际局域网 IP。",
        "重新点击「立即测试」。",
      ]
    : [
        "确认 WSL 内可访问公网 HTTPS（在 WSL 终端里执行 `curl https://api.openai.com` 测试）。",
        "检查代理、DNS、证书和防火墙设置。",
        "如果使用了 VPN 或代理，确保 WSL 也能走通该代理。",
      ];
  return {
    ok: false,
    message: isLocalhost
      ? "当前 Windows 宿主机上的模型服务，WSL 内 Hermes 访问不到。"
      : "WSL 内 Hermes 暂时访问不到这个模型服务地址。",
    detail: isLocalhost
      ? "这通常发生在你把模型服务绑在 localhost，但 Hermes 正跑在 WSL 里。"
      : "这通常是 WSL 网络、代理、DNS 或证书环境导致的。HTTP 4xx 会被视为服务可达，只有网络异常或 5xx 才会失败。",
    testedUrl: candidates.at(-1),
    fixHint: fixSteps.join(" "),
    fixSteps,
  };
}
