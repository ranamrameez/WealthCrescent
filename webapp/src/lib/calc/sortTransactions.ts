import type { Transaction } from '../../types/workbook';
import { toInstantMs } from '../datetime';

/**
 * Canonical processing order for stock transactions. A persisted transactionIndex
 * is authoritative even when it intentionally crosses trade dates; this is the
 * accounting order users can explicitly correct after imports or statement review.
 * Legacy/unindexed records retain the safe chronological fallback, including the
 * BUY-before-SELL rule for exact-instant ties that prevents phantom oversells.
 */
export function sortTransactionsChronological<T extends Pick<Transaction, 'date' | 'action' | 'time' | 'timezone' | 'seq' | 'transactionIndex'>>(transactions: T[]): T[] {
  return [...transactions].sort((a, b) => {
    const ai = Number.isInteger(a.transactionIndex) ? a.transactionIndex : undefined;
    const bi = Number.isInteger(b.transactionIndex) ? b.transactionIndex : undefined;
    if (ai !== undefined && bi !== undefined && ai !== bi) return ai - bi;
    if (ai !== undefined && bi === undefined) return -1;
    if (ai === undefined && bi !== undefined) return 1;

    const byInstant = toInstantMs(a.date, a.time, a.timezone) - toInstantMs(b.date, b.time, b.timezone);
    if (byInstant !== 0) return byInstant;
    if (a.action !== b.action) return a.action === 'BUY' ? -1 : 1;
    if (a.seq !== undefined && b.seq !== undefined && a.seq !== b.seq) return a.seq - b.seq;
    return (a.seq ?? 0) - (b.seq ?? 0);
  });
}
