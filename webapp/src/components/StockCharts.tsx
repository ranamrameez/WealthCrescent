import type { ChartOptions } from 'chart.js';
import type { ComponentProps } from 'react';
import { AppBar, AppLine, AppDoughnut } from './AppCharts';
import { spacedStockLabels } from '../lib/stockChartLabels';

// Stock charts retain their sparse, domain-specific value labels on the app-wide primitives.
function labels<T extends 'bar' | 'line' | 'doughnut'>(kind: T, options?: ChartOptions<T>): ChartOptions<T> {
  return { ...options, plugins: { ...options?.plugins,
    datalabels: { ...spacedStockLabels(kind), ...options?.plugins?.datalabels,
      display: options?.plugins?.datalabels?.display ?? spacedStockLabels(kind).display },
  } } as ChartOptions<T>;
}
export function StockBar({ options, ...props }: ComponentProps<typeof AppBar>) { return <AppBar {...props} options={labels('bar', options)} />; }
export function StockLine({ options, ...props }: ComponentProps<typeof AppLine>) { return <AppLine {...props} options={labels('line', options)} />; }
export function StockDoughnut({ options, ...props }: ComponentProps<typeof AppDoughnut>) { return <AppDoughnut {...props} options={labels('doughnut', options)} />; }
