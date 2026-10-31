import type { Transaction } from '../../types/workbook';
import { sortTransactionsChronological } from './sortTransactions';

const EPSILON = 1e-7;

export interface TradeQuantityEntry {
  ticker: string;
  action: 'BUY' | 'SELL';
  shares: number;
}

export interface SellQuantityError {
  index: number;
  ticker: string;
  requested: number;
  available: number;
}

/** Validate queued trades in their displayed order against the currently
 * committed holdings. Earlier BUY rows increase the balance available to
 * later SELL rows; earlier SELL rows reserve those shares. */
export function validateSellQuantities(
  entries: TradeQuantityEntry[],
  startingShares: Record<string, number>,
): SellQuantityError | null {
  const available = new Map(Object.entries(startingShares).map(([ticker, shares]) => [ticker.toUpperCase(), Math.max(0, Number(shares) || 0)]));
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const ticker = entry.ticker.trim().toUpperCase();
    if (!ticker || !Number.isFinite(entry.shares) || entry.shares <= 0) continue;
    const held = available.get(ticker) ?? 0;
    if (entry.action === 'SELL') {
      if (entry.shares > held + 1e-7) return { index, ticker, requested: entry.shares, available: held };
      available.set(ticker, Math.max(0, held - entry.shares));
    } else {
      available.set(ticker, held + entry.shares);
    }
  }
  return null;
}

/** Signed percentage difference of an entered trade price from a known
 * market price. A null result means there is no reliable comparison price. */
export function tradePriceDeviationPct(enteredPrice: number, marketPrice: number): number | null {
  if (!Number.isFinite(enteredPrice) || enteredPrice <= 0 || !Number.isFinite(marketPrice) || marketPrice <= 0) return null;
  return ((enteredPrice - marketPrice) / marketPrice) * 100;
}

export interface TransactionEditSellError {
  ticker: string;
  additionalUnmatchedShares: number;
}

/** Compare the full chronological ledgers before and after an edit. This
 * catches historical edits that would create a new oversell (including
 * reducing an earlier BUY), without rejecting legacy discrepancies that
 * already existed before the edit. Pending orders remain excluded exactly
 * as they are from official position accounting. */
export function validateTransactionEdit(
  existingTransactions: Transaction[],
  candidateTransactions: Transaction[],
): TransactionEditSellError | null {
  const unmatchedByTicker = (transactions: Transaction[]) => {
    const balances = new Map<string, number>();
    const unmatched = new Map<string, number>();
    for (const transaction of sortTransactionsChronological(transactions.filter(item => !item.isPending))) {
      const ticker = transaction.ticker.trim().toUpperCase();
      if (!ticker || !Number.isFinite(transaction.shares) || transaction.shares <= 0) continue;
      const held = balances.get(ticker) ?? 0;
      if (transaction.action === 'BUY') {
        balances.set(ticker, held + transaction.shares);
      } else {
        const matched = Math.min(held, transaction.shares);
        balances.set(ticker, Math.max(0, held - matched));
        if (transaction.shares > matched) {
          unmatched.set(ticker, (unmatched.get(ticker) ?? 0) + transaction.shares - matched);
        }
      }
    }
    return unmatched;
  };

  const before = unmatchedByTicker(existingTransactions);
  const after = unmatchedByTicker(candidateTransactions);
  for (const [ticker, totalUnmatched] of after) {
    const previousUnmatched = before.get(ticker) ?? 0;
    if (totalUnmatched > previousUnmatched + EPSILON) {
      return { ticker, additionalUnmatchedShares: totalUnmatched - previousUnmatched };
    }
  }
  return null;
}
