import { loadCachedFxRates, fetchFxRates, saveFxRates, isFxStale, setCrossRate, type FxRates } from '../../lib/fx';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { auth } from '../../lib/firebase/client';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../../store/personalLoansWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { useRentalsWorkbookStore } from '../../store/rentalsWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useCategoryGroupStore } from '../../store/categoryGroupStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { getNetWorthInputs } from './netWorthService';

/** Query functions for a dashboard reporting snapshot. No persistence or UI dependencies. */
export function getDashboardHeadline(input: Parameters<typeof CalculationEngine.dashboard.dashboardHeadline>[0]) {
  return CalculationEngine.dashboard.dashboardHeadline(input);
}
export function getPlannedActivityByCurrency(...args: Parameters<typeof CalculationEngine.dashboard.plannedActivityByCurrency>) {
  return CalculationEngine.dashboard.plannedActivityByCurrency(...args);
}
export function resolveDashboardRange(...args: Parameters<typeof CalculationEngine.dashboard.resolveDashboardRange>) {
  return CalculationEngine.dashboard.resolveDashboardRange(...args);
}
export function sumActivitiesByCurrency(...args: Parameters<typeof CalculationEngine.dashboard.sumActivitiesByCurrency>) {
  return CalculationEngine.dashboard.sumActivitiesByCurrency(...args);
}
export function activityFlowItems(...args: Parameters<typeof CalculationEngine.dashboard.activityFlowItems>) {
  return CalculationEngine.dashboard.activityFlowItems(...args);
}
export function shiftISODate(...args: Parameters<typeof CalculationEngine.dashboard.shiftISODate>) {
  return CalculationEngine.dashboard.shiftISODate(...args);
}

export function getUnverifiedOpeningCurrencies(...args: Parameters<typeof CalculationEngine.valuation.unverifiedOpeningCurrencies>) {
  return CalculationEngine.valuation.unverifiedOpeningCurrencies(...args);
}

export function getDashboardInsights(...args: Parameters<typeof CalculationEngine.dashboard.dashboardInsights>) {
  return CalculationEngine.dashboard.dashboardInsights(...args);
}



export type InclusionModule = 'cash' | 'qse' | 'psx' | 'bank' | 'creditCards' | 'personalLoans' | 'emi' | 'funds' | 'fundsCash';
export interface NetWorthInclusionOption { module: InclusionModule; id?: string; label: string; included: boolean; }
export interface NetWorthInclusionGroup { title: string; items: NetWorthInclusionOption[]; }
const listeners = new Set<() => void>();
let context: ReturnType<typeof buildDashboardContext> | undefined;
const activities = new Map<string, ReturnType<typeof CalculationEngine.dashboard.dashboardActivities>>();
const movements = new Map<string, ReturnType<typeof CalculationEngine.movements.collectMovementActivities>>();
function invalidateDashboard() { context = undefined; activities.clear(); movements.clear(); listeners.forEach(listener => listener()); }
for (const source of [useCashWorkbookStore, useBankWorkbookStore, useCreditCardWorkbookStore, usePersonalLoansWorkbookStore, useEMIWorkbookStore, useFundsWorkbookStore, useWorkbookStore, usePSXWorkbookStore, usePlannedCashWorkbookStore, usePlannedBankWorkbookStore, usePlannedRentalsWorkbookStore, useRentalsWorkbookStore, useCategoryStore, useCategoryGroupStore, useInterEntityTransfersStore, usePlannedCreditCardWorkbookStore]) source.subscribe(invalidateDashboard);
let calendarTimer: ReturnType<typeof setInterval> | undefined;
export function subscribeDashboard(listener: () => void) {
  listeners.add(listener);
  let day = new Date().toISOString().slice(0, 10);
  if (!calendarTimer) calendarTimer = setInterval(() => {
    const next = new Date().toISOString().slice(0, 10);
    if (next !== day) { day = next; invalidateDashboard(); }
  }, 60_000);
  return () => { listeners.delete(listener); if (!listeners.size && calendarTimer) { clearInterval(calendarTimer); calendarTimer = undefined; } };
}

