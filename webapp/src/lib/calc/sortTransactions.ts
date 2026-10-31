import type { Transaction } from '../../types/workbook';
import { toInstantMs } from '../datetime';

/**
 * Canonical stock transaction chronology: calendar date first, then the
 * persisted shared accounting sequence within that date. For legacy rows
 * without a saved order, an actual recorded time wins; global indexes are
 * retained as the tie-breaker when times are absent or identical.
 */
export function sortTransactionsChronological<T extends Pick<Transaction, 'date' | 'action' | 'time' | 'timezone' | 'seq' | 'transactionIndex' | 'globalTransactionIndex' | 'perTickerIndex' | 'accountingOrder'>>(transactions: T[]): T[] {
  return [...transactions].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate) return byDate;

    const aHasOrder = Number.isInteger(a.accountingOrder);
    const bHasOrder = Number.isInteger(b.accountingOrder);
    if (aHasOrder && bHasOrder && a.accountingOrder !== b.accountingOrder) return a.accountingOrder! - b.accountingOrder!;
    if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

    const byInstant = toInstantMs(a.date, a.time, a.timezone) - toInstantMs(b.date, b.time, b.timezone);
    if ((a.time || b.time) && byInstant !== 0) return byInstant;

    const ai = Number.isInteger(a.globalTransactionIndex) ? a.globalTransactionIndex : Number.isInteger(a.transactionIndex) ? a.transactionIndex : undefined;
    const bi = Number.isInteger(b.globalTransactionIndex) ? b.globalTransactionIndex : Number.isInteger(b.transactionIndex) ? b.transactionIndex : undefined;
    if (ai !== undefined && bi !== undefined && ai !== bi) return ai - bi;
    if (ai !== undefined && bi === undefined) return -1;
    if (ai === undefined && bi !== undefined) return 1;

    if (byInstant !== 0) return byInstant;
    if (a.action !== b.action) return a.action === 'BUY' ? -1 : 1;
    if (a.seq !== undefined && b.seq !== undefined && a.seq !== b.seq) return a.seq - b.seq;
    return (a.seq ?? 0) - (b.seq ?? 0);
  });
}
