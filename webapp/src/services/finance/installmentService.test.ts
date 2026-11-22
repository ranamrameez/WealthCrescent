import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { saveInstallmentContract, saveInstallmentPayment, saveInstallmentAllocations, previewInstallmentReversal, saveInstallmentReversal } from './installmentService';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import type { EMILoan } from '../../types/emiWorkbook';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import type { PlannedCreditCardTransaction } from '../../types/plannedCreditCard';
import { fulfillManualPlan } from './manualPlanPaymentService';
const session = vi.hoisted(() => ({ signedIn: true, uid: 'fixture' }));
vi.mock('../../lib/firebase/client', () => ({ auth: { get currentUser() { return session.signedIn ? { uid: session.uid } : null; } }, db: null, firebaseReady: false }));
const original = useEMIWorkbookStore.getState().workbook;
const links = useInterEntityTransfersStore.getState().workbook;
const loan: EMILoan = { id: 'loan', name: 'Property', lender: 'Seller', currencyCode: 'PKR', principal: 1000, tenureMonths: 10, startDate: '2026-01-01', repaymentMode: 'fixedTotal', totalToReturn: 1000, installmentOverrides: { 1: 300 } };
const contract = [{ id: 'booking', dueDate: '2026-01-01', amount: 200, description: 'Booking' }, { id: 'regular', dueDate: '2026-02-01', amount: 800, description: 'Remaining installments' }];
beforeEach(() => { session.signedIn = true; session.uid = 'fixture'; useEMIWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'PKR' }, entries: [loan], repayments: [] }); useInterEntityTransfersStore.getState().setWorkbook({ ...links, entries: [] }); });
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

it('records an actual card charge and one installment receipt for a reviewed planned occurrence', () => {
  const cardStore = useCreditCardWorkbookStore.getState();
  const planStore = usePlannedCreditCardWorkbookStore.getState();
  const card = { id: 'card', name: 'Paying card', currencyCode: loan.currencyCode };
  const plan: PlannedCreditCardTransaction = {
    id: 'card-plan', cardId: card.id, sourceEmiLoanId: loan.id, sourceEmiObligationId: contract[0].id,
    date: contract[0].dueDate, kind: 'charge', amount: 50, description: 'Card installment', executed: false,
  };
  const reference = { module: 'creditCard' as const, id: plan.id };
  const currentPlan = () => usePlannedCreditCardWorkbookStore.getState().workbook.entries.find(row => row.id === plan.id)!;
  try {
    cardStore.setWorkbook({ ...cardStore.workbook, cards: [{ ...card, currencyCode: 'USD' }], transactions: [] });
    planStore.setWorkbook({ ...planStore.workbook, entries: [plan] });
    saveInstallmentContract(loan, contract);
    planStore.updateEntry(plan.id, { amount: plan.amount });
    expect(() => fulfillManualPlan(reference, plan.date, currentPlan(), '2026-03-01')).toThrow('currency');
    expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([]);
    cardStore.updateCard(card.id, { currencyCode: loan.currencyCode });
    planStore.updateEntry(plan.id, { kind: 'payment' });
    expect(() => fulfillManualPlan(reference, plan.date, currentPlan(), '2026-03-01')).toThrow('card charge');
    planStore.updateEntry(plan.id, { kind: 'charge' });
    const { actualId } = fulfillManualPlan(reference, plan.date, currentPlan(), '2026-03-01');
    expect(useCreditCardWorkbookStore.getState().workbook.transactions).toEqual([
      expect.objectContaining({ id: actualId, kind: 'charge', amount: 50 }),
    ]);
    expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([
      expect.objectContaining({ id: `emi:${actualId}`, loanId: loan.id, amount: 50, paymentOnly: true }),
    ]);
    expect(useInterEntityTransfersStore.getState().workbook.entries).toEqual([
      expect.objectContaining({ from: { module: 'creditCard', ref: card.id }, fromRecordId: actualId, toRecordId: `emi:${actualId}` }),
    ]);
    const done = usePlannedCreditCardWorkbookStore.getState().workbook.entries.find(row => row.id === plan.id)!;
    expect(done.executed).toBe(true);
    expect(() => fulfillManualPlan(reference, plan.date, done, '2026-03-01')).toThrow('already completed');
  } finally {
    cardStore.setWorkbook(cardStore.workbook);
    planStore.setWorkbook(planStore.workbook);
  }
});


it('records a dated reversal without rewriting the original and rejects retries from a stale review', () => {
  saveInstallmentContract(loan, contract);
  const current = useEMIWorkbookStore.getState().workbook.entries[0];
  const paid = saveInstallmentPayment(current, { date: '2026-02-01', amount: 150 });
  const preview = previewInstallmentReversal(current, paid);
  session.uid = 'other';
  expect(() => saveInstallmentReversal(preview, { date: '2026-02-02', amount: 40 })).toThrow('account changed');
  session.uid = 'fixture';
  expect(() => saveInstallmentReversal(preview, { date: '2026-02-02', amount: 160 })).toThrow('exceed');
  const reversal = saveInstallmentReversal(preview, { date: '2026-02-02', amount: 40 });
  const workbook = useEMIWorkbookStore.getState().workbook;
  expect(workbook.repayments).toEqual([paid, reversal]);
  expect(reversal).toMatchObject({ amount: 40, reversesPaymentId: paid.id });
  expect(() => saveInstallmentReversal(preview, { date: '2026-02-02', amount: 40 })).toThrow('history changed');
  expect(() => useEMIWorkbookStore.getState().deleteRepayment(paid.id)).toThrow('cannot be deleted');
  expect(() => saveInstallmentPayment(current, { id: paid.id, date: paid.date, amount: 120 }, paid)).toThrow('cannot be edited');
  expect(previewInstallmentReversal(current, paid).remaining).toBe(110);
});

it('requires a coordinated workflow when a receipt has a funding link', () => {
  saveInstallmentContract(loan, contract);
  const current = useEMIWorkbookStore.getState().workbook.entries[0];
  const paid = saveInstallmentPayment(current, { date: '2026-02-01', amount: 150 });
  const preview = previewInstallmentReversal(current, paid);
  useInterEntityTransfersStore.getState().addEntry({
    id: 'existing', from: { module: 'cash' }, to: { module: 'emi', ref: loan.id },
    fromRecordId: 'cash', toRecordId: paid.id, fromAmount: paid.amount, toAmount: paid.amount, date: paid.date,
  });
  expect(() => saveInstallmentReversal(preview, { date: '2026-02-02', amount: 40 })).toThrow('coordinated reversal');
  expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([paid]);
});
