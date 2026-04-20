import { useState, useRef, useEffect } from "react";
import { CalendarClock, HelpCircle, PanelRight, Search, Settings, Sparkles, Trash2, ChevronDown, FolderOpen } from "lucide-react";
import type { SessionMetaPatch, WorkSession } from "../../../shared/types";
import { useAppStore } from "../../store";
import { cn } from "../DashboardPrimitives";
import { StatusBar } from "./StatusBar";

export function HermesHeader(props: {
  onRenameSession: (title: string) => void;
  onClearSession: () => void;
  onToggleInspector: () => void;
  onToggleWorkspace: () => void;
  onUpdateActiveSessionMeta: (patch: SessionMetaPatch) => void;
  onOpenSessionFolder: () => void;
  inspectorOpen?: boolean;
}) {
  const store = useAppStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeSession = store.sessions.find((s) => s.id === store.activeSessionId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function startEditing() {
    if (activeSession) {
      setTitleValue(activeSession.title);
      setEditingTitle(true);
    }
  }

  function saveTitle() {
    if (titleValue.trim()) {
      props.onRenameSession(titleValue.trim());
    }
    setEditingTitle(false);
  }

  function cancelEditing() {
    setEditingTitle(false);
    setTitleValue("");
  }

  const menuItems: Array<
    | { divider: true }
    | { icon: typeof HelpCircle; label: string; danger?: boolean; action: () => void }
  > = [
    { icon: HelpCircle, label: "帮助", action: () => { 
      if (window.workbenchClient && typeof window.workbenchClient.openHelp === "function") {
        window.workbenchClient.openHelp();
      } else {
        console.warn("workbenchClient.openHelp not available");
      }
      setShowMenu(false); 
    } },
    { icon: FolderOpen, label: "打开会话文件夹", action: () => { props.onOpenSessionFolder(); setShowMenu(false); } },
    { divider: true },
    { icon: Trash2, label: "清空会话", danger: true, action: () => { props.onClearSession(); setShowMenu(false); } },
  ];

  return (
    <header className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100">
            <Sparkles size={16} className="text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Hermes Forge</span>
        </div>

        {activeSession ? (
          editingTitle ? (
            <div className="flex items-center gap-1">
              <input
                className={inputClass}
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveTitle();
                  else if (event.key === "Escape") cancelEditing();
                }}
                autoFocus
              />
              <button className="grid h-6 w-6 place-items-center rounded text-slate-500" onClick={saveTitle} type="button">
                <CheckIcon />
              </button>
              <button className="grid h-6 w-6 place-items-center rounded text-slate-500" onClick={cancelEditing} type="button">
                <XIcon />
              </button>
            </div>
          ) : (
            <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100" onClick={startEditing} type="button">
              <FileIcon />
              <span className="truncate max-w-[200px]">{activeSession.title}</span>
            </button>
          )
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <StatusBar />
        
        <div className="mx-2 h-4 w-px bg-slate-200" />
        
        <button
          className={cn("grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-all hover:bg-slate-100", store.workspaceDrawerOpen && "bg-indigo-50 text-indigo-600")}
          onClick={props.onToggleWorkspace}
          title="文件树"
          type="button"
        >
          <PanelRight size={16} />
        </button>

        <button
          className={cn("grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-all hover:bg-slate-100", store.inspectorOpen && "bg-indigo-50 text-indigo-600")}
          onClick={props.onToggleInspector}
          title="检查器"
          type="button"
        >
          <Search size={16} />
        </button>

        <div className="mx-2 h-4 w-px bg-slate-200" />

        {!props.inspectorOpen && (
          <div className="relative z-50" ref={menuRef}>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-all hover:bg-slate-100"
              onClick={() => setShowMenu(!showMenu)}
              title="更多选项"
              type="button"
            >
              <ChevronDown size={16} className={showMenu ? "rotate-180 transition-transform" : ""} />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 origin-top-right rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200/50 transition-all duration-150 ease-out">
                {menuItems.map((item, index) => (
                  "divider" in item ? (
                    <div key={index} className="my-1 h-px bg-slate-100" />
                  ) : (
                    <button
                      key={index}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                        item.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"
                      )}
                      onClick={item.action}
                      type="button"
                    >
                      <item.icon size={14} />
                      {item.label}
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

const inputClass = "w-48 rounded-lg border-none bg-slate-100 px-2 py-1 text-sm outline-none ring-1 ring-indigo-200";

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
