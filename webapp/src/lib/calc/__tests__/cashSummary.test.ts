import { describe, expect, it } from 'vitest';
import { cashSummary } from '../cashSummary';

describe('cashSummary dividend cash treatment', () => {
  it('includes recorded dividends in cash balance, net worth and net P/L', () => {
    const dividends = [{ id: 'dividend', date: '2026-01-02', ticker: 'AAA', perShare: 0.5, shares: 10, amount: 5 }];
    const result = cashSummary([], [], [], {}, () => 0, [], dividends);
    expect(result.totalDividends).toBe(5);
    expect(result.cashBalance).toBe(5);
    expect(result.netWorth).toBe(5);
    expect(result.netPL).toBe(5);
    expect(result.ledger[0]).toMatchObject({ kind: 'dividend', sourceId: 'dividend', amount: 5, balance: 5 });
  });
});
