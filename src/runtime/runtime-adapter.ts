import type { HermesRuntimeConfig } from "../shared/types";
import type {
  BuildHermesLaunchInput,
  RuntimeKind,
  RuntimeLaunchSpec,
  RuntimePreflightResult,
  RuntimeProbeResult,
  BuildPythonLaunchInput,
} from "./runtime-types";

export interface RuntimeAdapter {
  getKind(): RuntimeKind;
  probe(workspacePath?: string): Promise<RuntimeProbeResult>;
  buildHermesLaunch(input: BuildHermesLaunchInput): Promise<RuntimeLaunchSpec>;
  buildPythonLaunch(input: BuildPythonLaunchInput): Promise<RuntimeLaunchSpec>;
  toRuntimePath(inputPath: string): string;
  getBridgeAccessHost(): Promise<string>;
  preflight(input?: { workspacePath?: string; requireBridge?: boolean }): Promise<RuntimePreflightResult>;
  describeRuntime(): Promise<string>;
  shutdown(reason?: string): Promise<void>;
}

export type RuntimeAdapterFactory = (runtime: HermesRuntimeConfig) => RuntimeAdapter;

export function preflightFromProbe(probe: RuntimeProbeResult): RuntimePreflightResult {
  const checks = probe.issues.map((issue) => ({
    ok: issue.severity !== "error",
    code: issue.code,
    severity: issue.severity,
    summary: issue.summary,
    detail: issue.detail,
    fixHint: issue.fixHint,
    debugContext: issue.debugContext,
  }));
  return {
    ok: checks.every((check) => check.ok),
    runtimeMode: probe.runtimeMode,
    summary: checks.every((check) => check.ok)
      ? `${probe.runtimeMode} runtime ready.`
      : `${probe.runtimeMode} runtime preflight failed.`,
    checks,
    issues: probe.issues,
    debugContext: {
      overallStatus: probe.overallStatus,
      bridge: probe.bridge,
      commands: probe.commands,
      paths: probe.paths.all,
    },
  };
}
