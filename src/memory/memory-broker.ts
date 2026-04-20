import crypto from "node:crypto";
import path from "node:path";
import { MemoryBudgeter } from "./memory-budgeter";
import type { ContextBundle, ContextRequest, ContextSource } from "../shared/types";

const now = () => new Date().toISOString();

export class MemoryBroker {
  constructor(private readonly budgeter: MemoryBudgeter) {}

  async prepareContextBundle(input: ContextRequest): Promise<ContextBundle> {
    const createdAt = now();
    const sources = this.buildSources(input, createdAt);
    const summary = this.buildSummary(input, sources);
    return {
      id: this.createId("hermes-bundle"),
      workspaceId: input.workspaceId,
      policy: "isolated",
      readonly: true,
      maxCharacters: this.budgeter.contextMaxCharacters,
      usedCharacters: summary.length,
      sources,
      summary,
      createdAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  private buildSources(input: ContextRequest, createdAt: string): ContextSource[] {
    const workspaceName = path.basename(input.workspacePath) || input.workspacePath;
    const taskLabel = this.taskLabel(input.taskType);
    const sources: ContextSource[] = [
      {
        id: this.createId("source-workspace"),
        engineId: "hermes",
        title: "当前工作区",
        summary: `工作区：${workspaceName}`,
        pointer: input.workspacePath,
        characters: workspaceName.length,
        createdAt,
      },
      {
        id: this.createId("source-task"),
        engineId: "hermes",
        title: "任务意图",
        summary: `任务类型：${taskLabel}`,
        pointer: input.taskType,
        characters: taskLabel.length,
        createdAt,
      },
      {
        id: this.createId("source-user"),
        engineId: "hermes",
        title: "用户输入",
        summary: input.userInput.slice(0, 240),
        pointer: "user-input",
        characters: input.userInput.length,
        createdAt,
      },
    ];
    return sources;
  }

  private buildSummary(input: ContextRequest, sources: ContextSource[]) {
    const workspaceName = path.basename(input.workspacePath) || input.workspacePath;
    const taskLabel = this.taskLabel(input.taskType);
    const hints = this.taskHints(input.taskType);
    return [
      `Hermes 上下文包（只读）`,
      `工作区：${workspaceName}`,
      `任务类型：${taskLabel}`,
      `用户输入摘要：${input.userInput.slice(0, 320)}`,
      `上下文来源：${sources.map((source) => source.title).join("、")}`,
      `建议关注：${hints}`,
      "本轮上下文仅用于辅助 Hermes 理解任务，不直接代表可写操作授权。",
    ].join("\n");
  }

  private taskHints(taskType: ContextRequest["taskType"]) {
    switch (taskType) {
      case "fix_error":
        return "报错相关文件、入口文件、配置文件、最近变动位置";
      case "generate_web":
        return "页面结构、样式资源、构建配置、入口组件";
      case "analyze_project":
        return "目录结构、关键模块、运行方式、依赖关系";
      case "organize_files":
        return "目录命名、重复文件、可归档内容、文件分组方式";
      default:
        return "用户当前意图、工作区位置、Hermes MEMORY.md 相关记忆";
    }
  }

  private taskLabel(taskType: ContextRequest["taskType"]) {
    switch (taskType) {
      case "fix_error":
        return "修复错误";
      case "generate_web":
        return "生成网页";
      case "analyze_project":
        return "分析项目";
      case "organize_files":
        return "整理文件";
      default:
        return "自定义任务";
    }
  }

  private createId(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
}
