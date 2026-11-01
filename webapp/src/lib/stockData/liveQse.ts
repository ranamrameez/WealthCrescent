import type { Workbook, PricePoint } from '../../types/workbook';

/** Compare by the exchange-local calendar date first. A date-only manual
 * point is a calendar-day value, not midnight UTC; parsing it as UTC can make
 * it appear newer than a live quote recorded late on the previous UTC day
 * (e.g. 01:00 in Qatar). When dates match, timestamped points sort after
 * date-only points; two timestamps are compared lexically as ISO instants. */
export function compareLivePricePoints(a: PricePoint, b: PricePoint): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate) return byDate;
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return 1;
  if (b.time) return -1;
  return 0;
}

export function applyLiveQse(workbook: Workbook, shared: Record<string, PricePoint[]>): Workbook {
  const marketPrices = {...workbook.marketPrices}, priceHistory = {...workbook.priceHistory};
  for (const [ticker,points] of Object.entries(shared)) {
    const valid = points.filter(p => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(Date.parse(p.time || p.date)));
    if (!valid.length) continue;
    const manual = workbook.priceHistory[ticker] || [];
    const ordered = [...valid,...manual].sort(compareLivePricePoints);
    priceHistory[ticker] = ordered;
    const latestShared = valid.reduce((a,b) => compareLivePricePoints(a,b) >= 0 ? a : b);
    const latestManual = manual.reduce<PricePoint | null>((a,b) => !a || compareLivePricePoints(b,a) >= 0 ? b : a,null);
    if (!latestManual || compareLivePricePoints(latestShared, latestManual) > 0) marketPrices[ticker] = latestShared.price;
  }
  return {...workbook, marketPrices, priceHistory};
}
