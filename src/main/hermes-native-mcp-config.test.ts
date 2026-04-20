import { describe, expect, it } from "vitest";
import { testOnly } from "./hermes-native-mcp-config";

describe("Hermes native MCP config helpers", () => {
  it("inserts the Windows bridge server under a new mcp_servers section", () => {
    const result = testOnly.upsertMcpServer("model:\n  provider: \"custom\"\n", "  windows_control_bridge:\n    command: \"python\"");

    expect(result).toContain("mcp_servers:\n  windows_control_bridge:");
    expect(result).toContain("command: \"python\"");
  });

  it("removes the managed Windows bridge server without touching other servers", () => {
    const result = testOnly.removeManagedServer([
      "model:",
      "  provider: \"custom\"",
      "mcp_servers:",
      "  windows_control_bridge:",
      "    command: \"python\"",
      "    args:",
      "      - \"bridge.py\"",
      "  github:",
      "    command: \"npx\"",
      "",
    ].join("\n"));

    expect(result).not.toContain("windows_control_bridge:");
    expect(result).toContain("github:");
    expect(result).toContain("command: \"npx\"");
  });

  it("replaces only the managed .env block", () => {
    const result = testOnly.removeManagedEnvBlock([
      "OPENAI_BASE_URL=http://127.0.0.1:8081/v1",
      "# >>> hermes-workbench-windows-bridge >>>",
      "HERMES_WINDOWS_BRIDGE_URL=\"http://127.0.0.1:1\"",
      "# <<< hermes-workbench-windows-bridge <<<",
      "CUSTOM_KEEP=1",
      "",
    ].join("\n"));

    expect(result).toContain("OPENAI_BASE_URL=http://127.0.0.1:8081/v1");
    expect(result).toContain("CUSTOM_KEEP=1");
    expect(result).not.toContain("HERMES_WINDOWS_BRIDGE_URL");
  });
});
