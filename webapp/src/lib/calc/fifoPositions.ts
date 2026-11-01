import type { FeeCalculator, Position, RealizedPLPoint, Transaction } from '../../types/workbook';
import { calculateStockPortfolio, type FIFOLot } from './stockCalculationEngine';
import { consumeLotsForSell } from './lotMatching';

export { consumeLotsForSell };
export type { LotMatchOrder, LotConsumption } from './lotMatching';
export type { FIFOLot };

export interface FIFOResult {
  positions: Position[];
  realizedSeries: RealizedPLPoint[];
  lotsByTicker: Record<string, FIFOLot[]>;
}

/** Compatibility adapter for the two lot-based cost-basis methods. */
export function computeFIFOPositions(
  transactions: Transaction[],
  calcFee: FeeCalculator,
  matchOrder: 'fifo' | 'lowestCostFirst' = 'fifo',
): FIFOResult {
  const result = calculateStockPortfolio(transactions, calcFee, matchOrder);
  return { positions: result.positions, realizedSeries: result.realizedSeries, lotsByTicker: result.lotsByTicker };
}
