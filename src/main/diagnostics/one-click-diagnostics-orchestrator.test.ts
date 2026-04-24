import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OneClickDiagnosticsOrchestrator } from "./one-click-diagnostics-orchestrator";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("OneClickDiagnosticsOrchestrator", () => {
  it("exports diagnostics without starting a one-click run when no cached report exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "one-click-export-"));
    tempDirs.push(dir);
    const diagnosticsService = {
      export: vi.fn(async () => ({ ok: true, path: dir, message: `诊断报告已导出：${dir}` })),
    };
    const setupService = { getSummary: vi.fn() };
    const orchestrator = new OneClickDiagnosticsOrchestrator(
      {} as any,
      setupService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      diagnosticsService as any,
      {} as any,
      {} as any,
    );

    const result = await orchestrator.exportLatest();

    expect(result.ok).toBe(true);
    expect(diagnosticsService.export).toHaveBeenCalledTimes(1);
    expect(setupService.getSummary).not.toHaveBeenCalled();
    const oneClickReport = JSON.parse(await fs.readFile(result.oneClickReportPath!, "utf8")) as { summary: { skipped: number }; items: Array<{ status: string }> };
    expect(oneClickReport.summary.skipped).toBe(1);
    expect(oneClickReport.items[0]?.status).toBe("skipped");
  });
});
