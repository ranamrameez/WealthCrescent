import { StockPLCharts } from './StockPLCharts';
import type { StockBasisMethod } from '../lib/calc/stockPLHistory';
import { useMemo } from 'react';
import { StockBar as Bar, StockDoughnut as Doughnut, StockLine as Line } from './StockCharts';
import { STOCK_BUY_COLOR, STOCK_SELL_COLOR, STOCK_HOLDINGS_COLOR } from '../lib/stockChartTheme';
import { StockTradingChart } from './StockTradingChart';
import { AnalyticsChartCard } from './AnalyticsChartCard';
import { MoneyValue } from './Card';
import { applyChartTheme } from '../lib/chartSetup';
import { useAppearanceStore } from '../store/appearanceStore';
import type { Transaction, FeeCalculator, PricePoint } from '../types/workbook';
import { gridAutoStyle } from '../lib/gridStyle';
import { fmtMoney } from '../lib/format';

export function ExchangeStockAnalytics({
  ticker,
  transactions,
  currency,
  formatPrice,
  priceHistory,
  calcFee,
  method,
}: {
  priceHistory: Record<string, PricePoint[]>;
  calcFee: FeeCalculator;
  method?: StockBasisMethod;
  ticker: string;
  transactions: Transaction[];
  currency: string;
  formatPrice: (value: number) => string;
}) {
  useAppearanceStore((state) => state.appearance);
  applyChartTheme();
  const trades = useMemo(
    () => transactions.filter((tx) => tx.ticker === ticker && !tx.isPending).sort((a, b) => a.date.localeCompare(b.date)),
    [transactions, ticker],
  );
  const analytics = useMemo(() => {
    const months = new Map<string, { buy: number; sell: number; buyShares: number; sellShares: number }>();
    const shareHistory = trades.reduce<{ date: string; shares: number }[]>((history, tx) => {
      const month = tx.date.slice(0, 7);
      const row = months.get(month) ?? { buy: 0, sell: 0, buyShares: 0, sellShares: 0 };
      const value = tx.shares * tx.price;
      if (tx.action === 'BUY') { row.buy += value; row.buyShares += tx.shares; }
      else { row.sell += value; row.sellShares += tx.shares; }
      months.set(month, row);
      const previousShares = history.at(-1)?.shares ?? 0;
      history.push({ date: tx.date, shares: previousShares + (tx.action === 'BUY' ? tx.shares : -tx.shares) });
      return history;
    }, []);
    const buys = trades.filter((tx) => tx.action === 'BUY');
    const sells = trades.filter((tx) => tx.action === 'SELL');
    const buyValue = buys.reduce((sum, tx) => sum + tx.shares * tx.price, 0);
    const sellValue = sells.reduce((sum, tx) => sum + tx.shares * tx.price, 0);
    const buyShares = buys.reduce((sum, tx) => sum + tx.shares, 0);
    const sellShares = sells.reduce((sum, tx) => sum + tx.shares, 0);
    return { months: [...months.entries()], shareHistory, buyValue, sellValue, buyShares, sellShares };
  }, [trades]);

  if (!trades.length) return <p className="text-muted">Add a completed trade to see stock analytics.</p>;
  const buy = STOCK_BUY_COLOR;
  const sell = STOCK_SELL_COLOR;
  const holdings = STOCK_HOLDINGS_COLOR;
  return <div>
    <div className="grid-auto mb-md" style={gridAutoStyle(170, 12)}>
      <div className="stat-card card"><div className="label">Bought</div><MoneyValue n={analytics.buyValue} currency={currency} /><div className="sub">{analytics.buyShares.toLocaleString()} shares</div></div>
      <div className="stat-card card"><div className="label">Sold</div><MoneyValue n={analytics.sellValue} currency={currency} /><div className="sub">{analytics.sellShares.toLocaleString()} shares</div></div>
      <div className="stat-card card"><div className="label">Average buy</div><div className="value">{formatPrice(analytics.buyShares ? analytics.buyValue / analytics.buyShares : 0)}</div></div>
      <div className="stat-card card"><div className="label">Average sell</div><div className="value">{formatPrice(analytics.sellShares ? analytics.sellValue / analytics.sellShares : 0)}</div></div>
    </div>
    <StockTradingChart ticker={ticker} transactions={transactions} currency={currency} />
    <StockPLCharts transactions={trades} priceHistory={priceHistory} calcFee={calcFee} method={method} currency={currency} />
    <div className="analytics-grid">
      <AnalyticsChartCard title="Monthly trading value" tooltip="The total value bought and sold each month for this stock.">
        <Bar data={{ labels: analytics.months.map(([month]) => month), datasets: [
          { label: 'Bought', data: analytics.months.map(([, row]) => row.buy), backgroundColor: buy },
          { label: 'Sold', data: analytics.months.map(([, row]) => row.sell), backgroundColor: sell },
        ] }} options={{ scales: { y: { beginAtZero: true, title: { display: true, text: currency } } }, plugins: { tooltip: { callbacks: { label: item => `${item.dataset.label}: ${fmtMoney(Number(item.raw), currency)}` } } } }} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Buy and sell mix" tooltip="The share count bought compared with the share count sold.">
        <Doughnut data={{ labels: ['Bought', 'Sold'], datasets: [{ data: [analytics.buyShares, analytics.sellShares], backgroundColor: [buy, sell] }] }} options={{ cutout: '48%', plugins: { tooltip: { callbacks: { label: item => `${item.label}: ${Number(item.raw).toLocaleString()} shares (${(Number(item.raw) / (analytics.buyShares + analytics.sellShares) * 100).toFixed(1)}%)` } } } }} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Shares held over time" tooltip="Cumulative shares after every completed buy or sell.">
        <Line data={{ labels: analytics.shareHistory.map((row) => row.date), datasets: [{ label: 'Shares', data: analytics.shareHistory.map((row) => row.shares), borderColor: holdings, backgroundColor: `${holdings}33`, fill: true, stepped: true }] }} options={{ scales: { y: { beginAtZero: true, title: { display: true, text: 'Shares held' } } }, plugins: { legend: { display: false } } }} />
      </AnalyticsChartCard>
    </div>
  </div>;
}
