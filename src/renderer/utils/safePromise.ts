import { useAppStore } from "../store";

export interface SafeResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function safePromise<T>(
  promise: Promise<T>,
  options?: {
    errorMessage?: string;
    showNotification?: boolean;
  }
): Promise<SafeResult<T>> {
  const { errorMessage, showNotification = true } = options ?? {};
  const store = useAppStore.getState();

  try {
    const data = await promise;
    return { ok: true, data };
  } catch (error) {
    const message = errorMessage ?? (error instanceof Error ? error.message : "操作失败");
    
    if (showNotification) {
      store.error(message, error instanceof Error ? error.message : undefined);
    }

    console.error("[safePromise] Error:", error);
    return { ok: false, error: message };
  }
}

export async function safePromiseWithFallback<T>(
  promise: Promise<T>,
  fallback: T,
  options?: {
    errorMessage?: string;
    showNotification?: boolean;
  }
): Promise<T> {
  const result = await safePromise(promise, options);
  return result.ok ? result.data! : fallback;
}

export function wrapAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: {
    errorMessage?: string;
    showNotification?: boolean;
  }
): (...args: Parameters<T>) => Promise<SafeResult<Awaited<ReturnType<T>>>> {
  return async (...args: Parameters<T>) => {
    return safePromise(fn(...args) as Promise<Awaited<ReturnType<T>>>, options);
  };
}