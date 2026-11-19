import { useSyncExternalStore } from 'react';
import { getDashboardContext, getDashboardActivities, getNativeMovementActivities, subscribeDashboard } from '../services/finance/dashboardService';
export function useDashboardContext() { return useSyncExternalStore(subscribeDashboard, getDashboardContext); }
export function useDashboardActivities(modules: readonly string[], window?: { fromDate: string; toDate: string }) {
  return useSyncExternalStore(subscribeDashboard, () => getDashboardActivities(modules, window));
}

export function useNativeMovementActivities(modules: readonly string[], window?: { fromDate: string; toDate: string }) {
  return useSyncExternalStore(subscribeDashboard, () => getNativeMovementActivities(modules,window));
}
