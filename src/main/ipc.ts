import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import type { AppPaths } from "./app-paths";
import type { RuntimeConfigStore } from "./runtime-config";
import type { RuntimeEnvResolver } from "./runtime-env-resolver";
import type { SessionLog } from "./session-log";
import type { WorkSessionService } from "./work-session-service";
import type { HermesConnectorService } from "./hermes-connector-service";
import type { HermesWebUiService } from "./hermes-webui-service";
import type { HermesWindowsBridgeTestService } from "./hermes-windows-bridge-test-service";
import type { WindowsControlBridge } from "./windows-control-bridge";
import type { EngineAdapter } from "../adapters/engine-adapter";
import type { SecretVault } from "../auth/secret-vault";
import type { DiagnosticsService } from "../diagnostics/diagnostics-service";
import type { FileTreeService } from "../file-manager/file-tree-service";
import type { SnapshotManager } from "../process/snapshot-manager";
import type { TaskRunner } from "../process/task-runner";
import type { WorkspaceLock } from "../process/workspace-lock";
import type { EngineProbeService } from "../probes/engine-probe-service";
import type { SetupService } from "../setup/setup-service";
import type { UpdateService } from "../updater/update-service";
import { IpcChannels } from "../shared/ipc";
import {
  runtimeConfigSchema,
  secretRefSchema,
  secretSaveInputSchema,
  sessionIdSchema,
  sessionUpdateSchema,
  startTaskInputSchema,
  workspacePathInputSchema,
} from "../shared/schemas";
import type { ClientInfo, HermesStatusSummary, ModelConnectionTestResult, SessionAttachment } from "../shared/types";
import { normalizeOpenAiCompatibleBaseUrl } from "../shared/model-config";

const quickTextFileInputSchema = z.object({
  fileName: z.string().trim().max(120).optional(),
  content: z.string().max(20000).optional(),
});

const connectorPlatformIdSchema = z.enum([
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "email",
  "matrix",
  "mattermost",
  "dingtalk",
  "feishu",
  "homeassistant",
  "wecom",
  "wecom_callback",
  "weixin",
  "bluebubbles",
  "sms",
  "qqbot",
]);

const connectorSaveInputSchema = z.object({
  platformId: connectorPlatformIdSchema,
  enabled: z.boolean().optional(),
  values: z.record(z.string(), z.union([z.string().max(20000), z.boolean(), z.undefined()])),
});

export type IpcServices = {
  appPaths: AppPaths;
  taskRunner: TaskRunner;
  snapshotManager: SnapshotManager;
  fileTreeService: FileTreeService;
  workspaceLock: WorkspaceLock;
  sessionLog: SessionLog;
  workSessionService: WorkSessionService;
  hermes: EngineAdapter;
  updateService: UpdateService;
  engineProbeService: EngineProbeService;
  configStore: RuntimeConfigStore;
  runtimeEnvResolver: RuntimeEnvResolver;
  secretVault: SecretVault;
  setupService: SetupService;
  diagnosticsService: DiagnosticsService;
  hermesWebUiService: HermesWebUiService;
  hermesConnectorService: HermesConnectorService;
  windowsControlBridge: WindowsControlBridge;
  hermesWindowsBridgeTestService: HermesWindowsBridgeTestService;
  clientInfo: () => ClientInfo;
};

