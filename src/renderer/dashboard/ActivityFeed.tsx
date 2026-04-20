import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ActivityLog } from "../../shared/types";
import { cn, engineLabel, formatShortDate } from "./DashboardPrimitives";

export function ActivityFeed(props: { logs: ActivityLog[] }) {
  const logs = props.logs.slice(0, 8);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] ring-1 ring-slate-100/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-slate-900">活动时间线</h3>
        <span className="text-[12px] text-slate-400">最近 {logs.length} 条</span>
      </div>
      <div className="divide-y divide-slate-100">
        {logs.map((log) => (
          <ActivityItem key={log.id} log={log} />
        ))}
        {logs.length === 0 && <p className="rounded-lg px-3 py-8 text-center text-[13px] text-slate-400">还没有任务记录，输入一个任务开始。</p>}
      </div>
    </section>
  );
}

function ActivityItem(props: { log: ActivityLog }) {
  const StatusIcon = statusIcon(props.log.status);
  return (
    <article className="cursor-pointer rounded-lg p-3 transition-colors hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", statusDot(props.log.status), props.log.status === "running" && "animate-pulse")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <StatusIcon className={statusText(props.log.status)} size={15} strokeWidth={1.75} />
              <span className="truncate text-[13px] font-semibold text-slate-800">{typeLabel(props.log.type)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <EngineBadge engineId={props.log.engineId} />
              <span className="text-[12px] text-slate-400">{formatShortDate(props.log.timestamp)}</span>
            </div>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-slate-500">{props.log.summary}</p>
        </div>
      </div>
    </article>
  );
}

function EngineBadge(props: { engineId: ActivityLog["engineId"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        props.engineId === "hermes"
          ? "bg-indigo-50/70 text-indigo-700"
          : "bg-slate-100 text-slate-600",
      )}
    >
      {engineLabel(props.engineId)}
    </span>
  );
}

function statusIcon(status: ActivityLog["status"]) {
  if (status === "success") return CheckCircle2;
  if (status === "failed") return XCircle;
  return Loader2;
}

function statusDot(status: ActivityLog["status"]) {
  if (status === "success") return "bg-indigo-500";
  if (status === "failed") return "bg-rose-500";
  return "bg-indigo-400";
}

function statusText(status: ActivityLog["status"]) {
  if (status === "success") return "text-indigo-500";
  if (status === "failed") return "text-rose-500";
  return "text-indigo-400";
}

function typeLabel(type: ActivityLog["type"]) {
  if (type === "generate") return "生成任务";
  if (type === "analyze") return "分析任务";
  return "修复任务";
}
