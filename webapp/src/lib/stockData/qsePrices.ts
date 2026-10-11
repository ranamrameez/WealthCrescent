import type { PricePoint } from '../../types/workbook';
export interface MarketObservation extends PricePoint {
  id: string;
  source: 'shared' | 'manual';
  dayHigh?: number | null;
  dayLow?: number | null;
  priceKey?: string;
}
export function qatarDay(time = new Date().toISOString()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Qatar', year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date(time));
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return part('year') + '-' + part('month') + '-' + part('day');
}
export function combinedQsePrices(shared: Record<string, PricePoint & {dayHigh?: number; dayLow?: number; priceKey?: string}> | null, manual: PricePoint[], from: string, to: string): MarketObservation[] {
  const rows: MarketObservation[] = [
    ...Object.entries(shared || {}).filter(([,p]) => p && Number.isFinite(p.price) && p.price > 0).map(([id,p]) => ({ ...p, id:'shared:'+id, source:'shared' as const })),
    ...manual.map((p,index) => ({ ...p,id:'manual:'+index,source:'manual' as const })),
  ];
  return rows.map(p => ({...p,date:p.time && Number.isFinite(Date.parse(p.time)) ? qatarDay(p.time) : p.date}))
    .filter(p => Number.isFinite(p.price) && p.price > 0 && p.date >= from && p.date <= to)
    .sort((a,b) => (b.time || b.date).localeCompare(a.time || a.date) || a.id.localeCompare(b.id));
}
