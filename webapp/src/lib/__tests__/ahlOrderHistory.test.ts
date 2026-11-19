import { describe, expect, it } from 'vitest';
import { parseAhlOrderHistory } from '../ahlOrderHistory';
import { readPsxBrokerTables } from '../psxCashStatement';
import { classifyAhlFills } from '../../services/finance/ahlOrderReview';
import type { Transaction } from '../../types/workbook';

const headers = ['Scrip', 'Quantity', 'Gross Rate', 'Net Amount', 'Type', 'Execution Date', 'Clearing Date'];
const fill = ['OGDC', '1,000', '312.70', '312,700', 'BUY', 'Nov 13, 2026', 'Nov 16, 2026'];
const otherPrice = fill.map((value, index) => index === 2 ? '312.50' : value);

describe('AHL order history', () => {
  it('uses execution dates, keeps clearing dates and preserves distinct identical fills', () => {
    const rows = parseAhlOrderHistory([[['AHL Order History'], headers, fill, fill]]);
    expect(rows[0]).toMatchObject({ ticker: 'OGDC', shares: 1000, price: 312.7, action: 'BUY', date: '2026-11-13', clearingDate: '2026-11-16' });
    expect(rows[0].sourceId).not.toBe(rows[1].sourceId);
  });

  it('reads the order table from a saved broker HTML text file', async () => {
    const cells = (row: string[], tag: string) => `<tr>${row.map(value => `<${tag}>${value}</${tag}>`).join('')}</tr>`;
    const { tables, dateSystem } = await readPsxBrokerTables(new File([
      `<table><tr><td>Header</td></tr></table><table>${cells(headers, 'th')}${cells(fill, 'td')}</table>`,
    ], 'AHL-order_history.html.txt'));
    expect(parseAhlOrderHistory(tables, dateSystem)).toHaveLength(1);
  });

  it('distinguishes fills already saved from overlapping and new ones', () => {
    const rows = parseAhlOrderHistory([[headers, fill, fill, otherPrice, ['DCR', '10', '39.37', '', 'SELL', '13/11/2026', '16/11/2026']]]);
    const records: Transaction[] = [{ ...rows[0], id: rows[0].sourceId + ':AHL' }];
    expect(classifyAhlFills(rows, records, 'AHL').map(row => row.status)).toEqual(['existing', 'overlap', 'overlap', 'new']);
    expect(classifyAhlFills(rows, [{ ...rows[0], id: 'manual' }], 'AHL').map(row => row.status)).toEqual(['existing', 'overlap', 'overlap', 'new']);
  });

  it('rejects account statements and invalid fills', () => {
    expect(() => parseAhlOrderHistory([[['Date', 'Description', 'Debit', 'Credit']]])).toThrow('No AHL fills found');
    expect(() => parseAhlOrderHistory([[headers, ['OGDC', '10.5', '312.70', '', 'BUY', 'Nov 13, 2026']]])).toThrow('Invalid AHL order');
  });
});
