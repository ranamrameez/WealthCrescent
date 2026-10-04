import { describe, expect, it } from 'vitest';
import type { Context } from 'chartjs-plugin-datalabels';
import { spacedStockLabels } from '../stockChartLabels';
describe('fixed stock chart labels', () => {
  it('keeps first and last valid labels and adds interior labels as the plot widens', () => {
    const values = [null, ...Array.from({ length: 98 }, (_, i) => i + 1), null];
    const display = spacedStockLabels('line').display;
    if (typeof display !== 'function') throw new Error('Expected adaptive labels');
    const shown = (width: number) => values.map((_, dataIndex) => display({
      dataset: { data: values }, dataIndex, datasetIndex: 0,
      chart: { chartArea: { width }, data: { datasets: [{}] }, isDatasetVisible: () => true },
    } as unknown as Context));
    const small = shown(300), large = shown(900);
    expect(small[0]).toBe(false);
    expect(small[1]).toBe('auto');
    expect(small[98]).toBe('auto');
    expect(small[99]).toBe(false);
    expect(small.filter(Boolean).length).toBeLessThan(10);
    expect(large.filter(Boolean).length).toBeGreaterThan(small.filter(Boolean).length);
  });
});
