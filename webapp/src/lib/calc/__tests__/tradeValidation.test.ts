import { describe, expect, it } from 'vitest';
import { tradePriceDeviationPct, validateSellQuantities } from '../tradeValidation';

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
