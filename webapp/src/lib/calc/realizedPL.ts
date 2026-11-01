import type { FeeCalculator, RealizedPLPoint, Transaction } from '../../types/workbook';
import { sortTransactionsChronological } from './sortTransactions';

const EPSILON = 1e-7;

/** Chronological weighted-average realized P/L series. Pending and invalid
 * oversell transactions are excluded so the series cannot manufacture profit
 * from shares that were never held. */
export function computeRealizedPLTimeSeries(transactions: Transaction[], calcFee: FeeCalculator): RealizedPLPoint[] {
  const byTicker: Record<string, { shares: number; cost: number }> = {};
  const points: RealizedPLPoint[] = [];
  const sorted = sortTransactionsChronological(transactions.filter((t) => !t.isPending));
  let running = 0;

  for (const tx of sorted) {
    const t = tx.ticker;
    if (!byTicker[t]) byTicker[t] = { shares: 0, cost: 0 };
    if (tx.action === 'SELL' && tx.shares > byTicker[t].shares + EPSILON) continue;

    const amount = tx.shares * tx.price;
    const fee = calcFee(amount, tx.action === 'BUY', { shares: tx.shares, tx });
    if (tx.action === 'BUY') {
      byTicker[t].shares += tx.shares;
      byTicker[t].cost += amount + fee;
      continue;
    }

    const avg = byTicker[t].shares > 0 ? byTicker[t].cost / byTicker[t].shares : 0;
    const costRemoved = avg * tx.shares;
    running += amount - fee - costRemoved;
    byTicker[t].shares -= tx.shares;
    byTicker[t].cost -= costRemoved;
    if (byTicker[t].shares < EPSILON) {
      byTicker[t].shares = 0;
      byTicker[t].cost = 0;
    }
    points.push({ date: tx.date, value: running });
  }

  return points;
}

/** Per-SELL realized P/L for the weighted-average method, keyed by stable
 * transaction id. This keeps the inline transaction-row insight aligned
 * with the official average-cost engine instead of borrowing lot-attributed
 * FIFO/lowest-cost results from the closed-trade reporting ledger. */
export function computeAveragePLBySellTxId(
  transactions: Transaction[],
  calcFee: FeeCalculator,
): Record<string, { netPL: number; shares: number }> {
  const byTicker: Record<string, { shares: number; cost: number }> = {};
  const out: Record<string, { netPL: number; shares: number }> = {};

  for (const tx of sortTransactionsChronological(transactions.filter((t) => !t.isPending))) {
    const ticker = tx.ticker;
    if (!byTicker[ticker]) byTicker[ticker] = { shares: 0, cost: 0 };
    const position = byTicker[ticker];

    // Short positions are not modeled. Ignore an unmatched sale consistently
    // with computePositions and computeRealizedPLTimeSeries.
    if (tx.action === 'SELL' && tx.shares > position.shares + EPSILON) continue;

    const amount = tx.shares * tx.price;
    const fee = calcFee(amount, tx.action === 'BUY', { shares: tx.shares, tx });
    if (tx.action === 'BUY') {
      position.shares += tx.shares;
      position.cost += amount + fee;
      continue;
    }

    const averageCost = position.shares > 0 ? position.cost / position.shares : 0;
    const costRemoved = averageCost * tx.shares;
    if (tx.id) out[tx.id] = { netPL: amount - fee - costRemoved, shares: tx.shares };
    position.shares -= tx.shares;
    position.cost -= costRemoved;
    if (position.shares < EPSILON) {
      position.shares = 0;
      position.cost = 0;
    }
  }

  return out;
}
