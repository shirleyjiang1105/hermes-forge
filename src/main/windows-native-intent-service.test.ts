import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WindowsNativeIntentService } from "./windows-native-intent-service";
import type { EngineRunRequest } from "../shared/types";

let tempRoot = "";
let desktop = "";
let publicDesktop = "";

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windows-native-intent-"));
  desktop = path.join(tempRoot, "Desktop");
  publicDesktop = path.join(tempRoot, "PublicDesktop");
  await fs.mkdir(desktop, { recursive: true });
  await fs.mkdir(publicDesktop, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("WindowsNativeIntentService", () => {
  it("creates a text file on the desktop without calling Hermes", async () => {
    const service = new WindowsNativeIntentService(() => [desktop, publicDesktop]);
    const result = await service.tryHandle(request("请在我的 Windows 桌面创建一个 txt 文件，文件名叫 bridge-test.txt，内容写 hello bridge"));

    expect(result?.handled).toBe(true);
    const filePath = path.join(desktop, "bridge-test.txt");
    await expect(fs.readFile(filePath, "utf8")).resolves.toBe("hello bridge");
    expect(result?.events.some((event) => event.type === "file_change" && event.path === filePath)).toBe(true);
  });

  it("counts visible user and public desktop entries", async () => {
    await fs.writeFile(path.join(desktop, "a.lnk"), "");
    await fs.writeFile(path.join(desktop, "desktop.ini"), "");
    await fs.mkdir(path.join(publicDesktop, "Tools"));
    const service = new WindowsNativeIntentService(() => [desktop, publicDesktop]);

    const result = await service.tryHandle(request("你好，请问我 windows 桌面一共有几个图标?"));
    const final = result?.events.find((event) => event.type === "result");

    expect(result?.handled).toBe(true);
    expect(final?.type === "result" ? final.detail : "").toContain("共有 2 个");
  });

  it("handles desktop app count wording without calling Hermes", async () => {
    await fs.writeFile(path.join(desktop, "Browser.lnk"), "");
    const service = new WindowsNativeIntentService(() => [desktop, publicDesktop]);

    const result = await service.tryHandle(request("帮我数一下现在 windows 客户端桌面一共有几个应用"));
    const final = result?.events.find((event) => event.type === "result");

    expect(result?.handled).toBe(true);
    expect(final?.type === "result" ? final.detail : "").toContain("共有 1 个");
  });

  it("returns a permission failure when file writing is disabled", async () => {
    const service = new WindowsNativeIntentService(() => [desktop]);
    const result = await service.tryHandle(request("在桌面创建一个 txt", { fileWrite: false }));
    const final = result?.events.find((event) => event.type === "result");

    expect(final?.type === "result" ? final.success : true).toBe(false);
    expect(final?.type === "result" ? final.detail : "").toContain("fileWrite=false");
  });

  it("ignores unrelated chat", async () => {
    const service = new WindowsNativeIntentService(() => [desktop]);
    await expect(service.tryHandle(request("今天天气怎么样"))).resolves.toBeUndefined();
  });
});

function request(
  userInput: string,
  permissions: Partial<NonNullable<EngineRunRequest["permissions"]>> = {},
): EngineRunRequest {
  return {
    sessionId: "session",
    workspaceId: "workspace",
    workspacePath: tempRoot,
    userInput,
    taskType: "custom",
    selectedFiles: [],
    memoryPolicy: "isolated",
    permissions: {
      enabled: true,
      workspaceRead: true,
      fileWrite: true,
      commandRun: true,
      memoryRead: true,
      contextBridge: true,
      ...permissions,
    },
  };
}
