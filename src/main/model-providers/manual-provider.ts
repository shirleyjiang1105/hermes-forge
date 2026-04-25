import { BaseProvider } from "./base-provider";
import type { ModelListResult, ModelSourceDefinition, ProviderAuthResult, ProviderTestContext } from "./types";

export class ManualActionProvider extends BaseProvider {
  readonly sourceType: ModelSourceDefinition["sourceType"];

  constructor(
    readonly definition: ModelSourceDefinition,
    private readonly message: string,
    private readonly fix: string,
  ) {
    super();
    this.sourceType = definition.sourceType;
  }

  protected override async resolveAuth(input: ProviderTestContext): Promise<ProviderAuthResult> {
    return {
      ok: false,
      result: this.fail(input.profile, "manual_action_required", this.message, this.fix, [
        { id: "auth", label: "auth", ok: false, message: "需要先完成本机 provider 登录/凭据配置" },
      ]),
    };
  }

  protected async fetchModels(): Promise<ModelListResult> {
    return {
      ok: false,
      message: this.message,
      failureCategory: "manual_action_required",
      recommendedFix: this.fix,
      availableModels: [],
      authResolved: false,
    };
  }
}
