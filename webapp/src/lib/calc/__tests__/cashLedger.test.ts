import { describe, expect, it } from 'vitest';
import type { Adjustment, FeeCalculator, Transaction, Transfer } from '../../../types/workbook';
import { buildCashLedger } from '../cashLedger';

const flatFee: FeeCalculator = () => 0;

function tx(over: Partial<Transaction>): Transaction {
  return { date: '2026-01-01', ticker: 'ABC', action: 'BUY', shares: 1, price: 100, ...over };
}

function xfer(over: Partial<Transfer>): Transfer {
  return { id: 'xfer', date: '2026-01-01', type: 'DEPOSIT', gross: 100, fee: 0, ...over };
}

describe('buildCashLedger', () => {
  it('puts a transfer before a trade on an exact instant tie, regardless of seq', () => {
    // A preceding BUY (seq 1, an earlier date so it's never part of the
    // tie itself) supplies the share the SELL needs — a lone SELL with
    // nothing held is correctly rejected by buildCashLedger's own oversell
    // guard regardless of ordering, which an earlier version of this test
    // didn't account for (corrected 2026-09-18 while verifying an
    // unrelated change: it always produced an empty ledger, for a reason
    // unrelated to the tie-breaking this test means to exercise).
    const buy: Transaction = tx({ date: '2025-12-31', action: 'BUY', shares: 1, price: 90, seq: 1 });
    const t: Transaction = tx({ date: '2026-01-01', action: 'SELL', shares: 1, price: 100, seq: 2 });
    const xfer: Transfer = { id: 'x1', date: '2026-01-01', type: 'DEPOSIT', gross: 500, fee: 0, seq: 3 };
    const ledger = buildCashLedger([buy, t], [xfer], [], flatFee);
    expect(ledger.map((e) => e.kind)).toEqual(['trade', 'transfer', 'trade']);
  });

  it('breaks a same-kind, same-instant tie by seq, not array position', () => {
    // A preceding BUY of 2 shares supplies both same-day SELLs below —
    // same fix as the test above, unrelated to the tie-breaking itself.
    const buy = tx({ date: '2025-12-31', action: 'BUY', shares: 2, price: 90, seq: 1 });
    // Two same-day trades, no time set -> identical noon-UTC instant.
    // Deliberately in the OPPOSITE order their seq implies.
    const first = tx({ date: '2026-01-01', action: 'SELL', shares: 1, price: 100, seq: 2 });
    const second = tx({ date: '2026-01-01', action: 'SELL', shares: 1, price: 200, seq: 3 });
    const ledger = buildCashLedger([second, buy, first], [], [], flatFee);
    expect(ledger.map((e) => e.amount)).toEqual([-180, 100, 200]);
  });

  it('never orders adjustments before a same-instant transfer', () => {
    const adj: Adjustment = { date: '2026-01-01', amount: 10, seq: 1 };
    const xfer: Transfer = { id: 'x1', date: '2026-01-01', type: 'DEPOSIT', gross: 500, fee: 0, seq: 2 };
    const ledger = buildCashLedger([], [xfer], [adj], flatFee);
    expect(ledger.map((e) => e.kind)).toEqual(['transfer', 'adjustment']);
  });
});


it('keeps the full cash proceeds from an executed oversell while stock accounting flags the unmatched quantity', async () => {
  const { calculateStockPortfolio } = await import('../stockCalculationEngine');
  const buy = tx({ id: 'buy', date: '2026-01-01', action: 'BUY', shares: 2, price: 10, seq: 1 });
  const sell = tx({ id: 'sell', date: '2026-01-02', action: 'SELL', shares: 3, price: 12, seq: 2 });
  const ledger = buildCashLedger([buy, sell], [], [], flatFee);
  const accounting = calculateStockPortfolio([buy, sell], flatFee, 'average');

  expect(ledger.map(event => event.amount)).toEqual([-20, 36]);
  expect(accounting.positions[0].unmatchedSellShares).toBe(1);
  expect(accounting.realizedBySellTxId.sell).toEqual({ netPL: 4, shares: 2 });
});


it('uses the shared same-day sequence across trades and transfers instead of their separate seq values', () => {
  const buy = tx({ id: 'trade', date: '2026-01-02', time: '12:00', action: 'BUY', shares: 1, price: 10, seq: 1, accountingOrder: 2 });
  const deposit = xfer({ id: 'deposit', date: '2026-01-02', time: '09:00', type: 'DEPOSIT', gross: 20, fee: 0, seq: 99, accountingOrder: 1 });
  const ledger = buildCashLedger([buy], [deposit], [], flatFee);
  expect(ledger.map(event => event.sourceId)).toEqual(['deposit', 'trade']);
  expect(ledger.map(event => event.accountingOrder)).toEqual([1, 2]);
});


it('records dividend receipts as cash events in the shared same-day sequence', () => {
  const dividend = { id: 'dividend', date: '2026-01-02', ticker: 'AAA', perShare: 0.5, shares: 10, amount: 5, accountingOrder: 3 };
  const deposit = xfer({ id: 'deposit', date: '2026-01-02', type: 'DEPOSIT', gross: 20, fee: 0, accountingOrder: 1 });
  const buy = tx({ id: 'buy', date: '2026-01-02', action: 'BUY', shares: 1, price: 10, accountingOrder: 2 });
  const ledger = buildCashLedger([buy], [deposit], [], flatFee, [dividend]);
  expect(ledger.map(event => event.kind)).toEqual(['transfer', 'trade', 'dividend']);
  expect(ledger.map(event => event.accountingOrder)).toEqual([1, 2, 3]);
  expect(ledger.map(event => event.amount)).toEqual([20, -10, 5]);
  expect(ledger[2].balance).toBe(15);
});
