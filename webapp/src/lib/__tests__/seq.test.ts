import { describe, expect, it } from 'vitest';
import { assignSeqForEntities, backfillSeq, getAccountingEventRefs, nextSeq, nextSeqForEntity, syncAccountingEventCollections, syncTransactionIndexes } from '../seq';

describe('nextSeq', () => {
  it('returns 1 for an empty array', () => {
    expect(nextSeq([])).toBe(1);
  });

  it('returns one more than the highest existing seq', () => {
    expect(nextSeq([{ seq: 1 }, { seq: 5 }, { seq: 3 }])).toBe(6);
  });

  it('treats a missing seq as 0', () => {
    expect(nextSeq([{ seq: 2 }, {}])).toBe(3);
  });
});

describe('backfillSeq', () => {
  it('leaves records untouched when every record already has a seq', () => {
    const records = [{ id: 'a', seq: 1 }, { id: 'b', seq: 2 }];
    expect(backfillSeq(records, records)).toBe(records); // same reference, no-op
  });

  it('assigns increasing seq in chronological order, preserving the original array order', () => {
    const c: { id: string; date: string; seq?: number } = { id: 'c', date: '2026-01-03' }; // seq missing
    const a: { id: string; date: string; seq?: number } = { id: 'a', date: '2026-01-01' }; // seq missing
    const b: { id: string; date: string; seq?: number } = { id: 'b', date: '2026-01-02' }; // seq missing
    // Stored (original) array order is c, a, b — deliberately NOT chronological.
    const records = [c, a, b];
    const chronological = [a, b, c]; // caller's own best-guess chronological order
    const result = backfillSeq(records, chronological);
    // Original array order preserved.
    expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    // Seq assigned in chronological order: a=1, b=2, c=3.
    const byId = Object.fromEntries(result.map((r) => [r.id, r.seq]));
    expect(byId.a).toBe(1);
    expect(byId.b).toBe(2);
    expect(byId.c).toBe(3);
  });

  it('never assigns a backfilled seq lower than an already-present one', () => {
    const old: { id: string; date: string; seq?: number } = { id: 'old', date: '2026-01-01', seq: 100 }; // already has a real seq
    const newer: { id: string; date: string; seq?: number } = { id: 'newer', date: '2026-01-02' }; // missing seq, chronologically after `old`
    const records = [old, newer];
    const result = backfillSeq(records, [old, newer]);
    const byId = Object.fromEntries(result.map((r) => [r.id, r.seq]));
    expect(byId.old).toBe(100);
    expect(byId.newer).toBeGreaterThan(100);
  });
});

describe('nextSeqForEntity', () => {
  it('numbers each entity independently — a different entity in `existing` never affects the result', () => {
    const existing = [
      { ticker: 'AAPL', seq: 1 },
      { ticker: 'AAPL', seq: 2 },
      { ticker: 'GOOG', seq: 1 },
      { ticker: 'GOOG', seq: 2 },
      { ticker: 'GOOG', seq: 3 },
    ];
    // AAPL only has 2 records — its next is 3, not 6, even though GOOG's
    // records also carry high seq values in the same combined array.
    expect(nextSeqForEntity(existing, (r) => r.ticker, 'AAPL')).toBe(3);
    expect(nextSeqForEntity(existing, (r) => r.ticker, 'GOOG')).toBe(4);
  });

  it('returns 1 for an entity with no existing records at all', () => {
    const existing = [{ ticker: 'AAPL', seq: 1 }];
    expect(nextSeqForEntity(existing, (r) => r.ticker, 'MSFT')).toBe(1);
  });
});

describe('assignSeqForEntities', () => {
  it('numbers a batch spanning multiple entities independently, per entity', () => {
    const existing: { ticker: string; seq?: number }[] = [{ ticker: 'AAPL', seq: 5 }];
    const batch: { ticker: string; seq?: number }[] = [
      { ticker: 'AAPL' },
      { ticker: 'GOOG' },
      { ticker: 'AAPL' },
      { ticker: 'GOOG' },
    ];
    const result = assignSeqForEntities(existing, batch, (r) => r.ticker);
    // AAPL already had seq 5 in `existing`, so its two new batch rows continue from there.
    expect(result.filter((r) => r.ticker === 'AAPL').map((r) => r.seq)).toEqual([6, 7]);
    // GOOG had nothing in `existing`, so its two new batch rows start fresh at 1.
    expect(result.filter((r) => r.ticker === 'GOOG').map((r) => r.seq)).toEqual([1, 2]);
  });

  it('leaves a record that already carries a seq untouched', () => {
    const result = assignSeqForEntities([], [{ ticker: 'AAPL', seq: 42 }], (r: { ticker: string; seq?: number }) => r.ticker);
    expect(result[0].seq).toBe(42);
  });
});


