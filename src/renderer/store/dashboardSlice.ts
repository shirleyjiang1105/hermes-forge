import { combine } from "zustand/middleware";
import type { ActivityLog, DashboardData, DashboardSnapshot, IntentProbeState } from "../../shared/types";
import { emptyDashboardData, emptyDashboardSnapshot } from "../../shared/types";

export interface DashboardState {
  dashboard: DashboardSnapshot;
  dashboardData: DashboardData;
}

export interface DashboardActions {
  setDashboardSnapshot(snapshot: DashboardSnapshot): void;
  setDashboardData(data: DashboardData): void;
  setIntentProbe(probe: IntentProbeState): void;
  pushActivityLog(log: ActivityLog): void;
  pushDashboardActivity(log: ActivityLog): void;
}

export const dashboardSlice = combine<DashboardState, DashboardActions>(
  {
    dashboard: emptyDashboardSnapshot,
    dashboardData: emptyDashboardData,
  },
  (set) => ({
    setDashboardSnapshot: (snapshot: DashboardSnapshot) => set({ dashboard: snapshot }),
    setDashboardData: (data: DashboardData) => set({ dashboardData: data }),
    setIntentProbe: (probe: IntentProbeState) =>
      set((state) => ({ dashboard: { ...state.dashboard, intentProbe: probe } })),
    pushActivityLog: (log: ActivityLog) =>
      set((state) => ({
        dashboardData: {
          ...state.dashboardData,
          activityLogs: [log, ...state.dashboardData.activityLogs].slice(0, 100),
        },
      })),
    pushDashboardActivity: (log: ActivityLog) =>
      set((state) => ({
        dashboard: {
          ...state.dashboard,
          activityLogs: [log, ...state.dashboard.activityLogs].slice(0, 100),
        },
      })),
  })
);
