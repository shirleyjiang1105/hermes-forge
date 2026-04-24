import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelConfigWizard } from "./ModelConfigWizard";
import { stableModelProfileId } from "../../../../shared/model-config";

const testModelConnection = vi.fn();
const updateModelConfig = vi.fn();
const saveSecret = vi.fn();
const setDefaultModel = vi.fn();

beforeEach(() => {
  testModelConnection.mockReset();
  updateModelConfig.mockReset();
  saveSecret.mockReset();
  setDefaultModel.mockReset();
  setDefaultModel.mockResolvedValue({ success: true, defaultModelId: "wizard-openrouter_api_key", models: [] });
  Object.assign(window, {
    workbenchClient: {
      testModelConnection,
      updateModelConfig,
      setDefaultModel,
      saveSecret,
      discoverLocalModelSources: vi.fn(),
    },
  });
});

describe("ModelConfigWizard", () => {
  it("highlights the recommended fix when a connection test fails", async () => {
    testModelConnection.mockResolvedValue({
      ok: false,
      profileId: "draft-openai_compatible",
      sourceType: "openai_compatible",
      failureCategory: "network_unreachable",
      message: "连不上模型服务。",
      recommendedFix: "请确认服务已经启动，而且 Base URL 指向 /v1。",
    });

    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: /立即测试/ }));

    expect(await screen.findByText("测试失败")).toBeInTheDocument();
    expect(screen.getByText(/建议动作：请确认服务已经启动/)).toBeInTheDocument();
  });

  it("enables saving after a successful connection test", async () => {
    testModelConnection.mockResolvedValue({
      ok: true,
      profileId: "draft-openai_compatible",
      sourceType: "openai_compatible",
      agentRole: "primary_agent",
      supportsTools: true,
      contextWindow: 32000,
      message: "连接成功。",
    });
    updateModelConfig.mockResolvedValue({});
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();

    renderWizard({ onRefresh, onSaved });

    expect(screen.getByRole("button", { name: /保存并复检/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /立即测试/ }));

    expect((await screen.findAllByText("测试通过")).length).toBeGreaterThan(0);
    const saveButton = screen.getByRole("button", { name: /保存并复检/ });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateModelConfig).toHaveBeenCalledWith(expect.objectContaining({ defaultProfileId: "wizard-openai_compatible" }));
    });
  });

  it("shows multiple saved profiles and keeps same-source additions unique", async () => {
    testModelConnection.mockResolvedValue({
      ok: true,
      profileId: "draft-openai_compatible",
      sourceType: "openai_compatible",
      agentRole: "primary_agent",
      supportsTools: true,
      contextWindow: 32000,
      message: "连接成功。",
    });
    updateModelConfig.mockResolvedValue({});

    renderWizard({
      models: {
        defaultProfileId: "wizard-openai_compatible",
        providerProfiles: [],
        modelProfiles: [
          { id: "wizard-openai_compatible", name: "OpenAI-compatible · qwen", provider: "custom", sourceType: "openai_compatible", model: "qwen", baseUrl: "http://127.0.0.1:8080/v1", agentRole: "primary_agent" },
          { id: "wizard-openrouter_api_key", name: "OpenRouter · anthropic/claude-sonnet-4-5", provider: "openrouter", sourceType: "openrouter_api_key", model: "anthropic/claude-sonnet-4-5", baseUrl: "https://openrouter.ai/api/v1", agentRole: "primary_agent" },
        ],
      },
    });

    expect(screen.getByText("OpenAI-compatible · qwen")).toBeInTheDocument();
    expect(screen.getByText("OpenRouter · anthropic/claude-sonnet-4-5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添加模型" }));
    fireEvent.change(screen.getByLabelText("添加模型名称"), { target: { value: "qwen3-coder-plus" } });
    fireEvent.click(screen.getByRole("button", { name: /立即测试/ }));
    expect((await screen.findAllByText("测试通过")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /新增并复检/ }).at(-1)!);

    await waitFor(() => {
      expect(updateModelConfig).toHaveBeenCalledWith(expect.objectContaining({
        modelProfiles: expect.arrayContaining([
          expect.objectContaining({ id: "wizard-openai_compatible", model: "qwen" }),
          expect.objectContaining({ id: "wizard-openrouter_api_key", model: "anthropic/claude-sonnet-4-5" }),
          expect.objectContaining({ id: stableModelProfileId({ provider: "custom", model: "qwen3-coder-plus", baseUrl: "http://127.0.0.1:8080/v1" }), model: "qwen3-coder-plus" }),
        ]),
      }));
    });
  });

  it("sets an older saved profile as default through the backend API", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    renderWizard({
      onRefresh,
      onSaved,
      models: {
        defaultProfileId: "openrouter-elephant",
        providerProfiles: [],
        modelProfiles: [
          { id: "openrouter-elephant", name: "OpenRouter · elephant", provider: "openrouter", sourceType: "openrouter_api_key", model: "openrouter/elephant-alpha", baseUrl: "https://openrouter.ai/api/v1", agentRole: "primary_agent" },
          { id: "mock-model", name: "Mock", provider: "local", sourceType: "legacy", model: "mock-model", agentRole: "auxiliary_model" },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "设为默认" }));

    await waitFor(() => {
      expect(setDefaultModel).toHaveBeenCalledWith("mock-model");
      expect(onRefresh).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith("默认模型已切换");
    });
  });

  it("applies API key family presets into connection fields", () => {
    renderWizard({
      models: {
        defaultProfileId: undefined,
        providerProfiles: [],
        modelProfiles: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "选择 provider family" }));
    fireEvent.click(screen.getByRole("button", { name: /Gemini API Key/ }));

    expect(screen.getByText("模型名称 / Model ID")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gemini-2.5-pro")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://generativelanguage.googleapis.com/v1beta")).toBeInTheDocument();
  });

  it("allows manual model IDs for provider presets with suggestions", () => {
    renderWizard({
      models: {
        defaultProfileId: undefined,
        providerProfiles: [],
        modelProfiles: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "选择 provider family" }));
    fireEvent.click(screen.getByRole("button", { name: /Gemini API Key/ }));
    fireEvent.change(screen.getByLabelText("添加模型名称"), { target: { value: "gemini-custom-preview" } });

    expect(screen.getByDisplayValue("gemini-custom-preview")).toBeInTheDocument();
  });

  it("applies custom endpoint family preset", () => {
    renderWizard({
      models: {
        defaultProfileId: undefined,
        providerProfiles: [],
        modelProfiles: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "选择 provider family" }));
    fireEvent.click(screen.getByRole("button", { name: /Ollama/ }));

    expect(screen.getByDisplayValue("http://127.0.0.1:11434/v1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/填写 Ollama 模型名/)).toBeInTheDocument();
  });
});

function renderWizard(overrides: { models?: Parameters<typeof ModelConfigWizard>[0]["models"]; onRefresh?: () => Promise<void>; onSaved?: (message: string) => void } = {}) {
  return render(
    <ModelConfigWizard
      models={overrides.models ?? {
        defaultProfileId: undefined,
        providerProfiles: [],
        modelProfiles: [{ id: "wizard-openai_compatible", provider: "custom", sourceType: "openai_compatible", model: "qwen", baseUrl: "http://127.0.0.1:8080/v1", agentRole: "primary_agent" }],
      }}
      secrets={[]}
      onRefresh={overrides.onRefresh ?? vi.fn().mockResolvedValue(undefined)}
      onSaved={overrides.onSaved ?? vi.fn()}
    />,
  );
}
