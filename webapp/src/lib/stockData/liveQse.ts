import type { Workbook, PricePoint } from '../../types/workbook';
export function applyLiveQse(workbook: Workbook, shared: Record<string, PricePoint[]>): Workbook {
  const marketPrices = {...workbook.marketPrices}, priceHistory = {...workbook.priceHistory};
  for (const [ticker,points] of Object.entries(shared)) {
    const valid = points.filter(p => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(Date.parse(p.time || p.date)));
    if (!valid.length) continue;
    const manual = workbook.priceHistory[ticker] || [];
    const ordered = [...valid,...manual].sort((a,b) => Date.parse(a.time || a.date) - Date.parse(b.time || b.date));
    priceHistory[ticker] = ordered;
    const latestShared = valid.reduce((a,b) => Date.parse(a.time || a.date) >= Date.parse(b.time || b.date) ? a : b);
    const latestManual = manual.reduce<PricePoint | null>((a,b) => !a || Date.parse(b.time || b.date) >= Date.parse(a.time || a.date) ? b : a,null);
    if (!latestManual || Date.parse(latestShared.time || latestShared.date) > Date.parse(latestManual.time || latestManual.date)) marketPrices[ticker] = latestShared.price;
  }
  return {...workbook, marketPrices, priceHistory};
}
