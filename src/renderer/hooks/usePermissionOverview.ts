import { useCallback, useEffect, useState } from "react";
import type { PermissionOverview } from "../../shared/types";
import { useAppStore } from "../store";

export function usePermissionOverview(options: { autoLoad?: boolean } = {}) {
  const store = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    if (!window.workbenchClient?.getPermissionOverview) {
      setError("Permission overview client is unavailable.");
      return undefined;
    }
    setLoading(true);
    setError(undefined);
    try {
      const overview = await window.workbenchClient.getPermissionOverview();
      store.setPermissionOverview(overview);
      return overview;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load permission overview.";
      setError(message);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    if (options.autoLoad === false) return;
    void refresh();
  }, [options.autoLoad, refresh]);

  return {
    data: store.permissionOverview as PermissionOverview | undefined,
    loading,
    error,
    refresh,
  };
}

