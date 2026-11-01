import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../../types/workbook';
import { sortTransactionsChronological } from '../sortTransactions';
import { syncTransactionIndexes } from '../../seq';

function tx(partial: Partial<Transaction>): Transaction {
  return { date: '2026-01-01', ticker: 'ABC', action: 'BUY', shares: 1, price: 100, ...partial };
}

describe('sortTransactionsChronological', () => {
  it('sorts by date first', () => {
    const sorted = sortTransactionsChronological([
      tx({ date: '2026-01-03', seq: 1 }),
      tx({ date: '2026-01-01', seq: 2 }),
      tx({ date: '2026-01-02', seq: 3 }),
    ]);
    expect(sorted.map((t) => t.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('keeps global and per-ticker indexes synchronized after a cross-ticker reorder', () => {
    const synced = syncTransactionIndexes([
      tx({ id: 'a1', ticker: 'AAA', globalTransactionIndex: 2 }),
      tx({ id: 'b1', ticker: 'BBB', globalTransactionIndex: 1 }),
      tx({ id: 'a2', ticker: 'AAA', globalTransactionIndex: 3 }),
    ]);
    const byId = Object.fromEntries(synced.map(row => [row.id, row]));
    expect(byId.b1.globalTransactionIndex).toBe(1);
    expect(byId.b1.perTickerIndex).toBe(1);
    expect(byId.a1.globalTransactionIndex).toBe(2);
    expect(byId.a1.perTickerIndex).toBe(1);
    expect(byId.a2.globalTransactionIndex).toBe(3);
    expect(byId.a2.perTickerIndex).toBe(2);
    expect(synced.every(row => row.transactionIndex === row.globalTransactionIndex && row.seq === row.perTickerIndex)).toBe(true);
  });

  it('always processes dates chronologically, regardless of legacy global indexes', () => {
    const sorted = sortTransactionsChronological([
      tx({ id: 'later-date', date: '2026-10-27', action: 'BUY', globalTransactionIndex: 1 }),
      tx({ id: 'earlier-date', date: '2026-10-18', action: 'SELL', globalTransactionIndex: 2 }),
    ]);
    expect(sorted.map(t => t.id)).toEqual(['earlier-date', 'later-date']);
  });

  it('uses the shared same-day accounting order ahead of trade-only compatibility indexes', () => {
    const sorted = sortTransactionsChronological([
      tx({ id: 'first-in-old-index', date: '2026-01-01', action: 'BUY', globalTransactionIndex: 1, accountingOrder: 2 }),
      tx({ id: 'second-in-old-index', date: '2026-01-01', action: 'SELL', globalTransactionIndex: 2, accountingOrder: 1 }),
    ]);
    expect(sorted.map(t => t.id)).toEqual(['second-in-old-index', 'first-in-old-index']);
  });

  it('uses recorded same-day time before legacy global indexes when no shared order exists', () => {
    const sorted = sortTransactionsChronological([
      tx({ id: 'later-time', date: '2026-01-01', time: '11:00', action: 'BUY', globalTransactionIndex: 1 }),
      tx({ id: 'earlier-time', date: '2026-01-01', time: '09:00', action: 'SELL', globalTransactionIndex: 2 }),
    ]);
    expect(sorted.map(row => row.id)).toEqual(['earlier-time', 'later-time']);
  });

  it('honors globalTransactionIndex over same-instant BUY-before-SELL fallback', () => {
    const sorted = sortTransactionsChronological([
      tx({ action: 'BUY', globalTransactionIndex: 2 }),
      tx({ action: 'SELL', globalTransactionIndex: 1 }),
    ]);
    expect(sorted.map(t => t.action)).toEqual(['SELL', 'BUY']);
  });

  it('keeps date chronology ahead of a legacy index while migration is pending', () => {
    const sorted = sortTransactionsChronological([
      tx({ id: 'legacy', date: '2026-01-01' }),
      tx({ id: 'indexed', date: '2026-01-02', globalTransactionIndex: 5 }),
    ]);
    expect(sorted.map(t => t.id)).toEqual(['legacy', 'indexed']);
  });

  it('puts BUY before SELL on an exact instant tie, regardless of seq', () => {
    const sorted = sortTransactionsChronological([
      tx({ action: 'SELL', seq: 1 }), // entered first, but a sell
      tx({ action: 'BUY', seq: 2 }), // entered second, but a buy
    ]);
    expect(sorted.map((t) => t.action)).toEqual(['BUY', 'SELL']);
  });

  it('falls back to seq (not array position) when BUY-before-SELL does not disambiguate', () => {
    // Two same-day BUYs, deliberately placed in the array in the OPPOSITE
    // order their seq implies — a real reorder (edit/delete-and-re-add/
    // import) that array-position-based tie-breaking would get wrong.
    const first = tx({ action: 'BUY', shares: 5, seq: 1 });
    const second = tx({ action: 'BUY', shares: 10, seq: 2 });
    const sorted = sortTransactionsChronological([second, first]); // array order: second, first
    expect(sorted.map((t) => t.shares)).toEqual([5, 10]); // seq order wins: first (seq 1), then second (seq 2)
  });

  it('treats a missing seq as 0, so an un-seq-ed record sorts before any seq-ed one on a tie', () => {
    const withSeq = tx({ action: 'SELL', shares: 10, seq: 5 });
    const withoutSeq = tx({ action: 'SELL', shares: 20 });
    const sorted = sortTransactionsChronological([withSeq, withoutSeq]);
    expect(sorted.map((t) => t.shares)).toEqual([20, 10]);
  });
});
