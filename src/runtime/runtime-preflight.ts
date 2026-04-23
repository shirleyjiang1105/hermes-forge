import type { RuntimePreflightResult } from "./runtime-types";

export class RuntimePreflightError extends Error {
  constructor(public readonly result: RuntimePreflightResult) {
    super(result.summary);
    this.name = "RuntimePreflightError";
  }
}

export function summarizePreflightFailure(result: RuntimePreflightResult) {
  const issue = result.issues.find((item) => item.severity === "error") ?? result.issues[0];
  return {
    code: issue?.code ?? "runtime_mismatch",
    title: "运行时未就绪",
    message: issue
      ? [issue.summary, issue.detail, issue.fixHint].filter(Boolean).join(" ")
      : result.summary,
  };
}
