import type { ChartOptions } from 'chart.js';
import { Bar as BaseBar, Line as BaseLine, Doughnut as BaseDoughnut } from 'react-chartjs-2';
import type { ComponentProps } from 'react';
import { chartAlpha, chartDepthPlugin } from '../lib/chartVisuals';
import { cssVar } from '../lib/cssVar';
import { spacedStockLabels } from '../lib/stockChartLabels';

function tint(color: unknown, alpha: number) {
  return typeof color === 'string' ? chartAlpha(color, alpha) : color;
}
function fill(color: unknown, alpha: number) {
  return Array.isArray(color) ? color.map(value => tint(value, alpha)) : tint(color, alpha);
}
function axes<T extends 'bar' | 'line'>(kind: T, options?: ChartOptions<T>): ChartOptions<T> {
  const axis = { grid: { color: cssVar('--border') || '#232b33' }, ticks: { color: cssVar('--muted') || '#94a3b8', maxTicksLimit: 6, maxRotation: 0 } };
  const supplied = options?.scales ?? {};
  return {
    ...options, responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false, ...options?.interaction },
    plugins: { ...options?.plugins, datalabels: { ...spacedStockLabels(kind), ...options?.plugins?.datalabels, display: spacedStockLabels(kind).display } },
    scales: Object.fromEntries(['x', 'y', ...Object.keys(supplied)].map(key => [key, { ...axis, ...supplied[key], grid: { ...axis.grid, ...supplied[key]?.grid }, ticks: { ...axis.ticks, ...supplied[key]?.ticks } }])),
  } as ChartOptions<T>;
}
export function StockBar({ data, options, plugins = [], ...props }: ComponentProps<typeof BaseBar>) {
  return <BaseBar {...props} plugins={[chartDepthPlugin, ...plugins]} options={axes('bar', options)} data={{ ...data, datasets: data.datasets.map(dataset => ({ borderWidth: 1.5, borderRadius: 5, ...dataset, borderColor: dataset.borderColor ?? dataset.backgroundColor, backgroundColor: fill(dataset.backgroundColor, .55) as typeof dataset.backgroundColor })) }} />;
}
export function StockLine({ data, options, plugins = [], ...props }: ComponentProps<typeof BaseLine>) {
  return <BaseLine {...props} plugins={[chartDepthPlugin, ...plugins]} options={axes('line', options)} data={{ ...data, datasets: data.datasets.map(dataset => ({ tension: .24, borderWidth: 2, pointRadius: data.labels && data.labels.length > 1 ? 0 : 3, pointHoverRadius: 4, ...dataset })) }} />;
}
export function StockDoughnut({ data, options, plugins = [], ...props }: ComponentProps<typeof BaseDoughnut>) {
  return <BaseDoughnut {...props} plugins={[chartDepthPlugin, ...plugins]} options={{ cutout: '48%', ...options, responsive: true, maintainAspectRatio: false, plugins: { ...options?.plugins, datalabels: { ...spacedStockLabels('doughnut'), ...options?.plugins?.datalabels, display: spacedStockLabels('doughnut').display } } }} data={{ ...data, datasets: data.datasets.map(dataset => ({ borderWidth: 2, hoverOffset: 8, ...dataset, borderColor: dataset.borderColor ?? dataset.backgroundColor, backgroundColor: fill(dataset.backgroundColor, .72) as typeof dataset.backgroundColor })) }} />;
}
