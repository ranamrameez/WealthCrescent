import { inferDateOrder, statementDate } from './psxCashStatement';
import type { Transaction } from '../types/workbook';

export type AhlFill = Pick<Transaction, 'date' | 'ticker' | 'action' | 'shares' | 'price'> & {
  clearingDate?: string;
  sourceId: string;
};

const required = ['scrip', 'quantity', 'gross rate', 'type', 'execution date'];
export const ahlFillKey = (fill: Pick<AhlFill, 'date' | 'ticker' | 'action' | 'shares' | 'price'>) =>
  [fill.date, fill.ticker.trim().toUpperCase(), fill.action, fill.shares, fill.price].join(':');

export function parseAhlOrderHistory(tables: string[][][], dateSystem?: '1900' | '1904'): AhlFill[] {
  const fills: AhlFill[] = [];
  const counts = new Map<string, number>();
  const header = (cell: string) => cell.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const table of tables) {
    const headerIndex = table.findIndex(row => required.every(key => row.map(header).includes(key)));
    if (headerIndex === -1) continue;
    const columns = table[headerIndex].map(header);
    const rows = table.slice(headerIndex + 1).filter(row => {
      const ticker = row[columns.indexOf('scrip')]?.trim();
      return ticker && !/^(?:grand total|totals?|scrip)$/i.test(ticker);
    });
    const order = inferDateOrder(rows.flatMap(row => ['execution date', 'clearing date'].map(key => row[columns.indexOf(key)]?.trim() ?? ''))) ?? 'day-first';
    for (const row of rows) {
      const get = (key: string) => row[columns.indexOf(key)]?.trim() ?? '';
      const ticker = get('scrip').toUpperCase();
      const action = get('type').toUpperCase();
      const quantity = get('quantity');
      const rate = get('gross rate');
      const shares = Number(quantity.replaceAll(',', ''));
      const price = Number(rate.replaceAll(',', ''));
      if (!/^[A-Z0-9][A-Z0-9.&-]*$/.test(ticker) || (action !== 'BUY' && action !== 'SELL') ||
        !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(quantity) || !Number.isSafeInteger(shares) || shares <= 0 ||
        !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(rate) || !Number.isFinite(price) || price <= 0) {
        throw new Error(`Invalid AHL order for ${ticker} on ${get('execution date')}. Check the side, quantity and price.`);
      }
      const date = statementDate(get('execution date'), dateSystem, order);
      const clearingDate = get('clearing date') ? statementDate(get('clearing date'), dateSystem, order) : undefined;
      const fill: Omit<AhlFill, 'sourceId' | 'clearingDate'> = { date, ticker, action, shares, price };
      const key = ahlFillKey(fill);
      const occurrence = (counts.get(key) ?? 0) + 1;
      counts.set(key, occurrence);
      fills.push({ ...fill, clearingDate, sourceId: `ahl-order:${key}:${occurrence}` });
    }
  }
  if (!fills.length) throw new Error('No AHL fills found. Use an order history export with Scrip, Quantity, Gross Rate, Type and Execution Date.');
  return fills;
}
