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
    expect(result.warning).toContain('1 missing rounded reward rows excluded');
  });
  it('preserves combined fills and stable IDs on repeated import', () => {
    const existing = [{ kind: 'trade' as const, id: 'buy', date: '2026-10-14', ticker: 'QFLS', action: 'BUY' as const, shares: 2, price: 11.8 }];
    const result = parseTheGroupStatement([header, ['14/10/2026', 'Buy', '1', 'Qatar Fuel', '11.8'], ['14/10/2026', 'Buy', '1', 'Qatar Fuel', '11.8']], existing);
    expect(result.records).toEqual([{ ...existing[0], accountingOrder: 1 }]);
  });
  it('rejects ambiguous overlaps, invalid dates, unknown stocks and nearby misdated trades', () => {
    const existing = [{ kind: 'trade' as const, id: 'buy', date: '2026-10-14', ticker: 'QFLS', action: 'BUY' as const, shares: 2, price: 11.8 }];
    expect(() => parseTheGroupStatement([header, ['14/10/2026', 'Buy', '3', 'Qatar Fuel', '11.8']], existing)).toThrow(/quantities differ/);
    expect(() => parseTheGroupStatement([header, ['31/02/2026', 'Buy', '3', 'Qatar Fuel', '11.8']])).toThrow(/invalid date/);
    expect(() => parseTheGroupStatement([header, ['14/10/2026', 'Buy', '3', 'Unknown', '11.8']])).toThrow(/Unknown statement stock/);
    expect(() => parseTheGroupStatement([header, ['15/10/2026', 'Buy', '2', 'Qatar Fuel', '11.8']], existing)).toThrow(/different date/);
  });
});

it('keeps separated equal-price buys in statement order and retains fee overrides', () => {
  const statement = [header,
    ['01/11/2026', 'Buy', '10', 'QIB', '20'],
    ['01/11/2026', 'Sell', '10', 'QIB', '21'],
    ['01/11/2026', 'Buy', '10', 'QIB', '20'],
  ];
  const initial = parseTheGroupStatement(statement).records;
  expect(initial.map(r => r.kind === 'trade' ? r.action : '')).toEqual(['BUY', 'SELL', 'BUY']);
  const existing = initial.map((r, i) => ({ ...r, id: String(i), ...(r.kind === 'trade' ? { feeOverride: 0.1 } : {}) }));
  expect(parseTheGroupStatement(statement, existing).records).toEqual(existing);
  expect(() => parseTheGroupStatement(statement, [{ kind: 'trade', id: 'combined', date: '2026-11-01', ticker: 'QIBK', action: 'BUY', shares: 20, price: 20 }])).toThrow(/cross other trades/);
});
it('corrects a unique price without adding a duplicate trade and preserves exact rewards', () => {
  const statement = [header, ['01/11/2026', 'Sell', '601', 'Rayyan B', '1.835'], ['01/11/2026', 'Trading Reward', '', '', '', '0']];
  const existing = [
    { kind: 'trade' as const, id: 'sale', date: '2026-11-01', ticker: 'MARK', action: 'SELL' as const, shares: 601, price: 1.836, feeOverride: 3 },
    { kind: 'adjustment' as const, id: 'reward', date: '2026-11-01', amount: 0.34, note: 'Trading reward' },
  ];
  const result = parseTheGroupStatement(statement, existing);
  expect(result.records).toHaveLength(2);
  expect(result.records[0]).toMatchObject({ id: 'sale', price: 1.835, feeOverride: 3 });
  expect(result.records[1]).toMatchObject({ id: 'reward', amount: 0.34 });
  expect(parseTheGroupStatement(statement, result.records).records).toEqual(result.records);
});
it('does not collapse two new same-day deposits', () => {
  const deposit = [['01/11/2026', 'SWIFT TR. FROM', '', '', '', '90'], ['', 'SWIFT TR. FROM', '', '', '', '100'], ['', 'Electronic Transfer', '', '', '', '-10']];
  expect(parseTheGroupStatement([header, ...deposit, ...deposit]).records).toHaveLength(2);
});
it('matches same-day deposits by amount and keeps their precise stored gross and fee', () => {
 const deposit = (gross: string) => [['01/11/2026', 'SWIFT TR. FROM', '', '', '', '90'], ['', 'SWIFT TR. FROM', '', '', '', gross], ['', 'Electronic Transfer', '', '', '', '-10']];
 const rows = [header,...deposit('100'),...deposit('200')];
 const existing = [{kind:'transfer' as const,id:'a',date:'2026-11-01',type:'DEPOSIT' as const,gross:100.12,fee:10.01},{kind:'transfer' as const,id:'b',date:'2026-11-01',type:'DEPOSIT' as const,gross:200.23,fee:10.02}];
 const parsed = parseTheGroupStatement(rows,existing).records;
 expect(parsed).toHaveLength(2);
 expect(parsed[0]).toMatchObject({id:'a',gross:100.12,fee:10.01});
 expect(parsed[1]).toMatchObject({id:'b',gross:200.23,fee:10.02});
 expect(parseTheGroupStatement(rows,parsed).records).toEqual(parsed);
});