function buildDashboardContext() {
  const inputs = getNetWorthInputs();
  const funds = useFundsWorkbookStore.getState().workbook;
  const option = (module: InclusionModule, id: string | undefined, label: string, included?: boolean): NetWorthInclusionOption => ({ module, id, label, included: included !== false });
  const inclusionGroups: NetWorthInclusionGroup[] = [
    { title: 'Modules', items: [option('cash', undefined, 'Cash', inputs.cashSettings.includeInNetWorth), option('qse', undefined, 'Stock Exchanges (QSE)', inputs.qseBrokers?.some(broker => broker.settings.includeInNetWorth !== false) ?? inputs.qseSettings.includeInNetWorth), option('psx', undefined, 'Stock Exchanges (PSX)', inputs.psxBrokers?.some(broker => broker.settings.includeInNetWorth !== false) ?? inputs.psxSettings.includeInNetWorth)] },
    { title: 'Banking', items: inputs.bankAccounts.filter(account => !account.migratedToCreditCardId).map(account => option('bank', account.id, account.name + ' (' + account.currencyCode + ')', account.includeInNetWorth)) },
    { title: 'Credit cards', items: inputs.creditCards.map(card => option('creditCards', card.id, card.name + ' (' + card.currencyCode + ')', card.includeInNetWorth)) },
    { title: 'Personal Loans', items: inputs.personalLoans.map(loan => option('personalLoans', loan.id, loan.person + ' (' + loan.currencyCode + ')', loan.includeInNetWorth)) },
    { title: 'EMI / Loans', items: inputs.emiLoans.map(loan => option('emi', loan.id, loan.name + ' (' + loan.currencyCode + ')', loan.includeInNetWorth)) },
    { title: 'Funds', items: funds.funds.length || funds.transfers.length ? [option('fundsCash', undefined, 'Funds cash (only with reconciled funding)', funds.settings.includeCashInNetWorth === true), ...funds.funds.map(fund => option('funds', fund.id, fund.name + ' (' + fund.currencyCode + ')', fund.includeInNetWorth))] : [] },
  ];
  return { fundsCashRequiresOptIn: funds.settings.includeCashInNetWorth === undefined && funds.transactions.length > 0, inclusionGroups: inclusionGroups.filter(group => group.items.length),
    rentals: useRentalsWorkbookStore.getState().workbook,
    categories: useCategoryStore.getState().workbook.categories,
    categoryGroups: useCategoryGroupStore.getState().workbook.groups,
  };
}
export function getDashboardContext() { return context ??= buildDashboardContext(); }

