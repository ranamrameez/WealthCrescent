import type { PSXWorkbook } from '../../../types/psxWorkbook';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { calculatePortfolio } from '../../../lib/calc';
import { makePSXFeeCalculator } from '../../../lib/calc/psxFees';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { applyLivePsx } from '../../../lib/stockData/livePsx';
import { useLivePsxWorkbook, usePsxFeed } from './useLivePsxWorkbook';

export interface PSXRow {
  ticker: string;
  shares: number;
  invested: number;
  marketPrice: number;
  value: number; // gross market value, shares * marketPrice
  sellFee: number;
  /** Unrealized P/L net of an estimated sell commission (and, where a
   * same-day pairing exists, the netted-side fee — see makePSXFeeCalculator). */
  profit: number;
  roiPct: number;
}

/** PSX's equivalent of useQSEDerived — same shape, different store + fee
 * model. makePSXFeeCalculator is rebuilt from the *current* transaction list
 * every time (not just settings) because its same-day netting logic
 * (README items 6/7) needs the full transaction history to know which side
 * of a same-day round trip is the "charged" one.
 *
 * README item 8: `positions`/`realizedSeries` come from FIFO lot matching
 * instead of the weighted-average default when `settings.costBasisMethod`
 * is 'fifo' or 'lowestCostFirst' — an explicit user opt-in (see
 * PSXSettings), not the default, since it changes real computed P/L
 * numbers. `lots` exposes each open ticker's remaining lots for display;
 * it's empty under the weighted-average method, which has no discrete lots
 * to show. */
function calculateDerived(workbook: PSXWorkbook, selectedTickers?: string[]) {
    const scoped = selectedTickers?.length ? workbook.transactions.filter((tx) => selectedTickers.includes(tx.ticker)) : workbook.transactions;
    const calcFee = makePSXFeeCalculator(workbook.settings, scoped);
    const calculation = calculatePortfolio({
      transactions: scoped,
      transfers: workbook.transfers,
      adjustments: workbook.adjustments,
      dividends: workbook.dividends,
      marketPrices: workbook.marketPrices,
      calcFee,
      costBasisMethod: workbook.settings.costBasisMethod ?? 'average',
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
const sharedDerived = new WeakMap<PSXWorkbook, ReturnType<typeof calculateDerived>>();

export function usePSXDerived(selectedTickers?: string[]) {
  const workbook = useLivePsxWorkbook();
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

/** Portfolio-only subscription for heavy strategy cards. Trade-plan edits do
 * not affect these inputs, so they must not make every card rebuild the full
 * portfolio model. */
export function usePSXPortfolioDerived() {
  const inputs = usePSXWorkbookStore(useShallow((state) => ({
    settings: state.workbook.settings,
    transactions: state.workbook.transactions,
    transfers: state.workbook.transfers,
    adjustments: state.workbook.adjustments,
    dividends: state.workbook.dividends,
    marketPrices: state.workbook.marketPrices,
    priceHistory: state.workbook.priceHistory,
  })));
  const points = usePsxFeed((state) => state.points);
  return useMemo(() => {
    const workbook = applyLivePsx({ ...usePSXWorkbookStore.getState().workbook, ...inputs }, points);
    return calculateDerived(workbook);
  }, [inputs, points]);
}
