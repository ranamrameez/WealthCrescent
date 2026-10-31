import type { FeeCalculator, Position, RealizedPLPoint, Transaction } from '../../types/workbook';
import { sortTransactionsChronological } from './sortTransactions';
import { consumeLotsForSell, type LotMatchOrder } from './lotMatching';

const EPSILON = 1e-7;

export type StockBasisMethod = 'average' | LotMatchOrder;

export interface FIFOLot {
  buyDate: string;
  buyPrice: number;
  buyFeeTotal: number;
  originalShares: number;
  remainingShares: number;
  buyId?: string;
  lifecycleId: string;
}

export interface ClosedTrade {
  ticker: string;
  lifecycleId: string;
  basisMethod: StockBasisMethod;
  sellTxId?: string;
  buyDate: string;
  buyPrice: number;
  buyFee: number;
  sellDate: string;
  sellPrice: number;
  sellFee: number;
  shares: number;
  netPL: number;
  holdingDays: number;
}

export interface PositionLifecycle {
  id: string;
  ticker: string;
  sequence: number;
  startDate: string;
  endDate?: string;
  status: 'open' | 'closed';
  boughtShares: number;
  soldShares: number;
  remainingShares: number;
  invested: number;
  buyFees: number;
  sellFees: number;
  realized: number;
}

export interface SellReconciliation {
  txId: string;
  requestedShares: number;
  matchedShares: number;
  unmatchedShares: number;
  totalFee: number;
  matchedFee: number;
  unmatchedFee: number;
  matchedProceeds: number;
}

export interface StockCalculationResult {
  method: StockBasisMethod;
  positions: Position[];
  realizedSeries: RealizedPLPoint[];
  realizedBySellTxId: Record<string, { netPL: number; shares: number }>;
  closedTrades: ClosedTrade[];
  lotsByTicker: Record<string, FIFOLot[]>;
  lifecycles: PositionLifecycle[];
  sellReconciliationByTxId: Record<string, SellReconciliation>;
}

interface TickerState {
  ticker: string;
  shares: number;
  invested: number;
  principalCost: number;
  buyFeeCost: number;
  buyFees: number;
  sellFees: number;
  realized: number;
  totalBoughtShares: number;
  totalSoldShares: number;
  unmatchedSellShares: number;
  unmatchedSellFees: number;
  unmatchedSellTransactions: number;
  buyCount: number;
  sellCount: number;
  firstDate: string;
  lastDate: string;
  lifecycleCount: number;
  activeLifecycleId?: string;
  lots: FIFOLot[];
}

function holdingDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
}

/**
 * The single stock-accounting pass used by positions, realized P/L, per-sell
 * P/L, open lots, closed trades and lifecycle reporting. The selected basis
 * method changes only cost attribution; it never changes or mutates source
 * transactions, fee overrides, or cash records.
 */
