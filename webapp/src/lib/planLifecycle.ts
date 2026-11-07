import { CalculationEngine } from './calc/CalculationEngine';
import type { RecurrenceRule } from '../types/recurrence';
import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';

/** Only explicit user mutations call these helpers; cloud hydration must not
 * delete plans while the other workbooks are still loading. */
function removeMatching<T extends { id: string; date: string; recurrence?: RecurrenceRule; completedDates?: string[]; executedThrough?: string; cancelled?: boolean }>(store: {
  getState: () => { workbook: { entries: T[] }; deleteEntry: (id: string) => void; updateEntry: (id: string,patch:Partial<T>) => void };
}, matches: (entry: T) => boolean, preserveHistory=false) {
  const state = store.getState();
  state.workbook.entries.filter(matches).forEach(entry => {
    const patch=preserveHistory?CalculationEngine.occurrences.cancellationPatchForSourceRemoval(entry):null;
    if(patch)state.updateEntry(entry.id,patch as Partial<T>);
    else state.deleteEntry(entry.id);
  });
}

export function removeAccountPlans(id: string) {
  removeMatching(usePlannedBankWorkbookStore, plan => plan.accountId === id);
}
export function removeCardPlans(id: string) {
  removeMatching(usePlannedCreditCardWorkbookStore, plan => plan.cardId === id);
}
export function removePropertyPlans(id: string) {
  removeMatching(usePlannedRentalsWorkbookStore, plan => plan.propertyId === id);
}
export function removeEmiPlans(id: string, keepAccountId?: string) {
  removeMatching(usePlannedCashWorkbookStore, plan => plan.sourceEmiLoanId === id && !plan.executed,true);
  removeMatching(usePlannedCreditCardWorkbookStore, plan => plan.sourceEmiLoanId === id && !plan.executed,true);
  removeMatching(usePlannedBankWorkbookStore, plan => plan.sourceEmiLoanId === id && !plan.executed && plan.accountId !== keepAccountId,true);
}
export function removeSubscriptionPlans(id: string, keep?: { module: string; ref?: string }) {
  removeMatching(usePlannedBankWorkbookStore, plan => plan.sourceSubscriptionId === id && !plan.executed && !(keep?.module === 'bank' && keep.ref === plan.accountId),true);
  removeMatching(usePlannedCashWorkbookStore, plan => plan.sourceSubscriptionId === id && !plan.executed && keep?.module !== 'cash',true);
  removeMatching(usePlannedCreditCardWorkbookStore, plan => plan.sourceSubscriptionId === id && !plan.executed && !(keep?.module === 'creditCard' && keep.ref === plan.cardId),true);
}
