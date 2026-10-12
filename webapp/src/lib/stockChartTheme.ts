// Match the Action column badges. Green/red are reserved for P/L.
export const STOCK_BUY_COLOR = '#5ab0e2';
export const STOCK_SELL_COLOR = '#f2b563';
export const STOCK_HOLDINGS_COLOR = '#a78bfa';
export const STOCK_UP_COLOR = '#16a34a';
export const STOCK_DOWN_COLOR = '#dc2626';
export const STOCK_NEUTRAL_COLOR = '#2563eb';

export function stockPriceChangeColor(current: number | undefined, previousClose: number | undefined) {
  if (!Number.isFinite(current) || !Number.isFinite(previousClose)) return STOCK_NEUTRAL_COLOR;
  return current! >= previousClose! ? STOCK_UP_COLOR : STOCK_DOWN_COLOR;
}
const palette = [STOCK_BUY_COLOR, STOCK_SELL_COLOR, STOCK_HOLDINGS_COLOR, '#c9a35a', '#8a97a3', '#c95a8f'];
export function stockTickerColor(symbol: string) {
  let hash = 0;
  for (const char of symbol) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
