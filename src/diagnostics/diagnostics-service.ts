import fs from "node:fs/promises";
import path from "node:path";
import type { AppPaths } from "../main/app-paths";
import type { RuntimeConfigStore } from "../main/runtime-config";
import type { SessionLog } from "../main/session-log";
import type { EngineAdapter } from "../adapters/engine-adapter";
import type { EngineProbeService } from "../probes/engine-probe-service";
import type { SetupService } from "../setup/setup-service";
import type { SnapshotManager } from "../process/snapshot-manager";
import type { WorkspaceLock } from "../process/workspace-lock";
import type { ClientInfo, DiagnosticExportResult } from "../shared/types";

export class DiagnosticsService {
  constructor(
    private readonly appPaths: AppPaths,
    private readonly setupService: SetupService,
    private readonly configStore: RuntimeConfigStore,
    private readonly sessionLog: SessionLog,
    private readonly hermes: EngineAdapter,
    private readonly engineProbeService: EngineProbeService,
    private readonly snapshotManager: SnapshotManager,
    private readonly workspaceLock: WorkspaceLock,
    private readonly clientInfo: () => ClientInfo,
  ) {}

  async export(workspacePath?: string): Promise<DiagnosticExportResult> {
    const createdAt = new Date().toISOString();
    const dir = path.join(this.appPaths.baseDir(), "diagnostics", createdAt.replace(/[:.]/g, "-"));
    await fs.mkdir(dir, { recursive: true });

    const workspaceId = workspacePath?.trim() ? await this.appPaths.ensureWorkspaceLayout(workspacePath) : undefined;
    const config = await this.configStore.read();
    const safeConfig = {
      ...config,
      modelProfiles: config.modelProfiles.map((profile) => ({
        ...profile,
        secretRef: profile.secretRef ? "[CONFIGURED]" : undefined,
      })),
    };

    const engine = await this.hermes.healthCheck();
    const memory = workspaceId ? await this.hermes.getMemoryStatus(workspaceId) : undefined;
    const snapshots = workspaceId ? await this.snapshotManager.listSnapshots(workspaceId) : [];
    const events = workspaceId ? await this.sessionLog.readRecent(workspaceId, 80) : [];
    const locks = this.workspaceLock.listActive(workspaceId);
    const probes = await this.engineProbeService.probeHermes(workspacePath);
    const installLogs = await this.listInstallLogs();

    const report = {
      createdAt,
      clientInfo: this.clientInfo(),
      setup: await this.setupService.getSummary(workspacePath),
      runtimeConfig: safeConfig,
      engine,
      probes,
      memory,
      snapshots,
      locks,
      installLogs,
      recentEvents: events,
    };

    await fs.writeFile(path.join(dir, "diagnostics.json"), JSON.stringify(report, null, 2), "utf8");
    await fs.writeFile(path.join(dir, "README.txt"), "诊断报告已脱敏，不包含 API Key 明文。\n", "utf8");
    return {
      ok: true,
      path: dir,
      message: `诊断报告已导出：${dir}`,
    };
  }

  private async listInstallLogs() {
    const dir = path.join(this.appPaths.baseDir(), "diagnostics", "install-logs");
    const files = await fs.readdir(dir).catch(() => []);
    return files.filter((file) => file.endsWith(".log")).slice(-12);
  }
}
