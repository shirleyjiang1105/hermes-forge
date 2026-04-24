import { describe, expect, it } from "vitest";
import { targetSessionForTaskEvent } from "./session-routing";

describe("targetSessionForTaskEvent", () => {
  it("routes task results to the event session instead of the currently active session", () => {
    expect(
      targetSessionForTaskEvent(
        { taskRunId: "run-a", workSessionId: "session-a", sessionId: "legacy" },
        {
          activeSessionId: "session-b",
          taskRunProjectionsById: {},
        },
      ),
    ).toBe("session-a");
  });

  it("falls back to the persisted projection session when older events omit workSessionId", () => {
    expect(
      targetSessionForTaskEvent(
        { taskRunId: "run-a", sessionId: "legacy" },
        {
          activeSessionId: "session-b",
          taskRunProjectionsById: {
            "run-a": { workSessionId: "session-a" },
          },
        },
      ),
    ).toBe("session-a");
  });
});
