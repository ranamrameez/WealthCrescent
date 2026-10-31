import type { FeeCalculator, Position, Transaction } from '../../types/workbook';
import { calculateStockPortfolio } from './stockCalculationEngine';

/** Compatibility adapter. The authoritative weighted-average accounting pass
 * lives in stockCalculationEngine.ts; callers should prefer its complete result
 * when they need more than the position roll-up. */
export function computePositions(transactions: Transaction[], calcFee: FeeCalculator): Position[] {
  return calculateStockPortfolio(transactions, calcFee, 'average').positions;
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
