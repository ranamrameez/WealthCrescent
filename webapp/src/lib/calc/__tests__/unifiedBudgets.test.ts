import { expect, it } from 'vitest';
import { CalculationEngine } from '../CalculationEngine';
import type { BudgetDefinition } from '../../../types/budget';
import type { MovementActivity } from '../movementActivities';
const engine = CalculationEngine.budgets;
const budget = (id: string, extra: Partial<BudgetDefinition> = {}): BudgetDefinition => ({ id, name: id, currencyCode: 'USD', startMonth: '2026-01', monthlyLimit: 100, rollover: 'none', ...extra });
const record = (id: string, amount: number, extra: Partial<MovementActivity> = {}): MovementActivity => ({ id, amount, module: 'bank', sourceId: 'account', sourceLabel: 'Checking', date: '2026-01-02', currencyCode: 'USD', description: id, executed: true, movementKind: 'operating', ...extra });
const report = (budgets: BudgetDefinition[], records: MovementActivity[], allocations: Parameters<typeof engine.unifiedBudgetReport>[1] = [], from = '2026-01', to = '2026-01') => engine.unifiedBudgetReport(budgets,allocations,records,from,to,'2026-03-31');
it('allocates one matching category/project budget and conserves actual outflow once',()=>{
  const a = record('a',-30,{ categoryId: 'food', planGroupId: 'home' }), b = record('b',-20,{ categoryId: 'food', planGroupId: 'other' });
  const result = report([budget('home-food',{ categoryIds: ['food'], planGroupId: 'home' })],[a,b]);
  expect(result.rows[0].months[0]).toMatchObject({ used: 30, remaining: 70 });
  expect(result.totals[0]).toMatchObject({ outflow: 50, allocatedOutflow: 30, unallocatedOutflow: 20 });
  expect(result.unallocated[0].record.id).toBe('b');
});
it('leaves overlapping scopes ambiguous rather than silently double counting or picking a budget',()=>{
  const result = report([budget('one'),budget('two')],[record('a',-30)]);
  expect(result.rows.map(row=>row.months[0].used)).toEqual([0,0]);
  expect(result.unallocated[0]).toMatchObject({ amount: 30, ambiguousBudgetIds: ['one','two'] });
  expect(result.totals[0].allocatedOutflow+result.totals[0].unallocatedOutflow).toBe(30);
});
it('supports explicit partial splits and leaves the rest unallocated',()=>{
  const a = record('a',-80), key = engine.budgetRecordKey(a);
  const result = report([budget('one'),budget('two')],[a],[{ id: 'x', budgetId: 'one', recordKey: key, amount: 20 },{ id: 'y', budgetId: 'two', recordKey: key, amount: 30 }]);
  expect(result.rows.map(row=>row.months[0].used)).toEqual([20,30]);
  expect(result.totals[0]).toMatchObject({ outflow: 80, allocatedOutflow: 50, unallocatedOutflow: 30 });
});
it('rejects over-allocation without applying a partial arbitrary selection',()=>{
  const a = record('a',-20), key = engine.budgetRecordKey(a);
  const result = report([budget('one')],[a],[{ id: 'x', budgetId: 'one', recordKey: key, amount: 21 }]);
  expect(result.rows[0].months[0].used).toBe(0);
  expect(result.issues[0].code).toBe('overallocated');
  expect(result.totals[0].unallocatedOutflow).toBe(20);
});
it('requires explicit refunds; ordinary positive income does not cancel budget usage',()=>{
  const out = record('out',-40), income = record('salary',500), refund = record('refund',10);
  const result = report([budget('one')],[out,income,refund],[{ id: 'refund-link', budgetId: 'one', recordKey: engine.budgetRecordKey(refund), amount: -10 }]);
  expect(result.rows[0].months[0]).toMatchObject({ outflow: 40, refunds: 10, used: 30, remaining: 70 });
  expect(result.totals[0]).toMatchObject({ outflow: 40, allocatedOutflow: 40, refunds: 10 });
});
it('keeps currencies, pending/plans/future records and internal transfers separate',()=>{
  const result = report([budget('usd'),budget('qar',{ currencyCode: 'QAR' })],[record('usd',-20),record('qar',-5,{ currencyCode: 'QAR' }),record('pending',-90,{ isPending: true }),record('plan',-80,{ executed: false }),record('future',-70,{ date: '2026-04-01' }),record('transfer',-200,{ movementKind: 'transfer' })]);
  expect(result.rows.map(row=>row.months[0].used)).toEqual([20,5]);
  expect(result.totals.map(row=>[row.currency,row.outflow])).toEqual([['QAR',5],['USD',20]]);
});
it('retains same record IDs from different accounts and brokers as distinct identities',()=>{
  const result = report([budget('one')],[record('same',-20),record('same',-30,{ sourceId: 'second' })]);
  expect(result.rows[0].months[0].used).toBe(50);
  expect(result.rows[0].months[0].items).toHaveLength(2);
});
it('calculates rollover before the visible window with none, surplus and negative balance policies',()=>{
  const records = [record('jan',-130),record('feb',-20,{ date: '2026-02-02' })];
  expect(report([budget('one',{ rollover: 'none' })],records,[],'2026-02','2026-02').rows[0].months[0]).toMatchObject({ carryIn: 0, available: 100, remaining: 80 });
  expect(report([budget('one',{ rollover: 'surplus' })],records,[],'2026-02','2026-02').rows[0].months[0]).toMatchObject({ carryIn: 0, available: 100, remaining: 80 });
  expect(report([budget('one',{ rollover: 'balance' })],records,[],'2026-02','2026-02').rows[0].months[0]).toMatchObject({ carryIn: -30, available: 70, remaining: 50 });
  expect(report([budget('one',{ rollover: 'surplus' })],[record('jan',-30)],[],'2026-02','2026-02').rows[0].months[0].carryIn).toBe(70);
});
it('supports explicit zero limits and per-month overrides without rewriting past targets',()=>{
  const result = report([budget('one',{ monthlyLimit: 0, monthlyLimits: { '2026-02': 50 } })],[record('a',-10)],[],'2026-01','2026-02');
  expect(result.rows[0].months.map(row=>[row.limit,row.remaining])).toEqual([[0,-10],[50,50]]);
});
it('reports orphan, wrong-currency and duplicate allocations without fabricating usage',()=>{
  const a = record('a',-20), key = engine.budgetRecordKey(a);
  const result = report([budget('one'),budget('qar',{ currencyCode: 'QAR' })],[a],[{ id: 'orphan', budgetId: 'one', recordKey: 'missing', amount: 10 },{ id: 'currency', budgetId: 'qar', recordKey: key, amount: 10 },{ id: 'duplicate', budgetId: 'one', recordKey: key, amount: 5 },{ id: 'duplicate', budgetId: 'one', recordKey: key, amount: 7 }]);
  expect(result.rows.map(row=>row.months[0].used)).toEqual([0,0]);
  expect(result.totals.find(row=>row.currency === 'USD')?.unallocatedOutflow).toBe(20);
  expect(result.issues.map(issue=>issue.code)).toContain('orphan-allocation');
  expect(result.issues.map(issue=>issue.code)).toContain('duplicate-allocation');
});
it('preserves inputs, checks invalid limits/dates and handles a December/year boundary',()=>{
  const b = budget('one',{ startMonth: '2025-12', rollover: 'surplus' }), records=[record('a',-30,{ date: '2025-12-31' })];
  const before=JSON.stringify([b,records]);
  expect(report([b],records,[],'2026-01','2026-01').rows[0].months[0].carryIn).toBe(70);
  expect(JSON.stringify([b,records])).toBe(before);
  expect(()=>engine.validateBudgetDefinition(budget('bad',{ monthlyLimit: Infinity }))).toThrow('finite');
  expect(()=>engine.validateBudgetDefinition(budget('bad',{ startMonth: '2026-13' }))).toThrow('months');
});

it('does not automatically absorb unknown account movement into a broad budget',()=>{
  const unknown=record('unknown',-20,{movementKind:'unclassified',categoryId:'food'});
  expect(report([budget('all')],[unknown]).totals[0].unallocatedOutflow).toBe(20);
  expect(report([budget('food',{categoryIds:['food']})],[unknown]).totals[0].allocatedOutflow).toBe(20);
});
