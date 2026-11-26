import { describe, expect, it } from 'vitest';
import { readStatementImportFile, suggestStatementColumn } from '../statementImportFile';

describe('shared statement intake', () => {
  it('preserves quoted delimiters and maps reordered headers by name', async () => {
    const [headers, ...rows] = await readStatementImportFile(new File([
      'Payment Amount;Memo;Transaction_Date\n12.35;"food; shop";2026-11-26',
    ], 'statement.txt'));
    expect(rows).toEqual([['12.35', 'food; shop', '2026-11-26']]);
    expect(suggestStatementColumn(headers, 'date')).toBe('Transaction_Date');
    expect(suggestStatementColumn(headers, 'amount')).toBe('Payment Amount');
  });

  it('requires an explicit choice when date or amount headers are ambiguous', async () => {
    const [headers] = await readStatementImportFile(new File([
      'Date,Posting Date,Amount,Amount\n2026-11-26,2026-11-27,12.35,99',
    ], 'statement.csv'));
    expect(new Set(headers).size).toBe(4);
    expect(suggestStatementColumn(headers, 'date')).toBe('');
    expect(suggestStatementColumn(headers, 'amount')).toBe('');
  });

  it('keeps JSON object keys aligned', async () => {
    expect(await readStatementImportFile(new File([
      '[{"date":"2026-11-26","amount":12.35},{"amount":-2,"category":"Grocery"}]',
    ], 'statement.json'))).toEqual([
      ['date', 'amount', 'category'], ['2026-11-26', '12.35', ''], ['', '-2', 'Grocery'],
    ]);
  });
});
