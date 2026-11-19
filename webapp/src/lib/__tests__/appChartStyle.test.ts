import { describe, expect, it } from 'vitest';
import { appChartOptions, softChartColor } from '../appChartStyle';

describe('shared chart interaction and appearance', () => {
  it('finds every series at the nearest x position without requiring a point hit', () => {
    const label = () => 'Domain currency label';
    const original = { interaction: { intersect: true, mode: 'point' as const }, plugins: { tooltip: { callbacks: { label } } }, scales: { y: { min: -200, max: 600 } } };
    const result = appChartOptions('line', original)!;
    expect(result.interaction).toMatchObject({ intersect: false, axis: 'x', mode: 'index' });
    expect(result.plugins?.tooltip).toMatchObject({ intersect: false, mode: 'index', callbacks: { label } });
    expect(result.scales?.y).toMatchObject({ min: -200, max: 600 });
    expect(original.interaction.intersect).toBe(true);
  });
  it('selects horizontal bars by row and keeps doughnut hover independent of axes', () => {
    expect(appChartOptions('bar', { indexAxis: 'y' })?.interaction).toMatchObject({ axis: 'y', intersect: false });
    const ring = appChartOptions('doughnut');
    expect(ring?.interaction).toMatchObject({ mode: 'nearest', axis: 'r', intersect: false });
    expect(ring?.scales).toBeUndefined();
  });
  it('honors reduced motion and preserves existing translucent or scriptable fills', () => {
    expect(appChartOptions('line', {}, true)?.animation).toBe(false);
    expect(appChartOptions('line', { animation: false })?.animation).toBe(false);
    expect(softChartColor('#38bdf8', .5)).toBe('rgba(56, 189, 248, 0.5)');
    expect(softChartColor('rgba(56, 189, 248, .18)', .58)).toBe('rgba(56, 189, 248, .18)');
    const gradient = () => 'gradient';
    expect(softChartColor(gradient, .5)).toBe(gradient);
  });
});
