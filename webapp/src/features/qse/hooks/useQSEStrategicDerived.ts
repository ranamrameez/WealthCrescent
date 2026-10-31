import { useMemo } from 'react';
import { calculatePortfolio, makeQSEFeeCalculator } from '../../../lib/calc';
import { useLiveQseWorkbook } from './useLiveQseWorkbook';

/** Dashboard's Strategic Trades what-if view. It deliberately uses
 * lowestCostFirst, but runs through the same authoritative portfolio
 * calculation pipeline as the official view. */
export function useQSEStrategicDerived() {
  const workbook = useLiveQseWorkbook();

  return useMemo(() => {
    const calcFee = makeQSEFeeCalculator(workbook.settings);
    const calculation = calculatePortfolio({
      transactions: workbook.transactions,
      transfers: workbook.transfers,
      adjustments: workbook.adjustments,
      dividends: workbook.dividends,
      marketPrices: workbook.marketPrices,
      calcFee,
      costBasisMethod: 'lowestCostFirst',
      feePct: workbook.settings.feePct,
      tick: workbook.settings.tick,
    });

    return {
      workbook,
      calcFee,
      positions: calculation.positions,
      summary: calculation.cashSummary,
      realizedSeries: calculation.realizedSeries,
      rows: calculation.positionRows,
      lots: calculation.lotsByTicker,
      calculation,
    };
  }, [workbook]);
}
