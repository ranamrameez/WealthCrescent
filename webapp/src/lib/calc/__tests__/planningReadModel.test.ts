import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../CalculationEngine';
import type { BudgetActivity } from '../budgetPlanner';
import type { HierarchySources } from '../planningReadModel';

const filters = { fromDate: '2026-11-01', toDate: '2026-11-30', direction: 'all', category: 'all', source: 'all' };
const activity = (patch: Partial<BudgetActivity>): BudgetActivity => ({ id: 'p', module: 'cash', sourceLabel: 'Cash', date: '2026-11-04', amount: -10, currencyCode: 'QAR', category: 'Food', description: 'Food', executed: false, ...patch });
const sources = (): HierarchySources => ({ records: [], groups: [], accounts: [], cards: [], properties: [], subscriptions: [], loans: [] });

describe('Planning read models', () => {
  it('selects a newly created empty parent plan', () => {
    const input = sources(); input.groups = [{ id: 'new', name: 'Renovation', createdAt: '' }];
    const result = CalculationEngine.planning.planningHierarchy(input, filters, 'group:new', '2026-11-04');
    expect(result.selected).toEqual([]);
    expect(result.title('group:new', result.selected!)).toBe('Renovation');
  });
  it('keeps category and module totals separate by currency and excludes actuals', () => {
    const result = CalculationEngine.planning.planningBudget([
      activity({}), activity({ id: 'p2', currencyCode: 'PKR', amount: -1000 }),
      activity({ id: 'p3', amount: 5 }), activity({ id: 'actual', executed: true, amount: -99 }),
      activity({ id: 'later', date: '2026-12-01' }),
    ], filters);
    expect(result.count).toBe(3);
    expect(result.categoryTotals).toEqual(expect.arrayContaining([
      { category: 'Food', currencyCode: 'QAR', income: 5, expense: 10, net: -5 },
      { category: 'Food', currencyCode: 'PKR', income: 0, expense: 1000, net: -1000 },
    ]));
    expect(result.moduleTotals).toEqual([
      { module: 'cash', currencyCode: 'QAR', total: -5 }, { module: 'cash', currencyCode: 'PKR', total: -1000 },
    ]);
  });

  it('applies category and direction filters to the budget as well as activities', () => {
    const rows = [activity({}), activity({ category: 'Travel', amount: -50 }), activity({ amount: 20 })];
    const selected = { ...filters, category: 'Food', direction: 'out' };
    expect(CalculationEngine.planning.filterPlanningActivities(rows, selected)).toHaveLength(1);
    expect(CalculationEngine.planning.planningBudget(rows, selected).currencyTotals).toEqual([['QAR', { income: 0, expenses: 10, net: -10 }]]);
  });

  it('retains fulfilled snapshots without generating duplicate recurrence rows', () => {
    const input = sources();
    input.records = [
      { module: 'cash', plan: { id: 'series', date: '2026-11-01', type: 'OUT', amount: 10, currencyCode: 'QAR', completedDates: ['2026-11-01'], recurrence: { cycle: 'monthly', startDate: '2026-11-01' } } },
      { module: 'cash', plan: { id: 'snapshot', seriesId: 'series', date: '2026-11-01', type: 'OUT', amount: 10, currencyCode: 'QAR', executed: true } },
    ];
    const result = CalculationEngine.planning.planningHierarchy(input, filters, 'series:series', '2026-11-04');
    expect(result.rows.map(row => row.plan.id)).toEqual(['snapshot']);
    expect(result.summaries).toEqual([{ code: 'QAR', receipts: 0, payments: 0, fulfilled: 1 }]);
    expect(result.cannotDelete).toBe(true);
  });

  it('resolves each finance currency and statuses at the supplied day', () => {
    const input = sources();
    input.accounts = [{ id: 'a', name: 'Account', currencyCode: 'PKR', openingBalance: 0 }];
    input.records = [
      { module: 'bank', plan: { id: 'bank', accountId: 'a', description: 'Bill', date: '2026-11-04', amount: -100 } },
      { module: 'cash', plan: { id: 'cash', date: '2026-11-05', amount: 20, currencyCode: 'QAR', type: 'IN' } },
    ];
    const result = CalculationEngine.planning.planningHierarchy(input, filters, null, '2026-11-04');
    expect(result.summaries).toEqual(expect.arrayContaining([{ code: 'PKR', receipts: 0, payments: 100, fulfilled: 0 }, { code: 'QAR', receipts: 20, payments: 0, fulfilled: 0 }]));
    expect(result.rows.map(result.statusOf)).toEqual(['Planned', 'Pending']);
  });
});
