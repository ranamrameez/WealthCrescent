import type { BudgetDefinition, BudgetAllocation } from '../../types/budget';
import { selectMovementActivities, type MovementActivity } from './movementActivities';
export const budgetRecordKey = (record: Pick<MovementActivity,'module' | 'sourceId' | 'id' | 'recordType'>) => JSON.stringify(record.recordType?[record.module,record.sourceId ?? '',record.recordType,record.id]:[record.module,record.sourceId ?? '',record.id]);
/** Read compatibility for the first optional allocation schema. Resolve an old
 * three-part identity only when one native collection owns it; never guess. */
export function normalizeBudgetAllocations(allocations:BudgetAllocation[], activities:MovementActivity[]):BudgetAllocation[] {
  const keys=new Set(activities.map(budgetRecordKey));
  const aliases=new Map<string,Set<string>>();
  for(const record of activities) {
    const legacy=JSON.stringify([record.module,record.sourceId ?? '',record.id]);
    const values=aliases.get(legacy) ?? new Set<string>();values.add(budgetRecordKey(record));aliases.set(legacy,values);
  }
  return allocations.map(allocation=>{
    if(keys.has(allocation.recordKey))return allocation;
    const candidates=aliases.get(allocation.recordKey);
    return candidates?.size===1?{...allocation,recordKey:[...candidates][0]}:allocation;
  });
}
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const monthIndex = (value: string) => Number(value.slice(0,4))*12+Number(value.slice(5,7))-1;
const indexMonth = (index: number) => String(Math.floor(index/12)).padStart(4,'0')+'-'+String(index%12+1).padStart(2,'0');
export function validateBudgetDefinition(budget: BudgetDefinition) {
  if (!budget.id || !budget.name.trim()) throw new Error('Enter a budget name.');
  if (!/^[A-Z][A-Z0-9]{2,7}$/.test(budget.currencyCode)) throw new Error('Choose a native currency.');
  if (!Number.isFinite(budget.monthlyLimit) || budget.monthlyLimit < 0) throw new Error('Enter a finite monthly limit of zero or more.');
  if (!validMonth(budget.startMonth) || budget.endMonth && (!validMonth(budget.endMonth) || budget.endMonth < budget.startMonth)) throw new Error('Choose valid budget months.');
  if (budget.monthlyLimits && Object.entries(budget.monthlyLimits).some(([month,limit])=>!validMonth(month) || !Number.isFinite(limit) || limit < 0)) throw new Error('Monthly overrides need valid months and non-negative finite limits.');
  if (!['none','surplus','balance'].includes(budget.rollover)) throw new Error('Choose a rollover policy.');
  if (budget.categoryIds && new Set(budget.categoryIds).size !== budget.categoryIds.length) throw new Error('Choose each category only once.');
}
interface BudgetIssue { code: string; message: string; recordKey?: string; budgetId?: string; allocationId?: string; }
export interface BudgetUsageItem { recordKey: string; allocated: number; record: MovementActivity; explicit: boolean; }
function active(budget: BudgetDefinition, record: MovementActivity) {
  const month = record.date.slice(0,7);
  return budget.currencyCode === record.currencyCode && month >= budget.startMonth && (!budget.endMonth || month <= budget.endMonth);
}
function matches(budget: BudgetDefinition, record: MovementActivity) {
  return active(budget,record) && (!budget.categoryIds?.length || !!record.categoryId && budget.categoryIds.includes(record.categoryId))
    && (!budget.planGroupId || budget.planGroupId === record.planGroupId);
}

/** One allocation authority. Overlapping scopes never silently duplicate usage;
 * ordinary income is not a refund. All computations use native currencies. */
