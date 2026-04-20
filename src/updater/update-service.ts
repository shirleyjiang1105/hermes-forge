import type { EngineAdapter } from "../adapters/engine-adapter";
import type { EngineUpdateStatus, RuntimeConfig } from "../shared/types";

export class UpdateService {
  constructor(private readonly adapters: EngineAdapter[]) {}

  async checkAll(config: RuntimeConfig): Promise<EngineUpdateStatus[]> {
    const engineUpdates = await Promise.all(this.adapters.map((adapter) => adapter.checkUpdate()));
    return [
      {
        engineId: "client",
        currentVersion: process.env.npm_package_version,
        updateAvailable: false,
        sourceConfigured: Boolean(config.updateSources.client),
        message: config.updateSources.client ? "客户端更新源已配置，MVP 暂不自动下载。" : "尚未配置客户端官方更新源。",
      },
      ...engineUpdates,
    ];
  }
}
