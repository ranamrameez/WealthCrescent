import type { FeeCalculator, Position, Transaction } from '../../types/workbook';
import { sortTransactionsChronological } from './sortTransactions';

const EPSILON = 1e-7;

/** Weighted-average-cost position rollup per ticker. Pending transactions are
 * excluded. For legacy oversells, only the quantity backed by tracked holdings
 * closes; unmatched shares/fees are exposed separately and never create
 * zero-cost realized profit. New oversells are blocked by trade-entry forms. */
export function computePositions(transactions: Transaction[], calcFee: FeeCalculator): Position[] {
  const byTicker: Record<string, Position> = {};
  const sorted = sortTransactionsChronological(transactions.filter((t) => !t.isPending));

  for (const tx of sorted) {
    const t = tx.ticker;
    if (!byTicker[t]) {
      byTicker[t] = { ticker: t, shares: 0, invested: 0, buyFees: 0, sellFees: 0, realized: 0, totalBoughtShares: 0, totalSoldShares: 0, buyCount: 0, sellCount: 0, firstDate: tx.date, lastDate: tx.date };
    }
    const p = byTicker[t];
    if (tx.date < p.firstDate) p.firstDate = tx.date;
    if (tx.date > p.lastDate) p.lastDate = tx.date;

    const amount = tx.shares * tx.price;
    const isBuy = tx.action === 'BUY';
    const fee = calcFee(amount, isBuy, { shares: tx.shares, tx });

    if (isBuy) {
      p.invested += amount + fee;
      p.shares += tx.shares;
      p.buyFees += fee;
      p.totalBoughtShares += tx.shares;
      p.buyCount += 1;
    } else {
      const matchedShares = Math.min(tx.shares, p.shares);
      const unmatchedShares = Math.max(0, tx.shares - matchedShares);
      const avg = p.shares > 0 ? p.invested / p.shares : 0;
      const costRemoved = avg * matchedShares;
      const matchedFee = tx.shares > 0 ? fee * matchedShares / tx.shares : 0;
      p.realized += matchedShares * tx.price - matchedFee - costRemoved;
      p.invested -= costRemoved;
      p.shares -= matchedShares;
      p.sellFees += fee;
      p.totalSoldShares += tx.shares;
      p.sellCount += 1;
      p.unmatchedSellShares = (p.unmatchedSellShares ?? 0) + unmatchedShares;
      p.unmatchedSellFees = (p.unmatchedSellFees ?? 0) + (fee - matchedFee);
      p.unmatchedSellTransactions = (p.unmatchedSellTransactions ?? 0) + (unmatchedShares > EPSILON ? 1 : 0);
      if (p.shares < EPSILON) p.shares = 0;
      if (p.shares === 0) p.invested = 0;
    }
  }

  return Object.values(byTicker);
}

export function pendingShareDeltaByTicker(transactions: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  transactions.forEach((tx) => {
    if (!tx.isPending) return;
    const delta = tx.action === 'BUY' ? tx.shares : -tx.shares;
    out[tx.ticker] = (out[tx.ticker] || 0) + delta;
  });
  return out;
}
