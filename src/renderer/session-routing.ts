import type { TaskEventEnvelope } from "../shared/types";

type SessionRoutingState = {
  activeSessionId?: string;
  runningSessionId?: string;
  taskRunProjectionsById: Record<string, { workSessionId?: string } | undefined>;
};

export function targetSessionForTaskEvent(
  event: Pick<TaskEventEnvelope, "taskRunId" | "workSessionId" | "sessionId">,
  state: SessionRoutingState,
): string | undefined {
  return (
    event.workSessionId ||
    state.taskRunProjectionsById[event.taskRunId]?.workSessionId ||
    state.runningSessionId ||
    event.sessionId ||
    state.activeSessionId
  );
}
