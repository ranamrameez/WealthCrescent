import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';

/** Only explicit user mutations call these helpers; cloud hydration must not
 * delete plans while the other workbooks are still loading. */
function removeMatching<T extends { id: string }>(store: {
  getState: () => { workbook: { entries: T[] }; deleteEntry: (id: string) => void };
}, matches: (entry: T) => boolean) {
  const state = store.getState();
  state.workbook.entries.filter(matches).forEach(entry => state.deleteEntry(entry.id));
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
  removeMatching(usePlannedBankWorkbookStore, plan => plan.sourceEmiLoanId === id && !plan.executed && plan.accountId !== keepAccountId);
}
export function removeSubscriptionPlans(id: string, keep?: { module: string; ref?: string }) {
  removeMatching(usePlannedBankWorkbookStore, plan => plan.sourceSubscriptionId === id && !plan.executed && !(keep?.module === 'bank' && keep.ref === plan.accountId));
  removeMatching(usePlannedCashWorkbookStore, plan => plan.sourceSubscriptionId === id && !plan.executed && keep?.module !== 'cash');
  removeMatching(usePlannedCreditCardWorkbookStore, plan => plan.sourceSubscriptionId === id && !plan.executed && !(keep?.module === 'creditCard' && keep.ref === plan.cardId));
}
