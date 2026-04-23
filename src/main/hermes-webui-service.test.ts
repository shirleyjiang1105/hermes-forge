import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppPaths } from "./app-paths";
import { HermesWebUiService } from "./hermes-webui-service";

let tempRoot = "";

describe("HermesWebUiService", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-webui-service-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("stores memory and skills under the active Hermes profile inside app HERMES_HOME", async () => {
    const appPaths = new AppPaths(tempRoot);
    await appPaths.ensureBaseLayout();
    const service = new HermesWebUiService(
      appPaths,
      async () => path.join(tempRoot, "Hermes Agent"),
      undefined,
      undefined,
    );

    await service.createProfile("wechat");
    await service.switchProfile("wechat");
    await service.saveMemoryFile("USER.md", "偏好：中文输出");
    await service.saveMemoryFile("MEMORY.md", "长期记忆：项目代号是星图");
    await service.saveSkill("review", "# review\n\nAlways summarize findings.");

    const activeHome = path.join(appPaths.hermesDir(), "profiles", "wechat");
    await expect(fs.readFile(path.join(activeHome, "memories", "USER.md"), "utf8")).resolves.toContain("中文输出");
    await expect(fs.readFile(path.join(activeHome, "memories", "MEMORY.md"), "utf8")).resolves.toContain("项目代号是星图");
    await expect(fs.readFile(path.join(activeHome, "skills", "review.md"), "utf8")).resolves.toContain("Always summarize findings.");
    const listed = await service.listMemoryFiles();
    expect(listed.map((item) => item.path)).toEqual([
      path.join(activeHome, "memories", "USER.md"),
      path.join(activeHome, "memories", "MEMORY.md"),
    ]);
  });
});
