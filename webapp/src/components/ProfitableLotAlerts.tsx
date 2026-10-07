import { computeFIFOPositions } from '../lib/calc/fifoPositions';
import { computeLotAdvice, profitableLotTotals, sellableShareSummary } from '../lib/calc/partialTradeStrategy';
import { getMarketPrice } from '../lib/calc/priceHistory';
import { fmt, fmtMoney, fmtPSXPrice, fmtQSEPrice } from '../lib/format';
import type { FeeCalculator, Transaction } from '../types/workbook';
import { Notice } from './Notice';

export function ProfitableLotAlerts({ transactions, marketPrices, calcFee, feePct, tick, currency, exchange }: {
  transactions: Transaction[]; marketPrices: Record<string, number>; calcFee: FeeCalculator;
  feePct: number; tick: number; currency: string; exchange: 'psx' | 'qse';
}) {
  const { lotsByTicker } = computeFIFOPositions(transactions, calcFee, 'lowestCostFirst');
  const alerts = Object.entries(lotsByTicker).flatMap(([ticker, lots]) => {
    const price = getMarketPrice(ticker, marketPrices, transactions);
    if (price <= 0) return [];
    const advice = computeLotAdvice(lots, calcFee, price, feePct, tick);
    const shares = sellableShareSummary(advice);
    return shares.sellable > 0 ? [{ ticker, price, ...shares, ...profitableLotTotals(advice, price) }] : [];
  }).sort((a, b) => b.profit - a.profit);
  const priceFormat = exchange === 'psx' ? fmtPSXPrice : fmtQSEPrice;
  return <section className="mb-sm" aria-label="Profitable share alerts" aria-live="polite">
    <h2 className="mb-sm">Profitable Share Alerts</h2>
    {alerts.length ? alerts.map(alert => <Notice key={alert.ticker} tone="success" className="mb-sm">
      <strong>{alert.ticker}</strong>: {fmt(alert.sellable, 0)} of {fmt(alert.total, 0)} shares profitable at {priceFormat(alert.price)}
      {' · '}Estimated profit {fmtMoney(alert.profit, currency)}
      {' · '}Sale value {fmtMoney(alert.grossProceeds, currency)}
      {' · '}Net proceeds {fmtMoney(alert.netProceeds, currency)}
    </Notice>) : <p className="text-muted">No open lots are profitable at current prices.</p>}
  </section>;
}
