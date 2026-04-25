import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Bot, KeyRound, MonitorCog, ShieldCheck } from "lucide-react";
import { cn } from "../../DashboardPrimitives";

export type ConfigSectionId = "general" | "providers" | "secrets" | "health";

type ConfigSection = {
  id: ConfigSectionId;
  label: string;
  icon: LucideIcon;
  description: string;
};

const SECTIONS: ConfigSection[] = [
  {
    id: "general",
    icon: MonitorCog,
    label: "Hermes",
    description: "路径、预热、权限",
  },
  {
    id: "providers",
    icon: Bot,
    label: "模型",
    description: "来源、测试、默认模型",
  },
  {
    id: "secrets",
    icon: KeyRound,
    label: "密钥",
    description: "本地保存状态",
  },
  {
    id: "health",
    icon: ShieldCheck,
    label: "诊断",
    description: "阻塞项与修复",
  },
];

export function ConfigCenterLayout(props: {
  activeSection: ConfigSectionId;
  onSectionChange: (section: ConfigSectionId) => void;
  title?: string;
  description?: string;
  saveNotice?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="absolute inset-0 overflow-auto bg-[#FAFAFA] text-slate-900">
      <div className="mx-auto flex min-h-full w-full max-w-6xl gap-7 px-7 py-8">
        <aside className="sticky top-0 h-fit w-[236px] shrink-0 rounded-[28px] bg-white/95 p-3 shadow-[0_24px_90px_rgba(15,23,42,0.065)] ring-1 ring-slate-200/55 backdrop-blur">
          <div className="px-4 pb-5 pt-3">
            <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-slate-950">
              {props.title ?? "配置中心"}
            </h1>
            <p className="mt-2 text-[12px] leading-5 text-slate-500">
              {props.description ?? "集中管理 Hermes、模型、密钥和系统健康状态。"}
            </p>
          </div>

          <nav className="mt-1 space-y-1.5">
            {SECTIONS.map((section) => {
              const active = props.activeSection === section.id;
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => props.onSectionChange(section.id)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-all duration-200",
                    active
                      ? "bg-slate-100/80 text-slate-950"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <span className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition", active ? "bg-slate-700" : "bg-transparent")} />
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl transition", active ? "bg-white text-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.06)]" : "bg-slate-50 text-slate-400")}>
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-[13px]", active ? "font-semibold" : "font-medium")}>
                      {section.label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        active ? "text-slate-500" : "text-slate-400",
                      )}
                    >
                      {section.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-5 px-3 pb-1 pt-3">
            <button
              type="button"
              onClick={props.onBack}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 active:translate-y-px"
            >
              <ArrowLeft size={14} />
              返回工作台
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex min-h-[36px] items-center justify-end">
              {props.saveNotice ? (
                <span className="rounded-full bg-emerald-50 px-3.5 py-1.5 text-[12px] font-medium text-emerald-700 shadow-[0_8px_24px_rgba(16,185,129,0.08)] ring-1 ring-emerald-200/60">
                  {props.saveNotice}
                </span>
              ) : null}
            </div>

            <div className="rounded-[30px] bg-white p-8 shadow-[0_28px_100px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/45">
              {props.children}
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}