export function getDashboardActivities(selectedModules: readonly string[], window?: { fromDate: string; toDate: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const key = JSON.stringify([today, [...selectedModules].sort(), window]);
  const cached = activities.get(key); if (cached) return cached;
  const inputs = getNetWorthInputs(), view = getDashboardContext();
  const result = CalculationEngine.dashboard.dashboardActivities({
    cashEntries: inputs.cashEntries, plannedCash: usePlannedCashWorkbookStore.getState().workbook.entries,
    bankAccounts: inputs.bankAccounts, bankTransactions: inputs.bankTransactions, plannedBank: usePlannedBankWorkbookStore.getState().workbook.entries,
    rentalProperties: view.rentals.settings.properties, rentalEntries: view.rentals.entries, plannedRentals: usePlannedRentalsWorkbookStore.getState().workbook.entries,
    categories: view.categories, links: useInterEntityTransfersStore.getState().workbook.entries,
  }, inputs.cashSettings, selectedModules, new Date(today + 'T00:00:00.000Z'), window);
  if (activities.size >= 32) activities.clear(); activities.set(key, result); return result;
}

/** Narrow authenticated command. Re-read the latest workbook to retain concurrent edits. */
export function setNetWorthInclusion(option: Pick<NetWorthInclusionOption, 'module' | 'id'>, included: boolean): void {
  if (!auth?.currentUser) throw new Error('Sign in to change what counts toward Net Worth.');
  if (typeof included !== 'boolean') throw new Error('Choose whether this item is included.');
  const { module, id } = option;
  const patch = { includeInNetWorth: included };
  if (module === 'cash') return useCashWorkbookStore.getState().updateSettings(patch);
  if (module === 'qse' || module === 'psx') {
    const store = module === 'qse' ? useWorkbookStore.getState() : usePSXWorkbookStore.getState();
    const workbook = store.workbook;
    // The dashboard toggle is exchange-wide; never leave hidden brokers included.
    const next = { ...workbook, settings: { ...workbook.settings, ...patch }, brokerProfiles: workbook.brokerProfiles.map(profile => ({ ...profile, settings: { ...profile.settings, ...patch } })) };
    if (module === 'qse') return useWorkbookStore.getState().setWorkbook(next as ReturnType<typeof useWorkbookStore.getState>['workbook']);
    return usePSXWorkbookStore.getState().setWorkbook(next as ReturnType<typeof usePSXWorkbookStore.getState>['workbook']);
  }
  if (module === 'fundsCash' || module === 'funds') {
    const store = useFundsWorkbookStore.getState(), workbook = store.workbook;
    if (module === 'fundsCash') return store.setWorkbook({ ...workbook, settings: { ...workbook.settings, includeCashInNetWorth: included } });
    if (!workbook.funds.some(fund => fund.id === id)) throw new Error('This fund no longer exists.');
    return store.setWorkbook({ ...workbook, funds: workbook.funds.map(fund => fund.id === id ? { ...fund, ...patch } : fund) });
  }
  if (module === 'bank') {
    const store = useBankWorkbookStore.getState();
    if (!store.workbook.settings.accounts.some(account => account.id === id && !account.migratedToCreditCardId)) throw new Error('This account no longer exists.');
    return store.updateAccount(id!, patch);
  }
  if (module === 'creditCards') {
    const store = useCreditCardWorkbookStore.getState();
    if (!store.workbook.cards.some(card => card.id === id)) throw new Error('This card no longer exists.');
    return store.updateCard(id!, patch);
  }
  if (module === 'personalLoans') {
    const store = usePersonalLoansWorkbookStore.getState();
    if (!store.workbook.loans.some(loan => loan.id === id)) throw new Error('This loan no longer exists.');
    return store.updateLoan(id!, patch);
  }
  if (module === 'emi') {
    const store = useEMIWorkbookStore.getState();
    if (!store.workbook.entries.some(loan => loan.id === id)) throw new Error('This loan no longer exists.');
    return store.updateEntry(id!, patch);
  }
  throw new Error('Unsupported inclusion source.');
}


export function getPlanningReality(input: Parameters<typeof CalculationEngine.dashboard.planningReality>[0]) { return CalculationEngine.dashboard.planningReality(input); }
export function getReportingMonths(...args: Parameters<typeof CalculationEngine.dashboard.reportingMonths>) { return CalculationEngine.dashboard.reportingMonths(...args); }
export function getMonthlyIncomeExpense(...args: Parameters<typeof CalculationEngine.budgets.monthlyIncomeExpense>) { return CalculationEngine.budgets.monthlyIncomeExpense(...args); }
export function getGroupActivities(...args: Parameters<typeof CalculationEngine.categoryGroups.activitiesForGroup>) { return CalculationEngine.categoryGroups.activitiesForGroup(...args); }
export function getNetWorthTrend(...args: Parameters<typeof CalculationEngine.netWorthTrend.projectedNetWorthTrend>) { return CalculationEngine.netWorthTrend.projectedNetWorthTrend(...args); }
export function getMonthEnd(...args: Parameters<typeof CalculationEngine.netWorthTrend.endOfMonthAsOf>) { return CalculationEngine.netWorthTrend.endOfMonthAsOf(...args); }
export function getEarliestActivityDate(...args: Parameters<typeof CalculationEngine.netWorthAsOf.earliestActivityDate>) { return CalculationEngine.netWorthAsOf.earliestActivityDate(...args); }
export function getNetWorthAtDate(...args: Parameters<typeof CalculationEngine.netWorthAsOf.netWorthAsOfDate>) { return CalculationEngine.netWorthAsOf.netWorthAsOfDate(...args); }
export function getRentalNetIncome(...args: Parameters<typeof CalculationEngine.rentalActuals.netIncomeByCurrency>) { return CalculationEngine.rentalActuals.netIncomeByCurrency(...args); }

export function getDashboardReport(input: Parameters<typeof CalculationEngine.dashboard.dashboardReport>[0]) { return CalculationEngine.dashboard.dashboardReport(input); }
export function getCurrencyDashboardSummary(...args: Parameters<typeof CalculationEngine.dashboard.currencyDashboardSummary>) { return CalculationEngine.dashboard.currencyDashboardSummary(...args); }
export function getBreakdownDelta(...args: Parameters<typeof CalculationEngine.dashboard.breakdownDelta>) { return CalculationEngine.dashboard.breakdownDelta(...args); }
export function getMonthlyFlowItems(...args: Parameters<typeof CalculationEngine.dashboard.monthlyFlowItems>) { return CalculationEngine.dashboard.monthlyFlowItems(...args); }
export function getNetWorthBreakdownForMonth(...args: Parameters<typeof CalculationEngine.dashboard.netWorthBreakdownForMonth>) { return CalculationEngine.dashboard.netWorthBreakdownForMonth(...args); }
export function getCategoryGroupReport(...args: Parameters<typeof CalculationEngine.dashboard.categoryGroupReport>) { return CalculationEngine.dashboard.categoryGroupReport(...args); }
export function getMonthlyNetFlow(...args: Parameters<typeof CalculationEngine.dashboard.monthlyNetFlow>) { return CalculationEngine.dashboard.monthlyNetFlow(...args); }


export function getDashboardFxRates() { return loadCachedFxRates(); }
export function isDashboardFxStale(rates: FxRates | null) { return isFxStale(rates); }
export function getDashboardEffectiveRate(from: string, to: string, rates: FxRates | null) { return CalculationEngine.currency.effectiveRate(from, to, rates); }
export async function refreshDashboardFxRates() {
  const rates = await fetchFxRates(); saveFxRates(rates); return rates;
}
/** Local manual-rate workflow retains its existing guest/cache semantics. */
export function saveDashboardCrossRate(from: string, to: string, rawValue: string, existing: FxRates | null) {
  const value = Number(rawValue);
  if (!from || !to || from === to || !Number.isFinite(value) || value <= 0) throw new Error('Pick two different currencies and a positive rate.');
  const rates = setCrossRate(from, to, value, existing);
  if (!rates) throw new Error('No valid rate anchor for ' + from + ' — set its rate against USD first, or pick USD as one side.');
  saveFxRates(rates); return rates;
}

export function getMonthlyPlanReport(...args: Parameters<typeof CalculationEngine.dashboard.monthlyPlanReport>) { return CalculationEngine.dashboard.monthlyPlanReport(...args); }

export function getMonthlyStatCards(...args: Parameters<typeof CalculationEngine.dashboard.monthlyStatCards>) { return CalculationEngine.dashboard.monthlyStatCards(...args); }
export function getModuleBreakdownChart(...args: Parameters<typeof CalculationEngine.dashboard.moduleBreakdownChart>) { return CalculationEngine.dashboard.moduleBreakdownChart(...args); }

export type { FlowDimension, FlowPopulation } from '../../lib/calc/dashboardReadModel';
export function getMoneyMovementReport(activities: Parameters<typeof CalculationEngine.dashboard.moneyMovementReport>[0], from: string, to: string, today: string, dimension: Parameters<typeof CalculationEngine.dashboard.moneyMovementReport>[4], population: Parameters<typeof CalculationEngine.dashboard.moneyMovementReport>[5], kind: Parameters<typeof CalculationEngine.dashboard.moneyMovementReport>[7] = 'all') {
  const names = Object.fromEntries((usePlannedCashWorkbookStore.getState().workbook.planGroups ?? []).map(group => [group.id, group.name]));
  return CalculationEngine.dashboard.moneyMovementReport(activities,from,to,today,dimension,population,names,kind);
}

export function getClearedRangeActivities(...args: Parameters<typeof CalculationEngine.dashboard.clearedRangeActivities>) { return CalculationEngine.dashboard.clearedRangeActivities(...args); }

export function getNativeMovementActivities(modules: readonly string[], window?: { fromDate: string; toDate: string }) {
  const today = new Date().toISOString().slice(0,10);
  const key = JSON.stringify([today,[...modules].sort(),window]);
  const cached = movements.get(key); if (cached) return cached;
  const cash = useCashWorkbookStore.getState().workbook, bank = useBankWorkbookStore.getState().workbook;
  const rentals = useRentalsWorkbookStore.getState().workbook, qse = useWorkbookStore.getState().workbook, psx = usePSXWorkbookStore.getState().workbook;
  const categories = getDashboardContext().categories, links = useInterEntityTransfersStore.getState().workbook.entries;
  const result = CalculationEngine.movements.collectMovementActivities({
    native: { cash: cash.entries, bank, rentals, cards: useCreditCardWorkbookStore.getState().workbook,
      personalLoans: usePersonalLoansWorkbookStore.getState().workbook, emi: useEMIWorkbookStore.getState().workbook, funds: useFundsWorkbookStore.getState().workbook, qse, psx },
    base: { cashEntries: cash.settings.includeInNetWorth === false ? [] : cash.entries, plannedCash: cash.settings.includeInNetWorth === false ? [] : usePlannedCashWorkbookStore.getState().workbook.entries,
      bankAccounts: bank.settings.accounts.filter(account => !account.migratedToCreditCardId && account.includeInNetWorth !== false), bankTransactions: bank.transactions, plannedBank: usePlannedBankWorkbookStore.getState().workbook.entries,
      rentalProperties: rentals.settings.properties, rentalEntries: rentals.entries, plannedRentals: usePlannedRentalsWorkbookStore.getState().workbook.entries, categories },
    plannedCards: usePlannedCreditCardWorkbookStore.getState().workbook.entries, categories, links, qseSettings: qse.settings, psxSettings: psx.settings,
  },modules,{ ...window, asOf: new Date(today + 'T00:00:00Z'), horizonDays: 365 });
  if (movements.size >= 32) movements.clear(); movements.set(key,result); return result;
}
export type { MovementActivity, MovementKind } from '../../lib/calc/movementActivities';
