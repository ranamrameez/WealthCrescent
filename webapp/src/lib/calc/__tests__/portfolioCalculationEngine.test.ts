import { describe, expect, it } from 'vitest';
import { calculatePortfolio } from '../portfolioCalculationEngine';

describe('central portfolio calculation pipeline', () => {
  it('changes cost-basis outputs while keeping cash movement and market value method-independent', () => {
    const input = {
      transactions: [
        { id: 'buy-1', date: '2026-01-01', ticker: 'AAA', action: 'BUY' as const, shares: 10, price: 10, accountingOrder: 1 },
        { id: 'buy-2', date: '2026-01-02', ticker: 'AAA', action: 'BUY' as const, shares: 10, price: 20, accountingOrder: 1 },
        { id: 'sell-1', date: '2026-01-03', ticker: 'AAA', action: 'SELL' as const, shares: 5, price: 30, accountingOrder: 1 },
      ],
      transfers: [{ id: 'deposit', date: '2026-01-01', type: 'DEPOSIT' as const, gross: 1000, fee: 0, accountingOrder: 2 }],
      adjustments: [{ id: 'reward', date: '2026-01-03', amount: 5, note: 'Reward', accountingOrder: 2 }],
      dividends: [{ id: 'dividend', date: '2026-01-03', ticker: 'AAA', perShare: 0.5, shares: 15, amount: 7.5, accountingOrder: 3 }],
      marketPrices: { AAA: 25 },
      calcFee: () => 0,
      feePct: 0,
      tick: 0.01,
    };
    const before = JSON.stringify(input);
    const average = calculatePortfolio({ ...input, costBasisMethod: 'average' });
    const fifo = calculatePortfolio({ ...input, costBasisMethod: 'fifo' });

    expect(average.positions[0].shares).toBe(fifo.positions[0].shares);
    expect(average.positions[0].invested).not.toBe(fifo.positions[0].invested);
    expect(average.positionRows[0].value).toBe(fifo.positionRows[0].value);
    expect(average.positionRows[0].breakEvenPrice).not.toBe(fifo.positionRows[0].breakEvenPrice);
    expect(average.positionRows[0].avgCost).toBeCloseTo(15, 8);
    expect(fifo.positionRows[0].avgCost).toBeCloseTo(16.6666667, 6);
    expect(average.cashLedger).toEqual(fifo.cashLedger);
    expect(average.cashSummary.cashBalance).toBeCloseTo(fifo.cashSummary.cashBalance, 8);
    expect(average.cashSummary.portfolioValue).toBeCloseTo(fifo.cashSummary.portfolioValue, 8);
    expect(average.cashSummary.totalDividends).toBe(7.5);
    expect(average.cashLedger.some(event => event.kind === 'dividend' && event.sourceId === 'dividend')).toBe(true);
    expect(average.cashSummary.realizedPL).not.toBe(fifo.cashSummary.realizedPL);
    expect(average.cashSummary.unrealizedPL).not.toBe(fifo.cashSummary.unrealizedPL);
    expect(average.cashSummary.netPL).toBeCloseTo(fifo.cashSummary.netPL, 8);
    const averageAgain = calculatePortfolio({ ...input, costBasisMethod: 'average' });
    expect(averageAgain.positions).toEqual(average.positions);
    expect(averageAgain.realizedSeries).toEqual(average.realizedSeries);
    expect(JSON.stringify(input)).toBe(before);
  });
});
