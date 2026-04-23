import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../process/command-runner", () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from "../process/command-runner";
import { __resetPreferredHermesRuntimeCacheForTests, RuntimeConfigStore } from "./runtime-config";

const runCommandMock = vi.mocked(runCommand);
const tempDirs: string[] = [];

afterEach(async () => {
  __resetPreferredHermesRuntimeCacheForTests();
  runCommandMock.mockReset();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("RuntimeConfigStore preferred runtime", () => {
  it("defaults to WSL when WSL is available and has distros", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-config-"));
    tempDirs.push(dir);
    runCommandMock
      .mockResolvedValueOnce({ exitCode: 0, stdout: "Default Distribution: Ubuntu", stderr: "" } as never)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "Ubuntu\n", stderr: "" } as never);

    const store = new RuntimeConfigStore(path.join(dir, "config.json"));
    const config = await store.read();

    expect(config.hermesRuntime?.mode).toBe("wsl");
    expect(config.hermesRuntime?.distro).toBe("Ubuntu");
    expect(config.hermesRuntime?.installSource).toMatchObject({
      sourceLabel: "pinned",
      repoUrl: "https://github.com/Mahiruxia/hermes-agent.git",
      commit: "55af678ec474bfd21ca5697dac08ef4f3fb59c37",
    });
  });

  it("keeps Windows default when WSL is unavailable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-config-"));
    tempDirs.push(dir);
    runCommandMock
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "wsl unavailable" } as never)
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" } as never);

    const store = new RuntimeConfigStore(path.join(dir, "config.json"));
    const config = await store.read();

    expect(config.hermesRuntime?.mode).toBe("windows");
    expect(config.hermesRuntime?.installSource).toMatchObject({
      sourceLabel: "pinned",
      repoUrl: "https://github.com/Mahiruxia/hermes-agent.git",
      commit: "55af678ec474bfd21ca5697dac08ef4f3fb59c37",
    });
  });
});
