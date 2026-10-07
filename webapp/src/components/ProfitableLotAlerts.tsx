import { strategyPositions } from '../lib/calc/strategyPositions';
import { computeLotAdvice, profitableLotTotals, sellableShareSummary, type LotAdvice } from '../lib/calc/partialTradeStrategy';
import { getMarketPrice } from '../lib/calc/priceHistory';
import type { FeeCalculator, Transaction } from '../types/workbook';
import { memo } from 'react';
import { ProfitableStockAlert } from './ProfitableStockAlert';

function ProfitableLotAlertsView({ transactions, marketPrices, calcFee, feePct, tick, currency, exchange, onSell }: {
  transactions: Transaction[]; marketPrices: Record<string, number>; calcFee: FeeCalculator;
  feePct: number; tick: number; currency: string; exchange: 'psx' | 'qse'; onSell?: (ticker: string, lots: LotAdvice[], price: number) => void;
}) {
  const { lotsByTicker } = strategyPositions(transactions, calcFee);
  const alerts = Object.entries(lotsByTicker).flatMap(([ticker, lots]) => {
    const price = getMarketPrice(ticker, marketPrices, transactions);
    if (price <= 0) return [];
    const advice = computeLotAdvice(lots, calcFee, price, feePct, tick);
    const shares = sellableShareSummary(advice);
    return shares.sellable > 0 ? [{ ticker, price, advice, ...shares, ...profitableLotTotals(advice, price) }] : [];
  }).sort((a, b) => b.profit - a.profit);
  return <section id="profitable-share-alerts" className="profitable-share-alerts" aria-label="Profitable share alerts" aria-live="polite" style={{ scrollMarginTop: 96 }}>
    <h2 className="trade-strategy-heading">Profitable Share Alerts</h2>
    {alerts.length ? alerts.map(alert => <ProfitableStockAlert key={alert.ticker} {...alert} currency={currency} exchange={exchange} onSell={onSell ? () => onSell(alert.ticker, alert.advice.filter(lot => lot.suggestion === 'sell'), alert.price) : undefined} />) : <p className="text-muted">No open lots are profitable at current prices.</p>}
  </section>;
}

export const ProfitableLotAlerts = memo(ProfitableLotAlertsView);
