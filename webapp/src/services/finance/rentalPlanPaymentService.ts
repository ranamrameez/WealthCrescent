import { auth } from '../../lib/firebase/client';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { useRentalsWorkbookStore } from '../../store/rentalsWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { createLinkedTransfer } from '../../lib/linkCascade';
import type { PlannedRentalEntry } from '../../types/plannedRentals';

/** Manual rental fulfillment; linked records stay in their native ledgers.
 * Local rollback is not remote transaction safety and is not used by automation. */
export function fulfillRentalPlan(id: string, expected?: PlannedRentalEntry): string | undefined {
  if (!auth?.currentUser) return 'Sign in to fulfill this rental plan.';
  const plans = usePlannedRentalsWorkbookStore.getState(), rentals = useRentalsWorkbookStore.getState();
  const plan = plans.workbook.entries.find(item=>item.id === id);
  if (!plan || plan.executed) return 'This plan is already fulfilled or was removed.';
  if (expected && JSON.stringify(expected) !== JSON.stringify(plan)) return 'This plan changed. Reopen it before fulfilling.';
  const property = rentals.workbook.settings.properties.find(item=>item.id === plan.propertyId);
  if (!property || property.isActive === false) return 'Choose an active property.';
  const bank = useBankWorkbookStore.getState(), cash = useCashWorkbookStore.getState(), links = useInterEntityTransfersStore.getState();
  const categoryID = useCategoryStore.getState().workbook.categories.find(category=>category.name.trim().toLowerCase() === plan.category?.trim().toLowerCase())?.id;
  let record: ReturnType<typeof CalculationEngine.manualPayments.prepareRentalPlanFulfillment>;
  try { record = CalculationEngine.manualPayments.prepareRentalPlanFulfillment(plan,categoryID); }
  catch (error) { return error instanceof Error ? error.message : String(error); }
  if (rentals.workbook.entries.some(entry=>entry.id === record.id || entry.planLink?.module === 'rentals' && entry.planLink.planId === id && entry.planLink.occurrenceDate === plan.date)) return 'This occurrence already has a ledger record.';
  if (plan.finance) {
    const account = plan.finance.module === 'bank' ? bank.workbook.settings.accounts.find(account=>account.id === plan.finance?.ref && !account.migratedToCreditCardId && account.isActive !== false) : undefined;
    const currency = plan.finance.module === 'bank' ? account?.currencyCode : plan.finance.currencyCode;
    if (currency !== property.currencyCode) return 'Choose an active finance in the property currency before fulfilling this plan.';
  }
  try {
    if (plan.finance) {
      const rental = { module: 'rentals' as const, ref: plan.propertyId };
      const result = createLinkedTransfer({ date: plan.date, fromAmount: plan.amount, toAmount: plan.amount,
        from: plan.type === 'RENT_INCOME' ? rental : plan.finance, to: plan.type === 'RENT_INCOME' ? plan.finance : rental, note: plan.note, categoryID });
      if ('error' in result) throw new Error(result.error);
      const rentalId = result.link.from.module === 'rentals' ? result.link.fromRecordId : result.link.toRecordId;
      const financeId = result.link.from.module === 'rentals' ? result.link.toRecordId : result.link.fromRecordId;
      rentals.updateEntry(rentalId,{ planLink: record.planLink });
      if (plan.finance.module === 'bank') bank.updateTransaction(financeId,{ planLink: record.planLink });
      else cash.updateEntry(financeId,{ planLink: record.planLink });
    } else rentals.addEntry(record);
    plans.updateEntry(id,{ executed: true });
  } catch (error) {
    // Restore only ledgers this operation can touch; preserve the original failure.
    const restore = [()=>rentals.setWorkbook(rentals.workbook),()=>plans.setWorkbook(plans.workbook),()=>links.setWorkbook(links.workbook),
      ...(plan.finance?.module === 'bank' ? [()=>bank.setWorkbook(bank.workbook)] : plan.finance?.module === 'cash' ? [()=>cash.setWorkbook(cash.workbook)] : [])];
    let rollbackFailed = false;
    for (const undo of restore) { try { undo(); } catch { rollbackFailed = true; } }
    return rollbackFailed ? 'Fulfillment failed and local rollback was incomplete. Review the linked records before retrying.' : error instanceof Error ? error.message : String(error);
  }
}
