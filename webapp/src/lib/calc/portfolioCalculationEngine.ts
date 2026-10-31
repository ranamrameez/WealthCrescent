import type {
  Adjustment,
  CashLedgerEvent,
  CashSummary,
  Dividend,
  FeeCalculator,
  Position,
  RealizedPLPoint,
  Transaction,
  Transfer,
} from '../../types/workbook';
import { buildCashLedger } from './cashLedger';
import { cashSummary, type PositionValuation } from './cashSummary';
import { getMarketPrice } from './priceHistory';
import { breakEvenPrice, perShareCommission } from './fees';
import { calculatePositionMarketValue } from './positionValuation';
import { calculateStockPortfolio, type StockBasisMethod, type StockCalculationResult } from './stockCalculationEngine';

export type PortfolioPositionRow = PositionValuation;

/**
 * One public calculation pipeline for an exchange portfolio. Cost-basis
 * dependent stock results, market-value rows, cash events and the final cash
 * summary are assembled here so feature hooks do not run separate calculators.
 */
export interface PortfolioCalculationInput {
  transactions: Transaction[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  dividends: Dividend[];
  marketPrices: Record<string, number>;
  calcFee: FeeCalculator;
  costBasisMethod: StockBasisMethod;
  feePct: number;
  tick: number;
}

export interface PortfolioCalculationResult extends StockCalculationResult {
  positions: Position[];
  realizedSeries: RealizedPLPoint[];
  positionRows: PortfolioPositionRow[];
  cashLedger: CashLedgerEvent[];
  cashSummary: CashSummary;
}

export function calculatePortfolio(input: PortfolioCalculationInput): PortfolioCalculationResult {
  const {
    transactions,
    transfers,
    adjustments,
    dividends,
    marketPrices,
    calcFee,
    costBasisMethod,
    feePct,
    tick,
  } = input;

  const stock = calculateStockPortfolio(transactions, calcFee, costBasisMethod);

  const positionRows: PortfolioPositionRow[] = stock.positions
    .filter(position => position.shares > 0)
    .map(position => {
      const marketPrice = getMarketPrice(position.ticker, marketPrices, transactions);
      const marketValue = calculatePositionMarketValue(position, marketPrice, calcFee);
      const targetPrice = (pct: number) => breakEvenPrice(position.invested * (1 + pct / 100), position.shares, feePct, tick, calcFee);
      return {
        ticker: position.ticker,
        shares: position.shares,
        invested: position.invested,
        avgCost: position.invested / position.shares,
        ...marketValue,
        breakEvenPrice: breakEvenPrice(position.invested, position.shares, feePct, tick, calcFee),
        target1Pct: targetPrice(1),
        target2Pct: targetPrice(2),
        target5Pct: targetPrice(5),
        perShareCommission: marketPrice > 0 ? perShareCommission(marketPrice, calcFee) : null,
      };
    });

  const cashLedger = buildCashLedger(transactions, transfers, adjustments, calcFee, dividends);
  const summary = cashSummary(
    transactions,
    transfers,
    adjustments,
    marketPrices,
    calcFee,
    stock.positions,
    dividends,
    cashLedger,
    positionRows,
  );

  return {
    ...stock,
    positionRows,
    cashLedger,
    cashSummary: summary,
  };
}
