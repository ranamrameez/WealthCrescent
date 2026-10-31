import type { FeeCalculator, RealizedPLPoint, Transaction } from '../../types/workbook';
import { calculateStockPortfolio } from './stockCalculationEngine';

/** Compatibility adapter for the average-basis realized series. The single
 * authoritative pass is stockCalculationEngine.ts. */
export function computeRealizedPLTimeSeries(transactions: Transaction[], calcFee: FeeCalculator): RealizedPLPoint[] {
  return calculateStockPortfolio(transactions, calcFee, 'average').realizedSeries;
}

/** Average-basis per-SELL result, keyed by stable transaction ID. */
export function computeAveragePLBySellTxId(
  transactions: Transaction[],
  calcFee: FeeCalculator,
): Record<string, { netPL: number; shares: number }> {
  return calculateStockPortfolio(transactions, calcFee, 'average').realizedBySellTxId;
}
