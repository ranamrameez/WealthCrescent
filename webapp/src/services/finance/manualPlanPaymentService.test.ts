import { readFinancePlans } from '../../lib/financePlans';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fulfillManualPlan } from './manualPlanPaymentService';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { getNativeMovementActivities, getMoneyMovementReport } from './dashboardService';
const session = vi.hoisted(()=>({ signedIn: true }));
vi.mock('../../lib/firebase/client',()=>({ auth: { get currentUser() { return session.signedIn ? { uid: 'fixture-user' } : null; } }, db: null, firebaseReady: false }));
const originalCash = useCashWorkbookStore.getState().workbook;
const originalPlans = usePlannedCashWorkbookStore.getState().workbook;
const originalUpdatePlan = usePlannedCashWorkbookStore.getState().updateEntry;
function capture<W>(store: { getState: () => { workbook: W; setWorkbook: (workbook: W) => void } }) { const workbook=store.getState().workbook; return ()=>store.getState().setWorkbook(workbook); }
const originals = [capture(useBankWorkbookStore),capture(useCreditCardWorkbookStore),capture(usePlannedBankWorkbookStore),capture(usePlannedCreditCardWorkbookStore)];
const live = (module: 'cash' | 'bank' | 'creditCard', id: string) => readFinancePlans().find(row=>row.module === module && row.plan.id === id)!.plan;
const plan = { id: 'bill', date: '2026-01-31', type: 'OUT' as const, amount: 30, currencyCode: 'USD', groupId: 'goal', category: 'Food' };
const reference = { module: 'cash' as const, id: 'bill' };
beforeEach(()=>{
  session.signedIn = true;
  useCashWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'USD' }, entries: [] });
  usePlannedCashWorkbookStore.getState().setWorkbook({ ...originalPlans, entries: [plan], planGroups: [{ id: 'goal', name: 'Groceries', createdAt: '2026-01-01' }] });
});
afterEach(()=>{
  vi.restoreAllMocks();
  usePlannedCashWorkbookStore.setState({ updateEntry: originalUpdatePlan });
  useCashWorkbookStore.getState().setWorkbook(originalCash);
  usePlannedCashWorkbookStore.getState().setWorkbook(originalPlans);
  originals.forEach(restore=>restore());
});
it('requires authentication and rejects stale snapshots before writing records',()=>{
  session.signedIn = false;
  expect(()=>fulfillManualPlan(reference,plan.date,live('cash','bill'))).toThrow('Sign in');
  session.signedIn = true;
  expect(()=>fulfillManualPlan(reference,plan.date,{ ...plan, amount: 999 })).toThrow('changed');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(0);
});
it('settles the explicit manual occurrence once and carries its group into actual report detail',()=>{
  const categories = useCategoryStore.getState().workbook.categories;
  const named = categories.find(category=>category.name === 'Food');
  const result = fulfillManualPlan(reference,plan.date,live('cash','bill'));
  const record = useCashWorkbookStore.getState().workbook.entries[0];
  expect(record).toMatchObject({ id: result.actualId, date: plan.date, amount: 30, isDeposit: false, planLink: { module: 'cash', planId: 'bill', occurrenceDate: plan.date, groupId: 'goal' } });
  if (named) expect(record.categoryID).toBe(named.id);
  const report = getMoneyMovementReport(getNativeMovementActivities(['cash']),plan.date,plan.date,'2026-01-31','plan','actual');
  expect(report.rows[0].groups[0]).toMatchObject({ key: 'goal', label: 'Groceries', net: -30 });
  expect(()=>fulfillManualPlan(reference,plan.date,plan)).toThrow('changed');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(1);
});
it('preserves out-of-order recurrence completion and the original month-end anchor',()=>{
  const recurring = { ...plan, recurrence: { cycle: 'monthly' as const, startDate: plan.date } };
  usePlannedCashWorkbookStore.getState().setWorkbook({ ...originalPlans, entries: [recurring] });
  fulfillManualPlan(reference,'2026-02-28',live('cash','bill'),'2026-02-20');
  const rows = usePlannedCashWorkbookStore.getState().workbook.entries;
  expect(rows[0]).toMatchObject({ date: '2026-01-31', completedDates: ['2026-02-28'], recurrence: recurring.recurrence });
  expect(rows[1]).toMatchObject({ date: '2026-02-28', fulfilledDate: '2026-02-20', executed: true, seriesId: 'bill' });
  expect(useCashWorkbookStore.getState().workbook.entries[0].date).toBe('2026-02-20');
  expect(CalculationEngine.occurrences.planOccurrences(rows,'2026-01-31','2026-03-31').filter(row=>!row.executed).map(row=>row.date)).toEqual(['2026-01-31','2026-03-31']);
});
it('rolls back both local workbooks if the completion marker fails',()=>{
  vi.spyOn(usePlannedCashWorkbookStore.getState(),'updateEntry').mockImplementation(()=>{ throw new Error('Fixture failure'); });
  expect(()=>fulfillManualPlan(reference,plan.date,live('cash','bill'))).toThrow('Fixture failure');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(0);
  expect(usePlannedCashWorkbookStore.getState().workbook.entries[0].executed).toBeUndefined();
});
it('rejects replay when an actual record survived but its remote completion marker was lost',()=>{
  fulfillManualPlan(reference,plan.date,live('cash','bill'));
  usePlannedCashWorkbookStore.getState().setWorkbook({ ...originalPlans, entries: [plan] });
  expect(()=>fulfillManualPlan(reference,plan.date,live('cash','bill'))).toThrow('already has a ledger');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(1);
});
it('rejects excluded recurrence dates, invalid dates and invalid amounts without altering ledgers',()=>{
  const engine = CalculationEngine.manualPayments;
  const recurring = { ...plan, recurrence: { cycle: 'monthly' as const, startDate: plan.date, excludedDates: ['2026-02-28'] } };
  expect(()=>engine.prepareManualPlanFulfillment(reference,recurring,'2026-02-28','2026-02-28')).toThrow('excluded');
  expect(()=>engine.prepareManualPlanFulfillment(reference,plan,'2026-02-30','2026-02-28')).toThrow('dates');
  expect(()=>engine.prepareManualPlanFulfillment(reference,{ ...plan, amount: NaN },plan.date,plan.date)).toThrow('amount');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(0);
});
it('uses native bank/card signs and rejects inactive sources before creating actuals',()=>{
  const bank = useBankWorkbookStore.getState();
  const cards = useCreditCardWorkbookStore.getState();
  const bankPlan = { id: 'b', accountId: 'checking', date: plan.date, amount: -12, description: 'Bill', groupId: 'goal' };
  const cardPlan = { id: 'c', cardId: 'card', date: plan.date, amount: 6, kind: 'charge' as const, description: 'Charge', groupId: 'goal' };
  bank.setWorkbook({ ...bank.workbook, settings: { ...bank.workbook.settings, accounts: [{ id: 'checking', name: 'Checking', openingBalance: 0, currencyCode: 'USD', isActive: false }] }, transactions: [] });
  cards.setWorkbook({ cards: [{ id: 'card', name: 'Card', currencyCode: 'USD' }], transactions: [] });
  const bankPlans = usePlannedBankWorkbookStore.getState(), cardPlans = usePlannedCreditCardWorkbookStore.getState();
  bankPlans.setWorkbook({ ...bankPlans.workbook, entries: [bankPlan] });
  cardPlans.setWorkbook({ ...cardPlans.workbook, entries: [cardPlan] });
  expect(()=>fulfillManualPlan({ module: 'bank', id: 'b' },plan.date,live('bank','b'))).toThrow('active');
  expect(useBankWorkbookStore.getState().workbook.transactions).toHaveLength(0);
  useBankWorkbookStore.getState().updateAccount('checking',{ isActive: true });
  fulfillManualPlan({ module: 'bank', id: 'b' },plan.date,live('bank','b'));
  fulfillManualPlan({ module: 'creditCard', id: 'c' },plan.date,live('creditCard','c'));
  expect(useBankWorkbookStore.getState().workbook.transactions[0]).toMatchObject({ amount: -12, isDeposit: false, planLink: { groupId: 'goal' } });
  expect(useCreditCardWorkbookStore.getState().workbook.transactions[0]).toMatchObject({ amount: 6, kind: 'charge', planLink: { groupId: 'goal' } });
  const report = getMoneyMovementReport(getNativeMovementActivities(['bank','creditCards']),plan.date,plan.date,plan.date,'plan','actual');
  expect(report.rows[0].groups[0]).toMatchObject({ key: 'goal', net: -18 });
});
