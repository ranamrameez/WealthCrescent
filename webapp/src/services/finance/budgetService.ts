import { auth } from '../../lib/firebase/client';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { resolveNumericInput } from '../../lib/mathExpression';
import { parseCSV, toCSV } from '../../lib/csv';
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
export function exportBudgetCsv(report: ReturnType<typeof buildOverview>['report'], type: 'balances' | 'allocations') {
  const periods = report.rows.flatMap(({ budget, months }) => months.map(month => ({ budget, month })));
  const identity = ['Budget ID', 'Budget', 'Currency', 'Month', 'Report cutoff'];
  const rows = type === 'balances'
    ? [[...identity, 'Limit', 'Carry in', 'Available', 'Outflow', 'Refunds', 'Net used', 'Remaining', 'Forecast carry'], ...periods.map(({ budget, month }) => [
      budget.id, budget.name, budget.currencyCode, month.month, report.today,
      month.limit, month.carryIn, month.available, month.outflow, month.refunds, month.used, month.remaining, month.isFuture ? 'Yes' : 'No',
    ])]
    : [[...identity, 'Record key', 'Date', 'Module', 'Source', 'Description', 'Native amount', 'Allocated amount', 'Refund'],
      ...periods.flatMap(({ budget, month }) => month.items.map(item => [
        budget.id, budget.name, budget.currencyCode, month.month, report.today,
        item.recordKey, item.record.date, item.record.module, item.record.sourceLabel, item.record.description,
        item.record.amount, item.allocated, item.allocated < 0 ? 'Yes' : 'No',
      ]))];
  // Financial values stay numeric. User-provided labels are cells, not formulas.
  const csv = toCSV(rows.map(row => row.map(value => typeof value === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value)));
  return { fileName: `budget-${type}-${report.fromMonth}-${report.toMonth}.csv`, csv };
}

export const subscribeBudgets = subscribeDashboard;
function requireUser() {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to change budgets.');
  return user;
}
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
export const BUDGET_IMPORT_COLUMNS = ['id', 'name', 'currency', 'monthly_limit', 'start_month', 'end_month', 'rollover', 'category_ids', 'plan_group_id'] as const;

