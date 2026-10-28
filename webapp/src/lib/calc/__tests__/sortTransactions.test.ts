import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../../types/workbook';
import { sortTransactionsChronological } from '../sortTransactions';

function tx(partial: Partial<Transaction>): Transaction {
  return { date: '2026-01-01', ticker: 'ABC', action: 'BUY', shares: 1, price: 100, ...partial };
}

describe('sortTransactionsChronological', () => {
  it('uses lifetime transactionIndex as the sole ordering source, even across trade dates', () => {
    const sorted = sortTransactionsChronological([
      tx({ date: '2026-10-27', action: 'BUY', transactionIndex: 1 }),
      tx({ date: '2026-10-18', action: 'SELL', transactionIndex: 2 }),
      tx({ date: '2026-10-18', action: 'BUY', transactionIndex: 3 }),
    ]);
    expect(sorted.map(t => [t.date, t.action])).toEqual([
      ['2026-10-27', 'BUY'], ['2026-10-18', 'SELL'], ['2026-10-18', 'BUY'],
    ]);
  });

  it('does not prioritize BUY over SELL when the explicit order says otherwise', () => {
    const sorted = sortTransactionsChronological([
      tx({ action: 'BUY', transactionIndex: 2 }),
      tx({ action: 'SELL', transactionIndex: 1 }),
    ]);
    expect(sorted.map(t => t.action)).toEqual(['SELL', 'BUY']);
  });

  it('sorts by transactionIndex, not array position or legacy seq', () => {
    const first = tx({ shares: 5, seq: 9, transactionIndex: 1 });
    const second = tx({ shares: 10, seq: 1, transactionIndex: 2 });
    expect(sortTransactionsChronological([second, first]).map(t => t.shares)).toEqual([5, 10]);
  });

  it('places indexed rows before legacy rows that have not yet been normalized', () => {
    const legacy = tx({ shares: 10 });
    const indexed = tx({ shares: 5, transactionIndex: 4 });
    expect(sortTransactionsChronological([legacy, indexed]).map(t => t.shares)).toEqual([5, 10]);
  });
});
