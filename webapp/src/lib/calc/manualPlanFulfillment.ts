import { validBatchDate } from '../dateValidation';
import { planOccurrences } from './planOccurrences';
import type { FinancePlan, PlanReference } from './financePlanModel';
import type { CashEntry } from '../../types/cashWorkbook';
import type { BankTransaction } from '../../types/bankWorkbook';
import type { CreditCardTransaction } from '../../types/creditCard';
import type { PlanLink } from '../../types/planLink';

/** Explicit interactive settlement only. Backend automation must create pending records
 * through an atomic repository; it must never call this cleared-record builder. */
export function prepareManualPlanFulfillment(reference: PlanReference, plan: FinancePlan, occurrenceDate: string, actualDate: string, categoryID?: string) {
  if (reference.module === 'rentals') throw new Error('Use the linked rental fulfillment workflow.');
  if (reference.id !== plan.id || !validBatchDate(occurrenceDate) || !validBatchDate(actualDate)) throw new Error('Choose valid occurrence and payment dates.');
  if (!Number.isFinite(plan.amount) || plan.amount === 0 || (reference.module !== 'bank' && plan.amount < 0)) throw new Error('This plan needs a valid positive amount.');
  if (plan.executed) throw new Error('This occurrence is already completed.');
  const occurrence = planOccurrences([plan],occurrenceDate,occurrenceDate,new Date(actualDate+'T00:00:00Z'),null)[0];
  if (!occurrence || occurrence.executed) throw new Error('This occurrence is already completed or excluded.');
  const planLink: PlanLink = { module: reference.module, planId: plan.id, occurrenceDate, groupId: plan.groupId };
  const id = 'plan:' + reference.module + ':' + encodeURIComponent(plan.id) + ':' + occurrenceDate;
  const common = { id, date: actualDate, source: 'manual' as const, categoryID, planLink };
  const result = reference.module === 'cash' && 'currencyCode' in plan && 'type' in plan
    ? { module: 'cash' as const, record: { ...common, currencyCode: plan.currencyCode, amount: plan.amount, isDeposit: plan.type === 'IN', category: plan.category, note: plan.note } satisfies CashEntry }
    : reference.module === 'bank' && 'accountId' in plan
      ? { module: 'bank' as const, record: { ...common, accountId: plan.accountId, amount: plan.amount, isDeposit: plan.amount >= 0, category: plan.category, description: plan.description } satisfies BankTransaction }
      : reference.module === 'creditCard' && 'cardId' in plan
        ? { module: 'creditCard' as const, record: { ...common, cardId: plan.cardId, amount: plan.amount, kind: plan.kind, description: plan.description } satisfies CreditCardTransaction }
        : null;
  if (!result) throw new Error('This plan no longer belongs to the selected finance.');
  const recurring = 'recurrence' in plan && !!plan.recurrence;
  const updated: FinancePlan = recurring ? { ...plan, completedDates: [...new Set([...('completedDates' in plan ? plan.completedDates ?? [] : []),occurrenceDate])] } : { ...plan, executed: true, fulfilledDate: actualDate };
  const snapshot: FinancePlan | undefined = recurring ? { ...plan, id: id + ':fulfilled', seriesId: plan.id, date: occurrenceDate, fulfilledDate: actualDate, executed: true, recurrence: undefined, completedDates: undefined, executedThrough: undefined } : undefined;
  return { result, updated, snapshot, recurring };
}
