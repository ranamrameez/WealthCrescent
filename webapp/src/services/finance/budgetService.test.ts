import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getBudgetOverview, saveBudget, saveBudgetAllocations, setBudgetMonthLimit, removeBudget } from './budgetService';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
const session=vi.hoisted(()=>({ signedIn: true }));
vi.mock('../../lib/firebase/client',()=>({ auth: { get currentUser() { return session.signedIn ? { uid:'budget-fixture' }:null; } },db:null,firebaseReady:false }));
const originalPlans=usePlannedCashWorkbookStore.getState().workbook;
const originalCash=useCashWorkbookStore.getState().workbook;
const originalCategories=useCategoryStore.getState().workbook;
const input={ id:'food',name:'Food',currencyCode:'USD',startMonth:'2026-01',monthlyLimit:'100',categoryIds:['food-category'],rollover:'none' as const };
beforeEach(()=>{
  session.signedIn=true; vi.useFakeTimers({ toFake:['Date'] }); vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
  useCategoryStore.getState().setWorkbook({ categories:[{ id:'food-category',name:'Food',serialNumber:1,scope:'custom' }] });
  usePlannedCashWorkbookStore.getState().setWorkbook({ ...originalPlans,entries:[],budgets:[],budgetAllocations:[] });
  useCashWorkbookStore.getState().setWorkbook({settings:{defaultCurrency:'USD'},entries:[{id:'spent',date:'2026-01-02',amount:30,isDeposit:false,currencyCode:'USD',categoryID:'food-category',source:'manual'},{id:'income',date:'2026-01-03',amount:10,isDeposit:true,currencyCode:'USD',source:'manual'}]});
});
afterEach(()=>{
  usePlannedCashWorkbookStore.getState().setWorkbook(originalPlans);useCashWorkbookStore.getState().setWorkbook(originalCash);useCategoryStore.getState().setWorkbook(originalCategories);vi.useRealTimers();
});
it('requires authentication for every budget mutation and retains native records',()=>{
  session.signedIn=false;
  expect(()=>saveBudget(input)).toThrow('Sign in');
  expect(()=>removeBudget('food',{...input,monthlyLimit:100})).toThrow('Sign in');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(2);
});
it('keeps stable view models, custom categories and native-currency actual totals',()=>{
  const before=getBudgetOverview();saveBudget(input);
  const result=getBudgetOverview();expect(result).not.toBe(before);expect(getBudgetOverview()).toBe(result);
  expect(result.report.rows[0].months[0]).toMatchObject({used:30,remaining:70});
  expect(result.categories.find(category=>category.id==='food-category')?.scope).toBe('custom');
  expect(useCashWorkbookStore.getState().workbook.entries[0].amount).toBe(30);
});
it('rejects stale edits and changes one monthly override without rewriting the default',()=>{
  saveBudget(input);const budget=getBudgetOverview().budgets[0];
  setBudgetMonthLimit('food','2026-01','50',budget);
  const current=getBudgetOverview().budgets[0];expect(current.monthlyLimit).toBe(100);expect(current.monthlyLimits).toEqual({'2026-01':50});
  expect(()=>saveBudget({...input,name:'stale'},budget)).toThrow('changed');
  expect(getBudgetOverview().report.rows[0].months[0].remaining).toBe(20);
});
it('supports explicit partial allocations and refunds, rejecting stale or excessive allocations',()=>{
  saveBudget(input);let context=getBudgetOverview();
  const spent=context.records.find(record=>record.id==='spent')!, income=context.records.find(record=>record.id==='income')!;
  saveBudgetAllocations(spent,[{budgetId:'food',amount:'20'}],[]);
  context=getBudgetOverview();expect(context.report.totals.find(row=>row.currency==='USD')?.unallocatedOutflow).toBe(10);
  expect(()=>saveBudgetAllocations(spent,[{budgetId:'food',amount:'31'}],context.allocations)).toThrow('exceed');
  expect(()=>saveBudgetAllocations(spent,[{budgetId:'food',amount:'5'}],[])).toThrow('changed');
  saveBudgetAllocations(income,[{budgetId:'food',amount:'10'}],[]);
  expect(getBudgetOverview().report.rows[0].months[0]).toMatchObject({outflow:20,refunds:10,used:10});
});
it('rejects missing categories/cross-currency allocation and preserves budgets with usage',()=>{
  expect(()=>saveBudget({...input,categoryIds:['removed']})).toThrow('category');
  saveBudget(input);const context=getBudgetOverview(), budget=context.budgets[0];
  expect(()=>removeBudget('food',budget)).toThrow('recorded usage');
  saveBudget({...input,id:'qar',currencyCode:'QAR'});
  expect(()=>saveBudgetAllocations(context.records.find(record=>record.id==='spent')!,[{budgetId:'qar',amount:'10'}],[])).toThrow('native currency');
  expect(usePlannedCashWorkbookStore.getState().workbook.entries).toEqual([]);
});
it('uses complete native ledgers independently of Net Worth inclusion controls',()=>{
  useCashWorkbookStore.getState().updateSettings({includeInNetWorth:false});
  saveBudget(input);
  expect(getBudgetOverview().report.rows[0].months[0].used).toBe(30);
});
it('uses the selected historical end date without treating later legitimate allocations as orphaned',()=>{
  useCashWorkbookStore.getState().addEntry({id:'later',date:'2026-01-25',amount:50,isDeposit:false,currencyCode:'USD',categoryID:'food-category',source:'manual'});
  saveBudget(input);const current=getBudgetOverview();
  saveBudgetAllocations(current.records.find(record=>record.id==='later')!,[{budgetId:'food',amount:'50'}],[]);
  const historical=getBudgetOverview('2026-01-01','2026-01-10');
  expect(historical.report.today).toBe('2026-01-10');
  expect(historical.report.rows[0].months[0].used).toBe(30);
  expect(historical.report.issues).toEqual([]);
  expect(historical.records.some(record=>record.id==='later')).toBe(false);
});
