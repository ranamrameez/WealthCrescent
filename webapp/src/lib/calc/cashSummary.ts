import type { Adjustment, CashLedgerEvent, CashSummary, Dividend, FeeCalculator, Position, Transaction, Transfer } from '../../types/workbook';
import { buildCashLedger, totalTransferFees } from './cashLedger';
import { computePositions } from './positions';
import { getMarketPrice } from './priceHistory';
import { calculatePositionMarketValue } from './positionValuation';

export interface PositionValuation {
  ticker: string;
  shares: number;
  invested: number;
  marketPrice: number;
  value: number;
  sellFee: number;
  profit: number;
  roiPct: number;
  avgCost: number;
  breakEvenPrice: number;
  target1Pct: number;
  target2Pct: number;
  target5Pct: number;
  perShareCommission: { buy: number; sell: number } | null;
}

/** Single all-in summary: actual cash, trading gains/losses and fees. Pending
 * trades are excluded; executed oversells retain their real cash movement while
 * unmatched shares are excluded from cost basis and realized P/L. */
export function cashSummary(
  transactions: Transaction[],
  transfers: Transfer[],
  adjustments: Adjustment[],
  marketPrices: Record<string, number>,
  calcFee: FeeCalculator,
  positions: Position[] = computePositions(transactions, calcFee),
  dividends: Dividend[] = [],
  precomputedLedger?: CashLedgerEvent[],
  precomputedPositionRows?: PositionValuation[],
): CashSummary {
  const totalInward = transfers.filter((t) => t.type === 'DEPOSIT').reduce((s, t) => s + t.gross, 0);
  const totalOutward = transfers.filter((t) => t.type === 'WITHDRAWAL').reduce((s, t) => s + t.gross, 0);
  const transferFees = totalTransferFees(transfers);
  const totalRewards = (adjustments || []).reduce((s, a) => s + a.amount, 0);
  const totalDividends = dividends.reduce((sum, dividend) => sum + dividend.amount, 0);
  const unmatchedSellFees = positions.reduce((sum, position) => sum + (position.unmatchedSellFees ?? 0), 0);
  const tradingFees = positions.reduce((s, p) => s + p.buyFees + p.sellFees, 0);
  const realizedPL = positions.reduce((s, p) => s + p.realized, 0);

  let unrealizedPL = 0;
  let portfolioValue = 0;
  if (precomputedPositionRows) {
    precomputedPositionRows.forEach(row => {
      if (Number.isFinite(row.profit)) unrealizedPL += row.profit;
      portfolioValue += row.value - row.sellFee;
    });
  } else {
    positions.filter((p) => p.shares > 0).forEach((p) => {
      const mp = getMarketPrice(p.ticker, marketPrices, transactions);
      const valuation = calculatePositionMarketValue(p, mp, calcFee);
      if (Number.isFinite(valuation.profit)) unrealizedPL += valuation.profit;
      portfolioValue += valuation.value - valuation.sellFee;
    });
  }

  const ledger = precomputedLedger ?? buildCashLedger(transactions, transfers, adjustments, calcFee, dividends);
  const cashBalance = ledger.length ? ledger[ledger.length - 1].balance : 0;
  const netWorth = cashBalance + portfolioValue;
  const totalCharges = transferFees + tradingFees;
  const netPL = realizedPL + unrealizedPL - transferFees + totalRewards + totalDividends - unmatchedSellFees;

  const pendingCashImpact = transactions.filter((t) => t.isPending).reduce((sum, t) => {
    const amount = t.shares * t.price;
    const fee = calcFee(amount, t.action === 'BUY', { shares: t.shares, tx: t });
    return sum + (t.action === 'BUY' ? -(amount + fee) : amount - fee);
  }, 0);

  return { totalInward, totalOutward, transferFees, tradingFees, totalCharges, totalRewards, totalDividends, unmatchedSellFees, realizedPL, unrealizedPL, netPL, cashBalance, portfolioValue, netWorth, ledger, pendingCashImpact };
}
