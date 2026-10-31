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


it('deducts fees allocated to unmatched oversell shares without treating their proceeds as realized profit', () => {
  const transactions = [
    { id: 'buy', date: '2026-01-01', ticker: 'AAA', action: 'BUY' as const, shares: 10, price: 10 },
    { id: 'oversell', date: '2026-01-02', ticker: 'AAA', action: 'SELL' as const, shares: 15, price: 10 },
  ];
  const calcFee = (tx: { action: string }) => tx.action === 'SELL' ? 10 : 0;
  const result = cashSummary(transactions, [], [], {}, calcFee);
  expect(result.unmatchedSellFees).toBeCloseTo(10 / 3, 8);
  expect(result.netPL).toBeCloseTo(-10 / 3, 8);
  expect(result.cashBalance).toBeCloseTo(40, 8);
});
