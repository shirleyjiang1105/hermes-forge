import { AlertTriangle } from "lucide-react";
import { cn } from "../DashboardPrimitives";

export function ConfirmCard(props: { title: string; body: string; tone: "normal" | "danger"; onCancel: () => void; onConfirm: () => void }) {
  return (
    <section className={cn("rounded-xl p-4", props.tone === "danger" ? "bg-rose-50" : "bg-amber-50")}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className={props.tone === "danger" ? "mt-0.5 text-rose-600" : "mt-0.5 text-amber-600"} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13px] font-semibold", props.tone === "danger" ? "text-rose-800" : "text-amber-800")}>{props.title}</p>
          <p className="mt-1 text-[12px] text-slate-600">{props.body}</p>
        </div>
        <div className="flex gap-2">
          <button className={secondaryActionClass} onClick={props.onCancel} type="button">取消</button>
          <button className={cn("rounded-lg px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors", props.tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700")} onClick={props.onConfirm} type="button">确认</button>
        </div>
      </div>
    </section>
  );
}

const secondaryActionClass = "rounded-md px-3 py-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100";