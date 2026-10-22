import type { PlanRecord } from './financePlans';
import type { FinancePlanGroup } from '../types/financePlanGroup';

/** Constant-time series lookups; tolerate broken/cyclic legacy parent references. */
export function groupFinancePlans(records: PlanRecord[], groups: FinancePlanGroup[]) {
  const byId = new Map(records.map(record => [record.plan.id, record]));
  const keys = new Map<string, string>();
  const keyFor = (record: PlanRecord, seen = new Set<string>()): string => {
    const { module, plan } = record, own = module + ':' + plan.id;
    const cached = keys.get(own);
    if (cached) return cached;
    if (seen.has(own)) return own;
    seen.add(own);
    let key: string;
    if (plan.groupId) key = 'group:' + plan.groupId;
    else if ('sourceSubscriptionId' in plan && plan.sourceSubscriptionId) key = 'subscription:' + plan.sourceSubscriptionId;
    else if ('sourceEmiLoanId' in plan && plan.sourceEmiLoanId) key = 'emi:' + plan.sourceEmiLoanId;
    else if ('sourceLeasePropertyId' in plan && plan.sourceLeasePropertyId) key = 'lease:' + plan.sourceLeasePropertyId;
    else if ('seriesId' in plan && plan.seriesId) {
      const parent = byId.get(plan.seriesId);
      key = parent ? keyFor(parent, seen) : 'series:' + plan.seriesId;
    } else key = 'recurrence' in plan && plan.recurrence ? 'series:' + ('planId' in plan ? plan.planId : plan.id) : own;
    keys.set(own, key);
    return key;
  };
  const grouped = new Map<string, PlanRecord[]>(groups.map(group => ['group:' + group.id, []]));
  for (const record of records) {
    const key = keyFor(record);
    const group = grouped.get(key);
    if (group) group.push(record); else grouped.set(key, [record]);
  }
  return { grouped, keyFor };
}