describe('syncAccountingEventCollections', () => {
  it('backfills one same-day sequence across trades, transfers, adjustments and dividends', () => {
    const result = syncAccountingEventCollections({
      transactions: [{ id: 'trade-a', date: '2026-01-01', time: '10:00', action: 'BUY', globalTransactionIndex: 1, accountingOrder: 0 }],
      transfers: [{ id: 'transfer', date: '2026-01-01', time: '09:00', seq: 1, accountingOrder: 0 }],
      adjustments: [{ id: 'reward', date: '2026-01-01', time: '11:00', seq: 1, accountingOrder: 0 }],
      dividends: [{ id: 'dividend', date: '2026-01-01', time: '12:00', seq: 1, accountingOrder: 0 }],
    });
    expect(result.transfers[0].accountingOrder).toBe(1);
    expect(result.transactions[0].accountingOrder).toBe(2);
    expect(result.adjustments[0].accountingOrder).toBe(3);
    expect(result.dividends[0].accountingOrder).toBe(4);
  });

  it('preserves saved same-day ordering and appends newly added rows without changing dates', () => {
    const result = syncAccountingEventCollections({
      transactions: [{ id: 'trade', date: '2026-01-01', accountingOrder: 2, action: 'BUY', globalTransactionIndex: 1 }],
      transfers: [{ id: 'transfer', date: '2026-01-01', accountingOrder: 1, seq: 1 }],
      adjustments: [{ id: 'new-reward', date: '2026-01-01', seq: 2, accountingOrder: undefined as number | undefined }],
      dividends: [],
    });
    expect(result.transfers[0].accountingOrder).toBe(1);
    expect(result.transactions[0].accountingOrder).toBe(2);
    expect(result.adjustments[0].accountingOrder).toBe(3);
    expect(result.transactions[0].date).toBe('2026-01-01');
    expect(result.adjustments[0].date).toBe('2026-01-01');
  });

  it('reindexes trade compatibility fields from date plus shared same-day order', () => {
    const result = syncTransactionIndexes([
      { id: 'later', ticker: 'AAA', date: '2026-01-02', action: 'BUY', accountingOrder: 1, globalTransactionIndex: 1, perTickerIndex: 0 },
      { id: 'same-day-second', ticker: 'AAA', date: '2026-01-01', action: 'SELL', accountingOrder: 2, globalTransactionIndex: 2, perTickerIndex: 0 },
      { id: 'same-day-first', ticker: 'AAA', date: '2026-01-01', action: 'BUY', accountingOrder: 1, globalTransactionIndex: 3, perTickerIndex: 0 },
    ]);
    const byId = Object.fromEntries(result.map(row => [row.id, row]));
    expect(byId['same-day-first'].globalTransactionIndex).toBe(1);
    expect(byId['same-day-second'].globalTransactionIndex).toBe(2);
    expect(byId.later.globalTransactionIndex).toBe(3);
    expect(byId['same-day-first'].perTickerIndex).toBe(1);
    expect(byId['same-day-second'].perTickerIndex).toBe(2);
    expect(byId.later.perTickerIndex).toBe(3);
  });

  it('returns a mixed event stream with pending trades excluded', () => {
    const events = getAccountingEventRefs({
      transactions: [
        { id: 'trade', date: '2026-01-01', accountingOrder: 2 },
        { id: 'pending', date: '2026-01-01', accountingOrder: 3, isPending: true },
      ],
      transfers: [{ id: 'transfer', date: '2026-01-01', accountingOrder: 1 }],
      adjustments: [],
      dividends: [{ id: 'dividend', date: '2026-01-01', accountingOrder: 4 }],
    });
    expect(events.map(event => event.kind + ':' + event.id)).toEqual(['transfer:transfer', 'trade:trade', 'dividend:dividend']);
  });
});
