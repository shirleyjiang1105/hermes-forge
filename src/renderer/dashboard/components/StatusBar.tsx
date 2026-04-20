import { useAppStore } from "../../store";
import { cn } from "../DashboardPrimitives";
import { Wifi, WifiOff, Server, ServerOff, CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

export function StatusBar() {
  const store = useAppStore();
  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [hermesStatus, setHermesStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkApiStatus = useCallback(async () => {
    setApiStatus("checking");
    
    if (!window.workbenchClient || typeof window.workbenchClient.getClientInfo !== "function") {
      setApiStatus("disconnected");
      return;
    }

    try {
      const result = await window.workbenchClient.getClientInfo();
      // 真正验证 API 是否正常工作
      if (result && typeof result === "object") {
        setApiStatus("connected");
      } else {
        setApiStatus("disconnected");
      }
    } catch (error) {
      console.error("API check failed:", error);
      setApiStatus("disconnected");
    }
  }, []);

  const checkHermesStatus = useCallback(async () => {
    setHermesStatus("checking");

    // 尝试调用 Hermes 相关 API 来验证
    if (!window.workbenchClient || typeof window.workbenchClient.getHermesProbe !== "function") {
      // 回退到检查 store 中的状态
      const hermes = store.hermesStatus;
      setHermesStatus(hermes?.engine?.available ? "connected" : "disconnected");
      return;
    }

    try {
      const probe = await window.workbenchClient.getHermesProbe();
      if (probe?.probe?.status === "healthy") {
        setHermesStatus("connected");
      } else {
        setHermesStatus("disconnected");
      }
    } catch (error) {
      console.error("Hermes check failed:", error);
      // 回退到检查 store 中的状态
      const hermes = store.hermesStatus;
      setHermesStatus(hermes?.engine?.available ? "connected" : "disconnected");
    }
  }, [store.hermesStatus]);

  const checkAllStatus = useCallback(async () => {
    await Promise.all([checkApiStatus(), checkHermesStatus()]);
    setLastChecked(new Date().toLocaleTimeString("zh-CN"));
  }, [checkApiStatus, checkHermesStatus]);

  useEffect(() => {
    // 初始检查
    const initialTimer = setTimeout(checkAllStatus, 500);
    
    // 每10秒自动检查一次
    const interval = setInterval(checkAllStatus, 10000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkAllStatus]);

  const handleRefresh = () => {
    checkAllStatus();
  };

  const statusItems = [
    {
      key: "api",
      label: "API",
      icon: apiStatus === "connected" ? Wifi : apiStatus === "disconnected" ? WifiOff : Loader2,
      status: apiStatus,
      color: apiStatus === "connected" ? "text-emerald-600" : apiStatus === "disconnected" ? "text-rose-600" : "text-slate-400",
      bgColor: apiStatus === "connected" ? "bg-emerald-50" : apiStatus === "disconnected" ? "bg-rose-50" : "bg-slate-50",
      tooltip: apiStatus === "connected" ? "API 服务正常" : apiStatus === "disconnected" ? "API 服务不可用" : "正在检查 API...",
    },
    {
      key: "hermes",
      label: "Hermes",
      icon: hermesStatus === "connected" ? Server : hermesStatus === "disconnected" ? ServerOff : Loader2,
      status: hermesStatus,
      color: hermesStatus === "connected" ? "text-emerald-600" : hermesStatus === "disconnected" ? "text-rose-600" : "text-slate-400",
      bgColor: hermesStatus === "connected" ? "bg-emerald-50" : hermesStatus === "disconnected" ? "bg-rose-50" : "bg-slate-50",
      tooltip: hermesStatus === "connected" ? "Hermes 已连接" : hermesStatus === "disconnected" ? "Hermes 未连接或不可用" : "正在检查 Hermes...",
    },
  ];

  return (
    <div className="flex items-center gap-3">
      {statusItems.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1",
              item.bgColor
            )}
            title={`${item.tooltip}${lastChecked ? ` (最后检查: ${lastChecked})` : ""}`}
          >
            <Icon size={12} className={item.color} />
            <span className={cn("text-[11px] font-medium", item.color)}>
              {item.label}
              {item.status === "checking" && " ..."}
            </span>
            {item.status !== "checking" && (
              item.status === "connected"
                ? <CheckCircle2 size={10} className={item.color} />
                : <AlertCircle size={10} className={item.color} />
            )}
          </div>
        );
      })}
      
      <button
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        onClick={handleRefresh}
        type="button"
        title="刷新状态"
      >
        <RefreshCw size={10} />
        刷新
      </button>
    </div>
  );
}
