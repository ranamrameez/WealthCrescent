import { describe, expect, it } from 'vitest';
import type { FeeCalculator, Transaction } from '../../../types/workbook';
import { stockPLHistory } from '../stockPLHistory';
import { stockTradingHistory } from '../stockTradingHistory';
const fee: FeeCalculator = amount => amount * .01;
const trades: Transaction[] = [
  { date: '2026-01-01', time: '10:00', ticker: 'A', action: 'BUY', shares: 10, price: 10 },
  { date: '2026-02-01', time: '10:00', ticker: 'A', action: 'BUY', shares: 10, price: 20 },
  { date: '2026-02-01', time: '11:00', ticker: 'A', action: 'SELL', shares: 10, price: 30 },
];
const quotes = { A: [{ date: '2026-01-01', price: 12 }, { date: '2026-02-01', price: 25 }, { date: '2026-02-02', price: 26 }] };
describe('stockPLHistory', () => {
  it('separates fee-adjusted realized and unrealized changes from quote movement', () => {
    const { daily, entries } = stockPLHistory(trades, quotes, fee);
    expect(daily[0].unrealized).toBeCloseTo(17.8);
    expect(daily[1].realizedChange).toBeCloseTo(145.5);
    expect(daily[1].realized).toBeCloseTo(145.5);
    expect(daily[1].unrealized).toBeCloseTo(96);
    expect(daily[1].unrealizedTradeChange).toBeCloseTo(-50.5);
    expect(daily[1].total).toBeCloseTo(241.5);
    expect(daily[1].dayTrade).toBe(true);
    expect(entries[1].unrealizedTradeChange).toBeCloseTo(45.5);
    expect(entries[2].unrealizedTradeChange).toBeCloseTo(-96);
    expect(daily[2].unrealized).toBeCloseTo(105.9);
    expect(daily[2].unrealizedTradeChange).toBe(0);
    expect(daily[2].realizedChange).toBe(0);
  });
  it.each(['fifo', 'lowestCostFirst'] as const)('uses %s for realized and remaining cost basis', method => {
    const final = stockPLHistory(trades, quotes, fee, method).daily[1];
    expect(final.realized).toBeCloseTo(196);
    expect(final.unrealized).toBeCloseTo(45.5);
    expect(final.total).toBeCloseTo(241.5);
  });
  it('does not use future quotes for past valuations and ignores pending trades', () => {
    const pending: Transaction = { date: '2026-01-01', ticker: 'A', action: 'SELL', shares: 10, price: 100, isPending: true };
    const { daily, entries } = stockPLHistory([trades[0], pending], { A: [{ date: '2026-02-01', price: 25 }] }, fee);
    expect(daily[0].unrealized).toBeNull();
    expect(daily[0].unrealizedTradeChange).toBeNull();
    expect(daily[0].total).toBeNull();
    expect(daily[0].realized).toBe(0);
    expect(entries).toHaveLength(1);
    expect(daily[1].unrealized).toBeCloseTo(146.5);
  });
  it('returns known zero unrealized P/L when fully closed, even without quotes', () => {
    const result = stockPLHistory([trades[0], { ...trades[2], date: '2026-01-02' }], {}, fee);
    expect(result.daily[1].unrealized).toBe(0);
    expect(result.daily[1].total).toBeCloseTo(196);
  });
  it('honors specific lot attribution under FIFO', () => {
    const txs = trades.map((tx, i) => ({ ...tx, id: `tx-${i}` }));
    txs[2] = { ...txs[2], targetLotBuyId: 'tx-1' };
    const final = stockPLHistory(txs, quotes, fee, 'fifo').daily[1];
    expect(final.realized).toBeCloseTo(95);
    expect(final.unrealized).toBeCloseTo(146.5);
    expect(final.total).toBeCloseTo(241.5);
  });
});
describe('stockTradingHistory', () => {
  it('retains every same-day entry and its lifetime sums and net shares', () => {
    const result = stockTradingHistory([...trades].reverse());
    expect(result.entries).toHaveLength(3);
    expect(result.daily).toHaveLength(2);
    expect(result.entries.map(row => row.bought)).toEqual([100, 300, 300]);
    expect(result.entries.map(row => row.boughtShares - row.soldShares)).toEqual([10, 20, 10]);
    expect(result.daily[1]).toMatchObject({ buy: 10, sell: 10, bought: 300, sold: 300, boughtShares: 20, soldShares: 10 });
  });
});
