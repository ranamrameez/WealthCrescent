import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';
import type { PlannedCashEntry } from '../types/plannedCash';
import type { PlannedBankTransaction } from '../types/plannedBank';
import type { PlannedCreditCardTransaction } from '../types/plannedCreditCard';
import type { PlannedRentalEntry } from '../types/plannedRentals';

export type PlanModule = 'cash' | 'bank' | 'creditCard' | 'rentals';
export type FinancePlan = PlannedCashEntry | PlannedBankTransaction | PlannedCreditCardTransaction | PlannedRentalEntry;
export interface PlanReference { module: PlanModule; id: string }
export interface PlanRecord { module: PlanModule; plan: FinancePlan }
export function readFinancePlans(): PlanRecord[] {
  return [
    ...usePlannedCashWorkbookStore.getState().workbook.entries.map(plan => ({ module: 'cash' as const, plan })),
    ...usePlannedBankWorkbookStore.getState().workbook.entries.map(plan => ({ module: 'bank' as const, plan })),
    ...usePlannedCreditCardWorkbookStore.getState().workbook.entries.map(plan => ({ module: 'creditCard' as const, plan })),
    ...usePlannedRentalsWorkbookStore.getState().workbook.entries.map(plan => ({ module: 'rentals' as const, plan })),
  ];
}
export function writeFinancePlan(module: PlanModule, plan: FinancePlan, exists = false) {
  switch (module) {
    case 'cash': { const s = usePlannedCashWorkbookStore.getState(); exists ? s.updateEntry(plan.id, plan as PlannedCashEntry) : s.addEntry(plan as PlannedCashEntry); break; }
    case 'bank': { const s = usePlannedBankWorkbookStore.getState(); exists ? s.updateEntry(plan.id, plan as PlannedBankTransaction) : s.addEntry(plan as PlannedBankTransaction); break; }
    case 'creditCard': { const s = usePlannedCreditCardWorkbookStore.getState(); exists ? s.updateEntry(plan.id, plan as PlannedCreditCardTransaction) : s.addEntry(plan as PlannedCreditCardTransaction); break; }
    case 'rentals': { const s = usePlannedRentalsWorkbookStore.getState(); exists ? s.updateEntry(plan.id, plan as PlannedRentalEntry) : s.addEntry(plan as PlannedRentalEntry); break; }
  }
}
export function deleteFinancePlan(ref: PlanReference) {
  switch (ref.module) {
    case 'cash': usePlannedCashWorkbookStore.getState().deleteEntry(ref.id); break;
    case 'bank': usePlannedBankWorkbookStore.getState().deleteEntry(ref.id); break;
    case 'creditCard': usePlannedCreditCardWorkbookStore.getState().deleteEntry(ref.id); break;
    case 'rentals': usePlannedRentalsWorkbookStore.getState().deleteEntry(ref.id); break;
  }
}
export function planDescription(plan: FinancePlan) { return 'description' in plan ? plan.description : plan.note ?? plan.category ?? 'Plan'; }
export function signedPlanAmount(plan: FinancePlan) {
  if ('accountId' in plan) return plan.amount;
  if ('kind' in plan) return ['payment', 'refund'].includes(plan.kind) ? plan.amount : -plan.amount;
  return plan.type === 'IN' || plan.type === 'RENT_INCOME' ? plan.amount : -plan.amount;
}

/** Reassign expected activity without creating a real transaction or losing provenance. */
export function assignPlanFinance(plan: FinancePlan, finance: {module: 'cash' | 'bank' | 'creditCard'; ref?: string; currencyCode: string}): FinancePlan {
  if ('propertyId' in plan) {
    if (finance.module === 'creditCard') throw new Error('Rent plans link to Cash or a bank account.');
    return {...plan,finance:{...finance,module:finance.module}};
  }
  const signed = signedPlanAmount(plan);
  const converted: FinancePlan = finance.module === 'cash'
    ? {...plan, type:signed >= 0 ? 'IN' : 'OUT', amount:Math.abs(signed), currencyCode:finance.currencyCode, note:planDescription(plan)}
    : finance.module === 'bank' ? {...plan, accountId:finance.ref!, amount:signed, description:planDescription(plan)}
    : {...plan, cardId:finance.ref!, amount:Math.abs(signed), kind:signed >= 0 ? 'payment' : 'charge', description:planDescription(plan)};
  const fields = finance.module === 'cash' ? ['accountId','cardId','propertyId','description','kind'] : finance.module === 'bank' ? ['cardId','propertyId','type','kind','currencyCode','note'] : ['accountId','propertyId','type','currencyCode','note'];
  fields.forEach(field => Reflect.deleteProperty(converted,field));
  return converted;
}