export function registerIpcHandlers(_mainWindow: BrowserWindow, services: IpcServices) {
  ipcMain.handle(IpcChannels.restartApp, () => {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  ipcMain.handle(IpcChannels.pickWorkspaceFolder, async () => {
    const result = await dialog.showOpenDialog({
      title: "选择工作目录",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle(IpcChannels.pickSessionAttachments, async (_event, sessionFilesPath: string): Promise<SessionAttachment[]> => {
    const targetSessionPath = workspacePathInputSchema.parse(sessionFilesPath);
    const result = await dialog.showOpenDialog({
      title: "选择要交给 Hermes 的文件或图片",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "支持的图片和文件", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "txt", "md", "pdf", "doc", "docx", "xls", "xlsx", "csv", "json", "yaml", "yml", "ts", "tsx", "js", "jsx", "py", "html", "css"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    const attachmentsDir = path.join(targetSessionPath, "attachments");
    await fs.mkdir(attachmentsDir, { recursive: true });
    const attachments: SessionAttachment[] = [];
    for (const sourcePath of result.filePaths.slice(0, 12)) {
      const stat = await fs.stat(sourcePath).catch(() => undefined);
      if (!stat?.isFile()) continue;
      if (stat.size > 200 * 1024 * 1024) {
        throw new Error(`附件过大：${path.basename(sourcePath)}。单个文件上限为 200MB。`);
      }
      const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const safeName = sanitizeAttachmentName(path.basename(sourcePath));
      const targetPath = await uniqueFilePath(attachmentsDir, `${id}-${safeName}`);
      await fs.copyFile(sourcePath, targetPath);
      const mimeType = inferMimeType(targetPath);
      attachments.push({
        id,
        name: safeName,
        path: targetPath,
        originalPath: sourcePath,
        kind: mimeType.startsWith("image/") ? "image" : "file",
        mimeType,
        size: stat.size,
        createdAt: new Date().toISOString(),
      });
    }
    return attachments;
  });

  ipcMain.handle(IpcChannels.createQuickTextFile, async (_event, input) => {
    const parsed = quickTextFileInputSchema.parse(input ?? {});
    const desktopPath = path.join(os.homedir(), "Desktop");
    await fs.mkdir(desktopPath, { recursive: true });
    const fileName = normalizeTextFileName(parsed.fileName);
    const targetPath = await uniqueFilePath(desktopPath, fileName);
    const content = parsed.content?.trim() || "这是由 Hermes 工作台快速创建的文本文件。";
    await fs.writeFile(targetPath, `${content}\n`, "utf8");
    return { ok: true, path: targetPath, message: `已在桌面创建 ${path.basename(targetPath)}。` };
  });

  ipcMain.handle(IpcChannels.getClientInfo, () => services.clientInfo());

  ipcMain.handle(IpcChannels.openPath, async (_event, targetPath: string) => {
    const stat = await fs.stat(targetPath).catch(() => undefined);
    if (!stat) return { ok: false, message: `路径不存在：${targetPath}` };
    const error = await shell.openPath(targetPath);
    return { ok: !error, message: error || `已打开：${targetPath}` };
  });

  ipcMain.handle(IpcChannels.openHelp, async () => {
    const helpUrl = "https://docs.hermes.systems";
    await shell.openExternal(helpUrl);
    return { ok: true, message: `已打开帮助文档：${helpUrl}` };
  });

  ipcMain.handle(IpcChannels.startTask, (_event, input) => {
    const parsed = startTaskInputSchema.parse(input);
    console.info("[Hermes Trace]", {
      layer: "main:task:start",
      clientTaskId: parsed.clientTaskId,
      taskType: parsed.taskType,
      userInputLength: parsed.userInput.length,
      workspacePath: parsed.workspacePath,
      selectedFilesCount: parsed.selectedFiles.length,
    });
    return services.taskRunner.start(parsed);
  });

  ipcMain.handle(IpcChannels.cancelTask, (_event, sessionId: string) => services.taskRunner.cancel(sessionId));

  ipcMain.handle(IpcChannels.restoreLatestSnapshot, async (_event, workspacePath: string) => {
    const parsed = workspacePathInputSchema.parse(workspacePath);
    const workspaceId = services.appPaths.workspaceId(parsed);
    return services.snapshotManager.restoreLatest(workspaceId);
  });

  ipcMain.handle(IpcChannels.listSnapshots, async (_event, workspacePath: string) => {
    const parsed = workspacePathInputSchema.parse(workspacePath);
    const workspaceId = services.appPaths.workspaceId(parsed);
    return services.snapshotManager.listSnapshots(workspaceId);
  });

  ipcMain.handle(IpcChannels.getFileTree, async (_event, workspacePath: string) => {
    const parsed = workspacePathInputSchema.parse(workspacePath);
    return services.fileTreeService.getTree(parsed);
  });

  ipcMain.handle(IpcChannels.listActiveLocks, async (_event, workspacePath?: string) => {
    if (!workspacePath) return services.workspaceLock.listActive();
    const parsed = workspacePathInputSchema.parse(workspacePath);
    return services.workspaceLock.listActive(services.appPaths.workspaceId(parsed));
  });

  ipcMain.handle(IpcChannels.getRecentTaskEvents, async (_event, workspacePath: string) => {
    const parsed = workspacePathInputSchema.parse(workspacePath);
    const workspaceId = services.appPaths.workspaceId(parsed);
    return services.sessionLog.readRecent(workspaceId);
  });

  ipcMain.handle(IpcChannels.listSessions, () => services.workSessionService.list());
  ipcMain.handle(IpcChannels.createSession, async (_event, title?: string) =>
    services.workSessionService.create(typeof title === "string" ? title : undefined),
  );
  ipcMain.handle(IpcChannels.updateSession, async (_event, input) => {
    const parsed = sessionUpdateSchema.parse(input);
    return services.workSessionService.update(parsed.id, parsed);
  });
  ipcMain.handle(IpcChannels.archiveSession, async (_event, id: string) => services.workSessionService.archive(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.deleteSession, async (_event, id: string) => services.workSessionService.delete(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.duplicateSession, async (_event, id: string) => services.workSessionService.duplicate(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.exportSession, async (_event, input) => {
    const parsed = z.object({ id: sessionIdSchema, format: z.enum(["json", "markdown"]).default("json") }).parse(input);
    return services.workSessionService.export(parsed.id, parsed.format);
  });
  ipcMain.handle(IpcChannels.importSession, async () => {
    const result = await dialog.showOpenDialog({
      title: "导入 Hermes 工作台会话 JSON / JSONL / 目录",
      properties: ["openFile", "openDirectory"],
      filters: [{ name: "Hermes Sessions", extensions: ["json", "jsonl"] }, { name: "All Files", extensions: ["*"] }],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    return services.workSessionService.importFromFile(result.filePaths[0]);
  });
  ipcMain.handle(IpcChannels.importCliSession, async (_event, filePath: string) => services.workSessionService.importFromFile(workspacePathInputSchema.parse(filePath)));
  ipcMain.handle(IpcChannels.clearSessionFiles, async (_event, id: string) => services.workSessionService.clearSessionFiles(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.openSessionFolder, async (_event, id: string) => {
    const parsed = sessionIdSchema.parse(id);
    const session = await services.workSessionService.read(parsed);
    if (!session) return { ok: false, message: `会话不存在：${parsed}` };
    const error = await shell.openPath(session.sessionFilesPath);
    return { ok: !error, message: error || `已打开会话文件夹：${session.sessionFilesPath}` };
  });

  ipcMain.handle(IpcChannels.getWebUiOverview, () => services.hermesWebUiService.overview());
  ipcMain.handle(IpcChannels.getWebUiSettings, () => services.hermesWebUiService.getSettings());
  ipcMain.handle(IpcChannels.saveWebUiSettings, (_event, input) => services.hermesWebUiService.saveSettings(input ?? {}));
  ipcMain.handle(IpcChannels.listConnectors, () => services.hermesConnectorService.list());
  ipcMain.handle(IpcChannels.saveConnector, (_event, input) =>
    services.hermesConnectorService.save(connectorSaveInputSchema.parse(input ?? {})),
  );
  ipcMain.handle(IpcChannels.disableConnector, (_event, platformId: string) =>
    services.hermesConnectorService.disable(connectorPlatformIdSchema.parse(platformId)),
  );
  ipcMain.handle(IpcChannels.syncConnectorsEnv, () => services.hermesConnectorService.syncEnv());
  ipcMain.handle(IpcChannels.getGatewayStatus, () => services.hermesConnectorService.status());
  ipcMain.handle(IpcChannels.startGateway, () => services.hermesConnectorService.start());
  ipcMain.handle(IpcChannels.stopGateway, () => services.hermesConnectorService.stop());
  ipcMain.handle(IpcChannels.restartGateway, () => services.hermesConnectorService.restart());
  ipcMain.handle(IpcChannels.startWeixinQrLogin, () => services.hermesConnectorService.startWeixinQrLogin());
  ipcMain.handle(IpcChannels.getWeixinQrLoginStatus, () => services.hermesConnectorService.getWeixinQrStatus());
  ipcMain.handle(IpcChannels.cancelWeixinQrLogin, () => services.hermesConnectorService.cancelWeixinQrLogin());
  ipcMain.handle(IpcChannels.listProjects, () => services.hermesWebUiService.listProjects());
  ipcMain.handle(IpcChannels.saveProject, (_event, input) => services.hermesWebUiService.saveProject(input ?? {}));
  ipcMain.handle(IpcChannels.deleteProject, (_event, id: string) => services.hermesWebUiService.deleteProject(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.listSpaces, () => services.hermesWebUiService.listSpaces());
  ipcMain.handle(IpcChannels.saveSpace, (_event, input) => services.hermesWebUiService.saveSpace(input ?? {}));
  ipcMain.handle(IpcChannels.deleteSpace, (_event, id: string) => services.hermesWebUiService.deleteSpace(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.listSkills, () => services.hermesWebUiService.listSkills());
  ipcMain.handle(IpcChannels.readSkill, (_event, id: string) => services.hermesWebUiService.readSkill(id));
  ipcMain.handle(IpcChannels.saveSkill, (_event, input) => {
    const parsed = z.object({ id: z.string().trim().min(1).max(300), content: z.string().max(200000) }).parse(input);
    return services.hermesWebUiService.saveSkill(parsed.id, parsed.content);
  });
  ipcMain.handle(IpcChannels.deleteSkill, (_event, id: string) => services.hermesWebUiService.deleteSkill(id));
  ipcMain.handle(IpcChannels.listMemoryFiles, () => services.hermesWebUiService.listMemoryFiles());
  ipcMain.handle(IpcChannels.saveMemoryFile, (_event, input) => {
    const parsed = z.object({ id: z.enum(["USER.md", "MEMORY.md"]), content: z.string().max(300000) }).parse(input);
    return services.hermesWebUiService.saveMemoryFile(parsed.id, parsed.content);
  });
  ipcMain.handle(IpcChannels.importMemoryFile, (_event, input) => {
    const parsed = z.object({ sourcePath: z.string(), targetId: z.enum(["USER.md", "MEMORY.md"]) }).parse(input);
    return services.hermesWebUiService.importMemoryFile(parsed.sourcePath, parsed.targetId);
  });
  ipcMain.handle(IpcChannels.listProfiles, () => services.hermesWebUiService.listProfiles());
  ipcMain.handle(IpcChannels.switchProfile, (_event, name: string) => services.hermesWebUiService.switchProfile(sessionIdSchema.parse(name)));
  ipcMain.handle(IpcChannels.createProfile, (_event, name: string) => services.hermesWebUiService.createProfile(sessionIdSchema.parse(name)));
  ipcMain.handle(IpcChannels.deleteProfile, (_event, name: string) => services.hermesWebUiService.deleteProfile(sessionIdSchema.parse(name)));
  ipcMain.handle(IpcChannels.listCronJobs, () => services.hermesWebUiService.listCronJobs());
  ipcMain.handle(IpcChannels.saveCronJob, (_event, input) => services.hermesWebUiService.saveCronJob(input ?? {}));
  ipcMain.handle(IpcChannels.runCronJob, (_event, id: string) => services.hermesWebUiService.runCronJob(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.pauseCronJob, (_event, id: string) => services.hermesWebUiService.pauseCronJob(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.resumeCronJob, (_event, id: string) => services.hermesWebUiService.resumeCronJob(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.deleteCronJob, (_event, id: string) => services.hermesWebUiService.deleteCronJob(sessionIdSchema.parse(id)));
  ipcMain.handle(IpcChannels.previewFile, (_event, filePath: string) => services.hermesWebUiService.previewFile(workspacePathInputSchema.parse(filePath)));
  ipcMain.handle(IpcChannels.getFileBreadcrumb, (_event, filePath: string) => services.hermesWebUiService.fileBreadcrumb(workspacePathInputSchema.parse(filePath)));
  ipcMain.handle(IpcChannels.getGitInfo, (_event, workspacePath: string) => services.hermesWebUiService.gitInfo(workspacePathInputSchema.parse(workspacePath)));
  ipcMain.handle(IpcChannels.respondApproval, (_event, input) => {
    const parsed = z.object({
      id: z.string().trim().min(1).max(160),
      approved: z.boolean(),
      editedCommand: z.string().trim().max(4000).optional(),
    }).parse(input ?? {});
    return { ok: true, ...parsed, message: parsed.approved ? "已批准，等待 Hermes 后续结构化接入。" : "已拒绝该操作。" };
  });

  ipcMain.handle(IpcChannels.getHermesStatus, async (_event, workspacePath?: string): Promise<HermesStatusSummary> => {
    const config = await services.configStore.read();
    const workspaceId = workspacePath
      ? await services.appPaths.ensureWorkspaceLayout(workspacePath)
      : services.appPaths.workspaceId(process.cwd());
    const [engine, memory, updates] = await Promise.all([
      services.hermes.healthCheck(),
      services.hermes.getMemoryStatus(workspaceId),
      services.updateService.checkAll(config),
    ]);
    return { engine, memory, update: updates.find((item) => item.engineId === "hermes") ?? updates[0] };
  });

  ipcMain.handle(IpcChannels.getHermesProbe, (_event, workspacePath?: string) =>
    services.engineProbeService.probeHermes(workspacePath),
  );

  ipcMain.handle(IpcChannels.warmHermes, async () => {
    if (!services.hermes.warmup) return { ok: false, message: "Hermes 当前没有可用的预热动作。", probeKind: "cheap" };
    return services.hermes.warmup("cheap");
  });

  ipcMain.handle(IpcChannels.probeHermes, async (_event, workspacePath?: string) => {
    if (!services.hermes.warmup) return { ok: false, message: "Hermes 当前没有可用的深度探针。", probeKind: "real", diagnosticCategory: "unknown" };
    const config = await services.configStore.read();
    const runtimeEnv = await services.runtimeEnvResolver.resolve(config.defaultModelProfileId);
    return services.hermes.warmup("real", workspacePath, runtimeEnv);
  });

  ipcMain.handle(IpcChannels.checkUpdates, async () => {
    const config = await services.configStore.read();
    return services.updateService.checkAll(config);
  });

  ipcMain.handle(IpcChannels.updateHermes, () => services.setupService.updateHermes());
  ipcMain.handle(IpcChannels.getRuntimeConfig, () => services.configStore.read());
  ipcMain.handle(IpcChannels.testHermesWindowsBridge, () => services.hermesWindowsBridgeTestService.test());
  ipcMain.handle(IpcChannels.getConfigOverview, async (_event, workspacePath?: string) => {
    const runtimeConfig = await services.configStore.read();
    const secretRefs = new Set<string>();
    for (const profile of runtimeConfig.modelProfiles) {
      if (profile.secretRef) secretRefs.add(profile.secretRef);
    }
    for (const provider of runtimeConfig.providerProfiles ?? []) {
      if (provider.apiKeySecretRef) secretRefs.add(provider.apiKeySecretRef);
    }
    const secrets = await Promise.all([...secretRefs].map(async (ref) => ({
      ref,
      exists: await services.secretVault.hasSecret(ref),
      ...(await services.secretVault.getSecretMeta(ref) ?? {}),
    })));
    const hermesPath = await services.configStore.getEnginePath("hermes");
    const health = await services.setupService.getSummary(workspacePath);
    return {
      runtimeConfig,
      hermes: {
        rootPath: hermesPath,
        warmupMode: runtimeConfig.startupWarmupMode ?? "cheap",
        runtime: runtimeConfig.hermesRuntime ?? { mode: "windows", pythonCommand: "python3" },
        bridge: services.windowsControlBridge.status(),
        permissions: {
          enabled: runtimeConfig.enginePermissions?.hermes?.enabled ?? true,
          workspaceRead: runtimeConfig.enginePermissions?.hermes?.workspaceRead ?? true,
          fileWrite: runtimeConfig.enginePermissions?.hermes?.fileWrite ?? true,
          commandRun: runtimeConfig.enginePermissions?.hermes?.commandRun ?? true,
          memoryRead: runtimeConfig.enginePermissions?.hermes?.memoryRead ?? true,
          contextBridge: runtimeConfig.enginePermissions?.hermes?.contextBridge ?? true,
        },
      },
      models: {
        defaultProfileId: runtimeConfig.defaultModelProfileId,
        providerProfiles: runtimeConfig.providerProfiles ?? [],
        modelProfiles: runtimeConfig.modelProfiles,
      },
      secrets,
      health,
    };
  });
  ipcMain.handle(IpcChannels.updateHermesConfig, async (_event, input) => {
    const parsed = z.object({
      rootPath: z.string().trim().max(1000).optional(),
      warmupMode: z.enum(["off", "cheap", "real_probe"]).optional(),
      permissions: z.object({
        enabled: z.boolean().optional(),
        workspaceRead: z.boolean().optional(),
        fileWrite: z.boolean().optional(),
        commandRun: z.boolean().optional(),
        memoryRead: z.boolean().optional(),
        contextBridge: z.boolean().optional(),
      }).optional(),
      runtime: z.object({
        mode: z.enum(["windows", "wsl"]).optional(),
        distro: z.string().trim().max(120).optional(),
        pythonCommand: z.string().trim().min(1).max(120).optional(),
        windowsAgentMode: z.enum(["hermes_native", "host_tool_loop", "disabled"]).optional(),
      }).optional(),
    }).parse(input);
    const config = await services.configStore.read();
    return services.configStore.write({
      ...config,
      startupWarmupMode: parsed.warmupMode ?? config.startupWarmupMode,
      enginePaths: {
        ...(config.enginePaths ?? {}),
        ...(parsed.rootPath ? { hermes: parsed.rootPath } : {}),
      },
      enginePermissions: {
        ...(config.enginePermissions ?? {}),
        hermes: {
          ...(config.enginePermissions?.hermes ?? {}),
          ...(parsed.permissions ?? {}),
        },
      },
      hermesRuntime: {
        ...(config.hermesRuntime ?? { mode: "windows", pythonCommand: "python3", windowsAgentMode: "hermes_native" }),
        ...(parsed.runtime ?? {}),
        pythonCommand: parsed.runtime?.pythonCommand?.trim() || config.hermesRuntime?.pythonCommand || "python3",
        distro: parsed.runtime?.distro?.trim() || undefined,
        windowsAgentMode: parsed.runtime?.windowsAgentMode ?? config.hermesRuntime?.windowsAgentMode ?? "hermes_native",
      },
    });
  });
  ipcMain.handle(IpcChannels.updateModelConfig, async (_event, input) => {
    const parsed = z.object({
      defaultProfileId: z.string().max(120).optional(),
      modelProfiles: z.array(z.any()).optional(),
      providerProfiles: z.array(z.any()).optional(),
    }).parse(input);
    const config = await services.configStore.read();
    return services.configStore.write({
      ...config,
      defaultModelProfileId: parsed.defaultProfileId ?? config.defaultModelProfileId,
      modelProfiles: parsed.modelProfiles ?? config.modelProfiles,
      providerProfiles: parsed.providerProfiles ?? config.providerProfiles,
    });
  });
  ipcMain.handle(IpcChannels.saveRuntimeConfig, (_event, config) => services.configStore.write(runtimeConfigSchema.parse(config)));

  ipcMain.handle(IpcChannels.testModelConnection, async (_event, profileId?: string): Promise<ModelConnectionTestResult> => {
    const config = await services.configStore.read();
    const profile =
      config.modelProfiles.find((item) => item.id === profileId) ??
      config.modelProfiles.find((item) => item.id === config.defaultModelProfileId) ??
      config.modelProfiles[0];

    if (!profile) return { ok: false, message: "尚未配置模型。请先添加一个模型配置。" };
    if (!profile.model.trim()) return { ok: false, profileId: profile.id, message: "模型名称为空，请填写 model。" };
    if (profile.provider === "local") return { ok: true, profileId: profile.id, message: `本地模型配置可用：${profile.model}` };
    if (profile.provider === "custom") {
      if (!profile.baseUrl?.trim()) {
        return { ok: false, profileId: profile.id, message: "本地/自定义模型缺少 Base URL。" };
      }
      let normalizedBaseUrl: string;
      try {
        normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(profile.baseUrl) ?? "";
      } catch {
        return { ok: false, profileId: profile.id, message: "本地/自定义模型的 Base URL 格式不正确。" };
      }
      if (profile.secretRef && !(await services.secretVault.hasSecret(profile.secretRef))) {
        return { ok: false, profileId: profile.id, message: "当前配置填写了密钥引用，但对应密钥尚未保存或已失效。" };
      }
      const secret = profile.secretRef ? await services.secretVault.readSecret(profile.secretRef) : undefined;
      return testOpenAiCompatibleModel(profile.id, normalizedBaseUrl, profile.model, secret);
    }
    if (!profile.secretRef) return { ok: false, profileId: profile.id, message: `${profile.provider} 配置缺少 API Key 引用。` };
    if (!(await services.secretVault.hasSecret(profile.secretRef))) {
      return { ok: false, profileId: profile.id, message: `${profile.provider} API Key 尚未保存或已失效。` };
    }
    return { ok: true, profileId: profile.id, message: `${profile.provider}/${profile.model} 已具备运行所需配置与密钥。` };
  });

  ipcMain.handle(IpcChannels.getSetupSummary, (_event, workspacePath?: string) => services.setupService.getSummary(workspacePath));
  ipcMain.handle(IpcChannels.getSecretStatus, () => services.secretVault.status());
  ipcMain.handle(IpcChannels.saveSecret, (_event, input) => {
    const parsed = secretSaveInputSchema.parse(input);
    return services.secretVault.saveSecret(parsed.ref, parsed.plainText);
  });
  ipcMain.handle(IpcChannels.deleteSecret, (_event, ref: string) => services.secretVault.deleteSecret(secretRefSchema.parse(ref)));
  ipcMain.handle(IpcChannels.hasSecret, async (_event, ref: string) => {
    const parsed = secretRefSchema.parse(ref);
    return { ref: parsed, exists: await services.secretVault.hasSecret(parsed) };
  });
  ipcMain.handle(IpcChannels.exportDiagnostics, (_event, workspacePath?: string) => services.diagnosticsService.export(workspacePath));
}

async function testOpenAiCompatibleModel(profileId: string, baseUrl: string, model: string, apiKey?: string): Promise<ModelConnectionTestResult> {
  const modelsUrl = `${baseUrl.replace(/\/$/, "")}/models`;
  try {
    console.info("[Model Test] Testing connection to:", modelsUrl);
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey || "lm-studio"}` },
      signal: AbortSignal.timeout(15000),
    });
    console.info("[Model Test] Response status:", response.status);
    if (!response.ok) {
      const statusText = response.statusText || "未知状态";
      return { ok: false, profileId, message: `本地模型服务可访问，但 /models 返回 HTTP ${response.status} (${statusText})。请确认 Base URL 是否正确：${baseUrl}。` };
    }
    const payload = await response.json().catch(() => undefined) as { data?: Array<{ id?: string }> } | undefined;
    console.info("[Model Test] Available models:", payload?.data?.map((item) => item.id));
    const availableModels = payload?.data?.map((item) => item.id).filter((item): item is string => Boolean(item)) ?? [];
    const hasModel = availableModels.length === 0 || availableModels.includes(model);
    if (!hasModel) {
      return {
        ok: false,
        profileId,
        message: `已连上本地模型服务，但没有找到模型 ${model}。可用模型：${availableModels.length > 0 ? availableModels.slice(0, 8).join("、") : "未返回模型列表"}`,
      };
    }
    return { ok: true, profileId, message: `已连上本地模型服务：${baseUrl}，模型 ${model} 可用。` };
  } catch (error) {
    console.error("[Model Test] Connection failed:", error);
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    let hint = "";
    if (errorMessage.includes("fetch failed") || errorMessage.includes("ECONNREFUSED")) {
      hint = "\n提示：请确保 llama.cpp 服务已启动，并且 Base URL 指向实际监听端口，例如 http://127.0.0.1:8081/v1。";
    } else if (errorMessage.includes("timeout")) {
      hint = "\n提示：连接超时，请检查网络或增加超时时间。";
    } else if (errorMessage.includes("CORS") || errorMessage.includes("CORB")) {
      hint = "\n提示：检测到 CORS 问题，请确保 llama.cpp 服务允许跨域请求。";
    }
    return {
      ok: false,
      profileId,
      message: `无法连接本地模型服务 ${modelsUrl}：${errorMessage}${hint}`,
    };
  }
}

function normalizeTextFileName(fileName?: string) {
  const safeName = (fileName || "output")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "output";
  return /\.txt$/i.test(safeName) ? safeName : `${safeName}.txt`;
}

function sanitizeAttachmentName(fileName: string) {
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "attachment";
}

function inferMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] ?? "application/octet-stream";
}

async function uniqueFilePath(directory: string, fileName: string) {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  for (let index = 1; await exists(candidate); index += 1) {
    candidate = path.join(directory, `${parsed.name}-${index}${parsed.ext || ".txt"}`);
  }
  return candidate;
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
