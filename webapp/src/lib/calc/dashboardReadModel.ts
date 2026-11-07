import { MOVEMENT_MODULE_LABELS, MOVEMENT_KIND_LABELS, selectMovementActivities, type MovementActivity, type MovementKind } from './movementActivities';
import { projectedNetWorthTrend, endOfMonthAsOf, type MonthlyNetWorthPoint } from './netWorthTrend';
import { earliestActivityDate, netWorthAsOfDate, type NetWorthAsOfInputs } from './netWorthAsOf';
import { unverifiedOpeningCurrencies as openingGaps } from './netWorthValuation';
import { netIncomeByCurrency as rentalsNetIncomeByCurrency } from './rentalsModule';
import { activitiesForGroup } from './categoryGroups';
import type { Category, CategoryGroup } from '../../types/finance';
import type { RentalsWorkbook } from '../../types/rentalsWorkbook';
import { collectBudgetActivities, type BudgetActivity, type BudgetOccurrenceWindow } from './budgetPlanner';
import type { CashSettings } from '../../types/cashWorkbook';
import type { CurrencyNetWorth, FlowActivityItem, NetWorthBreakdownEntry } from './netWorth';
import { convertAmount, type FxRates } from './currencyConversion';

function reportingPeriodStart(period: '3' | '6' | '12' | 'ytd', today: string): string {
  const [year, month] = today.split('-').map(Number);
  if (period === 'ytd') return year + '-01-01';
  const date = new Date(Date.UTC(year, month - Number(period), 1));
  return date.toISOString().slice(0, 10);
}

export function shiftISODate(value: string, days: number): string {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}


export function isValidISODate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function resolveDashboardRange(periodValue: string, fromValue: string | null, toValue: string | null, earliestDate: string | undefined, todayISO: string) {
  const legacy: Record<string, string> = { '7d': 'custom', '30d': 'custom', '90d': 'custom', '6m': '6', '1y': '12' };
  const period = legacy[periodValue] ?? (['since-month', '3', '6', '12', 'ytd', 'all', 'custom'].includes(periodValue) ? periodValue : 'since-month');
  let from = todayISO;
  let to = todayISO;
  if (period === 'since-month') from = todayISO.slice(0, 7) + '-01';
  else if (period === '3' || period === '6' || period === '12' || period === 'ytd') from = reportingPeriodStart(period, todayISO);
  else if (period === 'all') from = earliestDate && earliestDate <= todayISO ? earliestDate : todayISO;
  else if (period === 'custom') {
    const legacyDays = periodValue === '7d' ? 6 : periodValue === '30d' ? 29 : periodValue === '90d' ? 89 : null;
    const requestedFrom = isValidISODate(fromValue) ? fromValue : legacyDays === null ? todayISO.slice(0, 7) + '-01' : shiftISODate(todayISO, -legacyDays);
    const requestedTo = isValidISODate(toValue) ? toValue : todayISO;
    from = requestedFrom > todayISO ? todayISO : requestedFrom;
    to = requestedTo > todayISO ? todayISO : requestedTo;
    if (from > to) [from, to] = [to, from];
  }
  const label = period === 'custom' || period === 'all' ? from + ' – ' + to
    : period === 'since-month' ? 'This month'
      : period === '3' ? 'Last 3 months'
        : period === '6' ? 'Last 6 months'
          : period === '12' ? 'Last 12 months' : 'Year to date';
  return { period, from, to, label };
}

export function sumActivitiesByCurrency(activities: MovementActivity[], fromDate: string, toDate: string): Record<string, number> {
  const totals: Record<string, number> = {};
  activities.forEach(activity => {
    if (!activity.executed || activity.isPending || activity.date < fromDate || activity.date > toDate) return;
    totals[activity.currencyCode] = (totals[activity.currencyCode] ?? 0) + activity.amount;
  });
  return totals;
}

