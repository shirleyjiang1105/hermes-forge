import { describe, expect, it, vi } from "vitest";
import { HermesToolLoopRunner, parseHermesToolOutput } from "./hermes-tool-loop-runner";
import type { EngineAdapter, HermesToolLoopMessage } from "../adapters/engine-adapter";
import type { ContextRequest, EngineRunRequest, WindowsToolCall, WindowsToolExecutionResult } from "../shared/types";
import type { WindowsToolExecutor } from "../main/windows-tool-executor";

describe("parseHermesToolOutput", () => {
  it("parses fenced tool calls and final answers", () => {
    expect(parseHermesToolOutput('```json\n{"type":"tool_call","tool":"windows.clipboard.read","input":{}}\n```')).toEqual({
      ok: true,
      output: { type: "tool_call", tool: "windows.clipboard.read", input: {} },
    });
    expect(parseHermesToolOutput('{"type":"final","message":"done"}')).toEqual({
      ok: true,
      output: { type: "final", message: "done" },
    });
  });

  it("rejects non-json output", () => {
    expect(parseHermesToolOutput("hello")).toMatchObject({ ok: false });
  });
});

describe("HermesToolLoopRunner", () => {
  it("executes a valid tool call and continues to final", async () => {
    const planner = vi.fn(async (_request: EngineRunRequest, transcript: HermesToolLoopMessage[]) =>
      transcript.some((item) => item.role === "observation")
        ? '{"type":"final","message":"已完成"}'
        : '{"type":"tool_call","tool":"windows.files.writeText","input":{"path":"C:\\\\demo.txt","content":"hello"}}',
    );
    const executor = fakeExecutor(async (call) => ({
      ok: true,
      tool: call.tool,
      message: "written",
      result: { path: "C:\\demo.txt" },
      durationMs: 1,
    }));
    const runner = new HermesToolLoopRunner(fakeAdapter(planner), executor);

    const events = [];
    for await (const event of runner.run(request(), new AbortController().signal)) {
      events.push(event);
    }

    expect(planner).toHaveBeenCalledTimes(2);
    expect(events.some((event) => event.type === "tool_call" && event.toolName === "windows.files.writeText")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "result", success: true, detail: "已完成" });
  });

  it("returns a readable failure after repeated invalid JSON", async () => {
    const runner = new HermesToolLoopRunner(fakeAdapter(vi.fn(async () => "not json")), fakeExecutor());
    const events = [];

    for await (const event of runner.run(request(), new AbortController().signal)) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({ type: "result", success: false, title: "Hermes Tool Loop 格式错误" });
  });
});

function fakeAdapter(planner: EngineAdapter["planToolStep"]): EngineAdapter {
  return {
    id: "hermes",
    label: "Hermes",
    capabilities: [],
    healthCheck: async () => ({ engineId: "hermes", label: "Hermes", available: true, mode: "cli", message: "ok" }),
    run: async function* () {},
    planToolStep: planner,
    stop: async () => undefined,
    getMemoryStatus: async () => ({ engineId: "hermes", workspaceId: "w", usedCharacters: 0, entries: 0, message: "ok" }),
    prepareContextBundle: async (input: ContextRequest) => ({
      id: "ctx",
      workspaceId: input.workspaceId,
      policy: input.memoryPolicy,
      readonly: true,
      maxCharacters: 1,
      usedCharacters: 0,
      sources: [],
      summary: "",
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }),
    checkUpdate: async () => ({ engineId: "hermes", updateAvailable: false, sourceConfigured: true, message: "ok" }),
  };
}

function fakeExecutor(execute: (call: WindowsToolCall) => Promise<WindowsToolExecutionResult> = async (call) => ({
  ok: true,
  tool: call.tool,
  message: "ok",
  durationMs: 1,
})): WindowsToolExecutor {
  return { execute } as WindowsToolExecutor;
}

function request(): EngineRunRequest {
  return {
    sessionId: "s",
    workspaceId: "w",
    workspacePath: "D:\\AI\\zhenghebao",
    userInput: "create file",
    taskType: "custom",
    selectedFiles: [],
    memoryPolicy: "isolated",
  };
}
