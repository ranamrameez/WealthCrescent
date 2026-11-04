import { useMemo } from 'react';
import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';
import { useEMIWorkbookStore } from '../store/emiWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../store/subscriptionsWorkbookStore';
import { collectUpcomingItems, type UpcomingItem } from '../lib/calc/upcoming';

/** Live aggregation of active, unresolved future occurrences from every
 * module-owned plan store. The same source feeds the homepage and Planning. */
export function useUpcomingItems(windowDays = 14): UpcomingItem[] {
  const plannedCash = usePlannedCashWorkbookStore(state => state.workbook.entries);
  const plannedBank = usePlannedBankWorkbookStore(state => state.workbook.entries);
  const bankAccounts = useBankWorkbookStore(state => state.workbook.settings.accounts);
  const plannedCreditCards = usePlannedCreditCardWorkbookStore(state => state.workbook.entries);
  const creditCards = useCreditCardWorkbookStore(state => state.workbook.cards);
  const plannedRentals = usePlannedRentalsWorkbookStore(state => state.workbook.entries);
  const emiLoans = useEMIWorkbookStore(state => state.workbook.entries);
  const rentalProperties = useRentalsWorkbookStore(state => state.workbook.settings.properties);
  const subscriptions = useSubscriptionsWorkbookStore(state => state.workbook.entries);

  return useMemo(
    () => collectUpcomingItems({
      plannedCash, plannedBank, bankAccounts, plannedCreditCards, creditCards,
      plannedRentals, emiLoans, rentalProperties, subscriptions,
    }, windowDays),
    [plannedCash, plannedBank, bankAccounts, plannedCreditCards, creditCards, plannedRentals, emiLoans, rentalProperties, subscriptions, windowDays],
  );
}