export function calculateStockPortfolio(
  transactions: Transaction[],
  calcFee: FeeCalculator,
  method: StockBasisMethod = 'average',
): StockCalculationResult {
  const byTicker: Record<string, TickerState> = {};
  const lifecycleById = new Map<string, PositionLifecycle>();
  const lifecycles: PositionLifecycle[] = [];
  const closedTrades: ClosedTrade[] = [];
  const realizedBySellTxId: StockCalculationResult['realizedBySellTxId'] = {};
  const sellReconciliationByTxId: StockCalculationResult['sellReconciliationByTxId'] = {};
  const realizedSeries: RealizedPLPoint[] = [];
  let runningRealized = 0;

  const ensureState = (tx: Transaction): TickerState => {
    if (!byTicker[tx.ticker]) {
      byTicker[tx.ticker] = {
        ticker: tx.ticker, shares: 0, invested: 0, principalCost: 0, buyFeeCost: 0,
        buyFees: 0, sellFees: 0, realized: 0, totalBoughtShares: 0, totalSoldShares: 0,
        unmatchedSellShares: 0, unmatchedSellFees: 0, unmatchedSellTransactions: 0,
        buyCount: 0, sellCount: 0, firstDate: tx.date, lastDate: tx.date,
        lifecycleCount: 0, lots: [],
      };
    }
    const state = byTicker[tx.ticker];
    if (tx.date < state.firstDate) state.firstDate = tx.date;
    if (tx.date > state.lastDate) state.lastDate = tx.date;
    return state;
  };

  const beginLifecycle = (state: TickerState, date: string): PositionLifecycle => {
    state.lifecycleCount += 1;
    const lifecycle: PositionLifecycle = {
      id: `${state.ticker}#${state.lifecycleCount}`,
      ticker: state.ticker,
      sequence: state.lifecycleCount,
      startDate: date,
      status: 'open',
      boughtShares: 0,
      soldShares: 0,
      remainingShares: 0,
      invested: 0,
      buyFees: 0,
      sellFees: 0,
      realized: 0,
    };
    state.activeLifecycleId = lifecycle.id;
    lifecycleById.set(lifecycle.id, lifecycle);
    lifecycles.push(lifecycle);
    return lifecycle;
  };

  for (const tx of sortTransactionsChronological(transactions.filter(item => !item.isPending))) {
    const state = ensureState(tx);
    const isBuy = tx.action === 'BUY';
    const amount = tx.shares * tx.price;
    const fee = calcFee(amount, isBuy, { shares: tx.shares, tx });

    if (isBuy) {
      const lifecycle = (state.activeLifecycleId && lifecycleById.get(state.activeLifecycleId))
        || beginLifecycle(state, tx.date);
      state.shares += tx.shares;
      state.invested += amount + fee;
      state.buyFees += fee;
      state.totalBoughtShares += tx.shares;
      state.buyCount += 1;
      lifecycle.boughtShares += tx.shares;
      lifecycle.remainingShares += tx.shares;
      lifecycle.invested += amount + fee;
      lifecycle.buyFees += fee;

      if (method === 'average') {
        state.principalCost += amount;
        state.buyFeeCost += fee;
      } else {
        state.lots.push({
          buyDate: tx.date,
          buyPrice: tx.price,
          buyFeeTotal: fee,
          originalShares: tx.shares,
          remainingShares: tx.shares,
          buyId: tx.id,
          lifecycleId: lifecycle.id,
        });
      }
      continue;
    }

    const matchedShares = Math.min(tx.shares, state.shares);
    const unmatchedShares = Math.max(0, tx.shares - matchedShares);
    const matchedFee = tx.shares > 0 ? fee * matchedShares / tx.shares : 0;
    const unmatchedFee = fee - matchedFee;
    let realizedDelta = 0;

    if (matchedShares > EPSILON) {
      const lifecycle = state.activeLifecycleId ? lifecycleById.get(state.activeLifecycleId) : undefined;
      if (method === 'average') {
        const averagePrincipal = state.shares > 0 ? state.principalCost / state.shares : 0;
        const averageBuyFee = state.shares > 0 ? state.buyFeeCost / state.shares : 0;
        const principalRemoved = averagePrincipal * matchedShares;
        const buyFeeRemoved = averageBuyFee * matchedShares;
        const costRemoved = principalRemoved + buyFeeRemoved;
        realizedDelta = matchedShares * tx.price - matchedFee - costRemoved;
        state.principalCost -= principalRemoved;
        state.buyFeeCost -= buyFeeRemoved;
        if (lifecycle) {
          closedTrades.push({
            ticker: tx.ticker,
            lifecycleId: lifecycle.id,
            basisMethod: method,
            sellTxId: tx.id,
            buyDate: lifecycle.startDate,
            buyPrice: averagePrincipal,
            buyFee: buyFeeRemoved,
            sellDate: tx.date,
            sellPrice: tx.price,
            sellFee: matchedFee,
            shares: matchedShares,
            netPL: realizedDelta,
            holdingDays: holdingDays(lifecycle.startDate, tx.date),
          });
        }
      } else {
        const consumed = consumeLotsForSell(
          state.lots,
          matchedShares,
          method,
          tx.lotAllocations,
          tx.targetLotBuyId,
        );
        let consumedShares = 0;
        for (const { lot, take } of consumed) {
          consumedShares += take;
          const buyFeeShare = (take / lot.originalShares) * lot.buyFeeTotal;
          const sellFeeShare = matchedShares > 0 ? matchedFee * take / matchedShares : 0;
          const lotCost = take * lot.buyPrice + buyFeeShare;
          const lotPL = take * tx.price - sellFeeShare - lotCost;
          realizedDelta += lotPL;
          const lotLifecycle = lifecycleById.get(lot.lifecycleId);
          if (lotLifecycle) {
            lotLifecycle.soldShares += take;
            lotLifecycle.remainingShares = Math.max(0, lotLifecycle.remainingShares - take);
            lotLifecycle.invested = Math.max(0, lotLifecycle.invested - lotCost);
            lotLifecycle.sellFees += sellFeeShare;
          }
          closedTrades.push({
            ticker: tx.ticker,
            lifecycleId: lot.lifecycleId,
            basisMethod: method,
            sellTxId: tx.id,
            buyDate: lot.buyDate,
            buyPrice: lot.buyPrice,
            buyFee: buyFeeShare,
            sellDate: tx.date,
            sellPrice: tx.price,
            sellFee: sellFeeShare,
            shares: take,
            netPL: lotPL,
            holdingDays: holdingDays(lot.buyDate, tx.date),
          });
        }
        // The matched quantity is clamped before lot consumption. This guard
        // keeps any malformed/manual allocation from silently creating basis.
        if (consumedShares + EPSILON < matchedShares) {
          const unconsumed = matchedShares - consumedShares;
          state.unmatchedSellShares += unconsumed;
          state.unmatchedSellTransactions += unconsumed > EPSILON ? 1 : 0;
        }
        state.invested = state.lots.reduce((sum, lot) => sum + lot.remainingShares * (lot.buyPrice + lot.buyFeeTotal / lot.originalShares), 0);
      }

      state.shares = Math.max(0, state.shares - matchedShares);
      state.realized += realizedDelta;
      if (lifecycle) {
        lifecycle.soldShares += method === 'average' ? matchedShares : 0;
        if (method === 'average') {
          lifecycle.remainingShares = Math.max(0, lifecycle.remainingShares - matchedShares);
          const costRemoved = state.shares > EPSILON ? 0 : lifecycle.invested;
          lifecycle.invested = Math.max(0, lifecycle.invested - (matchedShares * (lifecycle.invested / (lifecycle.remainingShares + matchedShares || 1))));
          void costRemoved;
          lifecycle.sellFees += matchedFee;
        }
        lifecycle.realized += realizedDelta;
      }
      runningRealized += realizedDelta;
      realizedSeries.push({ date: tx.date, value: runningRealized });

      if (state.shares <= EPSILON) {
        state.shares = 0;
        state.invested = 0;
        state.principalCost = 0;
        state.buyFeeCost = 0;
        if (state.activeLifecycleId) {
          const closed = lifecycleById.get(state.activeLifecycleId);
          if (closed) {
            closed.status = 'closed';
            closed.endDate = tx.date;
            closed.remainingShares = 0;
            closed.invested = 0;
          }
        }
        state.activeLifecycleId = undefined;
      }
    }

    state.sellFees += fee;
    state.totalSoldShares += tx.shares;
    state.sellCount += 1;
    state.unmatchedSellShares += unmatchedShares;
    state.unmatchedSellFees += unmatchedFee;
    state.unmatchedSellTransactions += unmatchedShares > EPSILON ? 1 : 0;

    if (tx.id) {
      sellReconciliationByTxId[tx.id] = {
        txId: tx.id,
        requestedShares: tx.shares,
        matchedShares,
        unmatchedShares,
        totalFee: fee,
        matchedFee,
        unmatchedFee,
        matchedProceeds: matchedShares * tx.price - matchedFee,
      };
      if (matchedShares > EPSILON) realizedBySellTxId[tx.id] = { netPL: realizedDelta, shares: matchedShares };
    }
  }

  const positions: Position[] = Object.values(byTicker).map(state => ({
    ticker: state.ticker,
    shares: state.shares,
    invested: state.shares <= EPSILON ? 0 : state.invested,
    buyFees: state.buyFees,
    sellFees: state.sellFees,
    realized: state.realized,
    totalBoughtShares: state.totalBoughtShares,
    totalSoldShares: state.totalSoldShares,
    unmatchedSellShares: state.unmatchedSellShares,
    unmatchedSellFees: state.unmatchedSellFees,
    unmatchedSellTransactions: state.unmatchedSellTransactions,
    buyCount: state.buyCount,
    sellCount: state.sellCount,
    firstDate: state.firstDate,
    lastDate: state.lastDate,
  }));

  const lotsByTicker: Record<string, FIFOLot[]> = {};
  if (method !== 'average') {
    Object.entries(byTicker).forEach(([ticker, state]) => {
      if (state.lots.length) lotsByTicker[ticker] = state.lots;
    });
  }

  return {
    method,
    positions,
    realizedSeries,
    realizedBySellTxId,
    closedTrades,
    lotsByTicker,
    lifecycles,
    sellReconciliationByTxId,
  };
}
