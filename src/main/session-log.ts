import fs from "node:fs/promises";
import path from "node:path";
import type { AppPaths } from "./app-paths";
import type { EngineEvent, TaskEventEnvelope } from "../shared/types";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
];

export class SessionLog {
  constructor(private readonly appPaths: AppPaths) {}

  async append(workspaceId: string, envelope: TaskEventEnvelope) {
    const filePath = path.join(this.appPaths.workspaceSessionDir(workspaceId), `${envelope.sessionId}.jsonl`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(this.redact(envelope))}\n`, "utf8");
  }

  async readRecent(workspaceId: string, maxEvents = 200) {
    const dir = this.appPaths.workspaceSessionDir(workspaceId);
    const files = await fs.readdir(dir).catch(() => []);
    const events: TaskEventEnvelope[] = [];

    for (const file of files.filter((name) => name.endsWith(".jsonl")).slice(-12)) {
      const text = await fs.readFile(path.join(dir, file), "utf8").catch(() => "");
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        try {
          events.push(JSON.parse(line) as TaskEventEnvelope);
        } catch {
          // Ignore corrupt diagnostic lines.
        }
      }
    }

    return events.slice(-maxEvents);
  }

  async summarizeRecentRuns(workspaceId: string, maxEvents = 400) {
    const events = await this.readRecent(workspaceId, maxEvents);
    const grouped = new Map<string, TaskEventEnvelope[]>();
    for (const envelope of events) {
      const key = envelope.taskRunId || envelope.sessionId || "unknown";
      grouped.set(key, [...(grouped.get(key) ?? []), envelope]);
    }

    return [...grouped.entries()].map(([taskRunId, taskEvents]) => {
      const sorted = [...taskEvents].sort((left, right) => this.eventTimestamp(left.event).localeCompare(this.eventTimestamp(right.event)));
      const last = sorted.at(-1);
      const status = this.detectRunStatus(sorted.map((item) => item.event));
      const startedAt = this.eventTimestamp(sorted[0]?.event);
      const completedAt = last ? this.eventTimestamp(last.event) : undefined;
      const fileChanges = sorted.filter((item) => item.event.type === "file_change").length;
      const toolCalls = sorted.filter((item) => item.event.type === "tool_call").length;
      return {
        taskRunId,
        status,
        startedAt,
        completedAt,
        eventCount: sorted.length,
        fileChanges,
        toolCalls,
      };
    }).sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  }

  private detectRunStatus(events: EngineEvent[]) {
    const lastResult = [...events].reverse().find((event) => event.type === "result");
    if (lastResult?.type === "result") return lastResult.success ? "completed" : "failed";
    const lastLifecycle = [...events].reverse().find((event) => event.type === "lifecycle");
    if (lastLifecycle?.type === "lifecycle") return lastLifecycle.stage;
    return "unknown";
  }

  private eventTimestamp(event?: EngineEvent) {
    if (!event) return "";
    return "at" in event ? event.at : new Date().toISOString();
  }

  redact<T>(value: T): T {
    const raw = JSON.stringify(value);
    const safe = SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), raw);
    return JSON.parse(safe) as T;
  }
}