export function activityFlowItems(activities: MovementActivity[], currency: string, fromDate: string, toDate: string): FlowActivityItem[] {
  const labels = MOVEMENT_MODULE_LABELS;
  return activities
    .filter(activity => activity.executed && !activity.isPending && activity.currencyCode === currency && activity.date >= fromDate && activity.date <= toDate)
    .map(activity => ({
      module: labels[activity.module],
      date: activity.date,
      description: activity.description,
      amount: activity.amount,
      accountName: activity.sourceLabel,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}


export function plannedActivityByCurrency(activities: MovementActivity[], fromDate: string, toDate: string) {
  const totals: Record<string, number> = {};
  for (const activity of activities) {
    if (activity.executed || activity.date < fromDate || activity.date > toDate) continue;
    totals[activity.currencyCode] = (totals[activity.currencyCode] ?? 0) + activity.amount;
  }
  return totals;
}

export function convertCurrencyTotals(values: Record<string, number>, currency: string, rates: FxRates | null) {
  let total = 0;
  const missing: string[] = [];
  for (const [code, amount] of Object.entries(values)) {
    // A zero contribution needs no exchange rate and cannot make a report incomplete.
    if (amount === 0) continue;
    const converted = convertAmount(amount, code, currency, rates);
    if (converted === null) missing.push(code); else total += converted;
  }
  return { total, missing, anyUnconverted: missing.length > 0 };
}

export function dashboardHeadline(input: {
  currency: string; rates: FxRates | null; rows: CurrencyNetWorth[];
  todayFlow: Record<string, number>; periodFlow: Record<string, number>;
  rangeStart: Record<string, number>; rangeEnd: Record<string, number>;
  planned: Record<string, number>; hasRangeBaseline: boolean; unverifiedOpeningCurrencies?: string[];
}) {
  const sum = (values: Record<string, number>) => convertCurrencyTotals(values, input.currency, input.rates);
  const net = sum(Object.fromEntries(input.rows.map(row => [row.currency, row.net])));
  const debts = sum(Object.fromEntries(input.rows.map(row => [row.currency, row.liabilities])));
  const previous = sum(input.rangeStart), periodEnd = sum(input.rangeEnd);
  // A change between incomplete currency populations is not a defensible result.
  const netWorthDelta = input.hasRangeBaseline && !input.unverifiedOpeningCurrencies?.length && !previous.anyUnconverted && !periodEnd.anyUnconverted ? periodEnd.total - previous.total : null;
  return { net, debts, previous, periodEnd, todayFlowTotal: sum(input.todayFlow), periodFlowTotal: sum(input.periodFlow),
    plannedTotal: sum(input.planned), netWorthDelta,
    netWorthDeltaPct: netWorthDelta !== null && previous.total !== 0 ? netWorthDelta / Math.abs(previous.total) * 100 : null,
  };
}


/** Insights use the same cleared period population as headline flow and drilldown. */
export function dashboardInsights(rows: CurrencyNetWorth[], activities: MovementActivity[], fromDate: string, toDate: string) {
  return rows.map(row => {
    const currencyActivity = activityFlowItems(activities, row.currency, fromDate, toDate);
    return { currency: row.currency,
      largestAsset: [...row.breakdown].filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount)[0],
      largestLiability: [...row.breakdown].filter(item => item.amount < 0).sort((a, b) => a.amount - b.amount)[0],
      netActivity: currencyActivity.reduce((sum, item) => sum + item.amount, 0), clearedCount: currencyActivity.length,
    };
  });
}


export function dashboardActivities(inputs: Parameters<typeof collectBudgetActivities>[0], cashSettings: CashSettings, selectedModules: readonly string[], asOf: Date, window?: BudgetOccurrenceWindow) {
  const cashEnabled = selectedModules.includes('cash') && cashSettings.includeInNetWorth !== false;
  return collectBudgetActivities({ ...inputs,
    cashEntries: cashEnabled ? inputs.cashEntries : [], plannedCash: cashEnabled ? inputs.plannedCash : [],
    bankAccounts: inputs.bankAccounts.filter(account => !account.migratedToCreditCardId && account.includeInNetWorth !== false && selectedModules.includes(account.isLiability ? 'creditCards' : 'bank')),
    rentalProperties: selectedModules.includes('rentals') ? inputs.rentalProperties : [],
  }, { asOf, horizonDays: 365, ...window });
}


export function reportingMonths(fromMonth: string, toMonth: string): string[] {
  const [year, month] = fromMonth.split('-').map(Number);
  const [endYear, endMonth] = toMonth.split('-').map(Number);
  const count = (endYear - year) * 12 + endMonth - month;
  return Array.from({ length: Math.max(0, count + 1) }, (_, index) => new Date(Date.UTC(year, month - 1 + index, 1)).toISOString().slice(0, 7));
}

export function planningReality(input: Omit<Parameters<typeof projectedNetWorthTrend>[0], 'months' | 'currentMonth' | 'projectionThroughDate'> & {
  selectedModules: readonly string[]; currencies: readonly string[]; horizonDays: number;
}) {
  const endDate = shiftISODate(input.todayISODate, input.horizonDays);
  const scoped = input.activities.filter(activity => input.selectedModules.includes(activity.module));
  const planned = scoped.filter(activity => !activity.executed && !activity.isPending && activity.date >= input.todayISODate && activity.date <= endDate);
  const emiLoans = input.selectedModules.includes('emi') ? input.emiLoans : [];
  const currentMonth = input.todayISODate.slice(0, 7);
  const forecast = projectedNetWorthTrend({ ...input, activities: scoped, emiLoans, currentMonth,
    months: reportingMonths(currentMonth, endDate.slice(0, 7)), projectionThroughDate: endDate }).at(-1);
  const currencies = [...new Set([...input.currencies, ...planned.map(activity => activity.currencyCode), ...emiLoans.map(loan => loan.currencyCode)])];
  const rows = currencies.map(currency => {
    const current = input.currentRows.find(row => row.currency === currency)?.net ?? 0;
    const items = planned.filter(activity => activity.currencyCode === currency);
    const inflow = items.reduce((sum, activity) => sum + Math.max(0, activity.amount), 0);
    const outflow = items.reduce((sum, activity) => sum + Math.min(0, activity.amount), 0);
    const projected = forecast?.byCurrency[currency] ?? current;
    return { currency, current, inflow, outflow, projected, change: projected - current };
  });
  return { endDate, planned, rows };
}

export function dashboardReport(input: { inputs: NetWorthAsOfInputs; rows: CurrencyNetWorth[]; activities: BudgetActivity[]; movements?: MovementActivity[]; rentals: RentalsWorkbook; todayISO: string; period: string; fromDate: string | null; toDate: string | null; preferredCurrency: string; rates: FxRates | null }) {
  const { inputs: netWorthAsOfInputs, rows, activities, rentals, todayISO, period: legacyPeriod, preferredCurrency, rates } = input;
  const movementSource: MovementActivity[] = input.movements ?? activities;
  const timeFilters = { fromDate: input.fromDate, toDate: input.toDate };
  const earliestActivity = earliestActivityDate(netWorthAsOfInputs);
  const earliestDashboardDate = [earliestActivity, ...movementSource.map(activity => activity.date)].filter((date): date is string => !!date).sort()[0];
  const dashboardRange = resolveDashboardRange(legacyPeriod, timeFilters.fromDate, timeFilters.toDate, earliestDashboardDate, todayISO);
  const actualMovements = selectMovementActivities(movementSource,'0000-01-01',todayISO,todayISO,'actual');
  const todayFlow = sumActivitiesByCurrency(actualMovements, todayISO, todayISO);
  const rangeStartDate = dashboardRange.from;
  const rangeEndDate = dashboardRange.to;
  const rangeLabel = dashboardRange.label;
  const rentalsNetForRange = rentalsNetIncomeByCurrency(rentals.settings.properties, rentals.entries.filter(entry => entry.date >= rangeStartDate && entry.date <= rangeEndDate));
  const rangeBaselineDate = shiftISODate(rangeStartDate, -1);
  const unverifiedOpeningCurrencies = openingGaps(netWorthAsOfInputs, rangeBaselineDate);
  const hasRangeBaseline = !!earliestActivity && earliestActivity <= rangeBaselineDate;
  const rangeStartRows = netWorthAsOfDate(rangeBaselineDate, netWorthAsOfInputs);
  const rangeEndRows = rangeEndDate === todayISO ? rows : netWorthAsOfDate(rangeEndDate, netWorthAsOfInputs);
  const rangeStartByCurrency = Object.fromEntries(rangeStartRows.map(row => [row.currency, row.net]));
  const rangeStartBreakdownByCurrency = Object.fromEntries(rangeStartRows.map(row => [row.currency, row.breakdown]));
  const rangeEndByCurrency = Object.fromEntries(rangeEndRows.map(row => [row.currency, row.net]));
  const rangeEndBreakdownByCurrency = Object.fromEntries(rangeEndRows.map(row => [row.currency, row.breakdown]));
  const periodFlow = sumActivitiesByCurrency(actualMovements, rangeStartDate, rangeEndDate);
  const plannedUpcomingByCurrency = plannedActivityByCurrency(selectMovementActivities(movementSource,todayISO,shiftISODate(todayISO,29),todayISO,'planned'),todayISO,shiftISODate(todayISO,29));

  // Item 4: "capital split per currency" — each currency's net worth
  // converted to the preferred currency for a like-for-like comparison
  // (a currency that can't convert is omitted from the chart, same
  // degradation as the grand total, rather than plotting a wrong number).
  // A doughnut can't meaningfully show a negative slice, so a currency
  // with negative net worth is left out of the chart specifically — it's
  // still fully visible in the per-currency cards and breakdown below.
  const splitData = rangeEndRows
    .map((r) => ({ currency: r.currency, converted: convertAmount(r.net, r.currency, preferredCurrency, rates) }))
    .filter((r): r is { currency: string; converted: number } => r.converted !== null && r.converted > 0);

  // Ordered by the user's own Primary/Secondary/Other ranking (2026-09-16),
  // not alphabetically — see `useCurrencyRankComparator`'s own doc comment.
  const ownCurrencies = [...new Set([...rows, ...rangeStartRows, ...rangeEndRows].map((r) => r.currency))].sort();
  const trendCurrentRows = ownCurrencies.map(currency => rows.find(row => row.currency === currency) ?? { currency, assets: 0, liabilities: 0, net: 0, breakdown: [] });
  const activityCurrencies = [...new Set(movementSource.filter(item=>item.movementKind !== 'transfer').map(activity => activity.currencyCode))].sort();
  const currencySummaryCurrencies = [...new Set([...ownCurrencies, ...Object.keys(todayFlow), ...Object.keys(periodFlow), ...Object.keys(plannedUpcomingByCurrency)])].sort();
  const currencySummaryRows = currencySummaryCurrencies.map(currency => rows.find(row => row.currency === currency) ?? { currency, assets: 0, liabilities: 0, net: 0, breakdown: [] });
  const selectedRangeActivities = actualMovements.filter(activity => activity.date >= rangeStartDate && activity.date <= rangeEndDate);
  const selectedRangeActualActivities = selectedRangeActivities.filter(activity => activity.executed && !activity.isPending);
  const insightCurrencies = [...new Set([...rangeStartRows, ...rangeEndRows].map(row => row.currency).concat(selectedRangeActualActivities.map(activity => activity.currencyCode)))].sort();
  const periodInsightRows = insightCurrencies.map(currency => rangeEndRows.find(row => row.currency === currency) ?? { currency, assets: 0, liabilities: 0, net: 0, breakdown: [] });
  const missingFxCurrencies = [...new Set([...rangeStartRows, ...rangeEndRows].filter(row => row.net !== 0 && convertAmount(row.net, row.currency, preferredCurrency, rates) === null).map(row => row.currency))];
  const periodDeltaRows = ownCurrencies.map(currency => ({ label: currency, currency, amount: (rangeEndByCurrency[currency] ?? 0) - (rangeStartByCurrency[currency] ?? 0) }));
  return { todayFlow, periodFlow, plannedUpcomingByCurrency, rangeStartDate, rangeEndDate, rangeLabel, rangeBaselineDate,
    unverifiedOpeningCurrencies, hasRangeBaseline, rangeEndRows, rangeStartByCurrency, rangeEndByCurrency, rangeStartBreakdownByCurrency, rangeEndBreakdownByCurrency,
    splitData, ownCurrencies, activityCurrencies, trendCurrentRows, currencySummaryRows, periodInsightRows, missingFxCurrencies, rentalsNetForRange, periodDeltaRows };
}

export function currencyDashboardSummary(row: CurrencyNetWorth, input: Omit<Parameters<typeof dashboardHeadline>[0], 'rows' | 'planned'>) {
  const rangeStartC = input.rangeStart[row.currency] ?? 0, rangeEndC = input.rangeEnd[row.currency] ?? 0;
  const deltaC = input.hasRangeBaseline && !input.unverifiedOpeningCurrencies?.includes(row.currency) ? rangeEndC - rangeStartC : null;
  return { converted: convertAmount(row.net, row.currency, input.currency, input.rates), todayFlowC: input.todayFlow[row.currency] ?? 0,
    periodFlowC: input.periodFlow[row.currency] ?? 0, deltaC, deltaPctC: deltaC !== null && rangeStartC !== 0 ? deltaC / Math.abs(rangeStartC) * 100 : null };
}

export function breakdownDelta(previous: NetWorthBreakdownEntry[], current: NetWorthBreakdownEntry[]) {
  return [...new Set([...previous.map(row => row.module), ...current.map(row => row.module)])].map(module => {
    const before = previous.find(row => row.module === module)?.amount ?? 0;
    const now = current.find(row => row.module === module)?.amount ?? 0;
    return { module, previous: before, current: now, delta: now - before };
  });
}

const BUDGET_MODULE_LABEL = MOVEMENT_MODULE_LABELS;
export function monthlyFlowItems(activities: MovementActivity[], month: string, currency: string): FlowActivityItem[] {
  return activities
    .filter((a) => !a.isPending && a.date.slice(0, 7) === month && a.currencyCode === currency)
    .map((a) => ({
      module: BUDGET_MODULE_LABEL[a.module] ?? a.module,
      date: a.date,
      description: a.description,
      amount: a.amount,
      accountName: a.sourceLabel,
    }));
}

/** The Net worth row's per-module drill-down for one month — reuses
 * exactly the same source `projectedNetWorthTrend` itself reads for that
 * month (see that function's own doc comment for the past/current/future
 * split), so the popup's own numbers always match the figure it was
 * opened from: a completed month's `netWorthAsOfDate` breakdown, the
 * current month's already-known live breakdown, or (a future/projected
 * month, which has no real per-module breakdown to show — the projection
 * only ever tracks two combined totals, see `MonthlyNetWorthPoint`) a
 * synthetic 2-row Assets/Liabilities split built from the same numbers the
 * chart/table cell itself renders. */
export function netWorthBreakdownForMonth(
  month: string, currency: string, nowMonth: string,
  netWorthAsOfInputs: NetWorthAsOfInputs, currentRows: CurrencyNetWorth[], trendRow: MonthlyNetWorthPoint | undefined,
): { rows: NetWorthBreakdownEntry[]; isProjected: boolean } {
  if (month < nowMonth) {
    const rows = netWorthAsOfDate(endOfMonthAsOf(month), netWorthAsOfInputs);
    return { rows: rows.find((r) => r.currency === currency)?.breakdown ?? [], isProjected: false };
  }
  if (month === nowMonth) {
    return { rows: currentRows.find((r) => r.currency === currency)?.breakdown ?? [], isProjected: false };
  }
  const assets = trendRow?.assetsByCurrency[currency];
  const liabilities = trendRow?.liabilitiesByCurrency[currency];
  if (assets === undefined && liabilities === undefined) return { rows: [], isProjected: true };
  const rows: NetWorthBreakdownEntry[] = [];
  if (assets) rows.push({ module: 'Assets (projected)', amount: assets });
  if (liabilities) rows.push({ module: 'Liabilities (projected)', amount: -liabilities });
  return { rows, isProjected: true };
}


export function categoryGroupReport(activities: MovementActivity[], group: CategoryGroup, categories: Category[], from: string, to: string) {
  const items = activitiesForGroup(activities, group, categories).filter(activity => !activity.isPending && activity.date >= from && activity.date <= to);
  const byCurrency: Record<string, number> = {};
  const details: Record<string, FlowActivityItem[]> = {};
  for (const item of items) {
    byCurrency[item.currencyCode] = (byCurrency[item.currencyCode] ?? 0) + item.amount;
    (details[item.currencyCode] ??= []).push({ module: BUDGET_MODULE_LABEL[item.module], date: item.date, description: item.description, amount: item.amount, accountName: item.sourceLabel });
  }
  return { byCurrency, details };
}
export function monthlyNetFlow(monthly: import('./budgetPlanner').MonthlyIncomeExpense | undefined, currency: string) {
  return (monthly?.income[currency] ?? 0) - (monthly?.expense[currency] ?? 0);
}

export function monthlyPlanReport(activities: MovementActivity[], fromMonth: string, monthCount: number, today: string) {
  const start = /^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth) ? fromMonth : today.slice(0, 7);
  const count = [1, 3, 6, 12].includes(monthCount) ? monthCount : 1;
  const date = new Date(start + '-01T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() + count - 1);
  const months = reportingMonths(start, date.toISOString().slice(0, 7));
  const fromDate = start + '-01', toDate = endOfMonthAsOf(months.at(-1)!);
  const items = activities.filter(item => item.movementKind !== 'transfer' && item.date >= fromDate && item.date <= toDate);
  const currencies = [...new Set(items.map(item => item.currencyCode))].sort();
  const rows = currencies.map(currency => ({ currency, months: months.map(month => {
    const bucket = items.filter(item => item.currencyCode === currency && item.date.slice(0, 7) === month);
    const actual = bucket.filter(item => item.executed && !item.isPending && item.date <= today);
    const pending = bucket.filter(item => item.isPending);
    const planned = bucket.filter(item => !item.executed && !item.isPending);
    const inflow = (values: MovementActivity[]) => values.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
    const outflow = (values: MovementActivity[]) => values.reduce((sum, item) => sum + Math.min(0, item.amount), 0);
    return { month, actualIn: inflow(actual), actualOut: outflow(actual), pendingIn: inflow(pending), pendingOut: outflow(pending), pendingNet: inflow(pending) + outflow(pending), plannedIn: inflow(planned), plannedOut: outflow(planned), plannedNet: inflow(planned) + outflow(planned) };
  }) }));
  return { fromDate, toDate, items, planned: items.filter(item => !item.executed && !item.isPending).sort((a,b) => a.date.localeCompare(b.date)), rows, months };
}

export function monthlyStatCards(months: string[], currency: string, monthly: { month: string; income: Record<string, number>; expense: Record<string, number> }[], trend: MonthlyNetWorthPoint[]) {
  return months.map(month => {
    const flow = monthly.find(row => row.month === month);
    const snapshot = trend.find(row => row.month === month);
    const income = flow?.income[currency] ?? 0, expense = flow?.expense[currency] ?? 0;
    return { month, netWorth: snapshot?.byCurrency[currency] ?? null, income, expense, netFlow: income - expense };
  });
}
export function moduleBreakdownChart(row: CurrencyNetWorth) {
  const entries = row.breakdown.filter(item => item.amount !== 0);
  return { labels: entries.map(item => item.module), amounts: entries.map(item => item.amount) };
}

export type FlowDimension = 'category' | 'module' | 'source' | 'plan' | 'kind';
export type FlowPopulation = 'actual' | 'pending' | 'planned';
export function moneyMovementReport(activities: MovementActivity[], from: string, to: string, today: string, dimension: FlowDimension, population: FlowPopulation, planNames: Record<string, string> = {}, kind: MovementKind | 'all' = 'all') {
  const items = selectMovementActivities(activities,from,to,today,population,kind);
  const modules = MOVEMENT_MODULE_LABELS;
  const rows = [...new Set(items.map(item => item.currencyCode))].sort().map(currency => {
    const native = items.filter(item => item.currencyCode === currency);
    const buckets = new Map<string, { key: string; label: string; inflow: number; outflow: number; net: number; items: FlowActivityItem[] }>();
    let inflow = 0, outflow = 0;
    for (const item of native) {
      const key = dimension === 'kind' ? item.movementKind ?? 'unclassified' : dimension === 'category' ? item.category || 'Uncategorized' : dimension === 'module' ? item.module : dimension === 'source' ? item.module + ':' + (item.sourceId ?? item.sourceLabel) : item.planGroupId || '__unallocated__';
      const label = dimension === 'kind' ? MOVEMENT_KIND_LABELS[key as MovementKind] : dimension === 'module' ? modules[item.module] : dimension === 'source' ? modules[item.module] + ' · ' + item.sourceLabel : dimension === 'plan' ? (item.planGroupId ? planNames[item.planGroupId] || 'Unnamed plan group' : 'Unallocated / no explicit plan link') : key;
      const group = buckets.get(key) ?? { key, label, inflow: 0, outflow: 0, net: 0, items: [] };
      group.inflow += Math.max(0,item.amount); group.outflow += Math.min(0,item.amount); group.net += item.amount;
      group.items.push({ module: modules[item.module], accountName: item.sourceLabel, date: item.date, description: item.description, amount: item.amount });
      buckets.set(key,group); inflow += Math.max(0,item.amount); outflow += Math.min(0,item.amount);
    }
    return { currency, inflow, outflow, net: inflow + outflow, groups: [...buckets.values()].sort((a,b) => a.outflow - b.outflow || b.inflow - a.inflow || a.label.localeCompare(b.label)) };
  });
  return { from, to, population, dimension, rows, count: items.length };
}

export function clearedRangeActivities(activities: MovementActivity[], from: string, to: string, today: string) {
  return activities.filter(item => item.executed && !item.isPending && item.date >= from && item.date <= to && item.date <= today);
}
