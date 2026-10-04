import type { FeeCalculator, Position, PricePoint, Transaction } from '../../types/workbook';
import { computePositions } from './positions';
import { computeFIFOPositions } from './fifoPositions';
import { sortTransactionsChronological } from './sortTransactions';

export type StockBasisMethod = 'average' | 'fifo' | 'lowestCostFirst';
export interface StockPLPoint {
  date: string; label: string; realized: number; realizedChange: number;
  unrealized: number | null; unrealizedTradeChange: number | null;
  total: number | null; dayTrade: boolean; trades: number; quoteDates: string[];
}

/** Reconstruct full cost basis first; date filters belong in the view, not accounting.
 * Trade effects use the same as-of quote before/after, isolating trading from price movement.
 * Quotes are carried forward, never backward. Missing quotes leave unrealized P/L unknown.
 */
export function stockPLHistory(transactions: Transaction[], priceHistory: Record<string, PricePoint[]>, calcFee: FeeCalculator, method: StockBasisMethod = 'average') {
  const completed = sortTransactionsChronological(transactions.filter(tx => !tx.isPending)).sort((a, b) => a.date.localeCompare(b.date));
  if (!completed.length) return { daily: [], entries: [] };
  const quotes = Object.fromEntries(Object.entries(priceHistory).map(([ticker, points]) => [ticker, [...points].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))]));
  const positionFor = (txs: Transaction[]) => method === 'average' ? computePositions(txs, calcFee) : computeFIFOPositions(txs, calcFee, method).positions;
  const realizedFor = (positions: Position[]) => positions.reduce((sum, p) => sum + p.realized, 0);
  const mark = (positions: Position[], date: string) => {
    let value = 0;
    const quoteDates: string[] = [];
    for (const p of positions.filter(p => p.shares > 0)) {
      const quote = quotes[p.ticker]?.filter(point => point.date <= date).at(-1);
      if (!quote || quote.price <= 0) return { value: null, quoteDates };
      quoteDates.push(quote.date);
      const gross = p.shares * quote.price;
      value += gross - calcFee(gross, false, { shares: p.shares }) - p.invested;
    }
    return { value, quoteDates };
  };
  const dates = [...new Set([...completed.map(tx => tx.date), ...Object.values(quotes).flat().map(p => p.date)])].filter(date => date >= completed[0].date).sort();
  const daily: StockPLPoint[] = [], entries: StockPLPoint[] = [];
  const prefix: Transaction[] = [];
  let cursor = 0;
  let currentPositions: Position[] = [];
  for (const date of dates) {
    const before = currentPositions;
    const beforeRealized = realizedFor(before);
    const opening = mark(before, date);
    const todays: Transaction[] = [];
    while (cursor < completed.length && completed[cursor].date <= date) {
      const tx = completed[cursor++];
      const beforeEntry = currentPositions, openingEntry = mark(beforeEntry, date);
      prefix.push(tx); todays.push(tx);
      const afterEntry = positionFor(prefix), closingEntry = mark(afterEntry, date);
      currentPositions = afterEntry;
      const realized = realizedFor(afterEntry);
      entries.push({ date, label: `${date} ${tx.time ?? ''} ${tx.ticker} ${tx.action} #${entries.length + 1}`.trim(), realized,
        realizedChange: realized - realizedFor(beforeEntry), unrealized: closingEntry.value,
        unrealizedTradeChange: openingEntry.value === null || closingEntry.value === null ? null : closingEntry.value - openingEntry.value,
        total: closingEntry.value === null ? null : realized + closingEntry.value, dayTrade: false, trades: 1, quoteDates: closingEntry.quoteDates });
    }
    const after = currentPositions, closing = mark(after, date), realized = realizedFor(after);
    const dayTrade = todays.some(tx => tx.action === 'BUY' && todays.some(other => other.ticker === tx.ticker && other.action === 'SELL'));
    for (const entry of entries.filter(entry => entry.date === date)) entry.dayTrade = dayTrade;
    daily.push({ date, label: date, realized, realizedChange: realized - beforeRealized, unrealized: closing.value,
      unrealizedTradeChange: opening.value === null || closing.value === null ? null : closing.value - opening.value,
      total: closing.value === null ? null : realized + closing.value, dayTrade, trades: todays.length, quoteDates: closing.quoteDates });
  }
  return { daily, entries };
}
