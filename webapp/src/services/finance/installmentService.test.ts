import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { saveInstallmentContract, saveInstallmentPayment, saveInstallmentAllocations } from './installmentService';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import type { EMILoan } from '../../types/emiWorkbook';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { fulfillManualPlan } from './manualPlanPaymentService';
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../../lib/firebase/client', () => ({ auth: { get currentUser() { return session.signedIn ? { uid: 'fixture' } : null; } }, db: null, firebaseReady: false }));
const original = useEMIWorkbookStore.getState().workbook;
const links = useInterEntityTransfersStore.getState().workbook;
const loan: EMILoan = { id: 'loan', name: 'Property', lender: 'Seller', currencyCode: 'PKR', principal: 1000, tenureMonths: 10, startDate: '2026-01-01', repaymentMode: 'fixedTotal', totalToReturn: 1000, installmentOverrides: { 1: 300 } };
const contract = [{ id: 'booking', dueDate: '2026-01-01', amount: 200, description: 'Booking' }, { id: 'regular', dueDate: '2026-02-01', amount: 800, description: 'Remaining installments' }];
beforeEach(() => { session.signedIn = true; useEMIWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'PKR' }, entries: [loan], repayments: [] }); useInterEntityTransfersStore.getState().setWorkbook({ ...links, entries: [] }); });
afterEach(() => { useEMIWorkbookStore.getState().setWorkbook(original); useInterEntityTransfersStore.getState().setWorkbook(links); });
it('adopts only a reviewed contract and preserves legacy payments and overrides', () => {
  const payment = { id: 'old', loanId: loan.id, month: 1, amount: 300, date: '2026-02-01' };
  useEMIWorkbookStore.getState().setWorkbook({ ...useEMIWorkbookStore.getState().workbook, repayments: [payment] });
  saveInstallmentContract(loan, contract);
  const wb = useEMIWorkbookStore.getState().workbook;
  expect(wb.repayments).toEqual([payment]); expect(wb.entries[0].installmentOverrides).toEqual({ 1: 300 }); expect(wb.entries[0].contractSchedule).toEqual(contract);
});
it('retains multiple payments on the same day and editing one never alters the schedule or another receipt', () => {
  saveInstallmentContract(loan, contract);
  const current = useEMIWorkbookStore.getState().workbook.entries[0];
  const first = saveInstallmentPayment(current, { date: '2026-02-04', amount: 120 });
  const second = saveInstallmentPayment(current, { date: '2026-02-04', amount: 80 });
  saveInstallmentPayment(current, { id: first.id, date: '2026-02-05', amount: 150 }, first);
  const wb = useEMIWorkbookStore.getState().workbook;
  expect(wb.repayments).toHaveLength(2); expect(wb.repayments.find(row => row.id === second.id)).toEqual(second);
  expect(wb.entries[0].contractSchedule).toEqual(contract); expect(wb.entries[0].installmentOverrides).toEqual({ 1: 300 });
  useEMIWorkbookStore.getState().deleteRepayment(first.id);
  expect(useEMIWorkbookStore.getState().workbook.entries[0].contractSchedule).toEqual(contract);
});
it('rejects signed-out, stale, invalid-date and negative-payment commands before writing', () => {
  session.signedIn = false; expect(() => saveInstallmentContract(loan, contract)).toThrow('Sign in');
  session.signedIn = true; expect(() => saveInstallmentContract({ ...loan, name: 'stale' }, contract)).toThrow('changed');
  saveInstallmentContract(loan, contract);
  const current = useEMIWorkbookStore.getState().workbook.entries[0];
  expect(() => saveInstallmentPayment(current, { date: '2026-02-30', amount: 100 })).toThrow('date');
  expect(() => saveInstallmentPayment(current, { date: '2026-02-01', amount: -100 })).toThrow('positive');
  expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([]);
});
it('keeps fulfilled partial-payment history and generates exactly one open remainder plan', () => {
  const bank = useBankWorkbookStore.getState().workbook, plans = usePlannedBankWorkbookStore.getState().workbook;
  try {
    useBankWorkbookStore.getState().setWorkbook({ ...bank, settings: { ...bank.settings, accounts: [{ id: 'payer', name: 'Payer', currencyCode: 'PKR', openingBalance: 0 }] }, transactions: [] });
    usePlannedBankWorkbookStore.getState().setWorkbook({ ...plans, entries: [] });
    const linked = { ...loan, linkedBankAccountId: 'payer' };
    useEMIWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'PKR' }, entries: [linked], repayments: [] });
    saveInstallmentContract(linked, contract);
    const first = usePlannedBankWorkbookStore.getState().workbook.entries.find(row => row.sourceEmiObligationId === 'booking')!;
    usePlannedBankWorkbookStore.getState().updateEntry(first.id, { amount: -50 });
    fulfillManualPlan({ module: 'bank', id: first.id }, first.date, { ...first, amount: -50 });
    const current = useEMIWorkbookStore.getState().workbook.entries[0];
    saveInstallmentContract(current, contract);
    const booking = usePlannedBankWorkbookStore.getState().workbook.entries.filter(row => row.sourceEmiObligationId === 'booking');
    expect(booking.filter(row => row.executed)).toHaveLength(1);
    expect(booking.filter(row => !row.executed)).toHaveLength(1);
    expect(booking.find(row => !row.executed)?.amount).toBe(-150);
    expect(useEMIWorkbookStore.getState().workbook.repayments).toHaveLength(1);
    expect(useBankWorkbookStore.getState().workbook.transactions).toHaveLength(1);
  } finally { useBankWorkbookStore.getState().setWorkbook(bank); usePlannedBankWorkbookStore.getState().setWorkbook(plans); }
});
it('validates manual splits before persistence and can restore automatic allocation', () => {
  saveInstallmentContract(loan, contract);
  let current = useEMIWorkbookStore.getState().workbook.entries[0];
  const payment = saveInstallmentPayment(current, { date: '2026-02-01', amount: 300 });
  current = useEMIWorkbookStore.getState().workbook.entries[0];
  const before = useEMIWorkbookStore.getState().workbook;
  expect(() => saveInstallmentAllocations(current, payment.id, [{ obligationId: 'regular', amount: 400 }])).toThrow('exceeds');
  expect(useEMIWorkbookStore.getState().workbook).toEqual(before);
  saveInstallmentAllocations(current, payment.id, [{ obligationId: 'regular', amount: 80 }]);
  expect(useEMIWorkbookStore.getState().workbook.entries[0].paymentAllocations).toEqual([{ paymentId: payment.id, obligationId: 'regular', amount: 80 }]);
  current = useEMIWorkbookStore.getState().workbook.entries[0];
  saveInstallmentAllocations(current, payment.id, []);
  expect(useEMIWorkbookStore.getState().workbook.entries[0].paymentAllocations).toEqual([]);
});
