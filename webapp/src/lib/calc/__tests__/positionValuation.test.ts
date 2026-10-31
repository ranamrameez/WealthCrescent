import { describe, expect, it } from 'vitest';
import { calculatePositionMarketValue } from '../positionValuation';

describe('calculatePositionMarketValue', () => {
  const position = { shares: 10, invested: 100 } as const;
  const calcFee = (amount: number) => amount * 0.01;

  it('calculates net market value and unrealized P/L with the shared fee contract', () => {
    expect(calculatePositionMarketValue(position, 12, calcFee)).toEqual({
      marketPrice: 12,
      value: 120,
      sellFee: 1.2,
      profit: 18.8,
      roiPct: 18.8,
    });
  });

  it('does not invent an unrealized loss when no valid market price exists', () => {
    const result = calculatePositionMarketValue(position, 0, calcFee);
    expect(result.value).toBe(0);
    expect(result.sellFee).toBe(0);
    expect(Number.isNaN(result.profit)).toBe(true);
    expect(Number.isNaN(result.roiPct)).toBe(true);
  });
});
