import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import type { UpcomingItem } from '../../lib/calc/upcoming';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useRentalsWorkbookStore } from '../../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';

type Listener = () => void;

let revision = 0;
const listeners = new Set<Listener>();
const snapshots = new Map<string, UpcomingItem[]>();

function invalidate() {
  revision += 1;
  snapshots.clear();
  listeners.forEach(listener => listener());
}

/**
 * Application query boundary for the shared Upcoming read model.
 *
 * Store subscriptions and data access stay here; UI hooks only subscribe to
 * this service. Every financial/date-derived field is produced by
 * CalculationEngine, never by the renderer.
 */
const storeUnsubscribers = [
  usePlannedCashWorkbookStore.subscribe(invalidate),
  usePlannedBankWorkbookStore.subscribe(invalidate),
  useBankWorkbookStore.subscribe(invalidate),
  usePlannedCreditCardWorkbookStore.subscribe(invalidate),
  useCreditCardWorkbookStore.subscribe(invalidate),
  usePlannedRentalsWorkbookStore.subscribe(invalidate),
  useEMIWorkbookStore.subscribe(invalidate),
  useRentalsWorkbookStore.subscribe(invalidate),
  useSubscriptionsWorkbookStore.subscribe(invalidate),
];

export function subscribeUpcomingItems(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUpcomingItems(windowDays = 14): UpcomingItem[] {
  // Including the calendar date prevents a cached snapshot surviving midnight.
  const today = new Date().toISOString().slice(0, 10);
  const key = `${revision}:${windowDays}:${today}`;
  const cached = snapshots.get(key);
  if (cached) return cached;

  const items = CalculationEngine.upcoming.collectUpcomingItems({
    plannedCash: usePlannedCashWorkbookStore.getState().workbook.entries,
    plannedBank: usePlannedBankWorkbookStore.getState().workbook.entries,
    bankAccounts: useBankWorkbookStore.getState().workbook.settings.accounts,
    plannedCreditCards: usePlannedCreditCardWorkbookStore.getState().workbook.entries,
    creditCards: useCreditCardWorkbookStore.getState().workbook.cards,
    plannedRentals: usePlannedRentalsWorkbookStore.getState().workbook.entries,
    emiLoans: useEMIWorkbookStore.getState().workbook.entries,
    rentalProperties: useRentalsWorkbookStore.getState().workbook.settings.properties,
    subscriptions: useSubscriptionsWorkbookStore.getState().workbook.entries,
  }, windowDays, new Date(`${today}T00:00:00.000Z`));

  snapshots.set(key, items);
  return items;
}

/** Keep the store subscriptions alive for the lifetime of the application. */
export function disposeUpcomingQueryForTests(): void {
  storeUnsubscribers.forEach(unsubscribe => unsubscribe());
}
