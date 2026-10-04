import type { ChartOptions } from 'chart.js';
import type { Context } from 'chartjs-plugin-datalabels';
import { cssVar } from './cssVar';
type LabelOptions = NonNullable<NonNullable<ChartOptions<'line'>['plugins']>['datalabels']>;

/** Label first/last values and evenly spaced interior points, adapting to plot width.
 * 'auto' also suppresses collisions between adjacent series; hover keeps every value.
 */
export function spacedStockLabels(kind: 'bar' | 'line' | 'doughnut'): LabelOptions {
  return {
    display: (ctx: Context) => {
      const valid = ctx.dataset.data.map((value, i) => value !== null && Number.isFinite(Number(value)) ? i : -1).filter(i => i >= 0);
      if (!valid.includes(ctx.dataIndex)) return false;
      if (kind === 'doughnut') return 'auto';
      const width = ctx.chart.chartArea?.width || ctx.chart.width || 400;
      const series = ctx.chart.data.datasets.filter((_, i) => ctx.chart.isDatasetVisible(i)).length || 1;
      const capacity = Math.max(2, Math.min(8, Math.floor(width / (85 * Math.sqrt(series)))));
      const stride = Math.max(1, Math.ceil((valid.length - 1) / (capacity - 1)));
      const index = valid.indexOf(ctx.dataIndex);
      return index === 0 || index === valid.length - 1 || index % stride === 0 ? 'auto' : false;
    },
    anchor: kind === 'bar' ? 'end' : 'center',
    align: (ctx: Context) => {
      if (kind === 'doughnut') return 'center';
      const negative = Number(ctx.dataset.data[ctx.dataIndex]) < 0;
      if (kind === 'bar' && ctx.chart.options.indexAxis === 'y') return negative ? 'left' : 'right';
      if (kind === 'bar') return negative ? 'bottom' : 'top';
      return ctx.datasetIndex % 2 === 0 ? 'top' : 'bottom';
    },
    offset: 8, clamp: true, clip: false,
    color: cssVar('--text') || '#e8ecef', backgroundColor: cssVar('--panel-2') || '#12161b',
    borderRadius: 4, padding: 3, font: { size: 10, weight: 'bold' },
    formatter: value => Number(value).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 }),
  };
}
