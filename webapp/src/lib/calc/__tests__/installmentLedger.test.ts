import { expect, it } from 'vitest';
import { reconcileInstallments, installmentMonthlySummary } from '../installmentLedger';
const obligations = [1, 2, 3].map(month => ({ id: `due-${month}`, dueDate: `2026-0${month}-10`, amount: 100, currency: 'PKR', description: 'Installment' }));
it('allocates several irregular payments across partial, late and advance installments without rewriting inputs', () => {
  const payments = [{ id: 'a', date: '2026-01-20', amount: 40, currency: 'PKR' }, { id: 'b', date: '2026-02-15', amount: 210, currency: 'PKR' }];
  const before = JSON.stringify({ obligations, payments });
  const result = reconcileInstallments(obligations, payments, 'PKR', '2026-02-20');
  expect(result.actualRemaining).toBe(50); expect(result.overdue).toBe(0); expect(result.advance).toBe(50);
  expect(result.rows.map(row => row.paid)).toEqual([100, 100, 50]);
  expect(result.allocations.reduce((sum, row) => sum + row.amount, 0) + result.unappliedCredit).toBe(result.actualPaid);
  expect(JSON.stringify({ obligations, payments })).toBe(before);
});
it('supports explicit future-obligation allocation while keeping past arrears separate from advance credit', () => {
  const payment = [{ id: 'manual', date: '2026-01-20', amount: 150, currency: 'PKR' }];
  const result = reconcileInstallments(obligations, payment, 'PKR', '2026-02-20', [{ paymentId: 'manual', obligationId: 'due-3', amount: 80 }]);
  expect(result.overdue).toBe(200); expect(result.advance).toBe(150); expect(result.unappliedCredit).toBe(70);
  expect(result.allocations.reduce((sum, row) => sum + row.amount, 0) + result.unappliedCredit).toBe(150);
  expect(() => reconcileInstallments(obligations, payment, 'PKR', '2026-02-20', [{ paymentId: 'manual', obligationId: 'due-3', amount: 120 }])).toThrow('exceeds');
});
it('fills missing calendar months and keeps future actual chart values unavailable', () => {
  const result = reconcileInstallments([obligations[0], obligations[2]], [], 'PKR', '2026-02-20');
  const monthly = installmentMonthlySummary(result);
  expect(monthly.rows.map(row => row.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  expect(monthly.rows[1]).toMatchObject({ scheduled: 0, actual: 0, actualRemaining: 200 });
  expect(monthly.rows[2]).toMatchObject({ scheduled: 100, actual: null, actualRemaining: null, scheduledRemaining: 0 });
});
it('retains same-day payments individually, excludes future payments and exposes overpayment credit', () => {
  const result = reconcileInstallments(obligations, [
    { id: 'a', date: '2026-01-01', amount: 200, currency: 'PKR' },
    { id: 'b', date: '2026-01-01', amount: 150, currency: 'PKR' },
    { id: 'future', date: '2027-01-01', amount: 900, currency: 'PKR' },
  ], 'PKR', '2026-02-01');
  expect(result.actualPaid).toBe(350); expect(result.actualRemaining).toBe(0);
  expect(result.unappliedCredit).toBe(50); expect(result.advance).toBe(250); expect(result.futurePaymentCount).toBe(1);
  expect(new Set(result.allocations.map(row => row.paymentId))).toEqual(new Set(['a', 'b']));
});
it('shows arrears and rejects ambiguous identities, reversals and mixed currencies', () => {
  expect(reconcileInstallments(obligations, [], 'PKR', '2026-02-20').overdue).toBe(200);
  expect(() => reconcileInstallments([...obligations, obligations[0]], [], 'PKR', '2026-02-20')).toThrow('identity');
  expect(() => reconcileInstallments(obligations, [{ id: 'x', date: '2026-01-01', amount: -1, currency: 'PKR' }], 'PKR', '2026-02-20')).toThrow('Reversals');
  expect(() => reconcileInstallments(obligations, [], 'USD', '2026-02-20')).toThrow('Currencies');
});

it('keeps original payment history and reopens fixed-total obligations on a dated partial reversal', () => {
  const original = { id: 'payment', date: '2026-01-15', amount: 150, currency: 'PKR' };
  const reversal = { id: 'reversal', date: '2026-02-16', amount: 75, currency: 'PKR', reversesPaymentId: original.id };
  const before = reconcileInstallments(obligations, [original, reversal], 'PKR', '2026-02-15');
  const after = reconcileInstallments(obligations, [original, reversal], 'PKR', '2026-02-16');
  expect(before.actualPaid).toBe(150);
  expect(after.actualPaid).toBe(75);
  expect(after.rows.map(row => row.paid)).toEqual([75, 0, 0]);
  expect(after.events.filter(row => row.kind !== 'obligation').map(row => [row.kind, row.amount])).toEqual([['payment', 150], ['reversal', -75]]);
  const months = installmentMonthlySummary(after).rows;
  expect(months.find(row => row.month === '2026-01')?.actual).toBe(150);
  expect(months.find(row => row.month === '2026-02')?.actual).toBe(-75);
});

it('releases unapplied credit before releasing reviewed payment splits on reversal', () => {
  const original = { id: 'payment', date: '2026-01-15', amount: 150, currency: 'PKR' };
  const reversals = [
    { id: 'partial', date: '2026-02-15', amount: 30, currency: 'PKR', reversesPaymentId: original.id },
    { id: 'more', date: '2026-02-16', amount: 30, currency: 'PKR', reversesPaymentId: original.id },
  ];
  const splits = [{ paymentId: original.id, obligationId: 'due-1', amount: 50 }, { paymentId: original.id, obligationId: 'due-3', amount: 50 }];
  const first = reconcileInstallments(obligations, [original, ...reversals], 'PKR', '2026-02-15', splits);
  const second = reconcileInstallments(obligations, [original, ...reversals], 'PKR', '2026-02-16', splits);
  expect(first.unappliedCredit).toBe(20);
  expect(first.allocations).toEqual(splits);
  expect(second.unappliedCredit).toBe(0);
  expect(second.allocations).toEqual([splits[0], { ...splits[1], amount: 40 }]);
});

it('rejects overlapping reversal amounts, missing originals, reversal chains and backdating', () => {
  const original = { id: 'payment', date: '2026-01-15', amount: 100, currency: 'PKR' };
  const reversal = { id: 'refund', date: '2026-02-15', amount: 60, currency: 'PKR', reversesPaymentId: original.id };
  const report = (payments: Parameters<typeof reconcileInstallments>[1]) => reconcileInstallments(obligations, payments, 'PKR', '2026-02-20');
  expect(() => report([original, reversal, { ...reversal, id: 'duplicate' }])).toThrow('exceed');
  expect(() => report([reversal])).toThrow('original payment');
  expect(() => report([original, { ...reversal, date: '2026-01-14' }])).toThrow('on or after');
  expect(() => report([original, reversal, { ...reversal, id: 'chain', reversesPaymentId: reversal.id }])).toThrow('original payment');
});

it.each([
  ['2026-02-15', 150, 150, 0, 80, true],
  ['2026-02-16', 70, 230, -80, 70, false],
] as const)('reconciles manual allocations and report totals at cutoff %s', (cutoff, paid, remaining, februaryActual, allocated, futureReversal) => {
  const payments = [
    { id: 'receipt', date: '2026-01-20', amount: 150, currency: 'PKR' },
    { id: 'refund', date: '2026-02-16', amount: 80, currency: 'PKR', reversesPaymentId: 'receipt' },
    { id: 'future', date: '2026-02-28', amount: 100, currency: 'PKR' },
  ];
  const report = reconcileInstallments(obligations, payments, 'PKR', cutoff, [
    { paymentId: 'receipt', obligationId: 'due-3', amount: 80 },
  ]);

  expect(report).toMatchObject({ actualPaid: paid, actualRemaining: remaining, overdue: 200, unappliedCredit: paid - allocated });
  expect(report.rows.map(row => row.paid)).toEqual([0, 0, allocated]);
  expect(report.events.find(row => row.id === 'refund')).toMatchObject({ amount: -80, future: futureReversal });
  expect(report.events.find(row => row.id === 'future')).toMatchObject({ future: true, cumulativePaid: paid, actualRemaining: remaining });
  const { rows } = installmentMonthlySummary(report);
  expect(rows[1]).toMatchObject({ month: '2026-02', scheduled: 100, actual: februaryActual, actualRemaining: remaining });
  expect(rows[2]).toMatchObject({ month: '2026-03', actual: null, actualRemaining: null });
});

it('carries earlier payments and obligations into the first displayed month of a truncated chart', () => {
  const report = reconcileInstallments([
    { ...obligations[0], dueDate: '1900-01-10' },
    { ...obligations[1], dueDate: '2000-02-10' },
    { ...obligations[2], dueDate: '2100-01-10' },
  ], [
    { id: 'early', date: '1900-01-15', amount: 80, currency: 'PKR' },
    { id: 'first-visible', date: '2000-02-15', amount: 30, currency: 'PKR' },
  ], 'PKR', '2026-02-16');

  const monthly = installmentMonthlySummary(report);
  expect(monthly.truncated).toBe(true);
  expect(monthly.rows).toHaveLength(1200);
  expect(monthly.rows[0]).toEqual({ month: '2000-02', scheduled: 100, actual: 30, actualRemaining: 190, scheduledRemaining: 100 });
  expect(monthly.rows.at(-1)).toEqual({ month: '2100-01', scheduled: 100, actual: null, actualRemaining: null, scheduledRemaining: 0 });
});
