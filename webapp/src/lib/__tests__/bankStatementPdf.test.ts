import { describe, expect, it } from 'vitest';
import { parseBankPdfStatement, pdfStatementLines } from '../bankStatementPdf';

describe('bank text PDF statement', () => {
  it('orders positioned text by row and column and preserves signed amounts', () => {
    const lines = pdfStatementLines([
      { text: 'Amount', x: 300, y: 100 },
      { text: 'Date', x: 15, y: 100 },
      { text: 'Description', x: 100, y: 99 },
      { text: '-1,250.05', x: 300, y: 80 },
      { text: 'Transfer', x: 100, y: 80 },
      { text: '1 Nov 2026', x: 15, y: 80 },
    ]);
    expect(parseBankPdfStatement([lines, ['Date Narration Amount', '2026-11-02 Deposit +20.00']])).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-11-01', 'Transfer', '-1250.05'],
      ['2026-11-02', 'Deposit', '+20.00'],
    ]);
  });

  it('rejects statements without a supported text table', () => {
    expect(() => parseBankPdfStatement([[]])).toThrow(/No supported text/);
    expect(() => parseBankPdfStatement([['Date Description Amount Balance', '2026-11-01 Transfer 2.00 12.00']])).toThrow(/No supported text/);
  });

  it('rejects ambiguous dates, malformed transactions and missing continuation headers', () => {
    expect(() => parseBankPdfStatement([['Date Description Amount', '01/11/2026 Transfer -10.00']])).toThrow(/month name/);
    expect(() => parseBankPdfStatement([['Date Description Amount', '2026-11-01 Transfer unclear']])).toThrow(/could not be read/);
    expect(() => parseBankPdfStatement([['Date Description Amount', '2026-11-01 Transfer -10.00'], ['2026-11-02 Deposit 20.00']])).toThrow(/missing/);
  });
});
