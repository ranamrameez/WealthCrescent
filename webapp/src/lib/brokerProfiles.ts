import type { Adjustment, Dividend, Transaction, TradePlan, Transfer } from '../types/workbook';

/** Minimal shape shared by QSE and PSX. Market prices/watchlists are exchange
 * data, while trades, cash movements, dividends, and plans belong to a broker. */
export interface BrokerScopedWorkbook<T> {
  activeBrokerId?: string;
  transactions: Transaction[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  dividends: Dividend[];
  tradePlans: TradePlan[];
  [key: string]: unknown;
}

/** Return a calculation/UI-safe view for the active broker without mutating
 * the persisted workbook. Legacy unassigned records remain visible until the
 * store migration has attached them to the default broker. */
export function scopeWorkbookToActiveBroker<T extends BrokerScopedWorkbook<T>>(workbook: T): T {
  const brokerId = workbook.activeBrokerId;
  if (!brokerId) return workbook;
  const belongsToActive = (record: { brokerId?: string }) => !record.brokerId || record.brokerId === brokerId;
  return {
    ...workbook,
    transactions: workbook.transactions.filter(belongsToActive),
    transfers: workbook.transfers.filter(belongsToActive),
    adjustments: workbook.adjustments.filter(belongsToActive),
    dividends: workbook.dividends.filter(belongsToActive),
    tradePlans: workbook.tradePlans.filter(belongsToActive),
  };
}
