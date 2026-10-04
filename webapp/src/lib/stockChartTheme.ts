// Match the Action column badges. Green/red are reserved for P/L.
export const STOCK_BUY_COLOR = '#5ab0e2';
export const STOCK_SELL_COLOR = '#f2b563';
export const STOCK_HOLDINGS_COLOR = '#a78bfa';
const palette = [STOCK_BUY_COLOR, STOCK_SELL_COLOR, STOCK_HOLDINGS_COLOR, '#c9a35a', '#8a97a3', '#c95a8f'];
export function stockTickerColor(symbol: string) {
  let hash = 0;
  for (const char of symbol) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
