import type { ScriptableLineSegmentContext } from 'chart.js';
import { useMemo, useState } from 'react';
import type { FeeCalculator, PricePoint, Transaction } from '../types/workbook';
import { stockPLHistory, type StockBasisMethod } from '../lib/calc/stockPLHistory';
import type { ChartFilter } from '../lib/calc/chartFilters';
import { StockBar, StockLine } from './StockCharts';
import { AnalyticsChartCard } from './AnalyticsChartCard';
import { profitColor } from '../lib/chartLabels';
import { fmtMoney } from '../lib/format';
import { useAppearanceStore } from '../store/appearanceStore';
import { applyChartTheme } from '../lib/chartSetup';

export function StockPLCharts({ transactions, priceHistory, calcFee, method = 'average', currency, filter }: {
  transactions: Transaction[]; priceHistory: Record<string, PricePoint[]>; calcFee: FeeCalculator;
  method?: StockBasisMethod; currency: string; filter?: ChartFilter;
}) {
  useAppearanceStore(s => s.appearance);
  applyChartTheme();
  const [view, setView] = useState('daily');
  const [dayTradesOnly, setDayTradesOnly] = useState(false);
  const history = useMemo(() => {
    const scoped = transactions.filter(tx => !filter?.tickers.length || filter.tickers.includes(tx.ticker));
    const tickers = new Set(scoped.map(tx => tx.ticker));
    return stockPLHistory(scoped, Object.fromEntries(Object.entries(priceHistory).filter(([ticker]) => tickers.has(ticker))), calcFee, method);
  }, [transactions, priceHistory, calcFee, method, filter]);
  const points = (view === 'entries' ? history.entries : history.daily).filter(p =>
    (!filter?.fromMonth || p.date.slice(0, 7) >= filter.fromMonth) && (!filter?.toMonth || p.date.slice(0, 7) <= filter.toMonth) && (!dayTradesOnly || p.dayTrade));
  const options = { scales: { y: { title: { display: true, text: currency } } }, plugins: { tooltip: { callbacks: {
    label: (item: { dataset: { label?: string }; raw: unknown }) => `${item.dataset.label}: ${fmtMoney(Number(item.raw), currency)}`,
    afterBody: (items: { dataIndex: number }[]) => { const p = points[items[0]?.dataIndex]; return p ? `${p.dayTrade ? 'Buy and sell activity in the same stock on this date. ' : ''}Quote dates: ${[...new Set(p.quoteDates)].join(', ') || 'No open holdings / no quote'}` : ''; },
  } } } };
  const line = (label: string, values: (number | null)[]) => ({ label, data: values, borderColor: profitColor(values.at(-1) ?? 0), pointRadius: 2, tension: 0,
    segment: { borderColor: (ctx: ScriptableLineSegmentContext) => profitColor(ctx.p1.parsed.y ?? 0) } });
  if (!history.daily.length) return <p className="text-muted">Add completed trades to see profit/loss charts.</p>;
  return <div>
    <div className="row gap-sm mb-md">
      <label>Profit/loss detail <select aria-label="Profit/loss detail" value={view} onChange={event => setView(event.target.value)}><option value="daily">By date</option><option value="entries">Individual trades</option></select></label>
      <label><input type="checkbox" checked={dayTradesOnly} onChange={event => setDayTradesOnly(event.target.checked)} /> Buy/sell days only</label>
    </div>
    <p className="text-muted">Fees included; cost basis: {method}. Bars show changes, lines show lifetime balances at that date. Buy/sell days have both actions in the same stock and may include sales of older holdings.</p>
    <p className="text-muted">Unrealized P/L uses the latest recorded quote on or before each date, with estimated exit fees. Trade effects hold that quote fixed before and after trading. Missing quotes leave gaps; prior quotes are carried forward and listed on hover.</p>
    {!points.length ? <p className="text-muted">No activity matches these filters.</p> : <div className="analytics-grid">
      <AnalyticsChartCard title="Realized P/L changes" tooltip="Realized profit or loss added by each trade or date, net of trading fees, using the configured cost-basis method.">
        <StockBar data={{ labels: points.map(p => p.label), datasets: [{ label: 'Realized P/L change', data: points.map(p => p.realizedChange), backgroundColor: points.map(p => profitColor(p.realizedChange)) }] }} options={options} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Lifetime realized P/L" tooltip="Total realized P/L since the first trade, after each displayed date or trade. A date filter does not reset cost basis or this total.">
        <StockLine data={{ labels: points.map(p => p.label), datasets: [line('Lifetime realized P/L', points.map(p => p.realized))] }} options={options} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Trading effect on unrealized P/L" tooltip="Change in unrealized P/L caused by the selected date or trade, at a fixed as-of-date quote. This isolates changes to shares, remaining cost basis and exit fees from quote movement.">
        <StockBar data={{ labels: points.map(p => p.label), datasets: [{ label: 'Unrealized P/L trade effect', data: points.map(p => p.unrealizedTradeChange), backgroundColor: points.map(p => profitColor(p.unrealizedTradeChange ?? 0)) }] }} options={options} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Unrealized P/L at each date" tooltip="Open holdings marked at the last available historical quote, less remaining cost basis and estimated sell fees. Entry view uses the date's last recorded quote, not an intraday quote.">
        <StockLine data={{ labels: points.map(p => p.label), datasets: [line('Unrealized P/L', points.map(p => p.unrealized))] }} options={options} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Combined realized and unrealized P/L" tooltip="Lifetime realized P/L plus unrealized P/L on remaining holdings at the historical quote. Dividends, rewards and cash transfers are excluded.">
        <StockLine data={{ labels: points.map(p => p.label), datasets: [line('Combined trading P/L', points.map(p => p.total))] }} options={options} />
      </AnalyticsChartCard>
    </div>}
  </div>;
}
