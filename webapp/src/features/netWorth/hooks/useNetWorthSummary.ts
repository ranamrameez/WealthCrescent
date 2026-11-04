import { useSyncExternalStore } from 'react';
import { getNetWorthSummary, getScopedNetWorthInputs, subscribeNetWorthSummary } from '../../../services/finance/netWorthService';
import type { CurrencyNetWorth } from '../../../lib/calc/netWorth';

export interface NetWorthSummary { rows: CurrencyNetWorth[]; biggestExposureCurrency: string; }

/** Presentation adapter: ownership, subscriptions and calculations live in the service. */
export function useNetWorthSummary(selectedModules?: string[]): NetWorthSummary {
  return useSyncExternalStore(subscribeNetWorthSummary, () => getNetWorthSummary(selectedModules));
}

export function useNetWorthInputs(selectedModules?: readonly string[]) {
  return useSyncExternalStore(subscribeNetWorthSummary, () => getScopedNetWorthInputs(selectedModules));
}
