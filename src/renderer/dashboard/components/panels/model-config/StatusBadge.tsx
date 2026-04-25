import { cn } from "../../../DashboardPrimitives";

export type StatusTone = "success" | "warning" | "error" | "muted" | "default" | "selected";

/**
 * Compact status badge used across the model settings UI.
 */
export function StatusBadge(props: { label: string; tone: StatusTone }) {
  const className =
    props.tone === "success" ? "bg-emerald-50 text-emerald-700" :
    props.tone === "warning" ? "bg-amber-50 text-amber-700" :
    props.tone === "error" ? "bg-rose-50 text-rose-700" :
    props.tone === "default" ? "bg-slate-100 text-slate-700" :
    props.tone === "selected" ? "bg-slate-900 text-white" :
    "bg-slate-100 text-slate-600";
  return <span className={cn("inline-flex shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold", className)}>{props.label}</span>;
}
