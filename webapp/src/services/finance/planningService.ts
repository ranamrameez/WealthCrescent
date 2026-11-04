import { resolveNumericInput } from '../../lib/mathExpression';
import { validBatchDate } from '../../lib/dateValidation';
import type { RecurrenceRule } from '../../types/recurrence';
import type { CreditCardTransactionKind } from '../../types/creditCard';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import type { PlanningFilters } from '../../lib/calc/planningReadModel';
import { assignPlanFinance, readPlanGroups, savePlanGroup, writeFinancePlan, deleteFinancePlan, readFinancePlans, deletePlanGroup as removeGroup, deletePlanPayment as removePayment } from '../../lib/financePlans';
import type { PlanReference, PlanModule, FinancePlan, PlanRecord } from '../../lib/calc/financePlanModel';
import type { FinancePlanGroup } from '../../types/financePlanGroup';
import { auth } from '../../lib/firebase/client';
import { useCategoryStore } from '../../store/categoryStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { useRentalsWorkbookStore } from '../../store/rentalsWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';

export type { BudgetActivity, BudgetModule } from '../../lib/calc/budgetPlanner';
export type { PlanRecord, PlanReference, PlanModule } from '../../lib/calc/financePlanModel';
export { planDescription, signedPlanAmount } from '../../lib/calc/financePlanModel';

const listeners = new Set<() => void>();
let revision = 0;
function invalidate() { revision++; listeners.forEach(listener => listener()); }
[
  useCategoryStore, useCashWorkbookStore, usePlannedCashWorkbookStore,
  useBankWorkbookStore, usePlannedBankWorkbookStore, useCreditCardWorkbookStore,
  usePlannedCreditCardWorkbookStore, useRentalsWorkbookStore, usePlannedRentalsWorkbookStore,
  useSubscriptionsWorkbookStore, useEMIWorkbookStore, useInterEntityTransfersStore,
].forEach(store => store.subscribe(invalidate));

export function subscribePlanning(listener: () => void) {
  listeners.add(listener);
  // Read models need to refresh their due status when an open app crosses midnight.
  const timer = setInterval(listener, 60_000);
  return () => { listeners.delete(listener); clearInterval(timer); };
}

function sourceData() {
  const bank = useBankWorkbookStore.getState().workbook;
  const cashPlans = usePlannedCashWorkbookStore.getState().workbook;
  const rentals = useRentalsWorkbookStore.getState().workbook;
  return {
    cashEntries: useCashWorkbookStore.getState().workbook.entries,
    plannedCash: cashPlans.entries, bankAccounts: bank.settings.accounts, bankTransactions: bank.transactions,
    plannedBank: usePlannedBankWorkbookStore.getState().workbook.entries,
    rentalProperties: rentals.settings.properties, rentalEntries: rentals.entries,
    plannedRentals: usePlannedRentalsWorkbookStore.getState().workbook.entries,
    categories: useCategoryStore.getState().workbook.categories,
    links: useInterEntityTransfersStore.getState().workbook.entries,
    defaultCurrency: useCashWorkbookStore.getState().workbook.settings.defaultCurrency,
    records: readFinancePlans(), groups: cashPlans.planGroups ?? [], accounts: bank.settings.accounts,
    cards: useCreditCardWorkbookStore.getState().workbook.cards, properties: rentals.settings.properties,
    subscriptions: useSubscriptionsWorkbookStore.getState().workbook.entries,
    loans: useEMIWorkbookStore.getState().workbook.entries,
  };
}

function buildOverview(filters: PlanningFilters) {
  const { activities, categoryOptions } = CalculationEngine.planning.planningActivity(sourceData(), {
    fromDate: filters.fromDate ? filters.fromDate.slice(0, 7) + '-01' : undefined,
    toDate: filters.toDate || (filters.fromDate ? CalculationEngine.netWorthTrend.endOfMonthAsOf(filters.fromDate.slice(0, 7)) : undefined),
    asOf: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
  });
  return { activities, categoryOptions, filteredActivities: CalculationEngine.planning.filterPlanningActivities(activities, filters),
    budget: CalculationEngine.planning.planningBudget(activities, filters) };
}

function cachedQuery<T>(query: (filters: PlanningFilters, selected: string | null, today: string) => T) {
  const cache = new Map<string, T>();
  let cacheRevision = -1, cacheDate = '';
  return (filters: PlanningFilters, selected: string | null = null): T => {
    const today = new Date().toISOString().slice(0, 10);
    if (revision !== cacheRevision || cacheDate !== today) { cache.clear(); cacheRevision = revision; cacheDate = today; }
    const key = JSON.stringify([filters, selected]);
    const existing = cache.get(key);
    if (existing) return existing;
    const result = query(filters, selected, today);
    // Bound cache growth as users change filters in a long-lived session.
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  };
}

