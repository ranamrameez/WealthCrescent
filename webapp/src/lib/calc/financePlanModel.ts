import type { PlannedCashEntry } from '../../types/plannedCash';
import type { PlannedBankTransaction } from '../../types/plannedBank';
import type { PlannedCreditCardTransaction } from '../../types/plannedCreditCard';
import type { PlannedRentalEntry } from '../../types/plannedRentals';
export type PlanModule = 'cash' | 'bank' | 'creditCard' | 'rentals';
export type FinancePlan = PlannedCashEntry | PlannedBankTransaction | PlannedCreditCardTransaction | PlannedRentalEntry;
export interface PlanReference { module: PlanModule; id: string }
export interface PlanRecord { module: PlanModule; plan: FinancePlan }
export function hasFulfilledPayments(plan: FinancePlan): boolean {
  return !!(plan.executed || ('completedDates' in plan && plan.completedDates?.length) || ('executedThrough' in plan && plan.executedThrough));
}

export function planDescription(plan: FinancePlan) { return 'description' in plan ? plan.description : plan.note ?? plan.category ?? 'Plan'; }
export function signedPlanAmount(plan: FinancePlan) {
  if ('accountId' in plan) return plan.amount;
  if ('kind' in plan) return ['payment', 'refund'].includes(plan.kind) ? plan.amount : -plan.amount;
  return plan.type === 'IN' || plan.type === 'RENT_INCOME' ? plan.amount : -plan.amount;
}

