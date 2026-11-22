import { describe, expect, it } from 'vitest';
import { createEmptyWorkbook } from '../../../store/defaultWorkbook';
import { createEmptyPSXWorkbook } from '../../../store/defaultPsxWorkbook';
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

it('reports full calendar months with separate cleared, pending and planned populations', () => {
  const report = engine.monthlyPlanReport([
    activity('cleared', 100, true, { date: '2024-02-01' }),
    activity('pending', -20, true, { date: '2024-02-10', isPending: true }),
    activity('plan', -30, false, { date: '2024-02-29' }),
    activity('future-real', 900, true, { date: '2024-02-29' }),
    activity('outside', 500, false, { date: '2024-03-01' }),
    activity('qar', 7, false, { date: '2024-02-20', currencyCode: 'QAR' }),
  ], '2024-02', 1, '2024-02-15');
  expect(report.fromDate).toBe('2024-02-01'); expect(report.toDate).toBe('2024-02-29');
  expect(report.rows.find(row => row.currency === 'USD')?.months).toEqual([
    { month: '2024-02', actualIn: 100, actualOut: 0, pendingIn: 0, pendingOut: -20, pendingNet: -20, plannedIn: 0, plannedOut: -30, plannedNet: -30 },
  ]);
  expect(report.rows.find(row => row.currency === 'QAR')?.months[0].plannedIn).toBe(7);
});
it('includes zero-activity months and normalizes unsupported timeline requests', () => {
  const report = engine.monthlyPlanReport([activity('last', -10, false, { date: '2026-03-31' })], '2026-01', 3, '2026-01-01');
  expect(report.months).toEqual(['2026-01','2026-02','2026-03']);
  expect(report.rows[0].months.map(month => month.plannedNet)).toEqual([0,0,-10]);
  expect(engine.monthlyPlanReport([], 'invalid', 900, '2026-01-01').months).toEqual(['2026-01']);
});

it('monthly widgets preserve unknown net worth and match activity amounts without mixing currencies', () => {
  const rows = engine.monthlyStatCards(['2026-01','2026-02'], 'USD', [{ month: '2026-01', income: { USD: 100, QAR: 900 }, expense: { USD: 30 } }], []);
  expect(rows[0]).toEqual({ month: '2026-01', netWorth: null, income: 100, expense: 30, netFlow: 70 });
  expect(rows[1].netWorth).toBeNull(); expect(rows[1].netFlow).toBe(0);
});

it('reconciles movement groups to the same actual population without currency or lifecycle mixing', () => {
  const input = [activity('in',100,true,{category:'Salary'}), activity('out',-30,true,{category:'Food'}), activity('pending',-500,true,{isPending:true}), activity('plan',-900,false,{planGroupId:'goal'}), activity('future',800,true,{date:'2026-02-01'}), activity('qar',200,true,{currencyCode:'QAR'})];
  for (const dimension of ['category','module','source','plan'] as const) {
    const result = engine.moneyMovementReport(input,'2026-01-01','2026-02-28','2026-01-31',dimension,'actual');
    const usd = result.rows.find(row => row.currency === 'USD')!;
    expect(usd.inflow).toBe(100); expect(usd.outflow).toBe(-30); expect(usd.net).toBe(70);
    expect(usd.groups.reduce((sum,group) => sum + group.net,0)).toBe(usd.net);
    expect(usd.groups.flatMap(group => group.items).reduce((sum,item) => sum + item.amount,0)).toBe(70);
    if (dimension === 'plan') expect(usd.groups[0].label).toContain('Unallocated');
  }
  expect(engine.moneyMovementReport(input,'2026-01-01','2026-01-31','2026-01-31','plan','planned',{goal:'Renovation'}).rows[0].groups[0]).toMatchObject({label:'Renovation',outflow:-900});
});
it('keeps distinct source identities even when accounts share a display name', () => {
  const input = [activity('a',5,true,{module:'bank',sourceLabel:'Checking',sourceId:'a'}), activity('b',8,true,{module:'bank',sourceLabel:'Checking',sourceId:'b'})];
  const result = engine.moneyMovementReport(input,'2026-01-01','2026-01-31','2026-01-31','source','actual');
  expect(result.rows[0].groups).toHaveLength(2); expect(result.rows[0].net).toBe(13);
});

it('historical analytics uses cleared actual records without plans, pending or future-dated actuals', () => {
  const data = [activity('actual',100,true),activity('plan',200,false),activity('pending',300,true,{isPending:true}),activity('future',400,true,{date:'2026-02-01'})];
  expect(engine.clearedRangeActivities(data,'2026-01-01','2026-02-28','2026-01-31').map(item=>item.id)).toEqual(['actual']);
});