export const getPlanningOverview = cachedQuery(buildOverview);
export const getPlanningHierarchy = cachedQuery((filters, selected, today) => CalculationEngine.planning.planningHierarchy(sourceData(), filters, selected, today));

function requireUser() { if (!auth?.currentUser) throw new Error('Sign in to change planned payments.'); }
export function deletePlannedPayment(reference: PlanReference, occurrenceDate?: string) {
  requireUser();
  removePayment(reference, occurrenceDate);
}
export function deletePlanningGroup(id: string, expected: FinancePlanGroup) {
  requireUser();
  removeGroup(id, expected);
}

const editorFilters = { fromDate: '', toDate: '', category: 'all', direction: 'all', source: 'all' };
const editorQuery = cachedQuery(() => sourceData());
export function getPlanningEditorSources() { return editorQuery(editorFilters); }
export function savePlanningGroup(group: FinancePlanGroup, expected?: FinancePlanGroup) {
  requireUser(); savePlanGroup(group, expected);
}
export interface PlannedPaymentInput {
  reference?: PlanReference; original?: FinancePlan; occurrenceDate?: string;
  groupId: string; module: PlanModule; ref: string; currency: string; date: string;
  amount: string; direction: 'in' | 'out'; cardKind: CreditCardTransactionKind;
  description: string; category: string; recurrence?: RecurrenceRule;
}
export function savePlannedPayment(input: PlannedPaymentInput) {
  requireUser();
  const { reference, original, occurrenceDate, groupId, module, ref, currency, date, amount, direction, cardKind, description, category, recurrence } = input;
  const { accounts, cards, properties } = sourceData();
  const options = module === 'bank' ? accounts : module === 'creditCard' ? cards : module === 'rentals' ? properties : [];
  const selected = options.find(item => item.id === ref);
  const effectiveCurrency = selected?.currencyCode ?? currency;
  if (!effectiveCurrency.trim()) throw new Error('Choose a currency.');
  const numeric = resolveNumericInput(amount);
  if (!validBatchDate(date) || numeric === null || numeric <= 0) throw new Error('Enter a valid date and a positive amount.');
  if (module !== 'cash' && (!selected || selected.isActive === false)) throw new Error('Choose an active finance.');
  const rental = original && 'propertyId' in original ? original : undefined;
  if (rental && module !== 'rentals' && (module === 'creditCard' || properties.find(item => item.id === rental.propertyId)?.currencyCode !== effectiveCurrency)) throw new Error('Rent plans link to Cash or a bank account in the property currency.');
  if (recurrence && (module === 'rentals' || (recurrence.endDate && recurrence.endDate < date) || (recurrence.cycle === 'custom' && !(recurrence.customDays && recurrence.customDays > 0)))) throw new Error('Check the recurrence dates and interval.');
  if (reference && !original) throw new Error('This plan no longer exists.');
  if (original?.executed) throw new Error('Fulfilled plans cannot be reassigned.');
  if (occurrenceDate && original && 'recurrence' in original && CalculationEngine.occurrences.occurrenceCompleted(original, occurrenceDate)) throw new Error('Fulfilled items cannot be reassigned.');
  if (groupId && !readPlanGroups().some(group => group.id === groupId)) throw new Error('The parent plan no longer exists. Choose another plan.');
  const latest = reference && readFinancePlans().find(row => row.module === reference.module && row.plan.id === reference.id)?.plan;
  if (reference && JSON.stringify(latest) !== JSON.stringify(original)) throw new Error('This plan changed. Reopen its editor.');
  if (original && 'recurrence' in original && original.recurrence && !occurrenceDate && module !== reference?.module && (original.completedDates?.length || original.executedThrough)) throw new Error('Relink an individual occurrence to preserve this series\' completed history.');
  const id = occurrenceDate ? crypto.randomUUID() : original?.id ?? crypto.randomUUID();
  const common = { ...original, id, groupId: groupId || undefined, date, amount: numeric, category, executed: false, recurrence: recurrence ? { ...recurrence, startDate: date } : undefined };
  const destination = rental ? 'rentals' : module;
  const draft: FinancePlan = rental && module !== 'rentals' ? { ...rental, groupId: groupId || undefined, date, amount:numeric, type:direction==='in'?'RENT_INCOME':'EXPENSE', note:description, category, finance:{module:module==='cash'?'cash':'bank',ref:module==='cash'?undefined:ref,currencyCode:effectiveCurrency} }
    : module === 'cash' ? { ...common, type: direction === 'in' ? 'IN' : 'OUT', currencyCode: effectiveCurrency, note: description }
    : module === 'bank' ? { ...common, accountId: ref, amount: direction === 'in' ? numeric : -numeric, description }
    : module === 'creditCard' ? { ...common, cardId: ref, kind: direction === 'in' ? 'payment' : cardKind==='payment'?'charge':cardKind, description }
    : { ...common, propertyId: ref, type: direction === 'in' ? 'RENT_INCOME' : 'EXPENSE', note: description };
  // Keep destination records clean when moving between finance stores.
  if ('accountId' in draft && module !== 'bank') delete (draft as Partial<{accountId: string}>).accountId;
  if ('cardId' in draft && module !== 'creditCard') delete (draft as Partial<{cardId: string}>).cardId;
  if ('propertyId' in draft && destination !== 'rentals') delete (draft as Partial<{propertyId: string}>).propertyId;
  for (const field of destination === 'rentals' ? ['description', 'kind', 'currencyCode'] : module === 'cash' ? ['description', 'kind'] : module === 'bank' ? ['type', 'kind', 'currencyCode', 'note'] : module === 'creditCard' ? ['type', 'currencyCode', 'note'] : ['description', 'kind', 'currencyCode']) Reflect.deleteProperty(draft, field);
  if (occurrenceDate && original && 'recurrence' in original && original.recurrence && reference) {
    writeFinancePlan(reference.module, { ...original, recurrence: { ...original.recurrence, excludedDates: [...new Set([...(original.recurrence.excludedDates ?? []), occurrenceDate])] } }, true);
    writeFinancePlan(module, { ...draft, seriesId: original.id });
  } else {
    writeFinancePlan(destination, draft, !!reference && reference.module === destination);
    if (reference && reference.module !== destination) deleteFinancePlan(reference);
  }

}

