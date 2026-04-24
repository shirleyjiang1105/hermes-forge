import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type HermesWslWorkerRequest = {
  cwd: string;
  rootPath: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

export type HermesWslWorkerStreamEvent =
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "exit"; exitCode: number | null }
  | { type: "started" }
  | { type: "ready"; reused: boolean }
  | { type: "error"; message: string };

type WorkerProtocolEvent = HermesWslWorkerStreamEvent & {
  id?: string;
  pid?: number;
  durationMs?: number;
};

type PendingRequest = {
  id: string;
  push: (event: HermesWslWorkerStreamEvent) => void;
  fail: (error: Error) => void;
  done: () => void;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const WORKER_READY_TIMEOUT_MS = 12_000;

export class HermesWslWorker {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: PendingRequest;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private stderrLines: string[] = [];
  private queue: Promise<void> = Promise.resolve();
  private ready = false;

  constructor(
    private readonly key: string,
    private readonly launcher: () => Promise<{ command: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv }>,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  getKey() {
    return this.key;
  }

  async *run(request: HermesWslWorkerRequest, signal?: AbortSignal): AsyncIterable<HermesWslWorkerStreamEvent> {
    const release = await this.acquire();
    try {
      yield* this.runInternal(request, signal);
    } finally {
      release();
    }
  }

  async stop() {
    const child = this.child;
    this.child = undefined;
    this.ready = false;
    this.pending?.fail(new Error("Hermes WSL worker stopped."));
    this.pending = undefined;
    if (!child || child.killed) return;
    child.stdin.write(`${JSON.stringify({ type: "shutdown" })}\n`, () => undefined);
    child.kill();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async acquire() {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  private async *runInternal(request: HermesWslWorkerRequest, signal?: AbortSignal): AsyncIterable<HermesWslWorkerStreamEvent> {
    const reused = Boolean(this.child && !this.child.killed && this.ready);
    const child = await this.ensureChild();
    yield { type: "ready", reused };
    const id = `wsl-worker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const events: HermesWslWorkerStreamEvent[] = [];
    let done = false;
    let failure: Error | undefined;
    let notify: (() => void) | undefined;
    let timeout: NodeJS.Timeout | undefined;

    const push = (event: HermesWslWorkerStreamEvent) => {
      events.push(event);
      if (event.type === "exit" || event.type === "error") {
        done = true;
      }
      notify?.();
    };
    const fail = (error: Error) => {
      failure = error;
      done = true;
      notify?.();
    };
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (this.pending?.id === id) this.pending = undefined;
    };
    const abort = () => {
      void this.stop();
      fail(new Error("Hermes WSL worker task cancelled."));
    };

    this.pending = { id, push, fail, done: () => { done = true; notify?.(); } };
    timeout = setTimeout(() => {
      void this.stop();
      fail(new Error(`Hermes WSL worker request timed out after ${Math.ceil((request.timeoutMs ?? this.requestTimeoutMs) / 1000)} seconds.`));
    }, request.timeoutMs ?? this.requestTimeoutMs);

    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener("abort", abort, { once: true });
      child.stdin.write(`${JSON.stringify({
        id,
        cwd: request.cwd,
        rootPath: request.rootPath,
        args: request.args,
        env: request.env ?? {},
        timeoutMs: request.timeoutMs ?? this.requestTimeoutMs,
      })}\n`, "utf8", (error?: Error | null) => {
        if (error) fail(new Error(`Hermes WSL worker write failed: ${error.message}`));
      });
    }

    try {
      while (!done || events.length > 0) {
        if (events.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
          notify = undefined;
          continue;
        }
        yield events.shift()!;
      }
      if (failure) throw failure;
    } finally {
      cleanup();
    }
  }

  private async ensureChild() {
    if (this.child && !this.child.killed && this.ready) return this.child;
    const launch = await this.launcher();
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: { ...process.env, ...launch.env },
      windowsHide: true,
      shell: false,
      detached: false,
    });
    this.child = child;
    this.ready = false;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.stderrLines = [];

    child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk: Buffer) => this.handleStderr(chunk));
    child.on("error", (error) => {
      this.pending?.fail(new Error(`Hermes WSL worker spawn failed: ${error.message}`));
    });
    child.on("close", (exitCode) => {
      if (this.child !== child) return;
      this.child = undefined;
      this.ready = false;
      this.flushStderr();
      const message = this.stderrLines.at(-1) || `Hermes WSL worker exited with code ${exitCode ?? "unknown"}.`;
      this.pending?.fail(new Error(message));
    });

    await this.waitForReady(child);
    return child;
  }

  private waitForReady(child: ChildProcessWithoutNullStreams) {
    if (this.ready) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      const tick = () => {
        if (this.ready) {
          resolve();
          return;
        }
        if (this.child !== child || child.killed) {
          reject(new Error(this.stderrLines.at(-1) || "Hermes WSL worker closed before ready."));
          return;
        }
        if (Date.now() - startedAt > WORKER_READY_TIMEOUT_MS) {
          void this.stop();
          reject(new Error("Hermes WSL worker did not become ready in time."));
          return;
        }
        setTimeout(tick, 25);
      };
      tick();
    });
  }

  private handleStdout(chunk: Buffer) {
    const text = this.stdoutBuffer + chunk.toString("utf8");
    const lines = text.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
      let event: WorkerProtocolEvent;
      try {
        event = JSON.parse(line) as WorkerProtocolEvent;
      } catch {
        this.pending?.push({ type: "stderr", line });
        continue;
      }
      if (event.type === "ready" && !event.id) {
        this.ready = true;
        continue;
      }
      if (!event.id || event.id !== this.pending?.id) continue;
      if (event.type === "stdout" && typeof event.line === "string") this.pending.push({ type: "stdout", line: event.line });
      else if (event.type === "stderr" && typeof event.line === "string") this.pending.push({ type: "stderr", line: event.line });
      else if (event.type === "started") this.pending.push({ type: "started" });
      else if (event.type === "exit") this.pending.push({ type: "exit", exitCode: typeof event.exitCode === "number" ? event.exitCode : null });
      else if (event.type === "error") this.pending.push({ type: "error", message: event.message || "Hermes WSL worker request failed." });
    }
  }

  private handleStderr(chunk: Buffer) {
    const text = this.stderrBuffer + chunk.toString("utf8");
    const lines = text.split(/\r?\n/);
    this.stderrBuffer = lines.pop() ?? "";
    for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
      this.stderrLines.push(line);
      if (this.stderrLines.length > 40) this.stderrLines.shift();
    }
  }

  private flushStderr() {
    if (this.stderrBuffer.trim()) {
      this.stderrLines.push(this.stderrBuffer.trim());
      this.stderrBuffer = "";
    }
  }
}
