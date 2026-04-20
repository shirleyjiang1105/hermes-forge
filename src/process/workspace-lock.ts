import type { EngineId, FileLockState, TaskType } from "../shared/types";

type LockMetadata = {
  engineId?: EngineId;
  taskType?: TaskType;
  lockedPaths?: string[];
};

type WorkspaceLockRecord = FileLockState;

export class WorkspaceLock {
  private readonly locks = new Map<string, WorkspaceLockRecord>();

  acquire(workspaceId: string, sessionId: string, metadata: LockMetadata = {}) {
    const owner = this.locks.get(workspaceId);
    if (owner && owner.sessionId !== sessionId) {
      return {
        acquired: false,
        message: `这个工作区已有 ${owner.engineId ?? "另一个 Hermes"} 任务在运行。为避免多个任务同时改文件，请先等待或停止当前任务。`,
      };
    }

    this.locks.set(workspaceId, {
      workspaceId,
      sessionId,
      engineId: metadata.engineId,
      taskType: metadata.taskType,
      scope: metadata.lockedPaths?.length ? "path" : "workspace",
      mode: "write",
      lockedPaths: metadata.lockedPaths?.length ? metadata.lockedPaths : ["."],
      createdAt: new Date().toISOString(),
      message: metadata.lockedPaths?.length
        ? `已锁定 ${metadata.lockedPaths.length} 个选中文件/目录。`
        : "已锁定整个工作区。",
    });
    return { acquired: true, message: "工作区锁定成功。" };
  }

  release(workspaceId: string, sessionId: string) {
    if (this.locks.get(workspaceId)?.sessionId === sessionId) {
      this.locks.delete(workspaceId);
    }
  }

  isLocked(workspaceId: string) {
    return this.locks.has(workspaceId);
  }

  listActive(workspaceId?: string) {
    const locks = [...this.locks.values()];
    return workspaceId ? locks.filter((lock) => lock.workspaceId === workspaceId) : locks;
  }
}
