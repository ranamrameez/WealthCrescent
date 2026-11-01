import type { FeeCalculator, Position } from '../../types/workbook';

export interface PositionMarketValue {
  marketPrice: number;
  value: number;
  sellFee: number;
  profit: number;
  roiPct: number;
}

/** The single market-value/unrealized-P&L formula shared by live portfolio
 * valuation, cash summaries and historical P/L snapshots. */
export function calculatePositionMarketValue(
  position: Pick<Position, 'shares' | 'invested'>,
  marketPrice: number,
  calcFee: FeeCalculator,
): PositionMarketValue {
  const hasMarketPrice = Number.isFinite(marketPrice) && marketPrice > 0;
  const value = hasMarketPrice ? position.shares * marketPrice : 0;
  const sellFee = hasMarketPrice ? calcFee(value, false, { shares: position.shares }) : 0;
  const profit = hasMarketPrice ? value - sellFee - position.invested : Number.NaN;
  const roiPct = hasMarketPrice && position.invested > 0 ? (profit / position.invested) * 100 : Number.NaN;
  return { marketPrice, value, sellFee, profit, roiPct };
}
