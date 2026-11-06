import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveEmiLoan } from './emiCommandService';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import type { EMILoan } from '../../types/emiWorkbook';
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../../lib/firebase/client', () => ({ auth: { get currentUser() { return session.signedIn ? { uid: 'fixture' } : null; } }, db: null, firebaseReady: false }));
const original = [useEMIWorkbookStore.getState(), usePlannedBankWorkbookStore.getState(), usePlannedCashWorkbookStore.getState(), usePlannedCreditCardWorkbookStore.getState(), useBankWorkbookStore.getState()] as const;
const loan: EMILoan = { id: 'test', name: 'Loan', lender: 'Bank', currencyCode: 'USD', principal: 1000, totalToReturn: 1000, tenureMonths: 4, startDate: '2026-10-01', firstInstallmentDate: '2026-11-10', repaymentMode: 'fixedTotal', linkedBankAccountId: 'bank' };
beforeEach(() => {
  session.signedIn = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  useEMIWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'USD' }, entries: [loan], repayments: [] });
  useBankWorkbookStore.getState().setWorkbook({ ...original[4].workbook, settings: { ...original[4].workbook.settings, accounts: [{ id: 'bank', name: 'Bank', currencyCode: 'USD', openingBalance: 0 }] }, transactions: [] });
  usePlannedBankWorkbookStore.getState().setWorkbook({ ...original[1].workbook, entries: [{ id: 'open', accountId: 'bank', date: '2026-11-10', amount: -250, description: 'Preserve me', groupId: 'project', sourceEmiLoanId: loan.id, sourceEmiMonth: 1 }] });
  usePlannedCashWorkbookStore.getState().setWorkbook({ ...original[2].workbook, entries: [] });
  usePlannedCreditCardWorkbookStore.getState().setWorkbook({ ...original[3].workbook, entries: [] });
});
afterEach(() => {
  vi.restoreAllMocks(); vi.useRealTimers();
  useEMIWorkbookStore.setState(original[0]); usePlannedBankWorkbookStore.setState(original[1]);
  usePlannedCashWorkbookStore.setState(original[2]); usePlannedCreditCardWorkbookStore.setState(original[3]); useBankWorkbookStore.setState(original[4]);
});
it('refreshes a changed start date during save and preserves source plan ID and project metadata', () => {
  const saved = saveEmiLoan({ ...loan, firstInstallmentDate: '2026-12-20' }, loan);
  const rows = usePlannedBankWorkbookStore.getState().workbook.entries;
  expect(rows.find(row => row.id === 'open')).toMatchObject({ date: '2026-12-20', amount: -250, groupId: 'project', description: 'Preserve me' });
  expect(rows).toHaveLength(4);
  saveEmiLoan(saved, saved);
  expect(usePlannedBankWorkbookStore.getState().workbook.entries).toHaveLength(4);
});
it('preserves completed plans and real repayments, including dates, during a schedule edit', () => {
  usePlannedBankWorkbookStore.getState().updateEntry('open', { executed: true });
  const repayment = { id: 'actual', loanId: loan.id, month: 1, date: '2026-11-01', amount: 250 };
  useEMIWorkbookStore.getState().setWorkbook({ ...useEMIWorkbookStore.getState().workbook, repayments: [repayment] });
  saveEmiLoan({ ...loan, firstInstallmentDate: '2026-12-20' }, loan);
  expect(usePlannedBankWorkbookStore.getState().workbook.entries.find(row => row.id === 'open')).toMatchObject({ executed: true, date: '2026-11-10' });
  expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([repayment]);
});
it('generates bigger installments as plans without creating actual repayments, and deducts booking once', () => {
  const saved = saveEmiLoan({ ...loan, principal: 1200, bookingAmount: 200 }, loan, 'price', { from: 1, options: { intervalMonths: 2, amount: 300, mode: 'regularPlusMajor', reconcileLastMonth: true } });
  expect(saved.principal).toBe(1000);
  expect(saved.purchasePrice).toBe(1200);
  expect(saved.installmentOverrides?.[2]).toBe(550);
  expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([]);
});
it('rejects signed-out and stale commands and restores both workbooks after a failed plan update', () => {
  session.signedIn = false; expect(() => saveEmiLoan(loan, loan)).toThrow('Sign in');
  session.signedIn = true; expect(() => saveEmiLoan(loan, { ...loan, name: 'stale' })).toThrow('changed');
  const before = useEMIWorkbookStore.getState().workbook;
  vi.spyOn(usePlannedBankWorkbookStore.getState(), 'updateEntry').mockImplementation(() => { throw new Error('fixture failure'); });
  expect(() => saveEmiLoan({ ...loan, firstInstallmentDate: '2026-12-20' }, loan)).toThrow('fixture failure');
  expect(useEMIWorkbookStore.getState().workbook).toEqual(before);
  expect(usePlannedBankWorkbookStore.getState().workbook.entries[0].date).toBe('2026-11-10');
});
it('refreshes an explicitly routed Cash installment without generating a duplicate Bank installment', () => {
  usePlannedCashWorkbookStore.getState().addEntry({ id: 'cash-route', currencyCode: 'USD', type: 'OUT', date: '2026-12-10', amount: 250, groupId: 'goal', sourceEmiLoanId: loan.id, sourceEmiMonth: 2 });
  saveEmiLoan({ ...loan, firstInstallmentDate: '2026-12-20' }, loan);
  expect(usePlannedCashWorkbookStore.getState().workbook.entries[0]).toMatchObject({ id: 'cash-route', date: '2027-01-20', amount: 250, groupId: 'goal' });
  expect(usePlannedBankWorkbookStore.getState().workbook.entries.some(row => row.sourceEmiMonth === 2)).toBe(false);
});
it('refuses to orphan an existing pending ledger record when refreshing its open plan', () => {
  useBankWorkbookStore.getState().setWorkbook({ ...useBankWorkbookStore.getState().workbook, transactions: [{ id: 'pending', accountId: 'bank', date: '2026-11-10', amount: -250, description: 'Pending payment', source: 'manual', isDeposit: false, isPending: true, planLink: { module: 'bank', planId: 'open', occurrenceDate: '2026-11-10' } }] });
  expect(() => saveEmiLoan({ ...loan, firstInstallmentDate: '2026-12-20' }, loan)).toThrow('Settle or void');
  expect(usePlannedBankWorkbookStore.getState().workbook.entries[0].date).toBe('2026-11-10');
});
