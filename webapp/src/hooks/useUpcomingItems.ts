import { useCallback, useSyncExternalStore } from 'react';
import { getUpcomingItems, subscribeUpcomingItems } from '../services/finance/upcomingService';
import type { UpcomingItem } from '../lib/calc/upcoming';

/** Presentation adapter for the application-owned Upcoming query. */
export function useUpcomingItems(windowDays = 14): UpcomingItem[] {
  const subscribe = useCallback((listener: () => void) => subscribeUpcomingItems(listener), []);
  const getSnapshot = useCallback(() => getUpcomingItems(windowDays), [windowDays]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
