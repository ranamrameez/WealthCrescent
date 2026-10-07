import type { Workbook } from '../../../types/workbook';
import { useMemo } from 'react';
import { buildCashLedger, cashSummary, computePositions, computeRealizedPLTimeSeries, getMarketPrice, makeQSEFeeCalculator } from '../../../lib/calc';
import { computeFIFOPositions, type FIFOLot } from '../../../lib/calc/fifoPositions';
import { useWorkbookStore } from '../../../store/workbookStore';

export interface QSERow {
  ticker: string;
  shares: number;
  invested: number;
  marketPrice: number;
  value: number; // gross market value, shares * marketPrice
  sellFee: number;
  /** Unrealized P/L net of an estimated sell commission. */
  profit: number;
  roiPct: number;
}

/** Added 2026-09-17: see `QSESettings.costBasisMethod`'s own doc comment
 * for why QSE (which used to hardcode weighted-average with no toggle at
 * all) needed the same opt-in lot-based methods PSX already had — this
 * mirrors `usePSXDerived`'s own branch exactly. Default ('average' /
 * undefined) is byte-for-byte unchanged from before this existed. */
function calculateDerived(workbook: Workbook, selectedTickers?: string[]) {
    const scoped = selectedTickers?.length ? workbook.transactions.filter((tx) => selectedTickers.includes(tx.ticker)) : workbook.transactions;
    const calcFee = makeQSEFeeCalculator(workbook.settings);
    const method = workbook.settings.costBasisMethod ?? 'average';

    let positions;
    let realizedSeries;
    let lots: Record<string, FIFOLot[]> = {};
    if (method === 'average') {
      positions = computePositions(scoped, calcFee);
      realizedSeries = computeRealizedPLTimeSeries(scoped, calcFee);
    } else {
      const fifo = computeFIFOPositions(scoped, calcFee, method);
      positions = fifo.positions;
      realizedSeries = fifo.realizedSeries;
      lots = fifo.lotsByTicker;
    }

    const summary = cashSummary(
      scoped,
      workbook.transfers,
      workbook.adjustments,
      workbook.marketPrices,
      calcFee,
      positions,
    );
    const ledger = buildCashLedger(scoped, workbook.transfers, workbook.adjustments, calcFee);

    // Shared per-open-position rollup (mirrors the legacy dashboard's
    // `rows` variable) — feeds most of the ticker-level charts.
    const rows: QSERow[] = positions
      .filter((p) => p.shares > 0)
      .map((p) => {
        const marketPrice = getMarketPrice(p.ticker, workbook.marketPrices, scoped);
        const value = p.shares * marketPrice;
        const sellFee = marketPrice > 0 ? calcFee(value, false) : 0;
        const profit = value - sellFee - p.invested;
        const roiPct = p.invested > 0 ? (profit / p.invested) * 100 : 0;
        return { ticker: p.ticker, shares: p.shares, invested: p.invested, marketPrice, value, sellFee, profit, roiPct };
      });

    return { workbook, calcFee, positions, summary, realizedSeries, ledger, rows, lots };

}

const sharedDerived = new WeakMap<Workbook, ReturnType<typeof calculateDerived>>();

export function useQSEDerived(selectedTickers?: string[]) {
  const workbook = useWorkbookStore((state) => state.workbook);
  const tickerKey = selectedTickers?.join('|') ?? '';
  return useMemo(() => {
    if (!tickerKey) {
      const cached = sharedDerived.get(workbook);
      if (cached) return cached;
      const result = calculateDerived(workbook);
      sharedDerived.set(workbook, result);
      return result;
    }
    return calculateDerived(workbook, tickerKey.split('|'));
  }, [workbook, tickerKey]);
}
