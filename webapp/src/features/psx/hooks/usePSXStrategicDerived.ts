import { useMemo } from 'react';
import { calculatePortfolio } from '../../../lib/calc';
import { makePSXFeeCalculator } from '../../../lib/calc/psxFees';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';

/** PSX Strategic Trades mirror: lowestCostFirst is an advisory basis, routed
 * through the same authoritative portfolio pipeline as the official view. */
export function usePSXStrategicDerived() {
  const workbook = usePSXWorkbookStore((s) => s.workbook);

  return useMemo(() => {
    const calcFee = makePSXFeeCalculator(workbook.settings, workbook.transactions);
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
