import type { RuntimeConfigStore } from "../main/runtime-config";
import type { SetupDependencyRepairId } from "../shared/types";
import type { InstallStrategy } from "./install-strategy";
import type {
  InstallOptions,
  InstallPlan,
  InstallPublisher,
  InstallStrategyRepairResult,
  InstallStrategyResult,
  InstallStrategyUpdateResult,
} from "./install-types";

export class InstallOrchestrator {
  constructor(
    private readonly configStore: RuntimeConfigStore,
    private readonly nativeStrategy: InstallStrategy,
    private readonly managedWslStrategy: InstallStrategy,
  ) {}

  async plan(options: InstallOptions = {}): Promise<InstallPlan> {
    return this.strategyFor(await this.mode(options)).plan(options);
  }

  async install(publish?: InstallPublisher, options: InstallOptions = {}): Promise<InstallStrategyResult> {
    return this.strategyFor(await this.mode(options)).install(publish, options);
  }

  async update(options: InstallOptions = {}): Promise<InstallStrategyUpdateResult> {
    return this.strategyFor(await this.mode(options)).update();
  }

  async repairDependency(id: SetupDependencyRepairId, options: InstallOptions = {}): Promise<InstallStrategyRepairResult> {
    return this.strategyFor(await this.mode(options)).repairDependency(id);
  }

  private async mode(options: InstallOptions) {
    if (options.mode) return options.mode;
    const config = await this.configStore.read();
    return config.hermesRuntime?.mode ?? "windows";
  }

  private strategyFor(mode: "windows" | "wsl") {
    return mode === "wsl" ? this.managedWslStrategy : this.nativeStrategy;
  }
}
