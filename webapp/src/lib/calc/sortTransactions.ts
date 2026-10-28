import type { Transaction } from '../../types/workbook';

/** Canonical accounting order. transactionIndex is the persisted lifetime sequence
 * and deliberately overrides effective trade date/time and BUY/SELL type. This
 * permits late-entered historical trades and manual same-day corrections to be
 * accounted in the user's intended order. Legacy rows are normalized by the store. */
export function sortTransactionsChronological<T extends Pick<Transaction, 'transactionIndex' | 'date' | 'action' | 'time' | 'timezone' | 'seq' | 'timestamp'>>(transactions: T[]): T[] {
  return [...transactions].sort((a, b) => {
    const ai = a.transactionIndex;
    const bi = b.transactionIndex;
    if (ai !== undefined && bi !== undefined && ai !== bi) return ai - bi;
    if (ai !== undefined && bi === undefined) return -1;
    if (ai === undefined && bi !== undefined) return 1;
    // Compatibility only for raw/legacy rows not yet normalized by the store.
    // Persisted workbooks are assigned transactionIndex before calculations.
    if (ai === undefined && bi === undefined) {
      if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const at = a.time ?? '';
      const bt = b.time ?? '';
      if (at !== bt) return at.localeCompare(bt);
      return (a.seq ?? 0) - (b.seq ?? 0);
    }
    return 0;
  });
}
