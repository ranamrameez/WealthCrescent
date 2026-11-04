import { Bar as BaseBar, Line as BaseLine, Doughnut as BaseDoughnut, Chart as BaseChart } from 'react-chartjs-2';
import type { ChartData, ChartType, Plugin } from 'chart.js';
import type { ComponentProps } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { appChartOptions, softChartColor } from '../lib/appChartStyle';
import { chartDepthPlugin } from '../lib/chartVisuals';
import { cursorGuidePlugin } from '../lib/chartInteraction';
import { applyChartTheme } from '../lib/chartSetup';
import { useAppearanceStore } from '../store/appearanceStore';
import { chartThemeVisuals } from '../lib/chartThemeVisuals';

function useChartAppearance() {
  useAppearanceStore(state => state.appearance);
  const reducedMotion = useReducedMotion();
  applyChartTheme();
  return reducedMotion;
}

function softData<T extends ChartType, TData, TLabel>(kind: T, data: ChartData<T, TData, TLabel>): ChartData<T, TData, TLabel> {
  const visuals = chartThemeVisuals();
  return { ...data, datasets: data.datasets.map(dataset => {
    const type = dataset.type ?? kind;
    if (type === 'line') return {
      tension: visuals.tension, cubicInterpolationMode: 'monotone', borderWidth: visuals.lineWidth,
      pointRadius: Array.isArray(dataset.data) && dataset.data.length > 1 ? 0 : 3, pointHoverRadius: 5, pointHitRadius: 14, ...dataset,
    };
    if (type === 'bar') return {
      borderWidth: 1.5, borderRadius: visuals.barRadius, ...dataset,
      borderColor: dataset.borderColor ?? dataset.backgroundColor,
      backgroundColor: softChartColor(dataset.backgroundColor, visuals.fillAlpha),
    };
    if (type === 'doughnut') return {
      borderWidth: 2, hoverOffset: 6, ...dataset,
      borderColor: dataset.borderColor ?? dataset.backgroundColor,
      backgroundColor: softChartColor(dataset.backgroundColor, .72),
    };
    return dataset;
  }) } as ChartData<T, TData, TLabel>;
}

const sharedPlugins = [chartDepthPlugin, cursorGuidePlugin];
function description(kind: string, data: { datasets: { label?: string }[] }) {
  const names = data.datasets.map(dataset => dataset.label).filter(Boolean).join(', ');
  return names ? `${kind} chart: ${names}` : `${kind} chart`;
}
function withPlugins<T extends ChartType>(plugins: Plugin<T>[] = []): Plugin<T>[] {
  // These drawing plugins use only the common chart/canvas contract.
  return [...sharedPlugins.filter(shared => !plugins.some(plugin => plugin.id === shared.id)), ...plugins] as Plugin<T>[];
}

/** Use these primitives everywhere; data, scales and domain tooltip callbacks remain owned by each view. */
export function AppLine({ data, options, plugins, ...props }: ComponentProps<typeof BaseLine>) {
  const reduced = useChartAppearance();
  return <BaseLine role="img" {...props} aria-label={props['aria-label'] ?? description('Line', data)} data={softData('line', data)} options={appChartOptions('line', options, reduced)} plugins={withPlugins<'line'>(plugins)} />;
}
export function AppBar({ data, options, plugins, ...props }: ComponentProps<typeof BaseBar>) {
  const reduced = useChartAppearance();
  return <BaseBar role="img" {...props} aria-label={props['aria-label'] ?? description('Bar', data)} data={softData('bar', data)} options={appChartOptions('bar', options, reduced)} plugins={withPlugins<'bar'>(plugins)} />;
}
export function AppDoughnut({ data, options, plugins, ...props }: ComponentProps<typeof BaseDoughnut>) {
  const reduced = useChartAppearance();
  return <BaseDoughnut role="img" {...props} aria-label={props['aria-label'] ?? description('Doughnut', data)} data={softData('doughnut', data)} options={{cutout: '48%', ...appChartOptions('doughnut', options, reduced)}} plugins={withPlugins<'doughnut'>(plugins)} />;
}
export function AppChart({ type, data, options, plugins, ...props }: ComponentProps<typeof BaseChart>) {
  const reduced = useChartAppearance();
  return <BaseChart role="img" {...props} aria-label={props['aria-label'] ?? description(type, data)} type={type} data={softData(type, data)} options={appChartOptions(type, options, reduced)} plugins={withPlugins(plugins)} />;
}
