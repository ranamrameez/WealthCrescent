import { describe, expect, it } from 'vitest';
import type { EMILoan, EMIRepayment } from '../../../types/emiWorkbook';
import { CalculationEngine } from '../CalculationEngine';
const engine = CalculationEngine.emi;
const loan: EMILoan = { id: 'loan', name: 'Property', balanceTracking: 'recorded', lender: 'Seller', currencyCode: 'PKR', principal: 10000, totalToReturn: 10000, tenureMonths: 12, startDate: '2026-01-31', repaymentMode: 'fixedTotal', customMonthlyPayment: 500, installmentOverrides: { 1: 4000, 2: 2000 } };
const payment = (month: number, amount: number, date: string): EMIRepayment => ({ id: `payment-${month}`, loanId: loan.id, month, amount, date });
describe('EMI ledger and schedule separation', () => {
  it('uses dated evidence, excludes future payments and fines, and reports mismatched overrides without changing them', () => {
    const repayments = [payment(1, 3000, '2026-02-20'), { ...payment(2, 1000, '2026-03-10'), fine: 50 }, payment(6, 2000, '2026-08-01')];
    const before = JSON.stringify({ loan, repayments });
    const result = engine.emiRepaymentSummary(loan, repayments, '2026-04-01');
    expect(result.outstanding).toBe(6000);
    expect(result.paidSoFar).toBe(4000);
    expect(result.recordedFines).toBe(50);
    expect(result.futureRecordedCount).toBe(1);
    expect(result.mismatches).toHaveLength(2);
    expect(result.scheduledOutstanding).not.toBe(result.outstanding);
    expect(JSON.stringify({ loan, repayments })).toBe(before);
  });
  it('never treats an unrecorded installment as paid and exposes overpayment separately', () => {
    expect(engine.emiRepaymentSummary(loan, [], '2028-01-01').outstanding).toBe(10000);
    const result = engine.emiRepaymentSummary(loan, [payment(1, 11000, '2026-02-01')], '2026-02-01');
    expect(result.outstanding).toBe(0); expect(result.overpayment).toBe(1000);
  });
  it('retains an explicitly labelled scheduled-principal estimate for interest loans', () => {
    const interest = { ...loan, repaymentMode: 'interest' as const, annualRatePct: 10 };
    const result = engine.emiRepaymentSummary(interest, [], '2026-04-01');
    expect(result.balanceBasis).toBe('schedule'); expect(result.recordedPaid).toBe(0);
    expect(result.outstanding).toBe(engine.emiSummary(interest, new Date('2026-04-01T12:00:00Z')).outstanding);
  });
  it('preserves the estimate for legacy loans without a complete ledger and supports explicit tracking', () => {
    const legacy = { ...loan, balanceTracking: undefined };
    expect(engine.emiRepaymentSummary(legacy, [], '2026-04-01').balanceBasis).toBe('schedule');
    expect(engine.emiRepaymentSummary({ ...legacy, balanceTracking: 'recorded' }, [], '2026-04-01').outstanding).toBe(10000);
    expect(engine.emiRepaymentSummary({ ...legacy, balanceTracking: 'scheduled' }, [payment(1, 1000, '2026-02-01')], '2026-04-01').balanceBasis).toBe('schedule');
  });
});
it('preserves legacy month-end dates and supports an exact first due date with quarterly recurrence', () => {
  expect(engine.installmentDueDate(loan, 1)).toBe('2026-02-28');
  expect(engine.installmentDueDate(loan, 2)).toBe('2026-03-31');
  const quarterly = { ...loan, firstInstallmentDate: '2028-02-29', installmentIntervalMonths: 3, paymentDayOfMonth: 31 };
  expect(engine.installmentDueDate(quarterly, 1)).toBe('2028-02-29');
  expect(engine.installmentDueDate(quarterly, 2)).toBe('2028-05-31');
});
it('subtracts booking once from a total price and never subtracts it from an already financed principal', () => {
  expect(engine.normalizeEmiTerms({ ...loan, principal: 12000, bookingAmount: 2000 }, 'price').principal).toBe(10000);
  expect(engine.normalizeEmiTerms({ ...loan, bookingAmount: 2000 }, 'financed').principal).toBe(10000);
  expect(() => engine.normalizeEmiTerms({ ...loan, bookingAmount: 10000 }, 'price')).toThrow('Financed');
  expect(() => engine.normalizeEmiTerms({ ...loan, firstInstallmentDate: '2026-01-01' })).toThrow('precede');
});
it('refreshes open linked plans across all payment sources and preserves completed identities', () => {
  const result = engine.refreshEmiLinkedPlans({ ...loan, firstInstallmentDate: '2026-05-15' }, [
    { module: 'bank', plan: { id: 'done', date: '2026-02-28', amount: -4000, sourceEmiMonth: 1, executed: true } },
    { module: 'cash', plan: { id: 'cash', date: '2026-03-31', amount: 2000, sourceEmiMonth: 2 } },
    { module: 'creditCard', plan: { id: 'card', date: '2026-04-30', amount: 500, sourceEmiMonth: 3 } },
  ], [], '2026-04-01');
  expect(result.changes).toEqual([
    { module: 'cash', id: 'cash', date: '2026-06-15', amount: 2000 },
    { module: 'creditCard', id: 'card', date: '2026-07-15', amount: 500 },
  ]);
  expect(result.missing.every(row => row.month > 3)).toBe(true);
});
it('keeps historical period balances free from future-dated payments', () => {
  const repayments = [payment(1, 3000, '2026-02-20'), payment(2, 2000, '2027-01-01')];
  const result = engine.emiPeriodSummary([loan], repayments, { fromDate: '2026-03-01', toDate: '', direction: 'all', source: 'all' }, '2026-11-06');
  expect(result.start).toBe(7000); expect(result.current).toBe(7000); expect(result.outflow).toBe(0);
});
it('anchors forecast debt and cash to recorded outstanding, caps prepayments, and leaves arrears outstanding', () => {
  const repayments = [payment(1, 9900, '2026-02-20')];
  const forecast = engine.projectedEmiByCurrency([loan], repayments, '2026-03-01', '2027-12-01');
  expect(forecast.outstanding.PKR).toBe(0); expect(forecast.cashOutflow.PKR).toBe(100);
  const arrears = engine.projectedEmiByCurrency([loan], [], '2026-03-01', '2027-12-01');
  expect(arrears.outstanding.PKR).toBe(4000);
  const early = engine.projectedEmiByCurrency([loan], [payment(3, 500, '2026-02-20')], '2026-03-01', '2026-04-30');
  expect(early.cashOutflow.PKR).toBe(2000);
  expect(early.outstanding.PKR).toBe(7500);
});
