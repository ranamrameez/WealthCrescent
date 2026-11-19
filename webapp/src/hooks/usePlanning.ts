import { useSyncExternalStore } from 'react';
import { getPlanningEditorSources, getPlanningHierarchy, getPlanningOverview, subscribePlanning } from '../services/finance/planningService';

export function usePlanningOverview(filters: Parameters<typeof getPlanningOverview>[0]) {
  return useSyncExternalStore(subscribePlanning, () => getPlanningOverview(filters));
}
export function usePlanningHierarchy(filters: Parameters<typeof getPlanningHierarchy>[0], selected: string | null) {
  return useSyncExternalStore(subscribePlanning, () => getPlanningHierarchy(filters, selected));
}

export function usePlanningEditorSources() { return useSyncExternalStore(subscribePlanning, getPlanningEditorSources); }
