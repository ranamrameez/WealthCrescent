import type { Workbook } from '../../../types/workbook';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { calculatePortfolio, makeQSEFeeCalculator } from '../../../lib/calc';
import { useLiveQseWorkbook } from './useLiveQseWorkbook';
import { useQseFeed } from './useLiveQseWorkbook';
import { useWorkbookStore } from '../../../store/workbookStore';
import { applyLiveQse } from '../../../lib/stockData/liveQse';

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
  avgCost: number;
  breakEvenPrice: number;
  target1Pct: number;
  target2Pct: number;
  target5Pct: number;
  perShareCommission: { buy: number; sell: number } | null;
}

/** Added 2026-09-17: see `QSESettings.costBasisMethod`'s own doc comment
 * for why QSE (which used to hardcode weighted-average with no toggle at
 * all) needed the same opt-in lot-based methods PSX already had — this
 * mirrors `usePSXDerived`'s own branch exactly. Default ('average' /
 * undefined) is byte-for-byte unchanged from before this existed. */
function calculateDerived(workbook: Workbook, selectedTickers?: string[]) {
    const scoped = selectedTickers?.length ? workbook.transactions.filter((tx) => selectedTickers.includes(tx.ticker)) : workbook.transactions;
    const calcFee = makeQSEFeeCalculator(workbook.settings);
    const calculation = calculatePortfolio({
      transactions: scoped,
      transfers: workbook.transfers,
      adjustments: workbook.adjustments,
      dividends: workbook.dividends,
      marketPrices: workbook.marketPrices,
      calcFee,
      costBasisMethod: workbook.settings.costBasisMethod ?? 'average',
      feePct: workbook.settings.feePct,
      tick: workbook.settings.tick,
    });
    const {
      positions,
      realizedSeries,
      lotsByTicker: lots,
      cashSummary: summary,
      cashLedger: ledger,
      positionRows: rows,
    } = calculation;

    return {
      workbook,
      calcFee,
      positions,
      summary,
      realizedSeries,
      ledger,
      rows,
      lots,
      calculation,
      closedTrades: calculation.closedTrades,
      realizedBySellTxId: calculation.realizedBySellTxId,
      lifecycles: calculation.lifecycles,
      sellReconciliationByTxId: calculation.sellReconciliationByTxId,
    };
}
const sharedDerived = new WeakMap<Workbook, ReturnType<typeof calculateDerived>>();

export function useQSEDerived(selectedTickers?: string[]) {
  const workbook = useLiveQseWorkbook();
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

/** Strategy-card variant that ignores trade-plan-only workbook changes. */
export function useQSEPortfolioDerived() {
  const inputs = useWorkbookStore(useShallow((state) => ({
    settings: state.workbook.settings,
    transactions: state.workbook.transactions,
    transfers: state.workbook.transfers,
    adjustments: state.workbook.adjustments,
    dividends: state.workbook.dividends,
    marketPrices: state.workbook.marketPrices,
    priceHistory: state.workbook.priceHistory,
  })));
  const points = useQseFeed((state) => state.points);
  return useMemo(() => {
    const stored = { ...useWorkbookStore.getState().workbook, ...inputs };
    return calculateDerived(applyLiveQse(stored, points));
  }, [inputs, points]);
}
