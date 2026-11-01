import { describe, expect, it } from 'vitest';
import type { FeeCalculator, Transaction } from '../../../types/workbook';
import { calculateStockPortfolio } from '../stockCalculationEngine';

const noFee: FeeCalculator = () => 0;
const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'tx',
  date: '2026-10-01',
  ticker: 'QIBK',
  action: 'BUY',
  shares: 1,
  price: 10,
  ...over,
});

describe('calculateStockPortfolio', () => {
  it.each(['average', 'fifo', 'lowestCostFirst'] as const)(
    'starts a fresh %s lifecycle after a position is fully closed',
    method => {
      const transactions = [
        tx({ id: 'buy-old', date: '2026-10-01', action: 'BUY', shares: 6, price: 10, globalTransactionIndex: 1 }),
        tx({ id: 'sell-old', date: '2026-10-01', action: 'SELL', shares: 6, price: 12, globalTransactionIndex: 2 }),
        tx({ id: 'buy-new-1', date: '2026-10-01', action: 'BUY', shares: 4, price: 15, globalTransactionIndex: 3 }),
        tx({ id: 'buy-new-2', date: '2026-10-01', action: 'BUY', shares: 2, price: 16, globalTransactionIndex: 4 }),
      ];
      const result = calculateStockPortfolio(transactions, noFee, method);
      const position = result.positions[0];

      expect(position.shares).toBe(6);
      expect(position.invested).toBeCloseTo(92, 8);
      expect(position.realized).toBeCloseTo(12, 8);
      expect(result.lifecycles).toHaveLength(2);
      expect(result.lifecycles[0]).toMatchObject({
        id: 'QIBK#1', status: 'closed', startDate: '2026-10-01',
        endDate: '2026-10-01', boughtShares: 6, soldShares: 6, remainingShares: 0, invested: 0,
      });
      expect(result.lifecycles[1]).toMatchObject({
        id: 'QIBK#2', status: 'open', boughtShares: 6, soldShares: 0, remainingShares: 6, invested: 92,
      });
      if (method !== 'average') {
        expect(result.lotsByTicker.QIBK).toHaveLength(2);
        expect(result.lotsByTicker.QIBK.every(lot => lot.lifecycleId === 'QIBK#2')).toBe(true);
      } else {
        expect(result.lotsByTicker).toEqual({});
      }
    },
  );

  it('never lets FIFO consume a lot from a lifecycle that was already closed', () => {
    const result = calculateStockPortfolio([
      tx({ id: 'buy-1', date: '2026-10-01', action: 'BUY', shares: 6, price: 10, globalTransactionIndex: 1 }),
      tx({ id: 'sell-1', date: '2026-10-02', action: 'SELL', shares: 6, price: 11, globalTransactionIndex: 2 }),
      tx({ id: 'buy-2', date: '2026-10-03', action: 'BUY', shares: 2, price: 20, globalTransactionIndex: 3 }),
      tx({ id: 'sell-2', date: '2026-10-04', action: 'SELL', shares: 1, price: 21, globalTransactionIndex: 4 }),
    ], noFee, 'fifo');

    expect(result.closedTrades.map(trade => [trade.sellTxId, trade.lifecycleId, trade.buyPrice, trade.shares])).toEqual([
      ['sell-1', 'QIBK#1', 10, 6],
      ['sell-2', 'QIBK#2', 20, 1],
    ]);
    expect(result.lotsByTicker.QIBK).toHaveLength(1);
    expect(result.lotsByTicker.QIBK[0]).toMatchObject({ buyId: 'buy-2', lifecycleId: 'QIBK#2', remainingShares: 1 });
  });

  it('matches the available portion of an oversell and reports the unmatched shares and fees', () => {
    const percentageFee: FeeCalculator = amount => amount * 0.1;
    const result = calculateStockPortfolio([
      tx({ id: 'buy', action: 'BUY', shares: 6, price: 10, globalTransactionIndex: 1 }),
      tx({ id: 'oversell', action: 'SELL', shares: 8, price: 12, globalTransactionIndex: 2 }),
    ], percentageFee, 'average');

    const position = result.positions[0];
    expect(position.shares).toBe(0);
    expect(position.invested).toBe(0);
    expect(position.realized).toBeCloseTo(-1.2, 8);
    expect(position.unmatchedSellShares).toBe(2);
    expect(position.unmatchedSellFees).toBeCloseTo(2.4, 8);
    expect(result.realizedBySellTxId.oversell.shares).toBe(6);
    expect(result.realizedBySellTxId.oversell.netPL).toBeCloseTo(-1.2, 8);
    const reconciliation = result.sellReconciliationByTxId.oversell;
    expect(reconciliation).toMatchObject({ requestedShares: 8, matchedShares: 6, unmatchedShares: 2 });
    expect(reconciliation.totalFee).toBeCloseTo(9.6, 8);
    expect(reconciliation.matchedFee).toBeCloseTo(7.2, 8);
    expect(reconciliation.unmatchedFee).toBeCloseTo(2.4, 8);
    expect(reconciliation.matchedProceeds).toBeCloseTo(64.8, 8);
    expect(result.realizedSeries).toHaveLength(1);
    expect(result.realizedSeries[0].date).toBe('2026-10-01');
    expect(result.realizedSeries[0].value).toBeCloseTo(-1.2, 8);
  });

  it('switches basis methods without mutating history and reproduces Average results', () => {
    const transactions = [
      tx({ id: 'buy-1', action: 'BUY', shares: 2, price: 10, globalTransactionIndex: 1 }),
      tx({ id: 'buy-2', action: 'BUY', shares: 3, price: 20, globalTransactionIndex: 2 }),
      tx({ id: 'sell', action: 'SELL', shares: 2, price: 15, globalTransactionIndex: 3 }),
    ];
    const original = JSON.stringify(transactions);
    const averageBefore = calculateStockPortfolio(transactions, noFee, 'average');
    calculateStockPortfolio(transactions, noFee, 'fifo');
    calculateStockPortfolio(transactions, noFee, 'lowestCostFirst');
    const averageAfter = calculateStockPortfolio(transactions, noFee, 'average');

    expect(averageAfter).toEqual(averageBefore);
    expect(averageBefore.positions[0].invested).toBeCloseTo(48, 8);
    expect(JSON.stringify(transactions)).toBe(original);
  });
});
