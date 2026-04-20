import { useEffect, useRef } from "react";
import type { SessionMetaPatch, WorkSession } from "../../shared/types";
import { useAppStore } from "../store";
import { ContextInspector } from "./ContextInspector";
import { PureChatContainer } from "./PureChatContainer";
import { IconRail } from "./components/IconRail";
import { SessionSidebar } from "./components/SessionSidebar";
import { HermesHeader } from "./components/HermesHeader";
import { WorkspaceDrawer } from "./components/WorkspaceDrawer";
import { ControlCenter } from "./components/ControlCenter";

type PanelId = ReturnType<typeof useAppStore.getState>["activePanel"];
export function DashboardView(props: {
  onPickWorkspace: () => void;
  onSelectWorkspace: (workspacePath: string) => void;
  onCreateSession: () => void;
  onSelectSession: (session: WorkSession | string) => void;
  onDeleteSession: (session: WorkSession) => void;
  onDuplicateSession?: (session: WorkSession) => void;
  onExportSession?: (session: WorkSession, format: "json" | "markdown") => void;
  onImportSession?: () => void;
  onRenameSession: (title: string) => void;
  onUpdateActiveSessionMeta?: (patch: SessionMetaPatch) => void;
  onUpdateSessionMeta?: (sessionId: string, patch: SessionMetaPatch) => void;
  onOpenSessionFolder: () => void;
  onClearSession: () => void;
  onStartTask: () => void;
  onCancelTask: () => void;
  onRestoreSnapshot: () => void;
  onRefreshFileTree: () => void;
  onExportDiagnostics: () => void;
  onRefreshWebUiOverview?: () => Promise<unknown>;
}) {
  const store = useAppStore();
  const latestSnapshot = store.snapshots[0];
  const activeLock = store.locks[0];
  const canStart = Boolean(store.userInput.trim() || store.attachments.length) && !store.runningTaskRunId;
  const runs = (store.activeSessionId ? (store.taskRunOrderBySession[store.activeSessionId] ?? []) : [])
    .map((taskRunId) => store.taskRunProjectionsById[taskRunId])
    .filter((run): run is NonNullable<typeof run> => Boolean(run));

  const hasRefreshed = useRef(false);

  useEffect(() => {
    if (hasRefreshed.current) return;
    hasRefreshed.current = true;
    
    // 延迟500ms再加载，让UI先渲染
    const timer = setTimeout(() => {
      void props.onRefreshWebUiOverview?.();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="absolute inset-0 flex overflow-hidden bg-white text-slate-900">
      <IconRail />
      <SessionSidebar
        onCreateSession={props.onCreateSession}
        onSelectSession={props.onSelectSession}
        onDeleteSession={props.onDeleteSession}
        onDuplicateSession={props.onDuplicateSession ?? (() => undefined)}
        onExportSession={props.onExportSession ?? (() => undefined)}
        onImportSession={props.onImportSession ?? (() => undefined)}
        onUpdateSessionMeta={props.onUpdateSessionMeta ?? ((_sessionId, _patch) => undefined)}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <HermesHeader
          onRenameSession={props.onRenameSession}
          onClearSession={props.onClearSession}
          onToggleInspector={() => store.setInspectorOpen(!store.inspectorOpen)}
          onToggleWorkspace={() => store.setWorkspaceDrawerOpen(!store.workspaceDrawerOpen)}
          onUpdateActiveSessionMeta={props.onUpdateActiveSessionMeta ?? (() => undefined)}
          onOpenSessionFolder={props.onOpenSessionFolder}
          inspectorOpen={store.inspectorOpen}
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {store.activePanel === "chat" ? (
            <PureChatContainer
              runs={runs}
              onPickWorkspace={props.onPickWorkspace}
              onCreateSession={props.onCreateSession}
              onClearSession={props.onClearSession}
              onStartTask={props.onStartTask}
              onCancelTask={props.onCancelTask}
              onRestoreSnapshot={props.onRestoreSnapshot}
              canStart={canStart}
              latestSnapshotAvailable={Boolean(latestSnapshot)}
              locked={Boolean(activeLock)}
            />
          ) : (
            <ControlCenter
              onRefresh={props.onRefreshWebUiOverview ?? (async () => undefined)}
              onOpenSettings={() => store.setView("settings")}
              onClearSession={props.onClearSession}
              onOpenSessionFolder={props.onOpenSessionFolder}
              onExportDiagnostics={props.onExportDiagnostics}
            />
          )}
        </div>
      </div>

      <WorkspaceDrawer onPickWorkspace={props.onPickWorkspace} onSelectWorkspace={props.onSelectWorkspace} onRefreshFileTree={props.onRefreshFileTree} />

      <ContextInspector
        open={store.inspectorOpen}
        onClose={() => store.setInspectorOpen(false)}
        onRefreshFileTree={props.onRefreshFileTree}
        onRestoreSnapshot={props.onRestoreSnapshot}
        onExportDiagnostics={props.onExportDiagnostics}
        onOpenSessionFolder={props.onOpenSessionFolder}
      />
    </section>
  );
}
