import type {
  ContextBundle,
  ContextRequest,
  EngineCapability,
  EngineEvent,
  EngineHealth,
  EngineId,
  EngineRunRequest,
  EngineRuntimeEnv,
  EngineWarmupResult,
  EngineUpdateStatus,
  MemoryStatus,
  WindowsToolExecutionResult,
} from "../shared/types";

export type HermesToolLoopMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "observation"; content: WindowsToolExecutionResult };

export interface EngineAdapter {
  id: EngineId;
  label: string;
  capabilities: readonly EngineCapability[];
  healthCheck(): Promise<EngineHealth>;
  warmup?(kind?: "cheap" | "real", workspacePath?: string, runtimeEnv?: EngineRuntimeEnv): Promise<EngineWarmupResult>;
  run(request: EngineRunRequest, signal: AbortSignal): AsyncIterable<EngineEvent>;
  planToolStep?(request: EngineRunRequest, transcript: HermesToolLoopMessage[], signal: AbortSignal): Promise<string>;
  stop(sessionId: string): Promise<void>;
  getMemoryStatus(workspaceId: string): Promise<MemoryStatus>;
  prepareContextBundle(input: ContextRequest): Promise<ContextBundle>;
  checkUpdate(): Promise<EngineUpdateStatus>;
}
