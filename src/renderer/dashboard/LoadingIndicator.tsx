import { Loader2 } from "lucide-react";
import { cn } from "./DashboardPrimitives";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  inline?: boolean;
}

export function LoadingIndicator(props: LoadingProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  if (props.inline) {
    return (
      <span className="inline-flex items-center gap-2">
        <Loader2 className={cn(sizeClasses[props.size || "sm"], "animate-spin")} strokeWidth={1.5} />
        {props.text && <span className={textSizeClasses[props.size || "sm"]}>{props.text}</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={cn(sizeClasses[props.size || "lg"], "animate-spin text-indigo-600")} strokeWidth={1.5} />
      {props.text && <p className={cn("text-slate-500", textSizeClasses[props.size || "lg"])}>{props.text}</p>}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-indigo-200 opacity-75" />
          <div className="relative h-10 w-10 rounded-full bg-indigo-500" />
        </div>
        <p className="text-sm text-slate-500">正在加载...</p>
      </div>
    </div>
  );
}

export function PulseLoader() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" style={{ animationDelay: "0ms" }} />
      <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: "150ms" }} />
      <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-300" style={{ animationDelay: "300ms" }} />
    </div>
  );
}