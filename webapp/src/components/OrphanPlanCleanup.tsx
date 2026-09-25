import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { useEMIWorkbookStore } from '../store/emiWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../store/subscriptionsWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';
import { confirmDialog } from './ConfirmDialog';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';

/** Explicit repair for legacy plans. Never run destructive cleanup on hydration:
 * independently synced workbooks can arrive in any order. */
export function OrphanPlanCleanup() {
  const accounts = useBankWorkbookStore(s => s.workbook.settings.accounts);
  const cards = useCreditCardWorkbookStore(s => s.workbook.cards);
  const loans = useEMIWorkbookStore(s => s.workbook.entries);
  const subscriptions = useSubscriptionsWorkbookStore(s => s.workbook.entries);
  const properties = useRentalsWorkbookStore(s => s.workbook.settings.properties);
  const bankPlans = usePlannedBankWorkbookStore(s => s.workbook.entries);
  const cashPlans = usePlannedCashWorkbookStore(s => s.workbook.entries);
  const cardPlans = usePlannedCreditCardWorkbookStore(s => s.workbook.entries);
  const rentalPlans = usePlannedRentalsWorkbookStore(s => s.workbook.entries);
  const ensureSignedIn = useEnsureSignedIn();
  const wrongSubscription = (id: string | undefined, module: string, ref?: string) => {
    if (!id) return false;
    const payer = subscriptions.find(sub => sub.id === id)?.paidVia;
    return !payer || payer.module !== module || (module !== 'cash' && payer.ref !== ref);
  };
  const orphanBank = bankPlans.filter(p => !p.executed && (
    !accounts.some(a => a.id === p.accountId) || wrongSubscription(p.sourceSubscriptionId, 'bank', p.accountId) ||
    (p.sourceEmiLoanId && !loans.some(loan => loan.id === p.sourceEmiLoanId && loan.linkedBankAccountId === p.accountId))
  ));
  const orphanCash = cashPlans.filter(p => !p.executed && wrongSubscription(p.sourceSubscriptionId, 'cash'));
  const orphanCards = cardPlans.filter(p => !p.executed && (!cards.some(card => card.id === p.cardId) || wrongSubscription(p.sourceSubscriptionId, 'creditCard', p.cardId)));
  const orphanRentals = rentalPlans.filter(p => !p.executed && !properties.some(property => property.id === p.propertyId));
  const count = orphanBank.length + orphanCash.length + orphanCards.length + orphanRentals.length;
  if (!count) return null;
  const repair = async () => {
    if (!(await ensureSignedIn('Sign in to remove orphaned plans.'))) return;
    if (!(await confirmDialog(`Remove ${count} unfinished plans whose item was deleted or whose payment link changed? Completed plans and real transactions are kept.`, 'Remove orphaned plans?'))) return;
    orphanBank.forEach(p => usePlannedBankWorkbookStore.getState().deleteEntry(p.id));
    orphanCash.forEach(p => usePlannedCashWorkbookStore.getState().deleteEntry(p.id));
    orphanCards.forEach(p => usePlannedCreditCardWorkbookStore.getState().deleteEntry(p.id));
    orphanRentals.forEach(p => usePlannedRentalsWorkbookStore.getState().deleteEntry(p.id));
  };
  return <div className="notice mb-md">{count} unfinished plans have a missing item or an outdated payment link.{' '}
    <button className="btn secondary small" onClick={repair}>Remove orphaned plans</button>
  </div>;
}
