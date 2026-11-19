import { useMemo, useSyncExternalStore } from 'react';
import { getBankAnalyticsAccounts, getBankDirectory, getBankAccount, getBankingScopeSummary, getBankCategories, getBankAccountAnalytics, subscribeBankQueries } from '../services/finance/bankService';
import type { BankingReadFilters } from '../lib/calc/bankReadModel';
import type { PlannedBankTransaction } from '../types/plannedBank';
export function useBankAccount(id: string | undefined, filters: BankingReadFilters) { return useSyncExternalStore(subscribeBankQueries, () => getBankAccount(id, filters)); }
export function useBankingScopeSummary(ids: readonly string[], filters: BankingReadFilters, plans?: PlannedBankTransaction[], includeCards = true, bankId?: string) {
  return useSyncExternalStore(subscribeBankQueries, () => getBankingScopeSummary(ids, filters, plans, includeCards, bankId));
}

export function useBankAccountAnalytics(input: Parameters<typeof getBankAccountAnalytics>[0]) {
  const categories = useSyncExternalStore(subscribeBankQueries, getBankCategories);
  return useMemo(() => getBankAccountAnalytics(input), [input.ledger, input.pendingRows, input.plans, input.startingBalance, input.balanceLedger, input.closingBalance, categories]);
}

export function useBankDirectory(showArchived = false) { return useSyncExternalStore(subscribeBankQueries, () => getBankDirectory(showArchived)); }

export function useBankAnalyticsAccounts(bankId: string | undefined, accountId: string) { return useSyncExternalStore(subscribeBankQueries, () => getBankAnalyticsAccounts(bankId, accountId)); }
