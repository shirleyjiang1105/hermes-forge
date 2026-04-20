import { Save } from "lucide-react";
import type { HermesCronJob } from "../../../shared/types";
import { cn } from "../DashboardPrimitives";

export function CronEditor(props: { value: Partial<HermesCronJob>; onChange: (value: Partial<HermesCronJob>) => void; onCancel: () => void; onSave: () => void }) {
  return (
    <section className={editorPanelClass}>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextInput label="名称" value={props.value.name ?? ""} onChange={(name) => props.onChange({ ...props.value, name })} />
        <TextInput label="计划" value={props.value.schedule ?? ""} placeholder="manual / RRULE / cron" onChange={(schedule) => props.onChange({ ...props.value, schedule })} />
      </div>
      <textarea className={cn("mt-2 h-28", textareaClass)} placeholder="任务 prompt" value={props.value.prompt ?? ""} onChange={(event) => props.onChange({ ...props.value, prompt: event.target.value })} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-slate-600">
          <input type="checkbox" checked={props.value.status !== "paused"} onChange={(event) => props.onChange({ ...props.value, status: event.target.checked ? "active" : "paused" })} />
          启用任务
        </label>
        <FormActions onCancel={props.onCancel} onSave={props.onSave} disabled={!props.value.name?.trim()} />
      </div>
    </section>
  );
}

const editorPanelClass = "rounded-2xl bg-[#f9f9fa] p-4";
const inputClass = "rounded-xl bg-white px-3 py-2 text-[13px] font-normal text-slate-800 outline-none ring-1 ring-slate-100 transition-shadow focus:ring-2 focus:ring-indigo-100";
const textareaClass = "w-full rounded-xl bg-white p-3 text-[13px] outline-none ring-1 ring-slate-100 transition-shadow focus:ring-2 focus:ring-indigo-100";

function TextInput(props: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
      {props.label}
      <input className={inputClass} placeholder={props.placeholder} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function FormActions(props: { onCancel: () => void; onSave: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2">
      <button className={secondaryActionClass} onClick={props.onCancel} type="button">取消</button>
      <button className={primaryActionClass} disabled={props.disabled} onClick={props.onSave} type="button">
        <Save size={13} /> 保存
      </button>
    </div>
  );
}

const primaryActionClass = "inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryActionClass = "rounded-md px-3 py-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100";