describe('prior cleared movement comparison', () => {
  it('aligns the prior window to the observed day count and crosses leap day', () => {
    expect(engine.precedingClearedMovementWindow('2024-03-01', '2024-03-31', '2024-03-03')).toEqual({
      current: { from: '2024-03-01', to: '2024-03-03' },
      prior: { from: '2024-02-27', to: '2024-02-29' },
    });
    expect(engine.precedingClearedMovementWindow('2024-03-04', '2024-03-31', '2024-03-03')).toBeNull();
    expect(engine.precedingClearedMovementWindow('2024-02-30', '2024-03-31', '2024-03-03')).toBeNull();
    expect(engine.precedingClearedMovementWindow('0000-01-01', '0000-01-01', '0000-01-01')).toBeNull();
  });

  it('uses cleared supporting records and distinguishes a missing period from a zero net baseline', () => {
    const input = [
      activity('current', 120, true, { date: '2026-01-15' }),
      activity('earlier-in', 60, true, { date: '2026-01-12' }),
      activity('earlier-out', -60, true, { date: '2026-01-13' }),
      activity('pending', 500, true, { date: '2026-01-15', isPending: true }),
      activity('plan', 900, false, { date: '2026-01-15' }),
      activity('other-currency', 200, true, { date: '2026-01-14', currencyCode: 'QAR' }),
      activity('future', 700, true, { date: '2026-01-16' }),
    ].map(row => ({ ...row, movementKind: 'operating' as const }));
    const result = engine.clearedMovementComparison(input, '2026-01-14', '2026-01-17', '2026-01-15', 'operating');
    expect(result?.rows).toEqual([
      expect.objectContaining({ currency: 'QAR', current: expect.objectContaining({ net: 200 }), prior: null, netChange: null, netChangePct: null }),
      expect.objectContaining({ currency: 'USD', current: expect.objectContaining({ net: 120 }), prior: expect.objectContaining({ net: 0 }), netChange: 120, netChangePct: null }),
    ]);
    const usd = result?.rows.find(row => row.currency === 'USD');
    expect(usd?.current?.items.map(row => row.description)).toEqual(['current']);
    expect(usd?.prior?.items.map(row => row.description)).toEqual(['earlier-in', 'earlier-out']);
  });
});


it('keeps dated trade estimates broker- and scenario-scoped, and excludes linked or undated legs', () => {
  const qse = createEmptyWorkbook();
  const psx = createEmptyPSXWorkbook();
  const buy = { date: '2026-02-10', ticker: 'QNBK', action: 'BUY' as const, shares: 20, price: 5 };
  qse.transactions = [{ ...buy, id: 'native-pending', isPending: true }];
  qse.tradePlans = [
    { id: 'plan-a', name: 'Strategy A', createdAt: '2026-01-01', legs: [
      { ...buy, feeOverride: 3 },
      { ...buy, date: undefined },
      { ...buy, executedTransactionId: 'native-pending' },
      { ...buy, executed: true },
      { ...buy, ignored: true },
      { ...buy, date: '2026-03-01' },
    ] },
    { id: 'plan-b', name: 'Strategy B', createdAt: '2026-01-01', legs: [{ ...buy, action: 'SELL', feeOverride: 2 }] },
  ];
  qse.brokerProfiles.push({ id: 'archived', name: 'Closed', archived: true, settings: qse.settings, data: { ...qse, tradePlans: qse.tradePlans } });
  psx.tradePlans = [{ id: 'psx-plan', name: 'PSX scenario', createdAt: '2026-01-01', legs: [{ ...buy, ticker: 'OGDC', feeOverride: 5 }] }];
  const rows = engine.datedTradeEstimates({ qse, psx }, ['qse', 'psx'], '2026-02-01', '2026-02-28');
  expect(rows).toMatchObject([
    { module: 'qse', brokerId: qse.activeBrokerId, planId: 'plan-a', currency: qse.settings.currency, rows: [{ fee: 3, estimatedCash: -103 }] },
    { module: 'qse', brokerId: qse.activeBrokerId, planId: 'plan-b', rows: [{ fee: 2, estimatedCash: 98 }] },
    { module: 'psx', brokerId: psx.activeBrokerId, planId: 'psx-plan', currency: psx.settings.currency, rows: [{ fee: 5, estimatedCash: -105 }] },
  ]);
  expect(rows.map(row => row.rows.length)).toEqual([1, 1, 1]);
});


it('aligns calendar-month comparisons for short, leap, and partial months', () => {
  expect(engine.precedingCalendarMonthWindow('2024-03-01', '2024-03-31', '2024-04-02')).toEqual({
    current: { from: '2024-03-01', to: '2024-03-31' }, prior: { from: '2024-02-01', to: '2024-02-29' },
  });
  expect(engine.precedingCalendarMonthWindow('2024-02-01', '2024-02-29', '2024-03-02')?.prior.to).toBe('2024-01-31');
  expect(engine.precedingCalendarMonthWindow('2024-03-01', '2024-03-31', '2024-03-15')?.prior.to).toBe('2024-02-15');
  expect(engine.precedingCalendarMonthWindow('2024-03-01', '2024-03-31', '2024-03-30')?.prior.to).toBe('2024-02-29');
  expect(engine.precedingCalendarMonthWindow('2024-03-02', '2024-03-31', '2024-03-30')).toBeNull();
  expect(engine.precedingCalendarMonthWindow('2024-03-01', '2024-04-01', '2024-04-02')).toBeNull();
});
