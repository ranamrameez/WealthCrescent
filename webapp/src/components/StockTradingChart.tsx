import { useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import { AnalyticsChartCard } from './AnalyticsChartCard';
import { applyChartTheme } from '../lib/chartSetup';
import { chartAlpha, chartDepthPlugin } from '../lib/chartVisuals';
import { cssVar } from '../lib/cssVar';
import { useAppearanceStore } from '../store/appearanceStore';
import type { Transaction } from '../types/workbook';

export function StockTradingChart({ transactions, currency, ticker }: { transactions: Transaction[]; currency: string; ticker?: string }) {
  useAppearanceStore(s => s.appearance);
  applyChartTheme();
  const days = useMemo(() => {
    const grouped = new Map<string, { buy: number; sell: number; buyValue: number; sellValue: number }>();
    transactions.filter(tx => !tx.isPending && (!ticker || tx.ticker === ticker)).forEach(tx => {
      const row = grouped.get(tx.date) ?? { buy: 0, sell: 0, buyValue: 0, sellValue: 0 };
      if (tx.action === 'BUY') { row.buy += tx.shares; row.buyValue += tx.shares * tx.price; }
      else { row.sell += tx.shares; row.sellValue += tx.shares * tx.price; }
      grouped.set(tx.date, row);
    });
    let bought = 0, sold = 0;
    const result: Array<{ date: string; buy: number; sell: number; buyValue: number; sellValue: number; bought: number; sold: number }> = [];
    for (const [date, row] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      bought += row.buyValue; sold += row.sellValue;
      result.push({ date, ...row, bought, sold });
    }
    return result;
  }, [transactions, ticker]);
  const buy = cssVar('--profit') || '#3ecf8e';
  const sell = cssVar('--loss') || '#e5484d';
  const axis = { grid: { color: cssVar('--border') || '#232b33' }, ticks: { color: cssVar('--muted') || '#94a3b8', maxTicksLimit: 6, maxRotation: 0 } };
  const line = { type: 'line' as const, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .24 };
  const data: ChartData<'bar' | 'line'> = { labels: days.map(row => row.date), datasets: [
    { type: 'bar', label: 'Buy volume (shares)', data: days.map(r => r.buy), yAxisID: 'volume', backgroundColor: chartAlpha(buy, .42), borderColor: buy, borderWidth: 1, borderRadius: 4 },
    { type: 'bar', label: 'Sell volume (shares)', data: days.map(r => r.sell), yAxisID: 'volume', backgroundColor: chartAlpha(sell, .42), borderColor: sell, borderWidth: 1, borderRadius: 4 },
    { ...line, label: 'Buy price', data: days.map(r => r.buy ? r.buyValue / r.buy : null), yAxisID: 'price', pointRadius: 2, borderColor: buy, spanGaps: true },
    { ...line, label: 'Sell price', data: days.map(r => r.sell ? r.sellValue / r.sell : null), yAxisID: 'price', pointRadius: 2, borderColor: sell, spanGaps: true },
    { ...line, label: 'Total bought value', data: days.map(r => r.bought), yAxisID: 'value', borderColor: '#38bdf8', borderDash: [6, 4] },
    { ...line, label: 'Total sold value', data: days.map(r => r.sold), yAxisID: 'value', borderColor: '#a78bfa', borderDash: [6, 4] },
  ] };
  return <AnalyticsChartCard title="Trading over time" height="lg" tooltip="Completed trades by date: buy/sell volume, share-weighted daily prices, and cumulative bought/sold values before fees. Click a legend entry to show or hide a series.">
    {days.length ? <Chart type="bar" data={data} plugins={[chartDepthPlugin]} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: {
      x: axis,
      volume: { ...axis, position: 'left', beginAtZero: true, title: { display: true, text: 'Shares' } },
      price: { ...axis, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: `Price (${currency})` } },
      value: { ...axis, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: `Total value (${currency})` } },
    }, plugins: { legend: { display: true }, datalabels: { display: false }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${Number(item.raw).toLocaleString(undefined, { maximumFractionDigits: 2 })}${item.dataset.yAxisID === 'volume' ? ' shares' : ` ${currency}`}` } } } }} /> : <p className="text-muted">Add a completed trade to see trading over time.</p>}
  </AnalyticsChartCard>;
}

