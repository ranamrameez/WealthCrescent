import type { Chart, Plugin } from 'chart.js';
import { cssVar } from './cssVar';

const cursors = new WeakMap<Chart, number>();

/** Pointer position, rather than a snapped data point, guides reading across a plot. */
export const cursorGuidePlugin: Plugin = {
  id: 'cursorGuide',
  afterEvent(chart, args) {
    const { event, inChartArea } = args;
    const previous = cursors.get(chart);
    const x = inChartArea && event.type !== 'mouseout' ? event.x : null;
    if (x == null) cursors.delete(chart); else cursors.set(chart, x);
    // Chart.js redraws for changed active elements; also redraw between points.
    if (previous !== cursors.get(chart)) args.changed = true;
  },
  afterDatasetsDraw(chart) {
    if (!chart.scales.x || !chart.scales.y) return; // Rings have no time/category axis.
    const x = cursors.get(chart), area = chart.chartArea;
    if (x == null || x < area.left || x > area.right) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssVar('--muted') || '#64748b';
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    ctx.stroke();
    ctx.restore();
  },
  afterDestroy(chart) { cursors.delete(chart); },
};
