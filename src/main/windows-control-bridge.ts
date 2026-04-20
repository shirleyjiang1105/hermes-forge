import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { clipboard, desktopCapturer, shell } from "electron";
import type { AddressInfo } from "node:net";
import { runCommand } from "../process/command-runner";
import type { EnginePermissionPolicy, WindowsBridgeStatus, WindowsToolCall } from "../shared/types";
import { WINDOWS_TOOL_MANIFEST, type WindowsToolExecutor } from "./windows-tool-executor";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 200 * 1024;
const DEFAULT_POWERSHELL_TIMEOUT_MS = 60_000;
const MAX_POWERSHELL_TIMEOUT_MS = 5 * 60_000;
const BRIDGE_CAPABILITIES = ["tool", "manifest", "powershell", "openPath", "clipboard", "screenshot", "writeTextFile"];

type BridgeResponse = Record<string, unknown>;

export class WindowsControlBridge {
  private server?: http.Server;
  private token = crypto.randomBytes(32).toString("hex");
  private port?: number;

  constructor(
    private readonly getPermissions: () => Promise<EnginePermissionPolicy>,
    private readonly appVersion: () => string,
    private readonly windowsToolExecutor?: WindowsToolExecutor,
  ) {}

  async start() {
    if (this.server) {
      return this.status();
    }

    this.server = http.createServer((request, response) => {
      void this.handle(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "0.0.0.0", () => {
        this.server!.off("error", reject);
        const address = this.server!.address() as AddressInfo;
        this.port = address.port;
        resolve();
      });
    });

    return this.status();
  }

  status(): WindowsBridgeStatus {
    return {
      running: Boolean(this.server && this.port),
      port: this.port,
      host: "0.0.0.0",
      capabilities: BRIDGE_CAPABILITIES,
    };
  }

  accessForHost(host: string) {
    if (!this.server || !this.port) {
      return undefined;
    }
    return {
      url: `http://${host}:${this.port}`,
      token: this.token,
      capabilities: BRIDGE_CAPABILITIES.join(","),
    };
  }

