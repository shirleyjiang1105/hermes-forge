import { describe, expect, it } from "vitest";
import { HermesCliAdapter, toWslPath } from "./hermes-cli-adapter";

describe("toWslPath", () => {
  it("converts Windows drive paths", () => {
    expect(toWslPath("D:\\Projects\\hermes-desktop")).toBe("/mnt/d/Projects/hermes-desktop");
    expect(toWslPath("C:/Users/example/Desktop")).toBe("/mnt/c/Users/example/Desktop");
  });

  it("converts WSL UNC paths", () => {
    expect(toWslPath("\\\\wsl$\\Ubuntu\\home\\example\\Hermes Agent")).toBe("/home/example/Hermes Agent");
  });

  it("keeps Linux paths unchanged", () => {
    expect(toWslPath("/home/example/Hermes Agent")).toBe("/home/example/Hermes Agent");
    expect(toWslPath("/mnt/d/Projects/hermes-desktop")).toBe("/mnt/d/Projects/hermes-desktop");
  });
});

describe("HermesCliAdapter reply cleanup", () => {
  it("removes WSL environment dumps from displayable replies", () => {
    const adapter = Object.create(HermesCliAdapter.prototype) as { normalizeReply(reply: string): string };

    expect(adapter.normalizeReply([
      "SHELL=/bin/bash WSL2_GUI_APPS_ENABLED=1 WSL_DISTRO_NAME=Ubuntu-24.04-Fresh NAME=DESKTOP",
      "PWD=/root/Hermes-Agent LOGNAME=root HOME=/root",
      "PATH=/usr/local/sbin:/usr/local/bin:/mnt/c/Program Files/nodejs",
      "我现在运行在 WSL Ubuntu-24.04-Fresh，当前目录是 /root/Hermes-Agent。",
    ].join("\n"))).toBe("我现在运行在 WSL Ubuntu-24.04-Fresh，当前目录是 /root/Hermes-Agent。");
  });
});

describe("HermesCliAdapter WSL env", () => {
  it("rewrites localhost model URLs to the Windows host reachable from WSL", () => {
    const adapter = Object.create(HermesCliAdapter.prototype) as {
      rewriteLocalhostModelUrls(env: NodeJS.ProcessEnv, host: string): NodeJS.ProcessEnv;
    };

    expect(adapter.rewriteLocalhostModelUrls({
      OPENAI_BASE_URL: "http://127.0.0.1:8081/v1",
      AI_BASE_URL: "http://localhost:8081/v1",
      ANTHROPIC_BASE_URL: "https://example.com/v1",
    }, "172.17.160.1")).toMatchObject({
      OPENAI_BASE_URL: "http://172.17.160.1:8081/v1",
      AI_BASE_URL: "http://172.17.160.1:8081/v1",
      ANTHROPIC_BASE_URL: "https://example.com/v1",
    });
  });
});
