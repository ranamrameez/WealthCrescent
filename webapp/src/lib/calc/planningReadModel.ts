import { collectBudgetActivities, type BudgetActivity, type BudgetModule } from './budgetPlanner';
import { planOccurrences } from './planOccurrences';
import { groupFinancePlans } from '../financePlanHierarchy';
import { hasFulfilledPayments, planDescription, signedPlanAmount, type PlanRecord } from './financePlanModel';
import type { FinancePlanGroup } from '../../types/financePlanGroup';
import type { BankAccount } from '../../types/bankWorkbook';
import type { CreditCard } from '../../types/creditCard';
import type { Property } from '../../types/rentalsWorkbook';

export interface PlanningFilters { fromDate: string; toDate: string; category: string; direction: string; source: string }
export function filterPlanningActivities(activities: BudgetActivity[], filters: PlanningFilters) {
  return activities.filter(a => (!filters.fromDate || a.date >= filters.fromDate)
    && (!filters.toDate || a.date <= filters.toDate)
    && (filters.direction !== 'in' || a.amount >= 0) && (filters.direction !== 'out' || a.amount < 0)
    && (filters.category === 'all' || (a.category || 'Uncategorized') === filters.category));
}

/** Currency belongs to every aggregation key, including category and module rows. */
export function planningBudget(activities: BudgetActivity[], filters: PlanningFilters) {
  const month = filters.fromDate.slice(0, 7);
  const monthRows = filterPlanningActivities(activities, { ...filters, fromDate: '', toDate: '' })
    .filter(a => !a.executed && a.date.startsWith(month));
  const currencies = new Map<string, { income: number; expenses: number; net: number }>();
  const categories = new Map<string, { category: string; currencyCode: string; income: number; expense: number; net: number }>();
  const modules = new Map<string, { module: BudgetModule; currencyCode: string; total: number }>();
  for (const row of monthRows) {
    const totals = currencies.get(row.currencyCode) ?? { income: 0, expenses: 0, net: 0 };
    if (row.amount >= 0) totals.income += row.amount; else totals.expenses -= row.amount;
    totals.net += row.amount;
    currencies.set(row.currencyCode, totals);
    const category = row.category || 'Uncategorized', key = JSON.stringify([category, row.currencyCode]);
    const categoryTotal = categories.get(key) ?? { category, currencyCode: row.currencyCode, income: 0, expense: 0, net: 0 };
    if (row.amount >= 0) categoryTotal.income += row.amount; else categoryTotal.expense -= row.amount;
    categoryTotal.net += row.amount;
    categories.set(key, categoryTotal);
    const moduleKey = JSON.stringify([row.module, row.currencyCode]);
    const moduleTotal = modules.get(moduleKey) ?? { module: row.module, currencyCode: row.currencyCode, total: 0 };
    moduleTotal.total += row.amount;
    modules.set(moduleKey, moduleTotal);
  }
  return { count: monthRows.length, currencyTotals: [...currencies],
    categoryTotals: [...categories.values()].sort((a, b) => b.expense + b.income - a.expense - a.income),
    moduleTotals: [...modules.values()] };
}

export function planningActivity(input: Parameters<typeof collectBudgetActivities>[0], window?: Parameters<typeof collectBudgetActivities>[1]) {
  const activities = collectBudgetActivities(input, window);
  return { activities, categoryOptions: [...new Set(activities.map(a => a.category || 'Uncategorized'))].sort() };
}

export interface HierarchySources {
  records: PlanRecord[]; groups: FinancePlanGroup[]; accounts: BankAccount[];
  cards: CreditCard[]; properties: Property[];
  subscriptions: { id: string; name: string }[]; loans: { id: string; name: string }[];
}