  async stop() {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
    this.port = undefined;
    this.token = crypto.randomBytes(32).toString("hex");
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse) {
    const startedAt = Date.now();
    const endpoint = `${request.method ?? "GET"} ${request.url ?? "/"}`;
    try {
      if (!this.authorized(request)) {
        this.write(response, 401, { ok: false, message: "Unauthorized" });
        this.log(endpoint, false, startedAt, "unauthorized");
        return;
      }

      const permissions = await this.getPermissions();
      if (!permissions.enabled || !permissions.contextBridge) {
        this.write(response, 403, { ok: false, message: "Windows Control Bridge is disabled by permissions." });
        this.log(endpoint, false, startedAt, "permission-disabled");
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const result = await this.route(request, url, permissions);
      this.write(response, 200, result);
      this.log(endpoint, true, startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown bridge error";
      this.write(response, 500, { ok: false, message });
      this.log(endpoint, false, startedAt, message);
    }
  }

  private async route(request: http.IncomingMessage, url: URL, permissions: EnginePermissionPolicy): Promise<BridgeResponse> {
    if (request.method === "GET" && url.pathname === "/v1/health") {
      return { ok: true, platform: os.platform(), version: this.appVersion() };
    }

    if (request.method === "GET" && url.pathname === "/v1/manifest") {
      return { ok: true, tools: WINDOWS_TOOL_MANIFEST };
    }

    if (request.method === "POST" && url.pathname === "/v1/tool") {
      const body = await this.readJsonBody(request);
      return await this.executeTool({
        type: "tool_call",
        tool: this.stringField(body, "tool", 200) as WindowsToolCall["tool"],
        input: typeof body.input === "object" && body.input && !Array.isArray(body.input)
          ? body.input as Record<string, unknown>
          : {},
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/powershell") {
      this.requireCommandRun(permissions);
      const body = await this.readJsonBody(request);
      const script = this.stringField(body, "script", 40_000);
      const timeoutMs = this.timeoutField(body.timeoutMs);
      if (this.windowsToolExecutor) {
        const result = await this.executeTool({ type: "tool_call", tool: "windows.powershell.run", input: { script, timeoutMs } });
        return { ok: result.ok, ...(result.result ?? {}), message: result.message };
      }
      const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
        cwd: process.cwd(),
        timeoutMs,
      });
      return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: truncateOutput(result.stdout),
        stderr: truncateOutput(result.stderr),
      };
    }

    if (request.method === "POST" && url.pathname === "/v1/open-path") {
      const body = await this.readJsonBody(request);
      const targetPath = this.stringField(body, "path", 1000);
      if (this.windowsToolExecutor) {
        const result = await this.executeTool({ type: "tool_call", tool: "windows.shell.openPath", input: { path: targetPath } });
        return { ok: result.ok, ...(result.result ?? {}), message: result.message };
      }
      const error = await shell.openPath(targetPath);
      return { ok: !error, message: error || `Opened: ${targetPath}` };
    }

    if (request.method === "POST" && url.pathname === "/v1/write-text-file") {
      this.requireFileWrite(permissions);
      const body = await this.readJsonBody(request);
      const targetPath = this.stringField(body, "path", 1000);
      const content = this.optionalStringField(body, "content", 500_000) ?? "";
      if (this.windowsToolExecutor) {
        const result = await this.executeTool({ type: "tool_call", tool: "windows.files.writeText", input: { path: targetPath, content } });
        return { ok: result.ok, ...(result.result ?? {}), message: result.message };
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, "utf8");
      return { ok: true, path: targetPath, message: `Wrote text file: ${targetPath}` };
    }

    if (request.method === "GET" && url.pathname === "/v1/clipboard") {
      if (this.windowsToolExecutor) {
        const result = await this.executeTool({ type: "tool_call", tool: "windows.clipboard.read", input: {} });
        return { ok: result.ok, ...(result.result ?? {}), message: result.message };
      }
      return { ok: true, text: clipboard.readText() };
    }

    if (request.method === "POST" && url.pathname === "/v1/clipboard") {
      const body = await this.readJsonBody(request);
      const text = this.stringField(body, "text", 500_000);
      if (this.windowsToolExecutor) {
        const result = await this.executeTool({ type: "tool_call", tool: "windows.clipboard.write", input: { text } });
        return { ok: result.ok, ...(result.result ?? {}), message: result.message };
      }
      clipboard.writeText(text);
      return { ok: true };
    }

    if (request.method === "GET" && url.pathname === "/v1/screenshot") {
      this.requireCommandRun(permissions);
      if (this.windowsToolExecutor) {
        const result = await this.executeTool({ type: "tool_call", tool: "windows.screenshot.capture", input: {} });
        return { ok: result.ok, ...(result.result ?? {}), message: result.message };
      }
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 },
      });
      const source = sources[0];
      if (!source) {
        return { ok: false, message: "No screen source is available." };
      }
      return {
        ok: true,
        imageBase64: source.thumbnail.toPNG().toString("base64"),
        mimeType: "image/png",
      };
    }

    return { ok: false, message: `Unknown endpoint: ${request.method} ${url.pathname}` };
  }

  private requireCommandRun(permissions: EnginePermissionPolicy) {
    if (!permissions.commandRun) {
      throw new Error("Command execution is disabled by Hermes permissions.");
    }
  }

  private async executeTool(call: WindowsToolCall): Promise<BridgeResponse & { ok: boolean; message: string }> {
    if (!this.windowsToolExecutor) {
      return { ok: false, message: "WindowsToolExecutor is not available." };
    }
    const result = await this.windowsToolExecutor.execute(call);
    return { ok: result.ok, message: result.message, ...(result.result ?? {}) };
  }

  private requireFileWrite(permissions: EnginePermissionPolicy) {
    if (!permissions.fileWrite) {
      throw new Error("File writing is disabled by Hermes permissions.");
    }
  }

  private authorized(request: http.IncomingMessage) {
    return request.headers.authorization === `Bearer ${this.token}`;
  }

  private async readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        throw new Error("Request body is too large.");
      }
      chunks.push(buffer);
    }
    if (chunks.length === 0) {
      return {};
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  }

  private stringField(body: Record<string, unknown>, key: string, maxLength: number) {
    const value = body[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Missing required string field: ${key}`);
    }
    if (value.length > maxLength) {
      throw new Error(`Field ${key} is too long.`);
    }
    return value;
  }

  private optionalStringField(body: Record<string, unknown>, key: string, maxLength: number) {
    const value = body[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`Field ${key} must be a string.`);
    }
    if (value.length > maxLength) {
      throw new Error(`Field ${key} is too long.`);
    }
    return value;
  }

  private timeoutField(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_POWERSHELL_TIMEOUT_MS;
    }
    return Math.max(1000, Math.min(MAX_POWERSHELL_TIMEOUT_MS, Math.floor(value)));
  }

  private write(response: http.ServerResponse, statusCode: number, payload: BridgeResponse) {
    response.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(payload));
  }

  private log(endpoint: string, ok: boolean, startedAt: number, detail = "") {
    console.info("[Windows Bridge]", {
      at: new Date().toISOString(),
      endpoint,
      ok,
      durationMs: Date.now() - startedAt,
      detail: detail.slice(0, 160),
    });
  }
}

function truncateOutput(output: string) {
  const buffer = Buffer.from(output, "utf8");
  if (buffer.length <= MAX_COMMAND_OUTPUT_BYTES) {
    return output;
  }
  return `${buffer.subarray(0, MAX_COMMAND_OUTPUT_BYTES).toString("utf8")}\n...[truncated]`;
}
