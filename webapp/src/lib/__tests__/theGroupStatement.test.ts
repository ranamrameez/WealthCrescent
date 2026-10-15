import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseTheGroupStatement, readStatementXlsx } from '../theGroupStatement';
const header = ['Date', 'Type', 'Count', 'Unit', 'Price', 'Amount', 'Due Balance', 'Balance'];
describe('The Group Cash statement', () => {
  it('reads XLSX values and blank shared strings without inventing content', () => {
    const bytes = zipSync({
      'xl/sharedStrings.xml': strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Date</t></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v></v></c><c r="F1"><v>-10</v></c></row></sheetData></worksheet>'),
    });
    const rows = readStatementXlsx(bytes);
    expect(rows[0][0]).toBe('Date'); expect(rows[0][1]).toBe(''); expect(rows[0][5]).toBe('-10');
  });
  it('uses price/quantity and transfer breakdowns, excluding rounded rewards and commission detail rows', () => {
    const result = parseTheGroupStatement([header,
      ['15/10/2026', 'Buy', '2', 'Qatar Fuel', '12.24', '-25'],
      ['', 'Buy', '2', 'Qatar Fuel', '12.24', '-25'], ['', 'Commission', '', '', '', '-1'],
      ['15/10/2026', 'SWIFT TR. FROM', '', '', '', '6000'],
      ['', 'SWIFT TR. FROM', '', '', '', '6010'], ['', 'Electronic Transfer', '', '', '', '-10'],
      ['15/10/2026', 'Trading Reward', '', '', '', '1'],
    ]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ ticker: 'QFLS', shares: 2, price: 12.24, action: 'BUY' });
    expect(result.records[1]).toMatchObject({ gross: 6010, fee: 10 });
    expect(result.warning).toContain('1 rounded reward rows');
  });
  it('preserves combined fills and stable IDs on repeated import', () => {
    const existing = [{ kind: 'trade' as const, id: 'buy', date: '2026-10-14', ticker: 'QFLS', action: 'BUY' as const, shares: 2, price: 11.8 }];
    const result = parseTheGroupStatement([header, ['14/10/2026', 'Buy', '1', 'Qatar Fuel', '11.8'], ['14/10/2026', 'Buy', '1', 'Qatar Fuel', '11.8']], existing);
    expect(result.records).toEqual(existing);
  });
  it('rejects ambiguous overlaps, invalid dates, unknown stocks and nearby misdated trades', () => {
    const existing = [{ kind: 'trade' as const, id: 'buy', date: '2026-10-14', ticker: 'QFLS', action: 'BUY' as const, shares: 2, price: 11.8 }];
    expect(() => parseTheGroupStatement([header, ['14/10/2026', 'Buy', '3', 'Qatar Fuel', '11.8']], existing)).toThrow(/quantities differ/);
    expect(() => parseTheGroupStatement([header, ['31/02/2026', 'Buy', '3', 'Qatar Fuel', '11.8']])).toThrow(/invalid date/);
    expect(() => parseTheGroupStatement([header, ['14/10/2026', 'Buy', '3', 'Unknown', '11.8']])).toThrow(/Unknown statement stock/);
    expect(() => parseTheGroupStatement([header, ['15/10/2026', 'Buy', '2', 'Qatar Fuel', '11.8']], existing)).toThrow(/different date/);
  });
});
