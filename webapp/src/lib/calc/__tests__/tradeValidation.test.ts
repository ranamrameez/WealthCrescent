import { describe, expect, it } from 'vitest';
import { tradePriceDeviationPct, validateSellQuantities, validateTransactionEdit } from '../tradeValidation';

describe('validateSellQuantities', () => {
  it('blocks a sell above current holdings', () => {
    expect(validateSellQuantities([{ ticker: 'PSO', action: 'SELL', shares: 11 }], { PSO: 10 }))
      .toEqual({ index: 0, ticker: 'PSO', requested: 11, available: 10 });
  });

  it('reserves shares across multiple rows and allows a preceding buy to fund a later sell', () => {
    expect(validateSellQuantities([
      { ticker: 'PSO', action: 'SELL', shares: 6 },
      { ticker: 'PSO', action: 'SELL', shares: 5 },
    ], { PSO: 10 })?.available).toBe(4);
    expect(validateSellQuantities([
      { ticker: 'PSO', action: 'BUY', shares: 5 },
      { ticker: 'pso', action: 'SELL', shares: 15 },
    ], { PSO: 10 })).toBeNull();
  });

  it('does not confuse one ticker with another', () => {
    expect(validateSellQuantities([{ ticker: 'PSO', action: 'SELL', shares: 1 }], { OGDC: 100 }))
      .toEqual({ index: 0, ticker: 'PSO', requested: 1, available: 0 });
  });
});

describe('tradePriceDeviationPct', () => {
  it('returns a signed deviation from the known market price', () => {
    expect(tradePriceDeviationPct(110, 100)).toBe(10);
    expect(tradePriceDeviationPct(90, 100)).toBe(-10);
    expect(tradePriceDeviationPct(100, 0)).toBeNull();
  });
});

describe('validateTransactionEdit', () => {
  const buy = (id: string, date: string, shares: number, seq: number) => ({ id, date, seq, ticker: 'PSO', action: 'BUY' as const, shares, price: 100 });
  const sell = (id: string, date: string, shares: number, seq: number) => ({ id, date, seq, ticker: 'PSO', action: 'SELL' as const, shares, price: 100 });

  it('rejects a historical sell edit using holdings available on that date, not later buys', () => {
    const existing = [buy('b1', '2026-01-01', 10, 1), sell('s1', '2026-01-02', 5, 2), buy('b2', '2026-01-03', 20, 3)];
    const candidate = [existing[0], sell('s1', '2026-01-02', 15, 2), existing[2]];
    expect(validateTransactionEdit(existing, candidate)).toEqual({ ticker: 'PSO', additionalUnmatchedShares: 5 });
  });

  it('rejects reducing an earlier buy when that creates a later oversell', () => {
    const existing = [buy('b1', '2026-01-01', 100, 1), sell('s1', '2026-01-02', 80, 2)];
    const candidate = [buy('b1', '2026-01-01', 50, 1), existing[1]];
    expect(validateTransactionEdit(existing, candidate)).toEqual({ ticker: 'PSO', additionalUnmatchedShares: 30 });
  });

  it('allows an edit that does not increase a pre-existing legacy discrepancy', () => {
    const existing = [buy('b1', '2026-01-01', 5, 1), sell('s1', '2026-01-02', 10, 2)];
    const candidate = [existing[0], { ...existing[1], price: 105 }];
    expect(validateTransactionEdit(existing, candidate)).toBeNull();
  });

  it('ignores pending orders consistently with position accounting', () => {
    const existing = [buy('b1', '2026-01-01', 5, 1)];
    const candidate = [existing[0], { ...sell('s1', '2026-01-02', 20, 2), isPending: true }];
    expect(validateTransactionEdit(existing, candidate)).toBeNull();
  });
});
