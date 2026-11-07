import type { Chart, ChartEvent } from 'chart.js';
import { describe, expect, it, vi } from 'vitest';
import { cursorGuidePlugin } from '../chartInteraction';

function fixture(cartesian = true) {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), setLineDash: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
  const chart = { ctx, scales: cartesian ? { x: {}, y: {} } : {}, chartArea: { left: 10, right: 210, top: 20, bottom: 120 } } as unknown as Chart;
  return { chart, ctx };
}
function move(chart: Chart, x: number, inside = true, type: ChartEvent['type'] = 'mousemove') {
  const args = { event: { type, x, y: 80, native: null } as ChartEvent, replay: false, cancelable: false as const, inChartArea: inside, changed: false };
  cursorGuidePlugin.afterEvent!(chart, args, {});
  return args;
}
describe('plot cursor guide', () => {
  it('draws at the pointer between data points and requests redraw on every position change', () => {
    const { chart, ctx } = fixture();
    expect(move(chart, 113).changed).toBe(true);
    cursorGuidePlugin.afterDatasetsDraw!(chart, {}, {}, false);
    expect(ctx.moveTo).toHaveBeenCalledWith(113, 20);
    expect(ctx.lineTo).toHaveBeenCalledWith(113, 120);
    expect(move(chart, 114).changed).toBe(true);
    expect(move(chart, 114).changed).toBe(false);
  });
  it('clears on mouseout and does not draw on rings or outside the plot', () => {
    const { chart, ctx } = fixture();
    move(chart, 113); expect(move(chart, 113, false, 'mouseout').changed).toBe(true);
    cursorGuidePlugin.afterDatasetsDraw!(chart, {}, {}, false); expect(ctx.stroke).not.toHaveBeenCalled();
    const ring = fixture(false); move(ring.chart, 113); cursorGuidePlugin.afterDatasetsDraw!(ring.chart, {}, {}, false);
    expect(ring.ctx.stroke).not.toHaveBeenCalled();
  });
});
