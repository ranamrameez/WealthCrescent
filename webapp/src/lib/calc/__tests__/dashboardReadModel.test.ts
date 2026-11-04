import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../CalculationEngine';
import type { BudgetActivity } from '../budgetPlanner';
const engine = CalculationEngine.dashboard;
const activity = (id: string, amount: number, executed: boolean, extra: Partial<BudgetActivity> = {}): BudgetActivity => ({
  id, amount, executed, module: 'cash', sourceLabel: 'Cash', currencyCode: 'USD', date: '2026-01-15', description: id, ...extra,
});

describe('dashboard financial read model', () => {
  it('uses exactly the cleared activity population for totals and itemized drilldown', () => {
    const input = [activity('income', 200, true), activity('expense', -50, true), activity('pending', 1000, true, { isPending: true }),
      activity('plan', -80, false), activity('other-currency', 700, true, { currencyCode: 'QAR' }), activity('later', 600, true, { date: '2026-02-01' })];
    const totals = engine.sumActivitiesByCurrency(input, '2026-01-01', '2026-01-31');
    expect(totals).toEqual({ USD: 150, QAR: 700 });
    for (const [currency, amount] of Object.entries(totals)) {
      const details = engine.activityFlowItems(input, currency, '2026-01-01', '2026-01-31');
      expect(details.reduce((sum, item) => sum + item.amount, 0)).toBe(amount);
    }
    expect(engine.plannedActivityByCurrency(input, '2026-01-01', '2026-01-31')).toEqual({ USD: -80 });
  });

  it('anchors period boundaries to the supplied date, including leap years and year rollover', () => {
    expect(engine.resolveDashboardRange('since-month', null, null, undefined, '2024-02-29').from).toBe('2024-02-01');
    expect(engine.resolveDashboardRange('3', null, null, undefined, '2026-01-03').from).toBe('2025-11-01');
    expect(engine.resolveDashboardRange('custom', '2026-02-30', null, undefined, '2026-01-03').from).toBe('2026-01-01');
    expect(engine.resolveDashboardRange('custom', '2025-12-30', '2026-05-03', undefined, '2026-01-03').to).toBe('2026-01-03');
    expect(engine.shiftISODate('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('withholds a change when either endpoint lacks conversion coverage', () => {
    const result = engine.dashboardHeadline({ currency: 'USD', rates: null, rows: [], todayFlow: {}, periodFlow: {}, planned: {},
      rangeStart: { USD: 100 }, rangeEnd: { USD: 110, QAR: 200 }, hasRangeBaseline: true });
    expect(result.netWorthDelta).toBeNull();
    expect(result.netWorthDeltaPct).toBeNull();
    expect(result.periodEnd.missing).toEqual(['QAR']);
    expect(engine.convertCurrencyTotals({ USD: 10, QAR: 0 }, 'USD', null)).toEqual({ total: 10, missing: [], anyUnconverted: false });
  });

  it('keeps signed changes and percentage denominators consistent for a negative opening balance', () => {
    const result = engine.dashboardHeadline({ currency: 'USD', rates: null, rows: [], todayFlow: {}, periodFlow: {}, planned: {},
      rangeStart: { USD: -100 }, rangeEnd: { USD: -80 }, hasRangeBaseline: true });
    expect(result.netWorthDelta).toBe(20);
    expect(result.netWorthDeltaPct).toBe(20);
  });
});


it('does not turn an undated opening balance into apparent period growth', () => {
  const result = engine.dashboardHeadline({ currency: 'USD', rates: null, rows: [], todayFlow: {}, periodFlow: {}, planned: {},
    rangeStart: { USD: 100 }, rangeEnd: { USD: 600 }, hasRangeBaseline: true, unverifiedOpeningCurrencies: ['USD'] });
  expect(result.netWorthDelta).toBeNull();
});


it('reconciles cleared Insights with the same headline and itemized activity population', () => {
  const activities = [activity('actual', 100, true), activity('pending', 900, true, { isPending: true }), activity('plan', 800, false)];
  const rows = [{ currency: 'USD', assets: 100, liabilities: 0, net: 100, breakdown: [{ module: 'Cash', amount: 100 }] }];
  const [insight] = engine.dashboardInsights(rows, activities, '2026-01-01', '2026-01-31');
  expect(insight.netActivity).toBe(100);
  expect(insight.clearedCount).toBe(1);
  expect(insight.netActivity).toBe(engine.sumActivitiesByCurrency(activities, '2026-01-01', '2026-01-31').USD);
});


it('uses the same pending-safe population for monthly totals, category totals and their detail rows', () => {
  const activities = [activity('actual', 100, true, { category: 'Salary' }), activity('pending', 900, true, { category: 'Salary', isPending: true }), activity('plan', 80, false, { category: 'Salary' })];
  const monthly = CalculationEngine.budgets.monthlyIncomeExpense(activities, ['2026-01'])[0];
  const details = engine.monthlyFlowItems(activities, '2026-01', 'USD');
  expect(details.reduce((sum, item) => sum + item.amount, 0)).toBe(engine.monthlyNetFlow(monthly, 'USD'));
  expect(engine.monthlyNetFlow(monthly, 'USD')).toBe(180);
  const group = engine.categoryGroupReport(activities, { id: 'g', serialNumber: 1, name: 'Income', categoryIds: ['salary'] }, [{ id: 'salary', serialNumber: 1, name: 'Salary' }], '2026-01-01', '2026-01-31');
  expect(group.byCurrency.USD).toBe(180);
  expect(group.details.USD.reduce((sum, item) => sum + item.amount, 0)).toBe(group.byCurrency.USD);
});
