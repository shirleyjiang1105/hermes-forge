import { useState, useEffect } from "react";
import { Archive, Copy, Download, FolderPlus, Pin, Plus, Search, Trash2, Upload } from "lucide-react";
import type { ProjectGroup, SessionMetaPatch, WorkSession } from "../../../shared/types";
import { useAppStore } from "../../store";
import { cn } from "../DashboardPrimitives";

export function SessionSidebar(props: {
  onCreateSession: () => void;
  onSelectSession: (session: WorkSession | string) => void;
  onDeleteSession: (session: WorkSession) => void;
  onDuplicateSession: (session: WorkSession) => void;
  onExportSession: (session: WorkSession, format: "json" | "markdown") => void;
  onImportSession: () => void;
  onUpdateSessionMeta: (sessionId: string, patch: SessionMetaPatch) => void;
}) {
  const store = useAppStore();
  const [query, setQuery] = useState("");
  const [showProjects, setShowProjects] = useState(false);
  
  useEffect(() => {
    // 延迟1秒后显示项目列表，让会话列表先渲染
    const timer = setTimeout(() => {
      setShowProjects(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
  
  const projects = showProjects ? (store.webUiOverview?.projects ?? []) : [];
  const visibleSessions = store.sessions.filter((session) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return session.title.toLowerCase().includes(q) || session.id.toLowerCase().includes(q);
  });
  const pinned = visibleSessions.filter((s) => s.pinned);
  const unpinned = visibleSessions.filter((s) => !s.pinned);
  const archived = visibleSessions.filter((s) => s.status === "archived");
  const activeId = store.activeSessionId;

  function togglePin(session: WorkSession) {
    props.onUpdateSessionMeta(session.id, { pinned: !session.pinned });
  }

  function toggleArchive(session: WorkSession) {
    props.onUpdateSessionMeta(session.id, { status: session.status === "archived" ? "idle" : "archived" });
  }

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-[#f9f9fa]">
      <div className="border-b border-slate-200 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <button className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white px-3 py-2 text-[12px] text-slate-500 ring-1 ring-slate-100", !activeId && "opacity-50")} onClick={() => props.onSelectSession(store.sessions[0])} type="button">
            <span className="truncate">
              {store.sessions.find((s) => s.id === activeId)?.title || "选择会话"}
            </span>
          </button>
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white" onClick={props.onCreateSession} title="新建会话" type="button">
            <Plus size={14} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-100">
          <Search size={13} className="text-slate-400" />
          <input className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-slate-400" placeholder="搜索会话..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {pinned.length ? (
          <div className="mb-3">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">置顶</p>
            {pinned.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                active={session.id === activeId}
                onSelect={() => props.onSelectSession(session)}
                onPin={() => togglePin(session)}
                onArchive={() => toggleArchive(session)}
                onDuplicate={() => props.onDuplicateSession(session)}
                onExport={() => props.onExportSession(session, "json")}
                onDelete={() => props.onDeleteSession(session)}
              />
            ))}
          </div>
        ) : null}

        {unpinned.length ? (
          <div className="mb-3">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">会话</p>
            {unpinned.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                active={session.id === activeId}
                onSelect={() => props.onSelectSession(session)}
                onPin={() => togglePin(session)}
                onArchive={() => toggleArchive(session)}
                onDuplicate={() => props.onDuplicateSession(session)}
                onExport={() => props.onExportSession(session, "json")}
                onDelete={() => props.onDeleteSession(session)}
              />
            ))}
          </div>
        ) : null}

        {archived.length ? (
          <div>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">归档</p>
            {archived.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                active={session.id === activeId}
                onSelect={() => props.onSelectSession(session)}
                onArchive={() => toggleArchive(session)}
                onDelete={() => props.onDeleteSession(session)}
                archived
              />
            ))}
          </div>
        ) : null}

        {visibleSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <FolderPlus size={24} className="text-slate-300" />
            <p className="mt-2 text-[12px] text-slate-400">暂无会话</p>
            <button className="mt-2 rounded-md px-3 py-1.5 text-[12px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50" onClick={props.onCreateSession} type="button">
              新建会话
            </button>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 p-2">
        {projects.length ? (
          <div className="mb-2">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">项目</p>
            <div className="grid gap-1">
              {projects.map((project: ProjectGroup) => (
                <button key={project.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-slate-500 transition-colors hover:bg-white hover:text-slate-800" type="button">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                  <span className="truncate">{project.name}</span>
                  <span className="ml-auto text-xs text-slate-400">{project.sessionCount}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex gap-1">
          <button className={actionButtonClass} onClick={props.onImportSession} title="导入会话">
            <Upload size={12} />
          </button>
          <button className={actionButtonClass} onClick={() => props.onExportSession(store.sessions.find((s) => s.id === activeId)!, "json")} title="导出会话">
            <Download size={12} />
          </button>
        </div>
      </div>
    </aside>
  );
}

const actionButtonClass = "grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-600";

function SessionItem(props: {
  session: WorkSession;
  active: boolean;
  onSelect: () => void;
  onPin?: () => void;
  onArchive?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  archived?: boolean;
}) {
  return (
    <div className={cn("group flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] transition-colors", props.active ? "bg-indigo-50/70 text-indigo-700" : "text-slate-600 hover:bg-white", props.archived && "opacity-60")}>
      <button className={cn("grid h-5 w-5 place-items-center rounded", props.session.pinned && "text-amber-500")} onClick={props.onPin} title={props.session.pinned ? "取消置顶" : "置顶"} type="button">
        <Pin size={10} className={cn(!props.session.pinned && "opacity-0 group-hover:opacity-40")} />
      </button>
      <button className={cn("min-w-0 flex-1 text-left truncate", props.active && "font-medium")} onClick={props.onSelect} type="button">
        {props.session.title}
      </button>
      {!props.archived ? (
        <>
          <button className="grid h-5 w-5 place-items-center rounded opacity-0 text-slate-400 transition-opacity hover:text-slate-600 group-hover:opacity-100" onClick={props.onDuplicate} title="复制会话" type="button">
            <Copy size={10} />
          </button>
          <button className="grid h-5 w-5 place-items-center rounded opacity-0 text-slate-400 transition-opacity hover:text-slate-600 group-hover:opacity-100" onClick={props.onExport} title="导出" type="button">
            <Download size={10} />
          </button>
          <button className="grid h-5 w-5 place-items-center rounded opacity-0 text-slate-400 transition-opacity hover:text-rose-600 group-hover:opacity-100" onClick={props.onDelete} title="删除" type="button">
            <Trash2 size={10} />
          </button>
        </>
      ) : (
        <>
          <button className="grid h-5 w-5 place-items-center rounded opacity-0 text-slate-400 transition-opacity hover:text-indigo-600 group-hover:opacity-100" onClick={props.onArchive} title="取消归档" type="button">
            <Archive size={10} />
          </button>
          <button className="grid h-5 w-5 place-items-center rounded opacity-0 text-slate-400 transition-opacity hover:text-rose-600 group-hover:opacity-100" onClick={props.onDelete} title="删除" type="button">
            <Trash2 size={10} />
          </button>
        </>
      )}
    </div>
  );
}
