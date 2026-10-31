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
import { cashSummary } from './cashSummary';
import { getMarketPrice } from './priceHistory';
import { calculateStockPortfolio, type StockBasisMethod, type StockCalculationResult } from './stockCalculationEngine';

export interface PortfolioPositionRow {
  ticker: string;
  shares: number;
  invested: number;
  marketPrice: number;
  value: number;
  sellFee: number;
  profit: number;
  roiPct: number;
}

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
  } = input;

  const stock = calculateStockPortfolio(transactions, calcFee, costBasisMethod);
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
  );

  const positionRows: PortfolioPositionRow[] = stock.positions
    .filter(position => position.shares > 0)
    .map(position => {
      const marketPrice = getMarketPrice(position.ticker, marketPrices, transactions);
      const value = position.shares * marketPrice;
      const sellFee = marketPrice > 0 ? calcFee(value, false, { shares: position.shares }) : 0;
      const profit = value - sellFee - position.invested;
      const roiPct = position.invested > 0 ? (profit / position.invested) * 100 : 0;
      return {
        ticker: position.ticker,
        shares: position.shares,
        invested: position.invested,
        marketPrice,
        value,
        sellFee,
        profit,
        roiPct,
      };
    });

  return {
    ...stock,
    positionRows,
    cashLedger,
    cashSummary: summary,
  };
}
