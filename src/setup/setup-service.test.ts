import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupService } from "./setup-service";
import type { AppPaths } from "../main/app-paths";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { EngineAdapter } from "../adapters/engine-adapter";
import type { SecretVault } from "../auth/secret-vault";
import type { RuntimeConfig } from "../shared/types";

vi.mock("../process/command-runner", () => ({
  runCommand: vi.fn(async (command: string) => ({
    exitCode: command === "git" || command === "python" ? 0 : 1,
    stdout: command === "git" ? "git version fixture" : "Python fixture",
    stderr: "",
  })),
}));

let tempRoot = "";
let config: RuntimeConfig;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-setup-service-"));
  config = { modelProfiles: [], updateSources: {}, enginePaths: {} };
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("SetupService installHermes", () => {
  it("reuses an already healthy Hermes install and saves its root path", async () => {
    const rootPath = path.join(tempRoot, "Hermes Agent");
    const service = createService({
      healthCheck: async () => ({
        engineId: "hermes",
        label: "Hermes",
        available: true,
        mode: "cli",
        path: rootPath,
        message: "Hermes CLI ready",
      }),
    });

    const result = await service.installHermes();

    expect(result.ok).toBe(true);
    expect(result.rootPath).toBe(rootPath);
    expect(config.enginePaths?.hermes).toBe(rootPath);
  });

  it("refuses to overwrite a non-empty target directory without Hermes CLI", async () => {
    const rootPath = path.join(tempRoot, "occupied");
    await fs.mkdir(rootPath, { recursive: true });
    await fs.writeFile(path.join(rootPath, "notes.txt"), "user data", "utf8");
    vi.stubEnv("HERMES_INSTALL_DIR", rootPath);
    const service = createService();

    const result = await service.installHermes();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("目标目录已存在但未找到 Hermes CLI");
    expect(config.enginePaths?.hermes).toBeUndefined();
  });
});

function createService(overrides: Partial<EngineAdapter> = {}) {
  const appPaths = {
    baseDir: () => tempRoot,
  } as AppPaths;
  const configStore = {
    read: async () => config,
    write: async (next: RuntimeConfig) => {
      config = next;
      return next;
    },
    getEnginePath: async () => config.enginePaths?.hermes ?? path.join(tempRoot, "Hermes Agent"),
  } as RuntimeConfigStore;
  const hermes = {
    healthCheck: async () => ({
      engineId: "hermes",
      label: "Hermes",
      available: false,
      mode: "cli",
      message: "Hermes missing",
    }),
    ...overrides,
  } as EngineAdapter;

  return new SetupService(appPaths, hermes, configStore, {} as SecretVault);
}
