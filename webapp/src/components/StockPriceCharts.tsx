import { useState } from 'react';
import type { PricePoint } from '../types/workbook';
import { AnalyticsChartCard } from './AnalyticsChartCard';
import { StockLine } from './StockCharts';
import { STOCK_BUY_COLOR, STOCK_HOLDINGS_COLOR } from '../lib/stockChartTheme';

export function StockPriceCharts({ points, currency, formatPrice }: { points: PricePoint[]; currency: string; formatPrice: (n: number) => string }) {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
  const dates = [...new Set(ordered.map(p => p.date))];
  const [chosenDate, setChosenDate] = useState('');
  const [view, setView] = useState('entries');
  const date = dates.includes(chosenDate) ? chosenDate : dates.at(-1) ?? '';
  const daily = ordered.filter(p => p.date === date);
  const closings = [...new Map(ordered.map(p => [p.date, p])).values()];
  const lifetime = view === 'entries' ? ordered : closings;
  const averagesByPoint = new Map<PricePoint, number>();
  let total = 0;
  for (const [index, point] of ordered.entries()) {
    total += point.price;
    averagesByPoint.set(point, total / (index + 1));
  }
  const averages = lifetime.map(point => averagesByPoint.get(point)!);
  const options = { scales: { y: { title: { display: true, text: `${currency} per share` } } }, plugins: { datalabels: { formatter: (value: unknown) => formatPrice(Number(value)) }, tooltip: { callbacks: { label: (item: { dataset: { label?: string }; raw: unknown }) => `${item.dataset.label}: ${formatPrice(Number(item.raw))}` } } } };
  if (!points.length) return <p className="text-muted">No recorded market prices yet.</p>;
  return <div>
    <div className="row gap-sm mb-md">
      <label>Daily price date <select aria-label="Daily price date" value={date} onChange={event => setChosenDate(event.target.value)}>{[...dates].reverse().map(date => <option key={date} value={date}>{date}</option>)}</select></label>
      <label>Lifetime price detail <select aria-label="Lifetime price detail" value={view} onChange={event => setView(event.target.value)}><option value="entries">Every price update</option><option value="daily">Daily closing prices</option></select></label>
    </div>
    <div className="analytics-grid">
      <AnalyticsChartCard title="Daily price updates" height="sm" tooltip="Every recorded price update on the selected date only. Defaults to the latest date with recorded prices, not the entire history.">
        <StockLine data={{ labels: daily.map((p, i) => p.time?.includes('T') ? p.time.slice(11, 19) : p.time || `Update ${i + 1}`), datasets: [{ label: `Price on ${date}`, data: daily.map(p => p.price), borderColor: STOCK_BUY_COLOR, pointRadius: 3 }] }} options={options} />
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Lifetime market prices" height="sm" tooltip="Every recorded update or the last recorded price on each date, plus the running average of all recorded updates. Price averages are meaningful; summing unit prices is not a portfolio valuation.">
        <StockLine data={{ labels: lifetime.map((p, i) => view === 'entries' ? `${p.date} ${p.time?.includes('T') ? p.time.slice(11, 19) : p.time || `#${i + 1}`}` : p.date), datasets: [
          { label: view === 'entries' ? 'Recorded price' : 'Daily closing price', data: lifetime.map(p => p.price), borderColor: STOCK_BUY_COLOR, pointRadius: 2 },
          { label: 'Lifetime average recorded price', data: averages, borderColor: STOCK_HOLDINGS_COLOR, borderDash: [5, 4], pointRadius: 0 },
        ] }} options={options} />
      </AnalyticsChartCard>
    </div>
    <p className="text-muted">{daily.length} updates on {date}; open {formatPrice(daily[0].price)}, last {formatPrice(daily.at(-1)!.price)}. Lifetime: {ordered.length} updates across {dates.length} dates.</p>
  </div>;
}
