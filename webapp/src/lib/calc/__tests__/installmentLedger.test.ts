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
