import { useSyncExternalStore } from 'react';
import { getDashboardContext, getDashboardActivities, subscribeDashboard } from '../services/finance/dashboardService';
export function useDashboardContext() { return useSyncExternalStore(subscribeDashboard, getDashboardContext); }
export function useDashboardActivities(modules: readonly string[]) {
  return useSyncExternalStore(subscribeDashboard, () => getDashboardActivities(modules));
}
