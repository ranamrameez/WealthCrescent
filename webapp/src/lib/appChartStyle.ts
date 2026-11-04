import type { ChartOptions, ChartType } from 'chart.js';
import { chartAlpha } from './chartVisuals';
import { cssVar } from './cssVar';
import { chartThemeVisuals } from './chartThemeVisuals';

/** Preserve deliberate alpha, gradients and scriptable colors. */
export function softChartColor(color: unknown, alpha: number): unknown {
  if (Array.isArray(color)) return color.map(value => softChartColor(value, alpha));
  if (typeof color !== 'string' || !(/^#[\da-f]{3}$|^#[\da-f]{6}$|^rgb\(/i.test(color))) return color;
  return chartAlpha(color, alpha);
}

export function appChartOptions<T extends ChartType>(kind: T, suppliedOptions?: ChartOptions<T>, reducedMotion = false): ChartOptions<T> {
  const options = (suppliedOptions ?? {}) as NonNullable<ChartOptions<T>>;
  const visuals = chartThemeVisuals();
  const cartesian = kind === 'line' || kind === 'bar' || kind === 'scatter' || kind === 'bubble';
  const horizontal = options.indexAxis === 'y';
  const interactionAxis = cartesian ? horizontal ? 'y' : 'x' : 'r';
  const axis = {
    grid: { color: chartAlpha(cssVar('--border') || '#94a3b8', visuals.gridAlpha), drawTicks: false },
    border: { display: false },
    ticks: { color: cssVar('--muted') || '#64748b', maxTicksLimit: 6, maxRotation: 0, padding: 8 },
  };
  const supplied = options.scales ?? {};
  return {
    ...options,
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : options.animation === false ? false : { duration: 300, easing: 'easeOutQuart', ...options.animation },
    interaction: { ...options.interaction, mode: cartesian ? 'index' : 'nearest', axis: interactionAxis, intersect: false },
    hover: { ...options.hover, mode: cartesian ? 'index' : 'nearest', axis: interactionAxis, intersect: false },
    plugins: {
      ...options.plugins,
      tooltip: {
        backgroundColor: cssVar('--panel-2') || '#fff',
        titleColor: cssVar('--text') || '#0f172a', bodyColor: cssVar('--text') || '#0f172a',
        borderColor: cssVar('--border') || '#cbd5e1', borderWidth: 1, padding: 12, cornerRadius: visuals.tooltipRadius,
        displayColors: true, boxPadding: 4,
        ...options.plugins?.tooltip,
        mode: cartesian ? 'index' : 'nearest', axis: interactionAxis, intersect: false,
      },
    },
    ...(cartesian ? { scales: Object.fromEntries(['x', 'y', ...Object.keys(supplied)].map(key => [key, {
      ...axis, ...supplied[key], grid: { ...axis.grid, ...supplied[key]?.grid },
      border: { ...axis.border, ...(supplied[key] as { border?: object } | undefined)?.border }, ticks: { ...axis.ticks, ...supplied[key]?.ticks },
    }])) } : {}),
  } as ChartOptions<T>;
}