export function unifiedBudgetReport(definitions: BudgetDefinition[], allocations: BudgetAllocation[], activities: MovementActivity[], fromMonth: string, toMonth: string, today: string) {
  if (!validMonth(fromMonth) || !validMonth(toMonth) || fromMonth > toMonth) throw new Error('Choose a valid monthly reporting range.');
  allocations=normalizeBudgetAllocations(allocations,activities);
  const issues: BudgetIssue[] = [];
  const budgets: BudgetDefinition[] = [];
  const duplicateBudgetIds = new Set(definitions.filter((item,index)=>definitions.findIndex(other=>other.id === item.id) !== index).map(item=>item.id));
  const ids = new Set<string>();
  for (const definition of definitions) {
    try {
      validateBudgetDefinition(definition);
      if (duplicateBudgetIds.has(definition.id) || ids.has(definition.id)) throw new Error('Duplicate budget identity.');
      ids.add(definition.id); budgets.push(definition);
    } catch (error) { issues.push({ code: 'invalid-budget', budgetId: definition.id, message: error instanceof Error ? error.message : String(error) }); }
  }
  const eligible = selectMovementActivities(activities,'0000-01-01',today,today,'actual');
  const records = new Map<string,MovementActivity>();
  const duplicateKeys = new Set<string>();
  for (const record of eligible) {
    const key = budgetRecordKey(record);
    if (records.has(key)) duplicateKeys.add(key);
    else if (Number.isFinite(record.amount)) records.set(key,record);
    else issues.push({ code: 'invalid-record', recordKey: key, message: 'Record has a non-finite amount.' });
  }
  for (const key of duplicateKeys) { records.delete(key); issues.push({ code: 'duplicate-record', recordKey: key, message: 'Duplicate native record identity requires review.' }); }
  const explicit = new Map<string,BudgetAllocation[]>();
  const duplicateAllocationIds = new Set(allocations.filter((item,index)=>allocations.findIndex(other=>other.id === item.id) !== index).map(item=>item.id));
  const allocationIds = new Set<string>();
  for (const allocation of allocations) {
    if (duplicateAllocationIds.has(allocation.id) || allocationIds.has(allocation.id)) { explicit.set(allocation.recordKey,explicit.get(allocation.recordKey) ?? []); issues.push({ code: 'duplicate-allocation', allocationId: allocation.id, message: 'Duplicate allocation identity.' }); continue; }
    allocationIds.add(allocation.id);
    explicit.set(allocation.recordKey,[...(explicit.get(allocation.recordKey) ?? []),allocation]);
  }
  // An ambiguous legacy identity is not permission to choose a collection or
  // fall back to automatic allocation of the possibly intended records.
  for(const allocation of allocations) if(!records.has(allocation.recordKey)) {
    const candidates=[...records].filter(([,record])=>JSON.stringify([record.module,record.sourceId ?? '',record.id])===allocation.recordKey);
    if(candidates.length>1)for(const [key] of candidates)explicit.set(key,explicit.get(key) ?? []);
  }
  const usage = new Map<string,BudgetUsageItem[]>();
  const unallocated: Array<{ recordKey: string; record: MovementActivity; amount: number; ambiguousBudgetIds: string[] }> = [];
  const add = (budgetId: string,item: BudgetUsageItem) => usage.set(budgetId,[...(usage.get(budgetId) ?? []),item]);
  for (const [key,list] of explicit) if (!records.has(key) && !activities.some(record=>budgetRecordKey(record)===key && record.date>today)) list.forEach(item=>issues.push({ code: 'orphan-allocation', allocationId: item.id, recordKey: key, message: 'Allocation has no eligible cleared actual record.' }));
  for (const [key,record] of records) {
    const specified = explicit.get(key);
    let allocated = 0;
    let ambiguousBudgetIds: string[] = [];
    if (specified) {
      const valid: Array<{ allocation: BudgetAllocation; budget: BudgetDefinition }> = [];
      for (const allocation of specified) {
        const budget = budgets.find(budget=>budget.id === allocation.budgetId);
        const correctSign = record.amount < 0 ? allocation.amount > 0 : record.amount > 0 && allocation.amount < 0;
        if (!budget || !active(budget,record) || !Number.isFinite(allocation.amount) || !correctSign) {
          issues.push({ code: 'invalid-allocation', allocationId: allocation.id, recordKey: key, budgetId: allocation.budgetId, message: 'Allocation must match a live budget, native currency, budget period and outflow/refund direction.' });
        } else valid.push({ allocation, budget });
      }
      const total = valid.reduce((sum,item)=>sum+Math.abs(item.allocation.amount),0);
      if (total > Math.abs(record.amount)+1e-8) issues.push({ code: 'overallocated', recordKey: key, message: 'Allocations exceed the native record; none of these allocations is applied.' });
      else for (const { allocation,budget } of valid) { add(budget.id,{ recordKey: key, allocated: allocation.amount, record, explicit: true }); allocated += allocation.amount; }
    } else if (record.amount < 0) {
      const candidates = budgets.filter(budget=>matches(budget,record) && ((record.movementKind ?? 'unclassified') !== 'unclassified' || !!budget.categoryIds?.length || !!budget.planGroupId));
      if (candidates.length === 1) { allocated = -record.amount; add(candidates[0].id,{ recordKey: key, allocated, record, explicit: false }); }
      else if (candidates.length > 1) ambiguousBudgetIds = candidates.map(budget=>budget.id);
    }
    if (record.amount < 0 && -record.amount-allocated > 1e-8) unallocated.push({ recordKey: key, record, amount: -record.amount-allocated, ambiguousBudgetIds });
  }
  const rows = budgets.map(budget => {
    const items = usage.get(budget.id) ?? [];
    const byMonth = new Map<string,BudgetUsageItem[]>();
    for (const item of items) { const month=item.record.date.slice(0,7); byMonth.set(month,[...(byMonth.get(month) ?? []),item]); }
    let carry = 0;
    const months: Array<{ month: string; limit: number; carryIn: number; available: number; outflow: number; refunds: number; used: number; remaining: number; isFuture: boolean; items: BudgetUsageItem[] }> = [];
    const end = monthIndex(budget.endMonth && budget.endMonth < toMonth ? budget.endMonth : toMonth);
    for (let index=monthIndex(budget.startMonth); index<=end; index++) {
      const month = indexMonth(index), native = byMonth.get(month) ?? [];
      const outflow = native.reduce((sum,item)=>sum+Math.max(0,item.allocated),0), refunds = native.reduce((sum,item)=>sum+Math.max(0,-item.allocated),0);
      const limit = budget.monthlyLimits?.[month] ?? budget.monthlyLimit;
      const available = limit+carry, used=outflow-refunds, remaining=available-used;
      if (month >= fromMonth) months.push({ month, limit, carryIn: carry, available, outflow, refunds, used, remaining, isFuture: month > today.slice(0,7), items: native });
      carry = budget.rollover === 'none' ? 0 : budget.rollover === 'surplus' ? Math.max(0,remaining) : remaining;
    }
    return { budget, months };
  });
  const visibleRecords = [...records.values()].filter(record=>record.date.slice(0,7) >= fromMonth && record.date.slice(0,7) <= toMonth);
  const visibleUsage = [...usage.values()].flat().filter(item=>item.record.date.slice(0,7) >= fromMonth && item.record.date.slice(0,7) <= toMonth);
  const visibleUnallocated = unallocated.filter(item=>item.record.date.slice(0,7) >= fromMonth && item.record.date.slice(0,7) <= toMonth);
  const currencies = [...new Set([...visibleRecords.map(record=>record.currencyCode),...budgets.map(budget=>budget.currencyCode)])].sort();
  const totals = currencies.map(currency => {
    const outflow = visibleRecords.filter(record=>record.currencyCode === currency).reduce((sum,record)=>sum+Math.max(0,-record.amount),0);
    const allocatedOutflow = visibleUsage.filter(item=>item.record.currencyCode === currency).reduce((sum,item)=>sum+Math.max(0,item.allocated),0);
    const refunds = visibleUsage.filter(item=>item.record.currencyCode === currency).reduce((sum,item)=>sum+Math.max(0,-item.allocated),0);
    const unallocatedOutflow = visibleUnallocated.filter(item=>item.record.currencyCode === currency).reduce((sum,item)=>sum+item.amount,0);
    return { currency, outflow, allocatedOutflow, refunds, unallocatedOutflow };
  });
  const charts = currencies.map(currency=>{
    const entries=rows.filter(row=>row.budget.currencyCode===currency).flatMap(row=>row.months.map(month=>({label:row.budget.name+' · '+month.month,available:month.available,used:month.used})));
    return {currency,labels:entries.map(item=>item.label),available:entries.map(item=>item.available),used:entries.map(item=>item.used)};
  });
  return { fromMonth, toMonth, today, rows, totals, charts, unallocated: visibleUnallocated, issues };
}

export function buildBudgetAllocationDrafts(record:MovementActivity, targets:Array<{id:string;budgetId:string;amount:number}>, today:string):BudgetAllocation[] {
  if(!record.executed || record.isPending || record.movementKind==='transfer' || record.date>today)throw new Error('Only cleared actual movement can be allocated.');
  if(targets.some(item=>!item.budgetId || !Number.isFinite(item.amount) || item.amount<=0))throw new Error('Enter a positive allocation amount for each budget.');
  if(targets.reduce((sum,item)=>sum+item.amount,0)>Math.abs(record.amount)+1e-8)throw new Error('Allocations exceed the native record.');
  const key=budgetRecordKey(record);
  return targets.map(item=>({id:item.id,budgetId:item.budgetId,recordKey:key,amount:record.amount<0?item.amount:-item.amount}));
}