export function relinkPlannedPayments(snapshot: PlanRecord[], module: 'cash' | 'bank' | 'creditCard', ref: string, currency: string, currencyAcknowledged: boolean) {
  requireUser();
  const { accounts, cards, properties } = sourceData();
  const options = module === 'bank' ? accounts : cards;
  const selected = options.find(item => item.id === ref && item.isActive !== false);
  const targetCurrency = module === 'cash' ? currency : selected?.currencyCode;
  if (!snapshot.length) throw new Error('There are no unfulfilled items to relink.');
  if (snapshot.some(row => row.plan.executed)) throw new Error('Fulfilled items cannot be relinked.');
  if (module !== 'cash' && !selected) throw new Error('Choose an active finance.');
  if (!targetCurrency) throw new Error('Choose a currency.');
  const sourceCurrency = (row: PlanRecord) => {
    const plan = row.plan;
    return 'currencyCode' in plan ? plan.currencyCode : 'accountId' in plan ? accounts.find(item => item.id === plan.accountId)?.currencyCode : 'cardId' in plan ? cards.find(item => item.id === plan.cardId)?.currencyCode : properties.find(item => item.id === plan.propertyId)?.currencyCode;
  };
  if (!currencyAcknowledged && snapshot.some(row => { const code = sourceCurrency(row); return code && code !== targetCurrency; })) throw new Error('Confirm the currency change before saving.');
  const current = readFinancePlans();
  if (snapshot.some(row => JSON.stringify(current.find(item => item.module === row.module && item.plan.id === row.plan.id)?.plan) !== JSON.stringify(row.plan))) throw new Error('A plan item changed. Reopen the finance editor.');
  const target = {module,ref,currencyCode:module === 'cash' ? currency : selected!.currencyCode};
  if (snapshot.some(({plan})=>'propertyId' in plan && (module==='creditCard' || properties.find(p=>p.id===plan.propertyId)?.currencyCode!==target.currencyCode))) throw new Error('Rent plans link to Cash or a bank account in the property currency.');
  const updated = snapshot.map(row => ({row,plan:assignPlanFinance(row.plan,target)}));
  updated.forEach(({row,plan}) => { const destination='propertyId' in plan ? 'rentals' : module; writeFinancePlan(destination,plan,row.module === destination); if (row.module !== destination) deleteFinancePlan({module:row.module,id:row.plan.id}); });
  for (const {plan} of snapshot) {
    if ('propertyId' in plan && module!=='creditCard') useRentalsWorkbookStore.getState().updateProperty(plan.propertyId,{plannedFinance:{...target,module}});
    if ('sourceSubscriptionId' in plan && plan.sourceSubscriptionId) useSubscriptionsWorkbookStore.getState().updateEntry(plan.sourceSubscriptionId,{paidVia:module==='cash' ? {module:'cash'} : {module,ref}});
  }

}
