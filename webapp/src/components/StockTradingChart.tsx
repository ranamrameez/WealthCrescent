import { useMemo, useState } from 'react';
import { StockBar, StockLine } from './StockCharts';
import { STOCK_BUY_COLOR, STOCK_SELL_COLOR, STOCK_HOLDINGS_COLOR } from '../lib/stockChartTheme';
import { fmtMoney } from '../lib/format';
import { AnalyticsChartCard } from './AnalyticsChartCard';
import { applyChartTheme } from '../lib/chartSetup';
import { useAppearanceStore } from '../store/appearanceStore';
import type { Transaction } from '../types/workbook';
import type { ChartFilter } from '../lib/calc/chartFilters';
import { stockTradingHistory } from '../lib/calc/stockTradingHistory';

export function StockTradingChart({ transactions, currency, ticker, filter }: { transactions: Transaction[]; currency: string; ticker?: string; filter?: ChartFilter }) {
  useAppearanceStore(s => s.appearance);
  applyChartTheme();
  const [selectedTicker, setSelectedTicker] = useState('');
  const [view, setView] = useState('daily');
  const scopedTransactions = transactions.filter(tx => !filter?.tickers.length || filter.tickers.includes(tx.ticker));
  const tickers = [...new Set(scopedTransactions.filter(tx => !tx.isPending).map(tx => tx.ticker))].sort();
  const activeTicker = ticker || (tickers.includes(selectedTicker) ? selectedTicker : undefined);
  const history = useMemo(() => stockTradingHistory(transactions.filter(tx => (!filter?.tickers.length || filter.tickers.includes(tx.ticker)) && (!activeTicker || tx.ticker === activeTicker))), [transactions, activeTicker, filter]);
  const inWindow = (date: string) => (!filter?.fromMonth || date.slice(0, 7) >= filter.fromMonth) && (!filter?.toMonth || date.slice(0, 7) <= filter.toMonth);
  const rows = (view === 'entries' ? history.entries : history.daily).filter(row => inWindow(row.date));
  if (!rows.length) return <p className="text-muted">No completed trades match this period.</p>;
  const labels = rows.map(row => row.label);
  const trades = scopedTransactions.filter(tx => !tx.isPending && (!activeTicker || tx.ticker === activeTicker) && inWindow(tx.date));
  const singleStock = new Set(trades.map(tx => tx.ticker)).size === 1;
  const boughtShares = rows.reduce((sum, row) => sum + row.buy, 0);
  const soldShares = rows.reduce((sum, row) => sum + row.sell, 0);
  const totals = rows.at(-1)!;
  const buy = STOCK_BUY_COLOR, sell = STOCK_SELL_COLOR;
  const priceOptions = { scales: { y: { title: { display: true, text: `${currency} per share` } } }, plugins: { datalabels: { formatter: (value: unknown) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }) } } };
  const valueOptions = { scales: { y: { beginAtZero: true, title: { display: true, text: currency } } } };
  const shareOptions = { scales: { y: { beginAtZero: true, title: { display: true, text: 'Shares' } } } };
  return <div>
    <div className="row gap-sm mb-md">
      {!ticker && tickers.length > 1 && <label>Stock for charts <select aria-label="Stock for charts" value={activeTicker ?? ''} onChange={event => setSelectedTicker(event.target.value)}>
        <option value="">All selected stocks</option>{tickers.map(code => <option key={code} value={code}>{code}</option>)}
      </select></label>}
      <label>Trading detail <select aria-label="Trading detail" value={view} onChange={event => setView(event.target.value)}><option value="daily">Daily totals</option><option value="entries">Individual trades</option></select></label>
    </div>
    <p className="text-muted">{trades.length.toLocaleString()} completed trades; {new Set(trades.map(tx => tx.date)).size} trading days; {rows[0].date} to {totals.date}. Buys are blue; sells are orange. Values exclude fees. Lifetime lines retain earlier trades when filtering dates.</p>
    <div className="analytics-grid">
      <div>
        <AnalyticsChartCard title={view === 'entries' ? 'Buy and sell volume per trade' : 'Daily buy and sell volume'} tooltip="Shares bought and sold in each individual entry or summed on each date. Fixed labels are spaced across the chart; hover shows every value.">
          <StockBar data={{ labels, datasets: [
            { label: 'Bought shares', data: rows.map(r => r.buy), backgroundColor: buy },
            { label: 'Sold shares', data: rows.map(r => r.sell), backgroundColor: sell },
          ] }} options={shareOptions} />
        </AnalyticsChartCard>
        <p className="text-muted">Bought {boughtShares.toLocaleString()} shares; sold {soldShares.toLocaleString()} shares in this period.</p>
      </div>
      <div>
        <AnalyticsChartCard title="Buy and sell execution prices" tooltip="Individual execution prices or share-weighted daily averages. Connections span dates with recorded trades; these are not daily market quotes.">
          {singleStock ? <StockLine data={{ labels, datasets: [
            { label: 'Buy execution price', data: rows.map(r => r.buy ? r.buyValue / r.buy : null), borderColor: buy, pointRadius: 3, spanGaps: true },
            { label: 'Sell execution price', data: rows.map(r => r.sell ? r.sellValue / r.sell : null), borderColor: sell, pointRadius: 3, spanGaps: true },
          ] }} options={priceOptions} /> : <p className="text-muted">Select one stock to compare its buy and sell prices.</p>}
        </AnalyticsChartCard>
        <p className="text-muted">Execution prices for each entry or date; lifetime averages appear separately below.</p>
      </div>
      <div>
        <AnalyticsChartCard title={view === 'entries' ? 'Value per trade' : 'Daily trading value'} tooltip="Shares multiplied by execution price, separately for buys and sells, per entry or date, before fees.">
          <StockBar data={{ labels, datasets: [
            { label: 'Buy value', data: rows.map(r => r.buyValue), backgroundColor: buy },
            { label: 'Sell value', data: rows.map(r => r.sellValue), backgroundColor: sell },
          ] }} options={valueOptions} />
        </AnalyticsChartCard>
        <p className="text-muted">Amounts spent on buys or received from sales, before fees.</p>
      </div>
      <div>
        <AnalyticsChartCard title="Lifetime bought and sold values" tooltip="Running buy costs and sale proceeds from the first recorded trade, at each displayed date or entry. These are not P/L or portfolio valuation.">
          <StockLine data={{ labels, datasets: [
            { label: 'Total buy cost', data: rows.map(r => r.bought), borderColor: buy, stepped: true },
            { label: 'Total sale proceeds', data: rows.map(r => r.sold), borderColor: sell, stepped: true },
          ] }} options={valueOptions} />
        </AnalyticsChartCard>
        <p className="text-muted">Total bought {fmtMoney(totals.bought, currency)}; total sold {fmtMoney(totals.sold, currency)} through {totals.date}, before fees.</p>
      </div>
      <AnalyticsChartCard title="Lifetime volume and net shares" tooltip="Cumulative bought and sold shares and their net balance at each date or trade. Earlier trades remain in these totals when filtering dates.">
        <StockLine data={{ labels, datasets: [
          { label: 'Total bought shares', data: rows.map(r => r.boughtShares), borderColor: buy, stepped: true },
          { label: 'Total sold shares', data: rows.map(r => r.soldShares), borderColor: sell, stepped: true },
          { label: 'Net shares', data: rows.map(r => r.boughtShares - r.soldShares), borderColor: STOCK_HOLDINGS_COLOR, borderDash: [5, 4], stepped: true },
        ] }} options={shareOptions} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Lifetime average execution prices" tooltip="Share-weighted buy and sell prices across all earlier trades, shown at each date or entry. Unit prices are averaged, not summed.">
        {singleStock ? <StockLine data={{ labels, datasets: [
          { label: 'Lifetime average buy', data: rows.map(r => r.boughtShares ? r.bought / r.boughtShares : null), borderColor: buy, pointRadius: 2 },
          { label: 'Lifetime average sell', data: rows.map(r => r.soldShares ? r.sold / r.soldShares : null), borderColor: sell, pointRadius: 2 },
        ] }} options={priceOptions} /> : <p className="text-muted">Select one stock to compare its lifetime execution prices.</p>}
      </AnalyticsChartCard>
    </div>
  </div>;
}
