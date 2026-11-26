import { expect, it } from 'vitest';
import { extractStatementPdfTable, type StatementPdfLayout } from '../statementPdfTable';

const page = (rows: string[][]) => rows.flatMap((row, i) => row.map((text, j) => ({ text, x: j * 100, y: 800 - i * 18 })));

it.each<[StatementPdfLayout, string[], string[]]>([
  ['qse', ['Date', 'Type', 'Count', 'Unit', 'Price', 'Amount'], ['13/11/2026', 'Trading Reward', '', '', '', '1']],
  ['psx', ['Date', 'Description', 'Debit', 'Credit'], ['2026-11-13', 'Fund transfer', '', '100.25']],
  ['psx', ['Scrip', 'Quantity', 'Gross Rate', 'Type', 'Execution Date'], ['TEST', '10', '12.50', 'Buy', '13/11/2026']],
  ['installment', ['Payment Date', 'Paid Installment', 'Fine'], ['2026-11-13', '100', '']],
  ['funds', ['Index', 'Bank', 'FundCode', 'Name', 'Total Invested', 'Withdrawn', 'Notes', 'Current Balance', 'P/L', 'Currency', 'Risk'], ['1', 'Bank', 'TEST', 'Fund', '100', '0', '', '120', '20', 'PKR', 'Low']],
])('preserves positions and blank cells for %s across pages', (layout, headers, row) => {
  expect(extractStatementPdfTable([page([headers, row]), page([headers, row, ['Page 2 of 2']])], layout)).toEqual([headers, row, row]);
});

it('rejects missing or changed layouts instead of returning a partial table', () => {
  const first = page([['Date', 'Description', 'Debit', 'Credit'], ['2026-11-13', 'Fund transfer', '', '100.25']]);
  expect(() => extractStatementPdfTable([first, []], 'psx')).toThrow(/Each PDF page/);
  const next = page([['Date', 'Description', 'Credit', 'Debit'], ['2026-11-14', 'Fund transfer', '200', '']]);
  expect(() => extractStatementPdfTable([first, next], 'psx')).toThrow(/layout changes/);
});
