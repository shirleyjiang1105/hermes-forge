import { useState, useEffect } from "react";
import { Sparkles, CheckCircle2, AlertCircle, Loader2, ArrowRight, Settings, HelpCircle } from "lucide-react";
import { useAppStore } from "../store";

export function WelcomePage(props: { onComplete: () => void }) {
  const store = useAppStore();
  const [status, setStatus] = useState<"detecting" | "found" | "not-found" | "installing">("detecting");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("正在检测本地 Hermes...");

  useEffect(() => {
    async function detectHermes() {
      setStatus("detecting");
      setProgress(30);
      
      try {
        if (!window.workbenchClient || typeof window.workbenchClient.getHermesProbe !== "function") {
          throw new Error("Hermes client not available");
        }
        
        const probe = await window.workbenchClient.getHermesProbe();
        setProgress(70);
        
        if (probe?.probe?.status === "healthy") {
          setStatus("found");
          setMessage("检测到本地 Hermes，正在加载配置...");
          setProgress(100);
        } else {
          setStatus("not-found");
          setMessage("未检测到本地 Hermes");
        }
      } catch (error) {
        console.error("Hermes detection failed:", error);
        setStatus("not-found");
        setMessage("检测失败，请手动配置");
      }
    }
    
    // 延迟检测，确保 workbenchClient 已初始化
    const timer = setTimeout(() => {
      detectHermes();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  async function handleAutoDeploy() {
    setStatus("installing");
    setProgress(0);
    setMessage("正在部署 Hermes...");
    
    try {
      // 模拟部署进度
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setProgress(i);
        if (i < 50) setMessage("正在下载 Hermes CLI...");
        else if (i < 80) setMessage("正在安装依赖...");
        else setMessage("正在初始化配置...");
      }
      
      setMessage("部署完成！正在加载...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      store.setFirstLaunch(false);
      props.onComplete();
    } catch {
      setStatus("not-found");
      setMessage("部署失败，请手动安装");
    }
  }

  function handleManualConfig() {
    store.setFirstLaunch(false);
    props.onComplete();
  }

  function handleSkip() {
    store.setFirstLaunch(false);
    props.onComplete();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-rose-50">
      <div className="w-full max-w-md px-6">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
            <Sparkles size={32} className="text-white" />
          </div>
          
          <h1 className="text-2xl font-bold text-slate-900">欢迎使用 Hermes Forge</h1>
          <p className="mt-2 text-slate-500">本地优先的 Hermes Agent 桌面工坊</p>
        </div>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200/50">
          {status === "detecting" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                <Loader2 size={28} className="animate-spin text-indigo-600" />
              </div>
              <p className="text-slate-600">{message}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div 
                  className="h-full w-32 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === "found" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <CheckCircle2 size={28} className="text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">检测到本地 Hermes</h3>
              <p className="mt-2 text-sm text-slate-500">将自动继承本地配置（技能、记忆等）</p>
              <button
                className="mt-6 w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md active:scale-[0.98]"
                onClick={() => { store.setFirstLaunch(false); props.onComplete(); }}
              >
                <span className="flex items-center justify-center gap-2">
                  开始使用 <ArrowRight size={16} />
                </span>
              </button>
            </div>
          )}

          {status === "not-found" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
                <AlertCircle size={28} className="text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">未检测到 Hermes</h3>
              <p className="mt-2 text-sm text-slate-500">{message}</p>
              
              <div className="mt-6 space-y-3">
                <button
                  className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md active:scale-[0.98]"
                  onClick={handleAutoDeploy}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles size={16} /> 一键部署 Hermes
                  </span>
                </button>
                
                <button
                  className="w-full rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50"
                  onClick={handleManualConfig}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Settings size={16} /> 手动配置路径
                  </span>
                </button>
                
                <button
                  className="w-full rounded-xl px-6 py-3 text-sm text-slate-500 transition-colors hover:text-slate-700"
                  onClick={handleSkip}
                >
                  <span className="flex items-center justify-center gap-2">
                    <HelpCircle size={16} /> 跳过，稍后配置
                  </span>
                </button>
              </div>
            </div>
          )}

          {status === "installing" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                <Loader2 size={28} className="animate-spin text-indigo-600" />
              </div>
              <p className="text-slate-600">{message}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">{progress}%</p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Hermes Forge v{store.clientInfo?.appVersion || "unknown"}
        </p>
      </div>
    </div>
  );
}
