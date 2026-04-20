import { MessageSquare, CalendarClock, Sparkles, BookOpen, UserCircle, Settings, Cog, ExternalLink } from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../DashboardPrimitives";

type PanelId = ReturnType<typeof useAppStore.getState>["activePanel"];

export function IconRail() {
  const store = useAppStore();
  const items: Array<{ id: PanelId; label: string; icon: typeof MessageSquare }> = [
    { id: "chat", label: "聊天", icon: MessageSquare },
    { id: "tasks", label: "任务", icon: CalendarClock },
    { id: "skills", label: "技能", icon: Sparkles },
    { id: "memory", label: "记忆", icon: BookOpen },
    { id: "connectors", label: "连接器", icon: ExternalLink },
    { id: "profiles", label: "Agent", icon: UserCircle },
    { id: "settings", label: "设置", icon: Settings },
  ];

  return (
    <nav className="flex h-full w-14 shrink-0 flex-col items-center gap-2 bg-[#f6f7f8] px-1.5 py-3 shadow-[inset_-1px_0_rgba(15,23,42,0.03)]">
      {items.map((item) => {
        const Icon = item.icon;
        const active = store.activePanel === item.id;
        return (
          <button
            key={item.id}
            className={cn(
              "relative grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition-all duration-200",
              "hover:bg-slate-100 hover:text-slate-700",
              active && "bg-indigo-50 text-indigo-600 shadow-[0_2px_8px_rgba(99,102,241,0.15)]"
            )}
            title={item.label}
            type="button"
            onClick={() => store.setActivePanel(item.id)}
          >
            <Icon size={18} strokeWidth={1.5} />
            {active && (
              <span className="absolute bottom-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-indigo-500" />
            )}
          </button>
        );
      })}
      
      <div className="my-2 h-px w-6 bg-slate-200" />
      
      <button
        className="relative grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-700"
        title="配置中心"
        type="button"
        onClick={() => store.setView("settings")}
      >
        <Cog size={18} strokeWidth={1.5} />
      </button>
      
      <div className="mt-auto grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600">
        <Sparkles size={16} />
      </div>
    </nav>
  );
}