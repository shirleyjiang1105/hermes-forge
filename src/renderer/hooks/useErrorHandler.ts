import { useCallback } from "react";
import { useAppStore } from "../store";

export type ErrorCategory = "network" | "validation" | "permission" | "system" | "business";

export interface ErrorInfo {
  message: string;
  detail?: string;
  category: ErrorCategory;
  stack?: string;
}

export function useErrorHandler() {
  const store = useAppStore();

  const handleError = useCallback((error: unknown, context?: string): void => {
    let info: ErrorInfo;

    if (error instanceof Error) {
      info = {
        message: error.message,
        detail: context,
        category: inferCategory(error.message),
        stack: error.stack,
      };
    } else {
      info = {
        message: String(error),
        detail: context,
        category: "system",
      };
    }

    logError(info);
    showNotification(info);
  }, [store]);

  const handleNetworkError = useCallback((context?: string): void => {
    const info: ErrorInfo = {
      message: "网络请求失败",
      detail: context || "请检查网络连接后重试",
      category: "network",
    };
    logError(info);
    store.error(info.message, info.detail);
  }, [store]);

  const handleValidationError = useCallback((message: string, detail?: string): void => {
    const info: ErrorInfo = {
      message,
      detail,
      category: "validation",
    };
    logError(info);
    store.warning(info.message, info.detail);
  }, [store]);

  const handlePermissionError = useCallback((message: string, detail?: string): void => {
    const info: ErrorInfo = {
      message,
      detail,
      category: "permission",
    };
    logError(info);
    store.error(info.message, info.detail);
  }, [store]);

  const safeExecute = useCallback(async <T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (error) {
      handleError(error, context);
      return undefined;
    }
  }, [handleError]);

  return {
    handleError,
    handleNetworkError,
    handleValidationError,
    handlePermissionError,
    safeExecute,
  };
}

function inferCategory(message: string): ErrorCategory {
  if (/network|connection|timeout|fetch|api/i.test(message)) {
    return "network";
  }
  if (/permission|denied|access/i.test(message)) {
    return "permission";
  }
  if (/invalid|validate|required|format/i.test(message)) {
    return "validation";
  }
  return "system";
}

function logError(info: ErrorInfo): void {
  console.error(`[Error] [${info.category}] ${info.message}`, info.detail, info.stack);
}

function showNotification(info: ErrorInfo): void {
  const store = useAppStore.getState();
  switch (info.category) {
    case "network":
      store.error(info.message, info.detail);
      break;
    case "permission":
      store.error(info.message, info.detail);
      break;
    case "validation":
      store.warning(info.message, info.detail);
      break;
    case "business":
      store.warning(info.message, info.detail);
      break;
    default:
      store.error(info.message, info.detail);
  }
}