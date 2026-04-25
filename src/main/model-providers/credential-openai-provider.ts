import { OpenAiCompatibleProvider } from "./openai-compatible-provider";
import type { ModelSourceDefinition, ProviderAuthResult, ProviderTestContext } from "./types";

export class GithubCopilotProvider extends OpenAiCompatibleProvider {
  constructor(definition: ModelSourceDefinition) {
    super(definition, {
      urlPatterns: [/models\.github\.ai/i],
      modelPatterns: [/^gpt-/i, /^claude-/i, /^gemini-/i],
    });
  }

  protected override async resolveAuth(input: ProviderTestContext): Promise<ProviderAuthResult> {
    const token = process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
      return {
        ok: false,
        result: this.fail(input.profile, "manual_action_required", "没有发现 GitHub Copilot / GitHub Models 本地凭据。", "请先在本机完成 GitHub 凭据登录，或设置 COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN。", [
          { id: "auth", label: "auth", ok: false, message: "未发现本地 GitHub 凭据" },
        ]),
      };
    }
    return { ok: true, auth: token };
  }
}
