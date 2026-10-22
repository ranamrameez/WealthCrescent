import type { PSXWorkbook } from '../../types/psxWorkbook';
import type { PricePoint } from '../../types/workbook';
import { marketRows } from './marketPageModel';

/** Merge recorded observations in chronological order before calculating changes. */
export function psxMarketRows(workbook: PSXWorkbook, ticker: string, live: Record<string, PricePoint[]>) {
  const manual = workbook.priceHistory[ticker] || [];
  const recorded = manual.length
    ? manual.map((point, index) => ({ ...point, id: 'price-' + index, source: 'manual' as const }))
    : workbook.transactions.filter(tx => tx.ticker === ticker).map((tx, index) => ({ date: tx.date, time: tx.time, price: tx.price, id: 'trade-' + index, source: 'manual' as const }));
  const shared = (live[ticker] || []).map((point, index) => ({ ...point, id: 'live-' + index, source: 'shared' as const }));
  return marketRows([...shared, ...recorded].toSorted((a, b) => (b.time || b.date).localeCompare(a.time || a.date)));
}
