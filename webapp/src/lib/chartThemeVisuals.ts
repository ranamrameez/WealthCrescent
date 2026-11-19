/** Theme-defined visual treatment, separate from data and shared hover behavior. */
export function chartThemeVisuals() {
  const style = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const number = (name: string, fallback: number, min = 0, max = 100) => {
    const value = Number.parseFloat(style?.getPropertyValue(name) ?? '');
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  return {
    tension: number('--chart-tension', .24, 0, 1), barRadius: number('--chart-bar-radius', 6),
    fillAlpha: number('--chart-fill-opacity', .58, 0, 1), lineWidth: number('--chart-line-width', 2, 1, 4),
    gridAlpha: number('--chart-grid-opacity', .28, 0, 1), tooltipRadius: number('--chart-tooltip-radius', 8),
    shadowBlur: number('--chart-shadow-blur', 8), shadowAlpha: number('--chart-shadow-opacity', .1, 0, 1),
  };
}
