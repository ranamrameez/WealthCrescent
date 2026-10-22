import type { PSXWorkbook } from '../../types/psxWorkbook';
import type { PricePoint } from '../../types/workbook';

interface ScreenerRow { symbol?: unknown; price?: unknown }
interface ScreenerPayload { data?: unknown; meta?: { timestamp?: unknown } }

export function pakistanDay(time: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function parsePsxScreener(payload: ScreenerPayload, fallbackTime = new Date().toISOString()): Record<string, PricePoint[]> {
  if (!Array.isArray(payload.data)) throw new Error('PSX Data returned an unexpected response.');
  const suppliedTime = typeof payload.meta?.timestamp === 'string' ? payload.meta.timestamp : '';
  const time = Number.isFinite(Date.parse(suppliedTime)) ? suppliedTime : fallbackTime;
  const date = pakistanDay(time);
  const points: Record<string, PricePoint[]> = {};
  for (const item of payload.data as ScreenerRow[]) {
    const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
    const price = Number(item?.price);
    if (!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(symbol) || !Number.isFinite(price) || price <= 0) continue;
    points[symbol] = [{ date, time, price }];
  }
  return points;
}

/** Adds live observations to the rendered workbook without persisting them
 * into the user's manual price history. A newer manual observation wins. */
export function applyLivePsx(workbook: PSXWorkbook, shared: Record<string, PricePoint[]>): PSXWorkbook {
  const marketPrices = { ...workbook.marketPrices };
  const priceHistory = { ...workbook.priceHistory };
  for (const [ticker, points] of Object.entries(shared)) {
    const valid = points.filter(point => Number.isFinite(point.price) && point.price > 0 && Number.isFinite(Date.parse(point.time || point.date)));
    if (!valid.length) continue;
    const manual = workbook.priceHistory[ticker] || [];
    const latestLive = valid.reduce((a, b) => Date.parse(a.time || a.date) >= Date.parse(b.time || b.date) ? a : b);
    const latestManual = manual.reduce<PricePoint | null>((latest, point) => !latest || Date.parse(point.time || point.date) >= Date.parse(latest.time || latest.date) ? point : latest, null);
    priceHistory[ticker] = [...valid, ...manual].sort((a, b) => Date.parse(a.time || a.date) - Date.parse(b.time || b.date));
    if (!latestManual || Date.parse(latestLive.time || latestLive.date) > Date.parse(latestManual.time || latestManual.date)) marketPrices[ticker] = latestLive.price;
  }
  return { ...workbook, marketPrices, priceHistory };
}
