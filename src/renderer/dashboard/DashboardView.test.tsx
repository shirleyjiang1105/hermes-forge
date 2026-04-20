import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView";
import { ChatInput } from "./ChatInput";
import { useAppStore } from "../store";

describe("DashboardView", () => {
  beforeEach(() => {
    useAppStore.getState().resetStore();
    useAppStore.setState({
      sessions: [
        {
          id: "session-1",
          title: "测试会话",
          status: "idle",
          sessionFilesPath: "D:/temp/session-1",
          workspacePath: "D:/workspace/demo",
          workspaceStatus: "ready",
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:00.000Z",
          lastMessagePreview: "hello",
        },
      ],
      activeSessionId: "session-1",
      workspacePath: "D:/workspace/demo",
      runtimeConfig: {
        defaultModelProfileId: "custom-local-endpoint",
        modelProfiles: [],
        updateSources: {},
      },
      webUiOverview: {
        settings: { theme: "green-light", language: "zh", sendKey: "enter", showUsage: false, showCliSessions: true },
        projects: [{ id: "project-1", name: "项目 A", color: "#10b981", createdAt: "2026-04-18T10:00:00.000Z", updatedAt: "2026-04-18T10:00:00.000Z" }],
        spaces: [],
        skills: [],
        memory: [],
        crons: [],
        profiles: [{ id: "default", name: "default", path: "C:/Users/example/.hermes", active: true, hasConfig: false, skillCount: 0, memoryFiles: 0 }],
        slashCommands: [],
      },
    });
  });

  function renderView() {
    render(
      <DashboardView
        onPickWorkspace={vi.fn()}
        onSelectWorkspace={vi.fn()}
        onCreateSession={vi.fn()}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
        onOpenSessionFolder={vi.fn()}
        onClearSession={vi.fn()}
        onStartTask={vi.fn()}
        onCancelTask={vi.fn()}
        onRestoreSnapshot={vi.fn()}
        onRefreshFileTree={vi.fn()}
        onExportDiagnostics={vi.fn()}
      />,
    );
  }

  it("renders clean chat shell with management and delete session actions", () => {
    useAppStore.setState({
      taskRunProjectionsById: {
        "task-1": {
          taskRunId: "task-1",
          workSessionId: "session-1",
          status: "complete",
          engineId: "hermes",
          actualEngine: "hermes",
          toolEvents: [],
          startedAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:01.000Z",
          userMessage: {
            id: "u1",
            sessionId: "session-1",
            taskId: "task-1",
            role: "user",
            content: "你好",
            createdAt: "2026-04-18T10:00:00.000Z",
            visibleInChat: true,
          },
          assistantMessage: {
            id: "a1",
            sessionId: "session-1",
            taskId: "task-1",
            role: "agent",
            content: "我可以帮你分析项目。",
            status: "complete",
            actualEngine: "hermes",
            authorName: "Hermes",
            createdAt: "2026-04-18T10:00:01.000Z",
            visibleInChat: true,
          },
        },
      },
      taskRunOrderBySession: { "session-1": ["task-1"] },
    });

    renderView();

    expect(screen.getByRole("button", { name: "配置中心" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "删除" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hermes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("我可以帮你分析项目。").length).toBeGreaterThan(0);
  });

  it("keeps secondary header actions folded until the menu is opened", () => {
    renderView();
    const header = within(screen.getByRole("banner"));

    expect(header.getByText("测试会话")).toBeTruthy();
    expect(header.getByText("Hermes桌面端")).toBeTruthy();
    expect(header.getByRole("button", { name: "文件树" })).toBeTruthy();
    expect(header.getByRole("button", { name: "检查器" })).toBeTruthy();
    expect(header.queryByRole("button", { name: "清空会话" })).toBeNull();

    fireEvent.click(header.getByRole("button", { name: "更多选项" }));

    expect(header.getByRole("button", { name: "帮助" })).toBeTruthy();
    expect(header.getByRole("button", { name: "打开会话文件夹" })).toBeTruthy();
    expect(header.getByRole("button", { name: "清空会话" })).toBeTruthy();
  });

  it("prefers the latest task result in chat", () => {
    useAppStore.setState({
      taskRunProjectionsById: {
        "task-1": {
          taskRunId: "task-1",
          workSessionId: "session-1",
          status: "complete",
          engineId: "hermes",
          actualEngine: "hermes",
          toolEvents: [],
          startedAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:03.000Z",
          userMessage: {
            id: "u1",
            sessionId: "session-1",
            taskId: "task-1",
            role: "user",
            content: "请问我们之前聊过什么",
            createdAt: "2026-04-18T10:00:00.000Z",
            visibleInChat: true,
          },
          assistantMessage: {
            id: "a1",
            sessionId: "session-1",
            taskId: "task-1",
            role: "agent",
            content: "我们之前聊过 Hermes 的工作区和 MEMORY.md。",
            status: "complete",
            actualEngine: "hermes",
            authorName: "Hermes",
            createdAt: "2026-04-18T10:00:01.000Z",
            visibleInChat: true,
          },
        },
      },
      taskRunOrderBySession: { "session-1": ["task-1"] },
    });

    renderView();

    expect(screen.getAllByText("我们之前聊过 Hermes 的工作区和 MEMORY.md。").length).toBeGreaterThan(0);
  });

  it("shows a typing state instead of raw placeholder text while waiting", () => {
    useAppStore.setState({
      taskRunProjectionsById: {
        "task-typing": {
          taskRunId: "task-typing",
          workSessionId: "session-1",
          status: "routing",
          engineId: "hermes",
          actualEngine: "hermes",
          toolEvents: [],
          startedAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:01.000Z",
          userMessage: {
            id: "u2",
            sessionId: "session-1",
            taskId: "task-typing",
            role: "user",
            content: "你现在在哪",
            createdAt: "2026-04-18T10:00:00.000Z",
            visibleInChat: true,
          },
          assistantMessage: {
            id: "a2",
            sessionId: "session-1",
            taskId: "task-typing",
            role: "agent",
            content: "",
            status: "pending",
            actualEngine: "hermes",
            authorName: "Hermes",
            createdAt: "2026-04-18T10:00:01.000Z",
            visibleInChat: true,
          },
        },
      },
      taskRunOrderBySession: { "session-1": ["task-typing"] },
    });

    renderView();

    expect(screen.getByTestId("typing-state")).toBeTruthy();
    expect(screen.queryByText("已完成路由，正在执行任务。")).toBeNull();
  });

  it("enables send for normal Hermes input", () => {
    useAppStore.setState({ userInput: "帮我检查项目" });

    renderView();

    expect(screen.getByRole("button", { name: "发送" })).not.toBeDisabled();
  });

  it("uses Enter to submit Hermes input", () => {
    const onStartTask = vi.fn();
    useAppStore.setState({ userInput: "" });

    render(
      <ChatInput
        onStartTask={onStartTask}
        onCancelTask={vi.fn()}
        onRestoreSnapshot={vi.fn()}
        canStart
        latestSnapshotAvailable={false}
        locked={false}
      />,
    );

    const input = screen.getByLabelText("给 Hermes 发送消息");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "请检查 MEMORY.md", selectionStart: 14 } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onStartTask).toHaveBeenCalledTimes(1);
  });
});
