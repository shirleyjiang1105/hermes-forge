import { createInterface } from "node:readline";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { EngineEvent } from "../../shared/types";

const EVENT_START = "__FORGE_EVENT__";
const EVENT_END = "__FORGE_EVENT_END__";

export type ParsedJsonEvent =
  | { type: "lifecycle"; stage: string; session_id?: string; timestamp: string }
  | { type: "tool_call"; tool: string; input?: Record<string, unknown>; session_id?: string; timestamp: string }
  | { type: "tool_result"; tool: string; output?: string; success?: boolean; session_id?: string; timestamp: string }
  | { type: "message_chunk"; content: string; session_id?: string; timestamp: string }
  | { type: "result"; success: boolean; content: string; session_id?: string; timestamp: string }
  | { type: "error"; message: string; error_type?: string; traceback?: string; session_id?: string; timestamp: string }
  | Record<string, unknown>;

function parseEventLine(line: string): ParsedJsonEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith(EVENT_START) || !trimmed.endsWith(EVENT_END)) {
    return undefined;
  }
  const jsonText = trimmed.slice(EVENT_START.length, -EVENT_END.length);
  try {
    return JSON.parse(jsonText) as ParsedJsonEvent;
  } catch {
    return undefined;
  }
}

function toEngineEvent(parsed: ParsedJsonEvent): EngineEvent | undefined {
  if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
    return undefined;
  }
  const now = () => new Date().toISOString();
  const type = (parsed as Record<string, unknown>).type;

  switch (type) {
    case "lifecycle": {
      const stage = String((parsed as Record<string, unknown>).stage ?? "unknown");
      return {
        type: "lifecycle",
        stage: stage as EngineEvent & { type: "lifecycle" } extends { stage: infer S } ? S : "running",
        message: `Hermes ${stage}`,
        at: now(),
      };
    }
    case "tool_call": {
      const tool = String((parsed as Record<string, unknown>).tool ?? "unknown");
      const input = (parsed as Record<string, unknown>).input;
      return {
        type: "tool_call",
        toolName: tool,
        argsPreview: JSON.stringify(input ?? {}),
        status: "running",
        at: now(),
      };
    }
    case "tool_result": {
      const tool = String((parsed as Record<string, unknown>).tool ?? "unknown");
      const output = String((parsed as Record<string, unknown>).output ?? "");
      const success = Boolean((parsed as Record<string, unknown>).success ?? true);
      return {
        type: "tool_result",
        toolName: tool,
        outputPreview: output.slice(0, 400),
        success,
        status: "complete",
        at: now(),
      };
    }
    case "message_chunk": {
      const content = String((parsed as Record<string, unknown>).content ?? "");
      // message_chunk 映射为 stdout 事件，让前端按现有逻辑渲染
      return {
        type: "stdout",
        line: content,
        at: now(),
      };
    }
    case "result": {
      const success = Boolean((parsed as Record<string, unknown>).success ?? true);
      const content = String((parsed as Record<string, unknown>).content ?? "");
      return {
        type: "result",
        success,
        title: success ? "Hermes 回复" : "Hermes 执行失败",
        detail: content || "Hermes 已运行，但没有返回可显示的内容。",
        at: now(),
      };
    }
    case "error": {
      const message = String((parsed as Record<string, unknown>).message ?? "未知错误");
      const errorType = String((parsed as Record<string, unknown>).error_type ?? "Error");
      return {
        type: "result",
        success: false,
        title: `${errorType} 错误`,
        detail: message,
        at: now(),
      };
    }
    default:
      return undefined;
  }
}

export async function* readHermesJsonStream(
  proc: ChildProcessWithoutNullStreams,
  signal: AbortSignal,
): AsyncIterable<EngineEvent> {
  const rl = createInterface(proc.stdout);

  const stderrBuffer: string[] = [];
  proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) stderrBuffer.push(line.trim());
    }
  });

  try {
    for await (const line of rl) {
      if (signal.aborted) {
        proc.kill();
        rl.close();
        return;
      }

      const parsed = parseEventLine(line);
      if (parsed) {
        const event = toEngineEvent(parsed);
        if (event) yield event;
        continue;
      }

      // 非事件行作为 stdout 透传（兼容 Hermes 的普通日志输出）
      if (line.trim()) {
        yield { type: "stdout", line: line.trim(), at: new Date().toISOString() };
      }
    }
  } finally {
    rl.close();

    // 如果 stderr 有内容且进程退出码非 0，发出诊断
    const exitCode = proc.exitCode;
    if (exitCode !== 0 && exitCode !== null) {
      const stderrText = stderrBuffer.slice(-20).join("\n");
      if (stderrText) {
        yield {
          type: "diagnostic",
          category: "hermes-windows-agent-stderr",
          message: stderrText,
          at: new Date().toISOString(),
        };
      }
    }
  }
}
