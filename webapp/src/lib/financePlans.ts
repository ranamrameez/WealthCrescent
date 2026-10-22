import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';
import type { PlannedCashEntry } from '../types/plannedCash';
import type { PlannedBankTransaction } from '../types/plannedBank';
import type { PlannedCreditCardTransaction } from '../types/plannedCreditCard';
import type { PlannedRentalEntry } from '../types/plannedRentals';
import type { FinancePlanGroup } from '../types/financePlanGroup';
import { occurrenceCompleted } from './calc/planOccurrences';

export type PlanModule = 'cash' | 'bank' | 'creditCard' | 'rentals';
export type FinancePlan = PlannedCashEntry | PlannedBankTransaction | PlannedCreditCardTransaction | PlannedRentalEntry;
export interface PlanReference { module: PlanModule; id: string }
export interface PlanRecord { module: PlanModule; plan: FinancePlan }
export function readPlanGroups(): FinancePlanGroup[] { return usePlannedCashWorkbookStore.getState().workbook.planGroups ?? []; }

export function savePlanGroup(group: FinancePlanGroup, expected?: FinancePlanGroup) {
  const store = usePlannedCashWorkbookStore.getState();
  const groups = store.workbook.planGroups ?? [];
  const current = groups.find(item => item.id === group.id);
  if (expected && JSON.stringify(expected) !== JSON.stringify(current)) throw new Error('This plan changed. Reopen its editor.');
  if (!group.name.trim()) throw new Error('Enter a plan name.');
  const next = { ...group, name: group.name.trim(), notes: group.notes?.trim() || undefined };
  store.setWorkbook({ ...store.workbook, planGroups: current ? groups.map(item => item.id === group.id ? next : item) : [...groups, next] });
}

export function hasFulfilledPayments(plan: FinancePlan): boolean {
  return !!(plan.executed || ('completedDates' in plan && plan.completedDates?.length) || ('executedThrough' in plan && plan.executedThrough));
}

export function deletePlanPayment(reference: PlanReference, occurrenceDate?: string) {
  const record = readFinancePlans().find(row => row.module === reference.module && row.plan.id === reference.id);
  if (!record) throw new Error('This payment no longer exists.');
  const plan = record.plan;
  if (plan.executed || (occurrenceDate && 'recurrence' in plan && occurrenceCompleted(plan, occurrenceDate))) throw new Error('Fulfilled payments cannot be deleted.');
  if (occurrenceDate && 'recurrence' in plan && plan.recurrence) {
    writeFinancePlan(reference.module, { ...plan, recurrence: { ...plan.recurrence, excludedDates: [...new Set([...(plan.recurrence.excludedDates ?? []), occurrenceDate])] } }, true);
  } else {
    if (hasFulfilledPayments(plan)) throw new Error('This series has fulfilled payments. Delete an individual future payment instead.');
    deleteFinancePlan(reference);
  }
}

/** Removing a parent only removes its unfulfilled planned rows, never actual money. */
export function deletePlanGroup(id: string, expected: FinancePlanGroup) {
  const store = usePlannedCashWorkbookStore.getState();
  if (JSON.stringify(readPlanGroups().find(group => group.id === id)) !== JSON.stringify(expected)) throw new Error('This plan changed. Reopen its details.');
  const records = readFinancePlans().filter(row => row.plan.groupId === id);
  if (records.some(row => hasFulfilledPayments(row.plan))) throw new Error('This plan has fulfilled payments and must be kept for its history.');
  const bank = usePlannedBankWorkbookStore.getState(), cards = usePlannedCreditCardWorkbookStore.getState(), rentals = usePlannedRentalsWorkbookStore.getState();
  // One update per store, rather than re-persisting the whole ledger for every payment.
  if (bank.workbook.entries.some(plan => plan.groupId === id)) bank.setWorkbook({ ...bank.workbook, entries: bank.workbook.entries.filter(plan => plan.groupId !== id) });
  if (cards.workbook.entries.some(plan => plan.groupId === id)) cards.setWorkbook({ ...cards.workbook, entries: cards.workbook.entries.filter(plan => plan.groupId !== id) });
  if (rentals.workbook.entries.some(plan => plan.groupId === id)) rentals.setWorkbook({ ...rentals.workbook, entries: rentals.workbook.entries.filter(plan => plan.groupId !== id) });
  store.setWorkbook({ ...store.workbook, entries: store.workbook.entries.filter(plan => plan.groupId !== id), planGroups: (store.workbook.planGroups ?? []).filter(group => group.id !== id) });
}
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
    case 'cash': { const s = usePlannedCashWorkbookStore.getState(); if (exists) s.updateEntry(plan.id, plan as PlannedCashEntry); else s.addEntry(plan as PlannedCashEntry); break; }
    case 'bank': { const s = usePlannedBankWorkbookStore.getState(); if (exists) s.updateEntry(plan.id, plan as PlannedBankTransaction); else s.addEntry(plan as PlannedBankTransaction); break; }
    case 'creditCard': { const s = usePlannedCreditCardWorkbookStore.getState(); if (exists) s.updateEntry(plan.id, plan as PlannedCreditCardTransaction); else s.addEntry(plan as PlannedCreditCardTransaction); break; }
    case 'rentals': { const s = usePlannedRentalsWorkbookStore.getState(); if (exists) s.updateEntry(plan.id, plan as PlannedRentalEntry); else s.addEntry(plan as PlannedRentalEntry); break; }
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