export function planningHierarchy(input: HierarchySources, filters: PlanningFilters, selectedKey: string | null, today: string) {
  const { records, groups, accounts, cards, properties, subscriptions, loans } = input;
  const { grouped, keyFor } = groupFinancePlans(records, groups);
  const title = (key: string, rows: PlanRecord[]) => groups.find(group => key === 'group:' + group.id)?.name
    ?? (key.startsWith('subscription:') ? subscriptions.find(sub => sub.id === key.slice(13))?.name ?? 'Subscription renewals'
      : key.startsWith('emi:') ? loans.find(loan => loan.id === key.slice(4))?.name ?? 'Installment plan'
      : key.startsWith('lease:') ? properties.find(property => property.id === key.slice(6))?.name ?? 'Rent plan'
      : rows.length ? planDescription(rows.find(row => 'recurrence' in row.plan && row.plan.recurrence)?.plan ?? rows[0].plan) : 'Plan');
  const finance = ({ plan }: PlanRecord) => 'accountId' in plan ? accounts.find(a => a.id === plan.accountId)
    : 'cardId' in plan ? cards.find(a => a.id === plan.cardId) : 'propertyId' in plan ? properties.find(p => p.id === plan.propertyId) : undefined;
  const currency = (row: PlanRecord) => 'currencyCode' in row.plan ? row.plan.currencyCode : finance(row)?.currencyCode ?? '';
  const modules = ['cash', 'bank', 'creditCard', 'rentals'] as const;
  const expanded = modules.flatMap(module => planOccurrences(records.filter(row => row.module === module).map(row => row.plan), filters.fromDate, filters.toDate, new Date(today + 'T00:00:00Z'), null).map(plan => ({ module, plan })));
  const visible = expanded.filter(row => (filters.category === 'all' || row.plan.category === filters.category)
    && filters.source !== 'statement-import' && (filters.direction === 'all' || (filters.direction === 'in' ? signedPlanAmount(row.plan) >= 0 : signedPlanAmount(row.plan) < 0)));
  const selected = selectedKey ? grouped.get(selectedKey) : undefined;
  const selectedGroup = groups.find(group => selectedKey === 'group:' + group.id);
  const rawRows = selected ? visible.filter(row => keyFor(row) === selectedKey) : visible;
  const statusOf = (row: PlanRecord) => row.plan.executed ? 'Paid' : row.plan.date <= today ? 'Pending' : 'Planned';
  const rows = rawRows.map(row => ({ ...row, description: planDescription(row.plan), signedAmount: signedPlanAmount(row.plan),
    currencyCode: currency(row), financeName: finance(row)?.name ?? `Cash (${currency(row)})`, status: statusOf(row),
    reference: { module: row.module, id: 'planId' in row.plan && typeof row.plan.planId === 'string' ? row.plan.planId : row.plan.id },
    occurrenceDate: 'planId' in row.plan ? row.plan.date : undefined,
  }));
  const summaries = new Map<string, { code: string; receipts: number; payments: number; fulfilled: number }>();
  const analytics = new Map<string, { status: Record<string, number>; categories: Map<string, number>; finances: Map<string, number> }>();
  for (const row of rows) {
    const code = currency(row), signed = signedPlanAmount(row.plan);
    const summary = summaries.get(code) ?? { code, receipts: 0, payments: 0, fulfilled: 0 };
    if (row.plan.executed) summary.fulfilled++; else if (signed > 0) summary.receipts += signed; else summary.payments -= signed;
    summaries.set(code, summary);
    if (!code) continue;
    const current = analytics.get(code) ?? { status: {}, categories: new Map<string, number>(), finances: new Map<string, number>() };
    const amount = Math.abs(signed), status = statusOf(row), category = row.plan.category || 'Uncategorized';
    current.status[status] = (current.status[status] ?? 0) + amount;
    current.categories.set(category, (current.categories.get(category) ?? 0) + amount);
    const name = finance(row)?.name ?? `Cash (${code})`;
    current.finances.set(name, (current.finances.get(name) ?? 0) + amount);
    analytics.set(code, current);
  }
  return { grouped, selected, selectedGroup, rows, title, finance, currency, statusOf,
    summaries: [...summaries.values()],
    parent: selected?.find(row => 'recurrence' in row.plan && row.plan.recurrence),
    cannotDelete: selected?.some(row => hasFulfilledPayments(row.plan)) ?? false,
    analytics: [...analytics].map(([code, data]) => ({ code, status: data.status,
      categoryRows: [...data.categories].sort((a, b) => b[1] - a[1]).slice(0, 10),
      financeRows: [...data.finances].sort((a, b) => b[1] - a[1]),
      statusLabels: ['Planned', 'Pending', 'Paid'].filter(label => (data.status[label] ?? 0) > 0) })),
  };
}