function validateNewBudgetDefinitions(definitions: BudgetDefinition[]) {
  const workbook = usePlannedCashWorkbookStore.getState().workbook;
  const categoryIds = new Set(useCategoryStore.getState().workbook.categories.map(category => category.id));
  const groupIds = new Set((workbook.planGroups ?? []).map(group => group.id));
  const used = new Set((workbook.budgets ?? []).map(budget => budget.id));
  for (const [index, definition] of definitions.entries()) {
    try {
      CalculationEngine.budgets.validateBudgetDefinition(definition);
      if (used.has(definition.id)) throw new Error(`Budget ID "${definition.id}" already exists in the file or workbook.`);
      if (definition.categoryIds?.some(id => !categoryIds.has(id))) throw new Error('A category ID does not exist.');
      if (definition.planGroupId && !groupIds.has(definition.planGroupId)) throw new Error('The plan group ID does not exist.');
      used.add(definition.id);
    } catch (cause) {
      throw new Error(`Budget row ${index + 1}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return workbook;
}

export function previewBudgetDefinitionImport(csv: string) {
  const owner = requireUser().uid;
  const [header, ...rows] = parseCSV(csv);
  if (!header || header.length !== BUDGET_IMPORT_COLUMNS.length ||
      !BUDGET_IMPORT_COLUMNS.every((column, index) => column === header[index].trim().toLowerCase())) {
    throw new Error('Use the budget definition CSV columns in the listed order.');
  }
  if (!rows.length || rows.length > 500) throw new Error('Include 1 to 500 budget definitions.');
  const definitions = rows.map((row, index): BudgetDefinition => {
    if (row.length !== BUDGET_IMPORT_COLUMNS.length) throw new Error(`Budget row ${index + 1} has the wrong number of columns.`);
    const [id, name, currency, limit, startMonth, endMonth, rollover, categories, planGroupId] = row.map(cell => cell.trim());
    return {
      id, name, currencyCode: currency.toUpperCase(), startMonth,
      monthlyLimit: /^\d+(?:\.\d+)?$/.test(limit) ? Number(limit) : NaN,
      endMonth: endMonth || undefined, rollover: rollover.toLowerCase() as BudgetDefinition['rollover'],
      categoryIds: categories ? categories.split('|').map(value => value.trim()) : undefined,
      planGroupId: planGroupId || undefined,
    };
  });
  validateNewBudgetDefinitions(definitions);
  return { owner, definitions };
}

export function applyBudgetDefinitionImport(preview: ReturnType<typeof previewBudgetDefinitionImport>) {
  if (requireUser().uid !== preview.owner) throw new Error('The signed-in account changed. Review the CSV again.');
  const workbook = validateNewBudgetDefinitions(preview.definitions);
  usePlannedCashWorkbookStore.getState().setWorkbook({ ...workbook, budgets: [...(workbook.budgets ?? []), ...preview.definitions] });
  return preview.definitions.length;
}

export function setBudgetMonthLimit(id:string,month:string,raw:string,expected:BudgetDefinition) {
  requireUser();
  if(id!==expected.id)throw new Error('This budget changed. Reopen its details.');
  const limit=resolveNumericInput(raw);
  if(limit===null || !Number.isFinite(limit) || limit<0)throw new Error('Enter a finite monthly limit of zero or more.');
  saveBudget({...expected,monthlyLimit:String(expected.monthlyLimit),monthlyLimits:{...expected.monthlyLimits,[month]:limit}},expected);
}
export interface BudgetMonthLimitChange {
  expected: BudgetDefinition;
  month: string;
  limit: number;
}

export function applyBudgetMonthLimits(changes: BudgetMonthLimitChange[], reviewedUid: string) {
  if (requireUser().uid !== reviewedUid) throw new Error('The signed-in account changed. Reopen the editor.');
  if (!changes.length) return 0;
  const store = usePlannedCashWorkbookStore.getState();
  const definitions = store.workbook.budgets ?? [];
  const byId = new Map(definitions.map(budget => [budget.id, budget]));
  const updates = new Map<string, BudgetDefinition>();
  const keys = new Set<string>();
  for (const { expected, month, limit } of changes) {
    const current = byId.get(expected.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('A budget changed. Reopen the editor.');
    if (!validBatchDate(month + '-01') || month < current.startMonth || (current.endMonth && month > current.endMonth)) {
      throw new Error('A month is outside its budget period.');
    }
    const key = JSON.stringify([current.id, month]);
    if (keys.has(key)) throw new Error('The same budget month was selected twice.');
    keys.add(key);
    const next = updates.get(current.id) ?? current;
    const updated = { ...next, monthlyLimits: { ...next.monthlyLimits, [month]: limit } };
    CalculationEngine.budgets.validateBudgetDefinition(updated);
    updates.set(current.id, updated);
  }
  store.setWorkbook({ ...store.workbook, budgets: definitions.map(budget => updates.get(budget.id) ?? budget) });
  return changes.length;
}

export interface BudgetDefinitionChange {
  expected: BudgetDefinition;
  name: string;
  monthlyLimit: number;
  rollover: BudgetDefinition['rollover'];
}

export function applyBudgetDefinitionChanges(changes: BudgetDefinitionChange[], reviewedUid: string) {
  if (requireUser().uid !== reviewedUid) throw new Error('The signed-in account changed. Reopen the editor.');
  if (!changes.length) return 0;
  const store = usePlannedCashWorkbookStore.getState();
  const definitions = store.workbook.budgets ?? [];
  const byId = new Map<string, BudgetDefinition>();
  for (const budget of definitions) {
    if (byId.has(budget.id)) throw new Error('Duplicate budget IDs require review before editing.');
    byId.set(budget.id, budget);
  }
  const updates = new Map<string, BudgetDefinition>();
  for (const { expected, name, monthlyLimit, rollover } of changes) {
    const current = byId.get(expected.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('A budget changed. Reopen the editor.');
    if (updates.has(current.id)) throw new Error('The same budget was selected twice.');
    const next = { ...current, name: name.trim(), monthlyLimit, rollover };
    CalculationEngine.budgets.validateBudgetDefinition(next);
    updates.set(current.id, next);
  }
  store.setWorkbook({ ...store.workbook, budgets: definitions.map(budget => updates.get(budget.id) ?? budget) });
  return updates.size;
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
