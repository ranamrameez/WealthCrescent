import { auth } from '../../lib/firebase/client';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { resolveNumericInput } from '../../lib/mathExpression';
import { validBatchDate } from '../../lib/dateValidation';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
import { getNativeMovementActivities, subscribeDashboard } from './dashboardService';
import type { BudgetDefinition, BudgetAllocation } from '../../types/budget';
import type { MovementActivity } from '../../lib/calc/movementActivities';
export type { BudgetDefinition, BudgetAllocation } from '../../types/budget';
const MODULES = ['cash','bank','rentals','creditCards','personalLoans','emi','funds','qse','psx'];
const cache = new Map<string,ReturnType<typeof buildOverview>>();
let lastInput: unknown[] = [];
const today = () => new Date().toISOString().slice(0,10);
function sources() {
  const workbook = usePlannedCashWorkbookStore.getState().workbook;
  const categories = useCategoryStore.getState().workbook.categories;
  const activities = getNativeMovementActivities(MODULES,undefined,'all-ledgers');
  const currency = useCashWorkbookStore.getState().workbook.settings.defaultCurrency;
  const input = [workbook,categories,activities,currency,today()];
  if (input.some((value,index)=>value !== lastInput[index])) { cache.clear(); lastInput=input; }
  return { workbook,categories,activities,currency };
}
function buildOverview(fromDate: string,toDate: string) {
  const { workbook,categories,activities,currency }=sources();
  let fromMonth = validBatchDate(fromDate) ? fromDate.slice(0,7) : today().slice(0,7);
  let toMonth = validBatchDate(toDate) ? toDate.slice(0,7) : today().slice(0,7);
  if (fromMonth > toMonth) [fromMonth,toMonth]=[toMonth,fromMonth];
  const budgets=workbook.budgets ?? [], allocations=CalculationEngine.budgets.normalizeBudgetAllocations(workbook.budgetAllocations ?? [],activities);
  const asOf=validBatchDate(toDate) && toDate<today()?toDate:today();
  const report=CalculationEngine.budgets.unifiedBudgetReport(budgets,allocations,activities,fromMonth,toMonth,asOf);
  const records=CalculationEngine.movements.selectMovementActivities(activities,fromMonth+'-01',CalculationEngine.netWorthTrend.endOfMonthAsOf(toMonth),asOf,'actual');
  return { report,budgets,allocations,records,categories,groups:workbook.planGroups ?? [],defaultCurrency:currency,
    currencies:[...new Set([currency,...activities.map(item=>item.currencyCode),...budgets.map(item=>item.currencyCode)])].sort() };
}
export function getBudgetOverview(fromDate='',toDate='') {
  sources(); const key=JSON.stringify([fromDate,toDate]);
  const existing=cache.get(key); if(existing) return existing;
  const result=buildOverview(fromDate,toDate); if(cache.size>=24)cache.clear(); cache.set(key,result); return result;
}
export const subscribeBudgets = subscribeDashboard;
function requireUser() { if(!auth?.currentUser)throw new Error('Sign in to change budgets.'); }
export interface BudgetInput extends Omit<BudgetDefinition,'monthlyLimit'> { monthlyLimit: string; }
export function saveBudget(input: BudgetInput,expected?:BudgetDefinition) {
  requireUser();
  const { workbook,categories }=sources(), current=workbook.budgets?.find(item=>item.id===input.id);
  if(current ? !expected || JSON.stringify(current)!==JSON.stringify(expected) : !!expected)throw new Error('This budget changed. Reopen its editor.');
  const limit=resolveNumericInput(input.monthlyLimit);
  const next:BudgetDefinition={...input,name:input.name.trim(),currencyCode:input.currencyCode.trim().toUpperCase(),monthlyLimit:limit ?? NaN,
    categoryIds:input.categoryIds?.length ? [...new Set(input.categoryIds)] : undefined,planGroupId:input.planGroupId || undefined,endMonth:input.endMonth || undefined};
  CalculationEngine.budgets.validateBudgetDefinition(next);
  if(next.categoryIds?.some(id=>!categories.some(category=>category.id===id)))throw new Error('A selected category no longer exists.');
  if(next.planGroupId && !workbook.planGroups?.some(group=>group.id===next.planGroupId))throw new Error('The selected plan no longer exists.');
  if(current && (workbook.budgetAllocations ?? []).some(item=>item.budgetId===current.id) && current.currencyCode!==next.currencyCode)throw new Error('A budget with allocations keeps its native currency. Create a separate budget instead.');
  usePlannedCashWorkbookStore.getState().setWorkbook({...workbook,budgets:current ? (workbook.budgets ?? []).map(item=>item.id===next.id?next:item) : [...(workbook.budgets ?? []),next]});
}
export function setBudgetMonthLimit(id:string,month:string,raw:string,expected:BudgetDefinition) {
  requireUser();
  if(id!==expected.id)throw new Error('This budget changed. Reopen its details.');
  const limit=resolveNumericInput(raw);
  if(limit===null || !Number.isFinite(limit) || limit<0)throw new Error('Enter a finite monthly limit of zero or more.');
  saveBudget({...expected,monthlyLimit:String(expected.monthlyLimit),monthlyLimits:{...expected.monthlyLimits,[month]:limit}},expected);
}
export function removeBudget(id:string,expected:BudgetDefinition) {
  requireUser(); const { workbook,activities }=sources();
  const current=workbook.budgets?.find(item=>item.id===id);
  if(!current || JSON.stringify(current)!==JSON.stringify(expected))throw new Error('This budget changed. Reopen its details.');
  if(workbook.budgetAllocations?.some(item=>item.budgetId===id))throw new Error('This budget has allocations. Close its period instead of deleting its history.');
  const end=current.endMonth ?? today().slice(0,7);
  if(end>=current.startMonth) {
    const history=CalculationEngine.budgets.unifiedBudgetReport(workbook.budgets ?? [],[],activities,current.startMonth,end,today());
    if(history.rows.find(row=>row.budget.id===id)?.months.some(month=>month.items.length))throw new Error('This budget has recorded usage. Close its period instead of deleting its history.');
  }
  usePlannedCashWorkbookStore.getState().setWorkbook({...workbook,budgets:(workbook.budgets ?? []).filter(item=>item.id!==id)});
}
export interface AllocationInput { budgetId:string; amount:string; }
export function saveBudgetAllocations(record:MovementActivity,input:AllocationInput[],expected:BudgetAllocation[]) {
  requireUser(); const { workbook,activities }=sources();
  const key=CalculationEngine.budgets.budgetRecordKey(record);
  const current=activities.find(item=>CalculationEngine.budgets.budgetRecordKey(item)===key);
  if(!current || JSON.stringify(current)!==JSON.stringify(record))throw new Error('This record changed. Reopen its allocation editor.');
  const normalized=CalculationEngine.budgets.normalizeBudgetAllocations(workbook.budgetAllocations ?? [],activities);
  const before=normalized.filter(item=>item.recordKey===key);
  if(JSON.stringify(before)!==JSON.stringify(expected))throw new Error('These allocations changed. Reopen their editor.');
  if(!current.executed || current.isPending || current.movementKind==='transfer' || current.date>today())throw new Error('Only cleared actual movement can be allocated.');
  const targets=input.filter(item=>item.budgetId || item.amount.trim());
  if(new Set(targets.map(item=>item.budgetId)).size!==targets.length)throw new Error('Choose each budget once and combine its amount.');
  const amounts=targets.map(item=>({budgetId:item.budgetId,amount:resolveNumericInput(item.amount)}));
  if(amounts.some(item=>item.amount===null || !Number.isFinite(item.amount) || (item.amount ?? 0)<=0))throw new Error('Enter a positive allocation amount for each budget.');
  const next=CalculationEngine.budgets.buildBudgetAllocationDrafts(current,amounts.map(item=>({id:before.find(prior=>prior.budgetId===item.budgetId)?.id ?? crypto.randomUUID(),budgetId:item.budgetId,amount:item.amount!})),today());
  const all=[...normalized.filter(item=>item.recordKey!==key),...next];
  const report=CalculationEngine.budgets.unifiedBudgetReport(workbook.budgets ?? [],all,activities,current.date.slice(0,7),current.date.slice(0,7),today());
  const issue=report.issues.find(issue=>issue.recordKey===key);
  if(issue)throw new Error(issue.message);
  usePlannedCashWorkbookStore.getState().setWorkbook({...workbook,budgetAllocations:all});
}

export function getBudgetRecordKey(record:Pick<MovementActivity,'module'|'sourceId'|'id'|'recordType'>) { return CalculationEngine.budgets.budgetRecordKey(record); }
