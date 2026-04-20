import path from "node:path";
import type { AppPaths } from "../../main/app-paths";
import { MemoryBudgeter } from "../../memory/memory-budgeter";
import type { EngineAdapter } from "../engine-adapter";
import type {
  ContextBundle,
  ContextRequest,
  EngineEvent,
  EngineHealth,
  EngineRunRequest,
  EngineUpdateStatus,
  MemoryStatus,
} from "../../shared/types";

const now = () => new Date().toISOString();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockHermesAdapter implements EngineAdapter {
  id = "hermes" as const;
  label = "Hermes";
  capabilities = ["file_memory", "private_skills", "context_bridge"] as const;

  constructor(
    private readonly appPaths: AppPaths,
    private readonly budgeter: MemoryBudgeter,
  ) {}

  async healthCheck(): Promise<EngineHealth> {
    return {
      engineId: this.id,
      label: this.label,
      available: true,
      mode: "file",
      path: this.appPaths.hermesDir(),
      message: "Hermes 私人记忆目录已准备，写入会经过字符预算检查。",
    };
  }

  async *run(request: EngineRunRequest, signal: AbortSignal): AsyncIterable<EngineEvent> {
    yield { type: "status", level: "info", message: "Hermes 已接管个人化任务。", at: now() };
    await this.pause(signal, 360);
    yield { type: "memory_access", engineId: this.id, action: "read", source: "USER.md / MEMORY.md", at: now() };
    await this.pause(signal, 420);

    yield { type: "progress", step: "受限记忆检查", done: true, message: "Hermes 记忆预算安全。", at: now() };
    await this.pause(signal, 520);
    yield { type: "tool_call", toolName: "hermes.private-notes", argsPreview: request.taskType, at: now() };
    await this.pause(signal, 520);
    yield {
      type: "result",
      success: true,
      title: "Hermes 任务完成",
      detail: "已跑通 Hermes MEMORY.md、权限检查和统一事件流。",
      at: now(),
    };
  }

  async stop(_sessionId: string) {
    return;
  }

  async getMemoryStatus(workspaceId: string): Promise<MemoryStatus> {
    const memoryPath = path.join(this.appPaths.hermesDir(), "MEMORY.md");
    const status = await this.budgeter.getHermesStatus(memoryPath);
    return {
      engineId: this.id,
      workspaceId,
      usedCharacters: status.usedCharacters,
      maxCharacters: status.maxCharacters,
      entries: status.usedCharacters > 0 ? 1 : 0,
      filePath: memoryPath,
      message: `Hermes MEMORY.md 剩余 ${status.remainingCharacters} 字符。`,
    };
  }

  async prepareContextBundle(input: ContextRequest): Promise<ContextBundle> {
    return {
      id: `hermes-${Date.now()}`,
      workspaceId: input.workspaceId,
      policy: input.memoryPolicy,
      readonly: true,
      maxCharacters: this.budgeter.contextMaxCharacters,
      usedCharacters: 0,
      sources: [],
      summary: "Hermes 专属任务使用 MEMORY.md 与当前工作区上下文。",
      createdAt: now(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async checkUpdate(): Promise<EngineUpdateStatus> {
    return {
      engineId: this.id,
      updateAvailable: false,
      sourceConfigured: false,
      message: "尚未配置 Hermes 官方更新源。",
    };
  }

  private async pause(signal: AbortSignal, ms: number) {
    if (signal.aborted) {
      throw new Error("任务已取消");
    }
    await wait(ms);
    if (signal.aborted) {
      throw new Error("任务已取消");
    }
  }
}
