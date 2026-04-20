import type { ProjectGroup } from "../../../../shared/types";
import { useAppStore } from "../../../store";

type ProjectWithRecentSessions = ProjectGroup & {
  recentSessions?: Array<{ id: string; title: string; active?: boolean }>;
};

export function ProjectsPanel() {
  const store = useAppStore();
  const projects = store.webUiOverview?.projects ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7.5 17 3 20l1.5-4.5L16.5 3.5z" />
        </svg>
        <span>按项目分组管理会话。</span>
      </div>

      {projects.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project: ProjectWithRecentSessions) => (
            <section
              key={project.id}
              className="group rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:border-slate-200 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div
                  className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl"
                  style={{ backgroundColor: project.color + "20" }}
                >
                  <span className="text-xl font-bold" style={{ color: project.color }}>
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">{project.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">{project.sessionCount} 个会话</p>
                </div>
              </div>

              {project.recentSessions?.length ? (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">最近会话</p>
                  <div className="space-y-1">
                    {project.recentSessions.map((session) => (
                      <button
                        key={session.id}
                        className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          session.active
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => useAppStore.getState().setActiveSession(session.id)}
                        type="button"
                      >
                        <span className="truncate">{session.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7.5 17 3 20l1.5-4.5L16.5 3.5z" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-slate-500">暂无项目</p>
          <p className="mt-1 text-xs text-slate-400">会话会根据工作区路径自动分组</p>
        </div>
      )}
    </div>
  );
}
