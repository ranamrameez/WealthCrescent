import type { FeeCalculator, Transaction } from '../../types/workbook';
import { calculateStockPortfolio, type ClosedTrade } from './stockCalculationEngine';
import type { LotMatchOrder } from './lotMatching';

export type { ClosedTrade, LotMatchOrder };

/** Compatibility adapter. Closed-trade attribution is generated in the same
 * pass as positions and realized P/L, using the selected basis method. */
export function computeClosedTrades(
  transactions: Transaction[],
  calcFee: FeeCalculator,
  matchOrder: LotMatchOrder = 'fifo',
): ClosedTrade[] {
  return calculateStockPortfolio(transactions, calcFee, matchOrder).closedTrades;
}

/** Per-sell aggregate used by transaction-row P/L. */
export function closedPLBySellTxId(trades: ClosedTrade[]): Record<string, { netPL: number; shares: number }> {
  const out: Record<string, { netPL: number; shares: number }> = {};
  for (const trade of trades) {
    if (!trade.sellTxId) continue;
    if (!out[trade.sellTxId]) out[trade.sellTxId] = { netPL: 0, shares: 0 };
    out[trade.sellTxId].netPL += trade.netPL;
    out[trade.sellTxId].shares += trade.shares;
  }
  return out;
}
